"""CarryOn™ — Erasure service (GDPR Art. 17 / CCPA §1798.105). Sep 2026.

One executor for every deletion path: benefactor estate-delete, admin estate/user delete,
and (Phase 2) self-service account deletion. Driven entirely by services/erasure_manifest.py
so the code can never do less than the manifest says — and the drift guard makes sure the
manifest can never say less than the schema holds.

Every run writes a pseudonymous receipt (`erasure_receipts`: hashes + per-collection counts,
no PII) and a hash-chained audit_trail entry.
"""

import hashlib
import uuid
from datetime import datetime, timezone

from config import db, logger
from services import erasure_manifest as m
from services.estate_purge import purge_estate_storage, purge_user_storage
from services.storage import storage


def _h(value: str) -> str:
    return hashlib.sha256((value or "").strip().lower().encode()).hexdigest()


def _or(keys, value):
    return {"$or": [{k: value} for k in keys]} if len(keys) > 1 else {keys[0]: value}


async def _delete_blobs(coll, query) -> int:
    """Best-effort: remove object-storage blobs referenced by rows about to be deleted."""
    proj = {"_id": 0, **{f: 1 for f in m.BLOB_KEY_FIELDS}}
    removed = 0
    async for row in db[coll].find(query, proj):
        for f in m.BLOB_KEY_FIELDS:
            key = row.get(f)
            if key and isinstance(key, str) and not key.startswith("http"):
                try:
                    if await storage.delete(key):
                        removed += 1
                except Exception as e:  # storage is best-effort; rows are still deleted
                    logger.warning(f"[erasure] blob delete failed {coll}.{f}={key}: {e}")
    return removed


async def _purge_prefixes(prefixes) -> int:
    n = 0
    for p in prefixes:
        try:
            n += await storage.purge_prefix(p)
        except Exception as e:
            logger.warning(f"[erasure] prefix purge failed {p}: {e}")
    return n


async def _anonymise(entry: dict, value: str) -> int:
    query = _or(entry["match"], value)
    update = {}
    if entry.get("unset"):
        update["$unset"] = {f: "" for f in entry["unset"]}
    sets = dict(entry.get("set") or {})
    if entry.get("hash"):
        sets[entry["hash"]] = "sha256:" + _h(value)
    if sets:
        update["$set"] = sets
    if not update:
        return 0
    r = await db[entry["_coll"]].update_many(query, update)
    return r.modified_count


async def _audit(actor: dict, action: str, resource_type: str, resource_id: str, details: dict):
    try:
        from services.audit import log_audit_event

        await log_audit_event(
            actor_id=actor.get("id", "system"),
            actor_email=actor.get("email", "system"),
            actor_role=actor.get("role", "system"),
            action=action,
            category="compliance",
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            severity="warning",
        )
    except Exception as e:
        logger.warning(f"[erasure] audit entry failed: {e}")


async def erase_estate(estate_id: str, *, actor: dict, reason: str = "estate_delete") -> dict:
    """Delete every estate-scoped row + blob for one estate. Returns per-collection counts."""
    counts: dict = {}
    if not estate_id:
        return counts
    blobs = 0
    try:
        blobs += sum((await purge_estate_storage(estate_id)).values())
    except Exception as e:
        logger.warning(f"[erasure] purge_estate_storage failed {estate_id}: {e}")
    for coll, keys in m.ESTATE_DELETE.items():
        q = _or(keys, estate_id)
        blobs += await _delete_blobs(coll, q)
        r = await db[coll].delete_many(q)
        if r.deleted_count:
            counts[coll] = r.deleted_count
    for coll, entry in m.ANONYMISE.items():
        if "estate_id" in entry["match"]:
            n = await _anonymise({**entry, "_coll": coll, "match": ("estate_id",)}, estate_id)
            if n:
                counts[f"{coll}:anonymised"] = n
    blobs += await _purge_prefixes(p.format(estate_id=estate_id) for p in m.ESTATE_STORAGE_PREFIXES)
    r = await db.estates.delete_one({"id": estate_id})
    counts["estates"] = r.deleted_count
    counts["storage_objects"] = blobs
    await _audit(actor, f"erasure.estate.{reason}", "estate", estate_id, {"counts": counts})
    return counts


