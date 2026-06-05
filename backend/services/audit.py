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
import asyncio
from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from config import db, logger

# Sentinel for the first entry in the chain.
_GENESIS_HASH = "0" * 64

# Single-writer lock for chain appends. The read-prev-hash → compute → insert
# sequence is NOT atomic; without serialization two concurrent appends can read
# the same prev_hash and FORK the chain (audit P1.6). This lock serializes
# appends within the process (the dominant concurrency source for a single
# backend instance).
_chain_lock = asyncio.Lock()


async def _latest_chain_hash() -> str:
    """Return the integrity_hash of the most recently inserted CHAINED entry.

    Falls back to `_GENESIS_HASH` for the very first entry ever written
    *into the chain*. Filters on `prev_hash` exists so legacy pre-chain
    entries (which carry an `integrity_hash` but no `prev_hash`) don't
    leak into the chain root and corrupt the linkage.
    """
    latest = await db.audit_trail.find_one(
        {"prev_hash": {"$exists": True}, "integrity_hash": {"$exists": True}},
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
    entry = {
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

    # Bind this entry to the prior entry's hash under the single-writer lock so
    # concurrent appends within THIS process cannot fork the chain. Across pods
    # the unique partial index on `prev_hash` (db_indexes) makes the insert the
    # serialization point: if another instance chained off the same prev_hash
    # first, our insert raises DuplicateKeyError and we recompute against the new
    # head and retry. timestamp/stored_at are (re)computed INSIDE the loop so a
    # retry that chains to a newer head also carries a monotonically newer
    # stored_at — keeping `_latest_chain_hash()` head selection correct
    # (audit 18a9d44 F-18-02).
    inserted = False
    async with _chain_lock:
        for _attempt in range(12):
            now = datetime.now(timezone.utc)
            entry["timestamp"] = now.isoformat()
            entry.pop("integrity_hash", None)
            entry.pop("stored_at", None)
            entry["prev_hash"] = await _latest_chain_hash()

            canonical = json.dumps(entry, sort_keys=True)
            entry["integrity_hash"] = hashlib.sha256(canonical.encode()).hexdigest()
            entry["stored_at"] = now  # datetime for MongoDB TTL index (added after hash)

            try:
                await db.audit_trail.insert_one(entry)
                inserted = True
                break
            except DuplicateKeyError:
                continue

    if not inserted:
        # Do NOT silently drop a compliance event. Persist it to a durable repair
        # queue for out-of-band re-chaining and surface a critical log so the gap
        # is visible (audit 18a9d44 F-18-02).
        try:
            entry.pop("stored_at", None)
            await db.audit_repair_queue.insert_one(
                {**entry, "queued_at": datetime.now(timezone.utc), "reason": "chain_contention_retries_exhausted"}
            )
        except Exception as e:  # noqa: BLE001
            logger.error(f"AUDIT chain append AND repair-queue write failed: {e}")
        logger.error(
            f"AUDIT chain append failed after retries; event queued for repair "
            f"(actor={actor_email} action={action} {resource_type}:{resource_id})"
        )

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

    Implementation note: filters the cursor to entries with a `prev_hash`
    field so legacy pre-chain entries don't crowd out the chain window.
    `skipped_legacy` is counted out-of-band via a single count_documents.
    """
    # Count legacy entries (have integrity_hash but lack prev_hash) once.
    skipped_legacy = await db.audit_trail.count_documents(
        {"integrity_hash": {"$exists": True}, "prev_hash": {"$exists": False}}
    )

    cursor = db.audit_trail.find(
        {"prev_hash": {"$exists": True}, "integrity_hash": {"$exists": True}},
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
    first_break_at: str | None = None
    first_break_id: str | None = None

    async for entry in cursor:
        # Recompute the integrity_hash from a canonical copy of the entry
        # (excluding _id and integrity_hash themselves).
        canonical_entry = {k: v for k, v in entry.items() if k not in ("_id", "integrity_hash")}
        canonical = json.dumps(canonical_entry, sort_keys=True)
        recomputed = hashlib.sha256(canonical.encode()).hexdigest()

        if entry.get("prev_hash") != expected_prev or recomputed != entry.get("integrity_hash"):
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


async def ensure_chain_genesis() -> dict:
    """Write a one-time `audit_chain_genesis` entry the first time the
    hash chain is queried after rollout.

    Idempotent: returns `{"created": False}` once a chained entry exists.
    On the very first call ever (chained count == 0), inserts a single
    audit entry with `action="audit_chain_genesis"` that becomes the
    cryptographic anchor for every subsequent chained entry.

    Useful for SOC 2 evidence: auditors can point to one row whose
    `prev_hash` equals the genesis sentinel (`"0" * 64`) and trace every
    subsequent action's `prev_hash` chain forward from it.
    """
    existing = await db.audit_trail.find_one(
        {"prev_hash": {"$exists": True}},
        projection={"_id": 1},
    )
    if existing:
        return {"created": False}

    await log_audit_event(
        actor_id="system",
        actor_email="system@carryon.us",
        actor_role="system",
        action="audit_chain_genesis",
        category="security",
        resource_type="audit_trail",
        resource_id="genesis",
        details={
            "note": (
                "First entry of the SHA-256 hash-chained audit trail. "
                "Every subsequent entry's prev_hash links back through "
                "this anchor."
            ),
            "algorithm": "SHA-256",
            "genesis_prev_hash": _GENESIS_HASH,
        },
        severity="info",
    )
    return {"created": True}


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
