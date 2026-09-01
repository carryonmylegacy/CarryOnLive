"""One-time migration — encrypt legacy AI chat transcripts at rest (D6).

Encrypts `chat_history.content` (EGA) and `beneficiary_concierge_messages
.question/.answer` (BEC) with each estate's AES-256 key, marking migrated
rows with `enc_v: 1`. Idempotent: rows already carrying `enc_v: 1` are never
touched, so the script can be re-run safely at any time.

Rows WITHOUT an `estate_id` cannot be estate-scoped. By default they are
left as plaintext and counted. With `--backfill`, the script resolves the
missing `estate_id` from the row's `user_id` when that user owns EXACTLY
ONE estate (deterministic — EGA is benefactor-side and legacy rows predate
estate stamping), writes it onto the row, and encrypts it like any other.
Rows whose user owns zero or multiple estates stay plaintext and are
reported. `--backfill` also re-scans rows an earlier run marked `enc_v: 0`
("skipped"), so nothing is ever permanently skipped.

USAGE (Render shell, from the backend directory):

    python scripts/migrate_encrypt_transcripts.py                     # DRY RUN
    python scripts/migrate_encrypt_transcripts.py --backfill          # DRY RUN incl. estate_id resolution
    python scripts/migrate_encrypt_transcripts.py --backfill --apply  # backfill estate_id + encrypt
    python scripts/migrate_encrypt_transcripts.py --apply             # encrypt only (skips estate-less rows)

Requires MONGO_URL / DB_NAME / ENCRYPTION_KEY in the environment (already
set on the Render service). Exits 0 on success, 1 on any failure.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BATCH = 500


async def _salt(db, cache: dict, estate_id: str):
    from services.encryption import get_estate_salt

    if estate_id not in cache:
        try:
            cache[estate_id] = await get_estate_salt(estate_id)
        except Exception:
            cache[estate_id] = None  # estate deleted → leave rows plaintext
    return cache[estate_id]


async def _resolve_estate(db, cache: dict, user_id: str):
    """estate_id when `user_id` owns exactly one estate, else None."""
    if user_id not in cache:
        estates = await db.estates.find({"owner_id": user_id}, {"_id": 0, "id": 1}).to_list(3)
        cache[user_id] = estates[0]["id"] if len(estates) == 1 else None
    return cache[user_id]


async def migrate_collection(db, apply: bool, backfill: bool, name: str, fields: tuple) -> dict:
    from services.transcript_crypto import ENC_VERSION, enc

    coll = db[name]
    stats = {
        "scanned": 0,
        "encrypted": 0,
        "backfilled_estate_id": 0,
        "no_estate_unresolvable": 0,
        "no_salt": 0,
        "empty": 0,
    }
    salts: dict = {}
    owners: dict = {}
    # --backfill re-scans rows an earlier --apply marked enc_v: 0 (skipped).
    base_query = {"enc_v": {"$in": [None, 0]}} if backfill else {"enc_v": {"$exists": False}}
    projection = {"_id": 1, "estate_id": 1, "user_id": 1, **{f: 1 for f in fields}}

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
            estate_id = row.get("estate_id")
            backfilled = False
            if not estate_id and backfill and row.get("user_id"):
                estate_id = await _resolve_estate(db, owners, row["user_id"])
                backfilled = estate_id is not None
            if not estate_id:
                stats["no_estate_unresolvable"] += 1
                if apply:
                    await coll.update_one({"_id": row["_id"]}, {"$set": {"enc_v": 0}})
                continue
            salt = await _salt(db, salts, estate_id)
            if salt is None:
                stats["no_salt"] += 1
                if apply:
                    await coll.update_one({"_id": row["_id"]}, {"$set": {"enc_v": 0}})
                continue
            update = {}
            for f in fields:
                val = row.get(f)
                if val:
                    stored, _ = enc(val, salt)
                    update[f] = stored
            if not update:
                stats["empty"] += 1
                if apply:
                    await coll.update_one({"_id": row["_id"]}, {"$set": {"enc_v": 0}})
                continue
            if backfilled:
                update["estate_id"] = estate_id
                stats["backfilled_estate_id"] += 1
            stats["encrypted"] += 1
            if apply:
                await coll.update_one({"_id": row["_id"]}, {"$set": {**update, "enc_v": ENC_VERSION}})
    return stats


async def main() -> int:
    apply = "--apply" in sys.argv
    backfill = "--backfill" in sys.argv
    from config import db

    mode = "APPLY" if apply else "DRY RUN (pass --apply to write)"
    if backfill:
        mode += " + BACKFILL (resolve missing estate_id via sole-estate owner)"
    print(f"== Transcript encryption migration — {mode} ==")
    ok = True
    for name, fields in (
        ("chat_history", ("content",)),
        ("beneficiary_concierge_messages", ("question", "answer")),
    ):
        try:
            stats = await migrate_collection(db, apply, backfill, name, fields)
            print(f"{name}: {stats}")
        except Exception as e:
            ok = False
            print(f"{name}: FAILED — {e}")
    if not apply:
        print("NOTE: dry run scans everything but writes nothing; 'encrypted' = rows that WOULD be encrypted.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
