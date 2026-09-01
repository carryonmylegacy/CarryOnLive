"""One-time migration — encrypt legacy AI chat transcripts at rest (D6).

Encrypts `chat_history.content` (EGA) and `beneficiary_concierge_messages
.question/.answer` (BEC) with each estate's AES-256 key, marking migrated
rows with `enc_v: 1`. Idempotent: rows already carrying `enc_v: 1` are never
touched, so the script can be re-run safely at any time.

Rows WITHOUT an `estate_id` cannot be estate-scoped. By default they are
left as plaintext and counted. With `--backfill`, the script resolves the
missing `estate_id` deterministically, writes it onto the row, and encrypts
it like any other:

  1. sole owner   — the row's `user_id` owns EXACTLY ONE estate.
  2. cost ledger  — (EGA only) exactly one `llm_cost_ledger` `guardian.*`
                    entry for the same user within ±180 s of the row, AND
                    that estate is still owned by the user.

Rows that still cannot be resolved (user owns several estates, no ledger
match) stay plaintext and are reported. `--backfill` also re-scans rows an
earlier run marked `enc_v: 0` ("skipped"), so nothing is ever permanently
skipped.

`--delete-orphans` (implies --backfill) additionally deletes plaintext rows
that NO login can reach and that the deletion cascades should already have
removed: `user_id` missing, user no longer exists, user owns no estates
(EGA only — the estate was deleted), or the row's estate no longer exists.
Every row that would be deleted is listed BEFORE anything is deleted.

DRY RUN IS THE DEFAULT for every mode — nothing is written until `--apply`.
A dry run reads only; it never persists an estate salt or touches a row.

USAGE (Render shell, from the backend directory):

    python scripts/migrate_encrypt_transcripts.py                                   # DRY RUN
    python scripts/migrate_encrypt_transcripts.py --backfill                        # DRY RUN incl. estate_id resolution
    python scripts/migrate_encrypt_transcripts.py --backfill --delete-orphans       # DRY RUN incl. orphan listing
    python scripts/migrate_encrypt_transcripts.py --backfill --delete-orphans --apply   # backfill + encrypt + delete orphans
    python scripts/migrate_encrypt_transcripts.py --apply                           # encrypt only (skips estate-less rows)

Requires MONGO_URL / DB_NAME / ENCRYPTION_KEY in the environment (already
set on the Render service). Exits 0 on success, 1 on any failure.
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BATCH = 500
LEDGER_WINDOW = timedelta(seconds=180)
COLLECTIONS = (
    ("chat_history", ("content",)),
    ("beneficiary_concierge_messages", ("question", "answer")),
)


def _dt(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


class Caches:
    def __init__(self):
        self.salts: dict = {}
        self.owned: dict = {}
        self.users: dict = {}


async def _salt(db, caches: Caches, estate_id: str, apply: bool):
    """Estate salt, or None when the estate no longer exists.

    Dry runs only check the estate exists (read-only). Apply mode uses
    get_estate_salt, which lazily persists a salt for a legacy estate."""
    if estate_id not in caches.salts:
        if apply:
            from services.encryption import get_estate_salt

            try:
                caches.salts[estate_id] = await get_estate_salt(estate_id)
            except Exception:
                caches.salts[estate_id] = None
        else:
            exists = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1})
            caches.salts[estate_id] = b"dry-run" if exists else None
    return caches.salts[estate_id]


async def _owned_estates(db, caches: Caches, user_id: str) -> list:
    if user_id not in caches.owned:
        rows = await db.estates.find({"owner_id": user_id}, {"_id": 0, "id": 1}).to_list(1000)
        caches.owned[user_id] = [r["id"] for r in rows]
    return caches.owned[user_id]


async def _user(db, caches: Caches, user_id: str):
    """Minimal user identity for the orphan report, or None when deleted."""
    if user_id not in caches.users:
        caches.users[user_id] = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "email": 1, "username": 1})
    return caches.users[user_id]


async def _resolve_via_ledger(db, user_id: str, created_at, owned: list):
    """Estate of the single guardian.* ledger entry within ±180 s, if still owned."""
    t = _dt(created_at)
    if t is None:
        return None
    rows = await db.llm_cost_ledger.find(
        {
            "user_id": user_id,
            "endpoint": {"$regex": "^guardian"},
            "estate_id": {"$type": "string"},
            "created_at": {"$gte": t - LEDGER_WINDOW, "$lte": t + LEDGER_WINDOW},
        },
        {"_id": 0, "estate_id": 1},
    ).to_list(100)
    estates = {r["estate_id"] for r in rows}
    if len(estates) != 1:
        return None
    estate_id = estates.pop()
    return estate_id if estate_id in owned else None


async def _classify(db, caches: Caches, row: dict, name: str, backfill: bool):
    """→ (kind, detail, estate_id). kind ∈ resolved:<method> | keep | orphan | unresolvable | no_estate."""
    user_id = row.get("user_id")
    estate_id = row.get("estate_id")
    if not backfill:
        return ("keep", None, estate_id) if estate_id else ("no_estate", "no estate_id (run with --backfill)", None)
    if not user_id:
        return ("orphan", "user_id missing", None)
    if await _user(db, caches, user_id) is None:
        return ("orphan", "user no longer exists", None)
    if estate_id:
        return ("keep", None, estate_id)
    owned = await _owned_estates(db, caches, user_id)
    if len(owned) == 1:
        return ("resolved:sole_owner", None, owned[0])
    if name == "chat_history":
        if not owned:
            return ("orphan", "user owns no estates (estate deleted)", None)
        via_ledger = await _resolve_via_ledger(db, user_id, row.get("created_at"), owned)
        if via_ledger:
            return ("resolved:ledger", None, via_ledger)
        return ("unresolvable", f"user owns {len(owned)} estates, no ledger match", None)
    return ("unresolvable", "beneficiary row without estate_id", None)


def _describe(row: dict, name: str, fields: tuple, user, reason: str) -> str:
    if not row.get("user_id"):
        who = "user_id MISSING"
    elif user is None:
        who = f"DELETED user {row['user_id'][:8]}…"
    else:
        who = user.get("email") or user.get("username") or row["user_id"][:8]
    chars = sum(len(row.get(f) or "") for f in fields)
    return (
        f"  [{name}] {reason} | {who} | session={row.get('session_id')} | "
        f"{str(row.get('created_at'))[:19]} | role={row.get('role', 'bec')} | {chars} chars"
    )


async def migrate_collection(db, apply: bool, backfill: bool, delete_orphans: bool, name: str, fields: tuple):
    from services.transcript_crypto import ENC_VERSION, enc

    coll = db[name]
    caches = Caches()
    stats = {
        "scanned": 0,
        "encrypted": 0,
        "backfilled_estate_id": 0,
        "backfilled_via_sole_owner": 0,
        "backfilled_via_ledger": 0,
        "unresolvable_kept": 0,
        "no_estate_unresolvable": 0,
        "orphans": 0,
        "empty": 0,
    }
    orphans: list = []  # (row, reason, description)
    # --backfill re-scans rows an earlier --apply marked enc_v: 0 (skipped).
    base_query = {"enc_v": {"$in": [None, 0]}} if backfill else {"enc_v": {"$exists": False}}
    projection = {"_id": 1, "estate_id": 1, "user_id": 1, "session_id": 1, "role": 1, "created_at": 1}
    projection.update({f: 1 for f in fields})

    async def mark_skipped(row):
        if apply:
            await coll.update_one({"_id": row["_id"]}, {"$set": {"enc_v": 0}})

    # `_id`-cursor pagination: each batch advances past the last seen row
    # regardless of what was written, so unresolvable rows can never make
    # the loop spin in place.
    last_id = None
    while True:
        query = dict(base_query)
        if last_id is not None:
            query["_id"] = {"$gt": last_id}
        rows = await coll.find(query, projection).sort("_id", 1).limit(BATCH).to_list(BATCH)
        if not rows:
            break
        last_id = rows[-1]["_id"]
        for row in rows:
            stats["scanned"] += 1
            kind, reason, estate_id = await _classify(db, caches, row, name, backfill)
            if kind == "orphan":
                if delete_orphans:
                    orphans.append(
                        (row, reason, _describe(row, name, fields, caches.users.get(row.get("user_id")), reason))
                    )
                    stats["orphans"] += 1
                else:
                    stats["no_estate_unresolvable"] += 1
                    await mark_skipped(row)
                continue
            if kind in ("unresolvable", "no_estate"):
                stats["unresolvable_kept" if kind == "unresolvable" else "no_estate_unresolvable"] += 1
                await mark_skipped(row)
                continue
            salt = await _salt(db, caches, estate_id, apply)
            if salt is None:
                reason = "estate no longer exists"
                if delete_orphans:
                    orphans.append(
                        (row, reason, _describe(row, name, fields, caches.users.get(row.get("user_id")), reason))
                    )
                    stats["orphans"] += 1
                else:
                    stats["no_estate_unresolvable"] += 1
                    await mark_skipped(row)
                continue
            update = {}
            for f in fields:
                val = row.get(f)
                if val:
                    update[f] = enc(val, salt)[0] if apply else val
            if not update:
                stats["empty"] += 1
                await mark_skipped(row)
                continue
            if kind.startswith("resolved:"):
                update["estate_id"] = estate_id
                stats["backfilled_estate_id"] += 1
                stats["backfilled_via_" + kind.split(":", 1)[1]] += 1
            stats["encrypted"] += 1
            if apply:
                await coll.update_one({"_id": row["_id"]}, {"$set": {**update, "enc_v": ENC_VERSION}})

    if delete_orphans and orphans:
        verb = "DELETING" if apply else "WOULD DELETE"
        print(f"\n{name}: {verb} {len(orphans)} orphaned plaintext row(s):")
        for _, _, desc in orphans:
            print(desc)
        by_reason: dict = {}
        for _, reason, _ in orphans:
            by_reason[reason] = by_reason.get(reason, 0) + 1
        print(f"{name}: orphan reasons — {by_reason}")
        if apply:
            ids = [o[0]["_id"] for o in orphans]
            deleted = 0
            for i in range(0, len(ids), BATCH):
                r = await coll.delete_many({"_id": {"$in": ids[i : i + BATCH]}})
                deleted += r.deleted_count
            stats["orphans_deleted"] = deleted
            print(f"{name}: deleted {deleted} orphaned row(s).")
    return stats


async def main() -> int:
    apply = "--apply" in sys.argv
    delete_orphans = "--delete-orphans" in sys.argv
    backfill = "--backfill" in sys.argv or delete_orphans
    from config import db

    mode = "APPLY" if apply else "DRY RUN (pass --apply to write)"
    if backfill:
        mode += " + BACKFILL (sole-owner, then guardian cost-ledger ±180s)"
    if delete_orphans:
        mode += " + DELETE-ORPHANS (unreachable plaintext rows are listed before deletion)"
    print(f"== Transcript encryption migration — {mode} ==")
    ok = True
    for name, fields in COLLECTIONS:
        try:
            stats = await migrate_collection(db, apply, backfill, delete_orphans, name, fields)
            print(f"{name}: {stats}")
        except Exception as e:
            ok = False
            print(f"{name}: FAILED — {e}")
    if not apply:
        print(
            "NOTE: dry run scans everything but writes nothing; 'encrypted' = rows that WOULD be encrypted, "
            "'orphans' = rows that WOULD be deleted (listed above)."
        )
    if apply:
        remaining = 0
        for name, _ in COLLECTIONS:
            remaining += await db[name].count_documents({"enc_v": {"$in": [None, 0]}})
        print(f"Plaintext transcript rows remaining (enc_v missing or 0): {remaining}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
