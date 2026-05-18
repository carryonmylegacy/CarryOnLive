"""CarryOn™ — SOC 2 Audit Trail Service

Immutable, append-only audit logging for all operator and founder actions.
SOC 2 Trust Service Criteria compliance:
  CC6.1 — Logical access security
  CC7.2 — System monitoring
  CC8.1 — Change management
  A1.2  — System availability monitoring

Logs are:
  - Append-only (no update/delete endpoints)
  - Timestamped in UTC ISO 8601
  - Actor-identified (user_id, email, role, IP)
  - Action-classified (category, action, severity)
  - Target-identified (resource_type, resource_id)
  - Integrity-hashed (SHA-256 of payload for tamper detection)
  - **Hash-chained** (each entry's integrity_hash incorporates the previous
    entry's integrity_hash so tampering with any historical entry
    invalidates every subsequent hash — see `verify_audit_chain`).
"""

import hashlib
import json
from datetime import datetime, timezone

from config import db, logger

# Sentinel for the first entry in the chain.
_GENESIS_HASH = "0" * 64


async def _latest_chain_hash() -> str:
    """Return the integrity_hash of the most recently inserted audit entry.

    Falls back to `_GENESIS_HASH` for the very first entry ever written.
    Legacy entries (pre-chain) lack `integrity_hash`; those are skipped so
    the chain begins cleanly from the first hash-aware insert.
    """
    latest = await db.audit_trail.find_one(
        {"integrity_hash": {"$exists": True}},
        sort=[("stored_at", -1)],
        projection={"_id": 0, "integrity_hash": 1},
    )
    if latest and latest.get("integrity_hash"):
        return latest["integrity_hash"]
    return _GENESIS_HASH


async def log_audit_event(
    actor_id: str,
    actor_email: str,
    actor_role: str,
    action: str,
    category: str,
    resource_type: str = "",
    resource_id: str = "",
    details: dict | None = None,
    ip_address: str = "",
    severity: str = "info",
    session_id: str = "",
):
    """Append an immutable, hash-chained audit log entry."""
    now = datetime.now(timezone.utc)

    entry = {
        "timestamp": now.isoformat(),
        "actor_id": actor_id,
        "actor_email": actor_email,
        "actor_role": actor_role,
        "action": action,
        "category": category,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": json.dumps(details or {})[:2048],
        "ip_address": ip_address,
        "severity": severity,
        "session_id": session_id,
    }

    # Bind this entry to the prior entry's hash. Tampering with any earlier
    # entry invalidates every hash from that point forward.
    entry["prev_hash"] = await _latest_chain_hash()

    canonical = json.dumps(entry, sort_keys=True)
    entry["integrity_hash"] = hashlib.sha256(canonical.encode()).hexdigest()
    entry["stored_at"] = now  # datetime for MongoDB TTL index (added after hash)

    await db.audit_trail.insert_one(entry)

    if severity == "critical":
        logger.warning(f"AUDIT[{severity}] {actor_email} {action} {resource_type}:{resource_id}")


async def verify_audit_chain(limit: int = 10000) -> dict:
    """Walk the hash chain from oldest to newest and report any breaks.

    Returns:
        {
          "ok": bool,                  # True only if every link verifies
          "entries_checked": int,
          "first_break_at": str | None,  # timestamp of first broken entry
          "first_break_id": str | None,  # _id (stringified) of first broken entry
          "skipped_legacy": int,         # legacy entries without integrity_hash
        }

    Pass `limit` to bound the walk in production (default 10k entries).
    """
    cursor = db.audit_trail.find(
        {"integrity_hash": {"$exists": True}},
        sort=[("stored_at", 1)],
        projection={
            "_id": 1,
            "integrity_hash": 1,
            "prev_hash": 1,
            "timestamp": 1,
            "actor_id": 1,
            "actor_email": 1,
            "actor_role": 1,
            "action": 1,
            "category": 1,
            "resource_type": 1,
            "resource_id": 1,
            "details": 1,
            "ip_address": 1,
            "severity": 1,
            "session_id": 1,
        },
    ).limit(limit)

    expected_prev = _GENESIS_HASH
    checked = 0
    skipped_legacy = 0
    first_break_at: str | None = None
    first_break_id: str | None = None

    async for entry in cursor:
        stored_prev = entry.get("prev_hash")
        if stored_prev is None:
            # Legacy entry (pre-chain) — skip but don't reset the expected_prev,
            # since chain technically begins at first hash-aware entry.
            skipped_legacy += 1
            continue

        # Recompute the integrity_hash from a canonical copy of the entry
        # (excluding _id and integrity_hash themselves).
        canonical_entry = {k: v for k, v in entry.items() if k not in ("_id", "integrity_hash")}
        canonical = json.dumps(canonical_entry, sort_keys=True)
        recomputed = hashlib.sha256(canonical.encode()).hexdigest()

        if stored_prev != expected_prev or recomputed != entry.get("integrity_hash"):
            if first_break_at is None:
                first_break_at = entry.get("timestamp", "")
                first_break_id = str(entry.get("_id", ""))
            # Continue scanning so we count entries checked, but don't update
            # expected_prev — chain is already broken from this point.
        else:
            expected_prev = entry["integrity_hash"]
        checked += 1

    return {
        "ok": first_break_at is None,
        "entries_checked": checked,
        "first_break_at": first_break_at,
        "first_break_id": first_break_id,
        "skipped_legacy": skipped_legacy,
    }


def get_client_ip(request) -> str:
    """Extract client IP from request, respecting proxy headers."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def audit_log(
    action="",
    user_id="",
    resource_type="",
    resource_id="",
    estate_id="",
    details=None,
    **kwargs,
):
    """Backward-compatible wrapper for legacy audit_log calls."""
    await log_audit_event(
        actor_id=user_id,
        actor_email="",
        actor_role="",
        action=action,
        category="system",
        resource_type=resource_type,
        resource_id=resource_id,
        details={**(details or {}), "estate_id": estate_id},
    )
