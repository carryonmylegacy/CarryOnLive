"""CarryOn™ Backend — Admin: MongoDB cluster status.

Surfaces real-time database health for the Founder admin dashboard and
the CTO/IT (`/ops`) System Health portal. Designed to answer the live
pitch questions:

  * "Where is our data?"      → host + region (parsed from MONGO_URL)
  * "Is it healthy?"          → ping latency, server version, RS state
  * "How much do we have?"    → totals per collection, dataSize, idx size
  * "When did we last see it?"→ snapshot timestamp

Everything is best-effort: a probe that fails (no permission, command
unsupported on the deployment, etc.) returns a clear `null` or "n/a"
rather than 500-ing the whole endpoint. We don't want the admin
dashboard to go dark just because Atlas restricted one command on a
particular tier.
"""

from __future__ import annotations

import asyncio
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends

from config import db, db_read
from guards import require_admin

router = APIRouter()


# Collections worth surfacing on the tile. Keep this short — the
# Founder/CTO doesn't need to know about every transient queue. The
# endpoint still returns the full top-by-count list as a fallback.
_HEADLINE_COLLECTIONS = (
    "users",
    "estates",
    "beneficiaries",
    "messages",
    "documents",
    "checklist_items",
    "audit_trail",
    "stripe_subscriptions",
    "ega_tasks",
    "llm_cost_ledger",
)


def _parse_host(mongo_url: str) -> dict:
    """Best-effort extraction of host/cluster identity from a MONGO_URL.

    We never log or return credentials. For `mongodb+srv://` URLs the
    host is the SRV target hostname (e.g.
    `carryon-prod.abcd.mongodb.net`), which is sufficient for a "we
    are on Atlas, this region" indicator without leaking the cluster
    secret.
    """
    if not mongo_url:
        return {"backend": "unknown", "host": None, "cluster": None, "srv": False}
    try:
        parsed = urlparse(mongo_url)
    except Exception:
        return {"backend": "unknown", "host": None, "cluster": None, "srv": False}

    scheme = (parsed.scheme or "").lower()
    host = parsed.hostname or ""
    is_srv = scheme == "mongodb+srv"

    if is_srv and "mongodb.net" in host:
        # Atlas SRV hostnames are typically `<cluster>.<id>.mongodb.net`.
        # Strip the random Atlas id for a clean cluster label.
        cluster = host.split(".")[0]
        backend = "MongoDB Atlas"
    elif host in {"localhost", "127.0.0.1"} or host.startswith("mongo"):
        cluster = host or "local"
        backend = "Self-hosted (preview)" if host in {"localhost", "127.0.0.1"} else "Self-hosted"
    else:
        cluster = host
        backend = "Self-hosted"

    return {"backend": backend, "host": host, "cluster": cluster, "srv": is_srv}


async def _ping_with_latency() -> dict:
    started = time.perf_counter()
    try:
        await asyncio.wait_for(db.command("ping"), timeout=4.0)
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        return {"ok": True, "latency_ms": latency_ms, "error": None}
    except asyncio.TimeoutError:
        return {"ok": False, "latency_ms": None, "error": "timeout"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "latency_ms": None, "error": type(exc).__name__}


async def _server_info() -> dict:
    try:
        info = await asyncio.wait_for(db.command("buildInfo"), timeout=3.0)
        return {
            "version": info.get("version"),
            "git_version": info.get("gitVersion"),
        }
    except Exception:
        return {"version": None, "git_version": None}


async def _replica_set_status() -> dict | None:
    """Returns a sanitized replica-set summary if available, else None."""
    try:
        rs = await asyncio.wait_for(db.command("replSetGetStatus"), timeout=3.0)
    except Exception:
        return None
    members = rs.get("members", []) or []
    states = []
    primary_host = None
    healthy = 0
    for m in members:
        state_str = m.get("stateStr", "UNKNOWN")
        if state_str == "PRIMARY":
            primary_host = m.get("name")
        if m.get("health") == 1:
            healthy += 1
        states.append(
            {
                "name": m.get("name"),
                "state": state_str,
                "health": m.get("health"),
            }
        )
    return {
        "set_name": rs.get("set"),
        "member_count": len(members),
        "healthy_count": healthy,
        "primary_host": primary_host,
        "members": states,
    }


