"""Backup-drill smoke pack.

Run against a restored cluster to confirm the data is intact:

    MONGO_URL='<restored-uri>' DB_NAME=carryon python scripts/backup_drill_smoke.py

Exits 0 on success, 1 on any verification failure.
"""

import asyncio
import os
import sys

REQUIRED_COLLECTIONS = (
    "users",
    "estates",
    "documents",
    "audit_trail",
    "emergency_plans",
)


async def main() -> int:
    sys.path.insert(0, "/app/backend")

    # Import after sys.path adjustment so we get the project's config module.
    from config import db  # noqa: E402
    from services.audit import verify_audit_chain  # noqa: E402

    print(f"Connecting to {os.environ.get('DB_NAME')}...")

    # 1. Collection presence + count
    failures: list[str] = []
    for coll in REQUIRED_COLLECTIONS:
        try:
            count = await db[coll].count_documents({})
            print(f"  ✓ {coll}: {count} docs")
            if count == 0 and coll in ("users", "estates"):
                failures.append(f"{coll} is empty — restore likely corrupted")
        except Exception as e:
            failures.append(f"{coll}: query failed ({e})")

    # 2. Audit-trail hash chain
    print("Verifying audit-trail hash chain (this can take a moment)...")
    chain = await verify_audit_chain(limit=50000)
    print(f"  chain.ok={chain['ok']} checked={chain['entries_checked']} legacy_skipped={chain['skipped_legacy']}")
    if not chain["ok"]:
        failures.append(f"audit chain broken at {chain['first_break_at']} (_id={chain['first_break_id']})")

    # 3. Cross-reference: latest 5 estates must have a resolvable owner
    print("Cross-referencing latest 5 estates → owners...")
    latest = (
        await db.estates.find({}, {"_id": 0, "id": 1, "owner_id": 1, "name": 1})
        .sort("created_at", -1)
        .limit(5)
        .to_list(5)
    )
    resolved = 0
    for est in latest:
        owner = await db.users.find_one({"id": est.get("owner_id")}, {"_id": 0, "id": 1})
        if owner:
            resolved += 1
        else:
            failures.append(f"estate {est.get('id')} owner {est.get('owner_id')} missing")
    print(f"  {resolved}/{len(latest)} estates intact")

    if failures:
        print("\nFAIL:")
        for f in failures:
            print(f"  - {f}")
        return 1

    print(f"\nOK: {len(REQUIRED_COLLECTIONS)} collections, chain verified, {resolved}/{len(latest)} estates intact")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