async def erase_user(user_id: str, *, actor: dict, reason: str = "admin_delete", request_id: str | None = None) -> dict:
    """Erase a user and everything reachable from them. Idempotent; returns the receipt."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "email": 1, "role": 1, "username": 1})
    email = (user or {}).get("email", "")
    started = datetime.now(timezone.utc)
    counts: dict = {}
    blobs = 0

    # 1) owned estates — full estate cascade each
    estate_ids = [e["id"] for e in await db.estates.find({"owner_id": user_id}, {"_id": 0, "id": 1}).to_list(1000)]
    for eid in estate_ids:
        for k, v in (await erase_estate(eid, actor=actor, reason=reason)).items():
            counts[k] = counts.get(k, 0) + v

    # 2) children reached through a parent row (must run before the parents go)
    for coll, (parent, child_key, parent_key) in m.USER_DELETE_VIA_PARENT.items():
        pkeys = m.USER_DELETE.get(parent, ("user_id",))
        parents = [
            p.get(parent_key)
            for p in await db[parent].find(_or(pkeys, user_id), {"_id": 0, parent_key: 1}).to_list(10000)
        ]
        parents = [p for p in parents if p]
        if parents:
            r = await db[coll].delete_many({child_key: {"$in": parents}})
            if r.deleted_count:
                counts[coll] = counts.get(coll, 0) + r.deleted_count

    # 3) user-keyed rows (+ their blobs, + abandoned chunk buffers)
    uploads = [u["id"] for u in await db.chunked_uploads.find({"user_id": user_id}, {"_id": 0, "id": 1}).to_list(10000)]
    for coll, keys in m.USER_DELETE.items():
        if not keys:
            continue
        q = _or(keys, user_id)
        blobs += await _delete_blobs(coll, q)
        r = await db[coll].delete_many(q)
        if r.deleted_count:
            counts[coll] = counts.get(coll, 0) + r.deleted_count
    blobs += await _purge_prefixes(m.CHUNKED_TMP_PREFIX.format(upload_id=u) for u in uploads)

    # 4) unlink where the row belongs to someone else (D2, memberships)
    r = await db.beneficiaries.update_many({"user_id": user_id}, {"$set": m.USER_UNLINK["beneficiaries"]["set"]})
    if r.modified_count:
        counts["beneficiaries:unlinked"] = r.modified_count
    r = await db.estates.update_many({"beneficiaries": user_id}, {"$pull": {"beneficiaries": user_id}})
    if r.modified_count:
        counts["estates:unlinked"] = r.modified_count
    r = await db.estate_channels.update_many({"members": user_id}, {"$pull": {"members": user_id}})
    if r.modified_count:
        counts["estate_channels:unlinked"] = r.modified_count
    r = await db.family_plans.update_many({"members.user_id": user_id}, {"$pull": {"members": {"user_id": user_id}}})
    if r.modified_count:
        counts["family_plans:unlinked"] = r.modified_count
    if email:
        r = await db.failed_logins.delete_many({"email": {"$in": [email, email.lower(), user_id]}})
        if r.deleted_count:
            counts["failed_logins"] = r.deleted_count

    # 5) anonymise telemetry / financial / compliance rows
    for coll, entry in m.ANONYMISE.items():
        n = await _anonymise({**entry, "_coll": coll}, user_id)
        if n:
            counts[f"{coll}:anonymised"] = n

    # 6) sessions dead, personal storage gone, user row gone
    try:
        from services.token_blacklist import revoke_all_user_tokens

        await revoke_all_user_tokens(user_id, reason="erasure")
    except Exception as e:
        logger.warning(f"[erasure] token revocation failed {user_id}: {e}")
    try:
        blobs += await purge_user_storage(user_id)
    except Exception as e:
        logger.warning(f"[erasure] purge_user_storage failed {user_id}: {e}")
    blobs += await _purge_prefixes(p.format(user_id=user_id) for p in m.USER_STORAGE_PREFIXES)
    r = await db.users.delete_one({"id": user_id})
    counts["users"] = r.deleted_count
    counts["storage_objects"] = blobs

    receipt = {
        "id": str(uuid.uuid4()),
        "request_id": request_id,
        "subject_hash": _h(email) if email else None,
        "user_id_hash": _h(user_id),
        "role": (user or {}).get("role"),
        "reason": reason,
        "actor_id_hash": _h(actor.get("id", "system")),
        "actor_role": actor.get("role", "system"),
        "estates_erased": len(estate_ids),
        "counts": counts,
        "retained": sorted(m.RETAIN),
        "legal_hold": False,
        "started_at": started.isoformat(),
        "executed_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.erasure_receipts.insert_one(dict(receipt))
    await _audit(
        actor,
        f"erasure.user.{reason}",
        "user",
        receipt["user_id_hash"][:16],
        {"estates": len(estate_ids), "collections": len(counts)},
    )
    logger.info(f"[erasure] user erased reason={reason} estates={len(estate_ids)} collections={len(counts)}")
    return receipt
