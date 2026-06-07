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

# Single-writer lock for chain appends WITHIN a process (fast path that avoids
# most CAS retries on a single instance). Cross-pod safety comes from the
# compare-and-swap on the singleton head document below.
_chain_lock = asyncio.Lock()

# The chain head is a single document in `audit_chain_state`: {key, hash}. Every
# append atomically advances it from the prev hash to the new hash via
# find_one_and_update (compare-and-swap). Only the CAS winner keeps its inserted
# entry, so two pods can never fork the chain — and this needs NO unique index on
# historical audit_trail data (which may contain a pre-existing fork).
_HEAD_KEY = "chain_head"


async def _latest_chain_hash() -> str:
    """Return the integrity_hash of the most recently inserted CHAINED entry.

    Used only to initialize the head pointer the first time. Falls back to
    `_GENESIS_HASH` when no chained entry exists yet.
    """
    latest = await db.audit_trail.find_one(
        {"prev_hash": {"$exists": True}, "integrity_hash": {"$exists": True}},
        sort=[("stored_at", -1)],
        projection={"_id": 0, "integrity_hash": 1},
    )
    if latest and latest.get("integrity_hash"):
        return latest["integrity_hash"]
    return _GENESIS_HASH


async def _ensure_head_hash() -> str:
    """Read the current chain-head hash, initializing it (idempotently, race-safe
    via the unique `key` index) from the canonical latest chained hash."""
    doc = await db.audit_chain_state.find_one({"key": _HEAD_KEY}, {"_id": 0, "hash": 1})
    if doc and doc.get("hash"):
        return doc["hash"]
    seed = await _latest_chain_hash()
    try:
        await db.audit_chain_state.update_one(
            {"key": _HEAD_KEY},
            {"$setOnInsert": {"key": _HEAD_KEY, "hash": seed, "created_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    except DuplicateKeyError:
        pass  # another worker initialized it first
    doc = await db.audit_chain_state.find_one({"key": _HEAD_KEY}, {"_id": 0, "hash": 1})
    return (doc or {}).get("hash") or seed


async def _enqueue_audit_repair(entry: dict, prev_hash: str, new_hash: str, reason: str) -> None:
    """Durably capture a compliance event that could not be chained/inserted so a
    reconciler can re-insert it later WITHOUT rewriting history (audit fa1ad83 #1)."""
    try:
        doc = {k: v for k, v in entry.items() if k not in ("_id", "stored_at")}
        doc["prev_hash"] = prev_hash
        doc["integrity_hash"] = new_hash
        doc["queued_at"] = datetime.now(timezone.utc)
        doc["reason"] = reason
        await db.audit_repair_queue.insert_one(doc)
    except Exception as e:  # noqa: BLE001
        logger.error(f"AUDIT repair-queue write failed ({reason}): {e}")


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

    # Append via compare-and-swap on the singleton head pointer. We reserve the
    # next slot by atomically advancing the head from prev → our hash FIRST, then
    # insert the entry (append-only — no updates/deletes on audit_trail, SOC2
    # CC7.2). The CAS-first ordering means the head can advance before the row is
    # durably inserted; if the insert then fails we capture the FULL event
    # (incl. prev_hash + new_hash) in a durable repair queue so a reconciler can
    # re-insert it without rewriting history, and verify_audit_chain() reports
    # the head/last-event mismatch as NOT ok (audit fa1ad83 #1/#8).
    inserted = False
    cas_won = False
    async with _chain_lock:
        for _attempt in range(16):
            now = datetime.now(timezone.utc)
            prev = await _ensure_head_hash()
            entry.pop("_id", None)
            entry.pop("integrity_hash", None)
            entry.pop("stored_at", None)
            entry["timestamp"] = now.isoformat()
            entry["prev_hash"] = prev

            canonical = json.dumps(entry, sort_keys=True)
            new_hash = hashlib.sha256(canonical.encode()).hexdigest()

            advanced = await db.audit_chain_state.find_one_and_update(
                {"key": _HEAD_KEY, "hash": prev},
                {"$set": {"hash": new_hash, "updated_at": now}},
            )
            if advanced is None:
                # Lost the CAS — another writer advanced the head. Nothing was
                # inserted, so simply recompute against the new head and retry.
                continue

            cas_won = True
            entry["integrity_hash"] = new_hash
            entry["stored_at"] = now  # datetime for MongoDB TTL index
            try:
                await db.audit_trail.insert_one(entry)
                inserted = True
            except Exception as insert_err:  # noqa: BLE001
                # Head advanced but the evidence row failed to persist — durable
                # repair capture; do NOT delete from audit_trail.
                await _enqueue_audit_repair(entry, prev, new_hash, "insert_failed_after_head_advance")
                logger.error(f"AUDIT insert failed after head advance: {insert_err}")
            break

    if not cas_won and not inserted:
        # Never won the head slot after retries (extreme contention) — capture for
        # repair so the compliance event is not silently dropped.
        await _enqueue_audit_repair(
            entry, entry.get("prev_hash", ""), entry.get("integrity_hash", ""), "chain_cas_retries_exhausted"
        )
        logger.error(
            f"AUDIT chain append failed after retries; event queued for repair "
            f"(actor={actor_email} action={action} {resource_type}:{resource_id})"
        )

    if severity == "critical":
        logger.warning(f"AUDIT[{severity}] {actor_email} {action} {resource_type}:{resource_id}")


async def verify_audit_chain(limit: int = 10000, latest_window: bool = False) -> dict:
    """Walk the hash chain and report any breaks.

    Returns:
        {
          "ok": bool,                  # True only if every link verifies
          "entries_checked": int,
          "first_break_at": str | None,  # timestamp of first broken entry
          "first_break_id": str | None,  # _id (stringified) of first broken entry
          "skipped_legacy": int,         # legacy entries without integrity_hash
          "windowed": bool,              # True when only the latest window was walked
          "window_size": int,            # entries in the verified window
        }

    Modes:
      * Full-from-genesis (`latest_window=False`): walk oldest→newest, bounded by
        `limit`. Seeds expected_prev from the genesis hash. Suitable for a chain
        small enough to fit within `limit`.
      * Latest-window (`latest_window=True`): walk the NEWEST `limit` chained
        events. We fetch them descending, reverse to oldest-first, and seed
        expected_prev from the oldest-in-window row's own `prev_hash` (which
        links to the event immediately before the window). This guarantees
        recent tampering / chain breaks are caught even once production volume
        exceeds `limit` — the old oldest-first+limit walk silently verified only
        the OLDEST `limit` and could report a false green (audit #1798 P1).

    Implementation note: filters to entries with a `prev_hash` field so legacy
    pre-chain entries don't crowd out the chain window. `skipped_legacy` is
    counted out-of-band via a single count_documents.
    """
    # Count legacy entries (have integrity_hash but lack prev_hash) once.
    skipped_legacy = await db.audit_trail.count_documents(
        {"integrity_hash": {"$exists": True}, "prev_hash": {"$exists": False}}
    )

    chain_filter = {"prev_hash": {"$exists": True}, "integrity_hash": {"$exists": True}}
    projection = {
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
    }

    if latest_window:
        # Newest `limit` chained events, descending, then reversed to oldest-first.
        rows = (
            await db.audit_trail.find(chain_filter, sort=[("stored_at", -1)], projection=projection)
            .limit(limit)
            .to_list(limit)
        )
        rows.reverse()
        windowed = True
        # Seed from the oldest-in-window row's prev_hash (links to the event
        # immediately before the window). Genesis if the window starts at row 0.
        expected_prev = rows[0]["prev_hash"] if rows else _GENESIS_HASH
    else:
        rows = (
            await db.audit_trail.find(chain_filter, sort=[("stored_at", 1)], projection=projection)
            .limit(limit)
            .to_list(limit)
        )
        windowed = False
        expected_prev = _GENESIS_HASH

    checked = 0
    first_break_at: str | None = None
    first_break_id: str | None = None

    for entry in rows:
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

    # SOC2 evidence completeness: a nonzero repair-queue backlog means some
    # compliance events failed to chain and are awaiting reconciliation, so the
    # chain is NOT fully authoritative even when every existing link verifies
    # (audit 512bd5c F-18-06).
    repair_queue_backlog = await db.audit_repair_queue.count_documents({})
    # The cross-pod chain guard is the singleton head pointer (CAS). For evidence
    # to be authoritative the head must (a) exist and (b) equal the integrity_hash
    # of the most recently inserted chained event — otherwise the head advanced
    # past a row that never durably landed (audit fa1ad83 #8).
    head_doc = await db.audit_chain_state.find_one({"key": "chain_head"}, {"_id": 0, "hash": 1})
    chain_head_present = bool(head_doc and head_doc.get("hash"))
    last_event = await db.audit_trail.find_one(
        {"prev_hash": {"$exists": True}, "integrity_hash": {"$exists": True}},
        sort=[("stored_at", -1)],
        projection={"_id": 0, "integrity_hash": 1},
    )
    chain_head_matches_last_event = bool(
        chain_head_present and last_event and head_doc.get("hash") == last_event.get("integrity_hash")
    )

    return {
        "ok": (
            first_break_at is None
            and repair_queue_backlog == 0
            and chain_head_present
            and chain_head_matches_last_event
        ),
        "chain_links_ok": first_break_at is None,
        "entries_checked": checked,
        "first_break_at": first_break_at,
        "first_break_id": first_break_id,
        "skipped_legacy": skipped_legacy,
        "repair_queue_backlog": repair_queue_backlog,
        "chain_head_present": chain_head_present,
        "chain_head_matches_last_event": chain_head_matches_last_event,
        "windowed": windowed,
        "window_size": len(rows),
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
