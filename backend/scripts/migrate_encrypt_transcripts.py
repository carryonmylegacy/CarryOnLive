"""One-time migration — encrypt legacy AI chat transcripts at rest (D6).

Encrypts `chat_history.content` (EGA) and `beneficiary_concierge_messages
.question/.answer` (BEC) with each estate's AES-256 key, marking migrated
rows with `enc_v: 1`. Idempotent: rows that already carry `enc_v` are never
touched, so the script can be re-run safely at any time.

Rows WITHOUT an `estate_id` cannot be estate-scoped and are left as
plaintext (the read path passes them through unchanged) — they are counted
and reported so the founder can decide whether to delete them.

USAGE (Render shell, from the backend directory):

    python scripts/migrate_encrypt_transcripts.py            # DRY RUN (default)
    python scripts/migrate_encrypt_transcripts.py --apply    # actually encrypt

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


async def migrate_collection(db, apply: bool, name: str, fields: tuple) -> dict:
    from services.transcript_crypto import ENC_VERSION, enc

    coll = db[name]
    stats = {"scanned": 0, "encrypted": 0, "no_estate": 0, "no_salt": 0, "empty": 0}
    salts: dict = {}
    query = {"enc_v": {"$exists": False}}
    projection = {"_id": 1, "estate_id": 1, **{f: 1 for f in fields}}

    while True:
        rows = await coll.find(query, projection).limit(BATCH).to_list(BATCH)
        if not rows:
            break
        made_progress = False
        for row in rows:
            stats["scanned"] += 1
            estate_id = row.get("estate_id")
            if not estate_id:
                stats["no_estate"] += 1
                if apply:  # mark so the query loop terminates; 0 = "not encrypted"
                    await coll.update_one({"_id": row["_id"]}, {"$set": {"enc_v": 0}})
                    made_progress = True
                continue
            salt = await _salt(db, salts, estate_id)
            if salt is None:
                stats["no_salt"] += 1
                if apply:
                    await coll.update_one({"_id": row["_id"]}, {"$set": {"enc_v": 0}})
                    made_progress = True
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
                    made_progress = True
                continue
            stats["encrypted"] += 1
            if apply:
                await coll.update_one({"_id": row["_id"]}, {"$set": {**update, "enc_v": ENC_VERSION}})
                made_progress = True
        if not apply or not made_progress:
            break  # dry run: one pass over the first batches is enough to report
    return stats


async def main() -> int:
    apply = "--apply" in sys.argv
    from config import db

    mode = "APPLY" if apply else "DRY RUN (pass --apply to write)"
    print(f"== Transcript encryption migration — {mode} ==")
    ok = True
    for name, fields in (
        ("chat_history", ("content",)),
        ("beneficiary_concierge_messages", ("question", "answer")),
    ):
        try:
            stats = await migrate_collection(db, apply, name, fields)
            print(f"{name}: {stats}")
        except Exception as e:
            ok = False
            print(f"{name}: FAILED — {e}")
    if not apply:
        print("NOTE: dry run scans only the first unmigrated batches; counts are a lower bound.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