async def _db_stats() -> dict:
    """Logical db size + index size + collection count.

    Uses `db_read` (secondaryPreferred when MONGO_READ_PREFERENCE is set)
    because admin dashboards tolerate ~100ms of replication lag and
    offloading this hot path off the primary helps under load.
    """
    try:
        stats = await asyncio.wait_for(db_read.command("dbStats"), timeout=4.0)
    except Exception:
        return {"collections": None, "data_size": None, "storage_size": None, "index_size": None}
    return {
        "collections": stats.get("collections"),
        "data_size": stats.get("dataSize"),
        "storage_size": stats.get("storageSize"),
        "index_size": stats.get("indexSize"),
        "objects": stats.get("objects"),
    }


async def _collection_counts() -> list[dict]:
    """Document counts for the headline collections.

    We use `estimated_document_count()` because it's O(1) (reads
    collection metadata) — `count_documents({})` would scan every
    doc which is too slow for a dashboard fetch. Reads route through
    `db_read` so secondary replicas can absorb the load.
    """
    names = await asyncio.wait_for(db_read.list_collection_names(), timeout=4.0)
    names_set = set(names)
    out: list[dict] = []
    for headline in _HEADLINE_COLLECTIONS:
        if headline not in names_set:
            continue
        try:
            count = await asyncio.wait_for(db_read[headline].estimated_document_count(), timeout=2.0)
        except Exception:
            count = None
        out.append({"name": headline, "count": count})

    # Surface any other collections with very large counts so a stray
    # heavy table doesn't hide from the admin view.
    seen = {row["name"] for row in out}
    extras: list[tuple[str, int]] = []
    for name in names:
        if name in seen or name.startswith("system."):
            continue
        try:
            c = await asyncio.wait_for(db_read[name].estimated_document_count(), timeout=1.5)
        except Exception:
            continue
        if c >= 1000:
            extras.append((name, c))
    extras.sort(key=lambda x: x[1], reverse=True)
    for name, c in extras[:6]:
        out.append({"name": name, "count": c, "extra": True})
    return out


# Mongo URL is read from env at config import time; reach it through
# the env var so we don't have to re-derive it from a Motor client.
def _resolve_mongo_url() -> str:
    import os

    # No fallback default — protected env var per SOC 2 CC8.1 (housekeeping
    # gate). Missing config should fail loud at config-time, not silently
    # here.
    return os.environ.get("MONGO_URL") or ""


@router.get("/admin/db-status")
async def get_db_status(_admin: dict = Depends(require_admin)):
    """Live MongoDB cluster status for admin/founder/IT dashboards."""
    mongo_url = _resolve_mongo_url()
    host_info = _parse_host(mongo_url)

    # Fire the cheap probes in parallel. If any one hangs we don't want
    # to block the whole dashboard fetch on it.
    ping, server, rs, stats, cols = await asyncio.gather(
        _ping_with_latency(),
        _server_info(),
        _replica_set_status(),
        _db_stats(),
        _collection_counts(),
        return_exceptions=False,
    )

    # Connection state for the UI dot.
    if ping["ok"]:
        if ping["latency_ms"] is None or ping["latency_ms"] > 800:
            state = "degraded"
        else:
            state = "healthy"
    else:
        state = "unreachable"

    # If the env var is missing (e.g., Mongo URL hard-coded in compose),
    # at least redact the credentials we *can* reach.
    redacted_url = None
    if mongo_url:
        redacted_url = re.sub(r"://[^@/]+@", "://***:***@", mongo_url, count=1)

    return {
        "state": state,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "host": host_info,
        "connection_string_redacted": redacted_url,
        "ping": ping,
        "server": server,
        "replica_set": rs,
        "db_stats": stats,
        "collections": cols,
    }
