#!/usr/bin/env python3
"""CarryOn™ — MongoDB schema-drift snapshot + detector.

Tracks the shape of critical collections and their indexes so forgotten
`create_index` calls or schema changes are caught BEFORE they cause a prod
degradation.

Usage:
    # Create snapshot (run after confirmed healthy prod/staging state)
    python3 scripts/schema_snapshot.py --save

    # Detect drift (run in CI or pre-push)
    python3 scripts/schema_snapshot.py --check
        exit 0 = no drift
        exit 1 = drift detected

Output file: scripts/.schema_snapshot.json
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

SNAPSHOT_FILE = Path(__file__).parent / ".schema_snapshot.json"
TRACKED_COLLECTIONS = [
    "users",
    "estates",
    "beneficiaries",
    "documents",
    "messages",
    "user_subscriptions",
    "founders_circle",
    "payment_transactions",
    "audit_trail",
    "subscription_overrides",
    "scheduler_locks",
    "rate_limits",
]


async def current_schema(db):
    """Collect index names + key options for each tracked collection."""
    snap = {}
    for name in TRACKED_COLLECTIONS:
        try:
            indexes = await db[name].list_indexes().to_list(100)
            snap[name] = sorted(
                [
                    {
                        "name": idx.get("name"),
                        "key": list(idx.get("key", {}).items()),
                        "unique": idx.get("unique", False),
                        "ttl_seconds": idx.get("expireAfterSeconds"),
                        "partial": bool(idx.get("partialFilterExpression")),
                    }
                    for idx in indexes
                ],
                key=lambda x: x["name"],
            )
        except Exception as e:
            snap[name] = {"error": str(e)}
    return snap


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--save", action="store_true", help="Save current schema as baseline")
    parser.add_argument("--check", action="store_true", help="Check for drift against baseline")
    args = parser.parse_args()

    if not args.save and not args.check:
        parser.print_help()
        sys.exit(1)

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        print("MONGO_URL and DB_NAME must be set", file=sys.stderr)
        sys.exit(2)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    current = await current_schema(db)

    if args.save:
        SNAPSHOT_FILE.write_text(json.dumps(current, indent=2, sort_keys=True))
        print(f"Schema snapshot saved to {SNAPSHOT_FILE}")
        sys.exit(0)

    # --check
    if not SNAPSHOT_FILE.exists():
        print(f"No baseline snapshot at {SNAPSHOT_FILE} — run --save first", file=sys.stderr)
        sys.exit(2)

    baseline = json.loads(SNAPSHOT_FILE.read_text())
    drift = []
    for coll in TRACKED_COLLECTIONS:
        base = baseline.get(coll)
        cur = current.get(coll)
        if base != cur:
            drift.append({"collection": coll, "baseline": base, "current": cur})

    if not drift:
        print("✓ No schema drift detected")
        sys.exit(0)

    print(f"✗ Schema drift detected in {len(drift)} collection(s):")
    for d in drift:
        print(f"\n  Collection: {d['collection']}")
        print(f"    Baseline: {json.dumps(d['baseline'], indent=4)[:500]}")
        print(f"    Current : {json.dumps(d['current'], indent=4)[:500]}")
    print("\nIf this drift is INTENDED, update the snapshot:")
    print("  python3 scripts/schema_snapshot.py --save")
    sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
