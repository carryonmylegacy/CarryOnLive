"""CarryOn™ — Lightweight MongoDB migration system (Feb 2026).

Why a custom runner instead of migrate-mongo / mongock?
  * Zero new external deps (we already have motor + pymongo).
  * Works with motor (async) which migrate-mongo's CLI doesn't.
  * Idempotent: every migration records its hash in `db.schema_migrations`
    after a successful run, so re-running is a no-op.

USAGE
-----
Add files to /app/backend/migrations/ named like `0002_add_estate_archived_flag.py`.
Each file must expose an `async def up(db): ...` coroutine.

Migrations run automatically at backend startup (via server.py lifespan).
To run manually:

    python -m backend.migrations.runner            # apply all pending
    python -m backend.migrations.runner --list     # show pending + applied
    python -m backend.migrations.runner --dry-run  # rehearse without writing

SAFETY
------
* Each migration runs in a try/except — failure logs an error but does NOT
  abort backend startup. The migration is also NOT marked applied so it
  will retry on next boot.
* The schema_migrations collection has a unique index on `name`. The runner
  acquires a Mongo-backed lock (services/scheduler_lock.py) so multiple
  pods coming up simultaneously do not double-run a migration.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import importlib
import logging
from datetime import datetime, timezone
from pathlib import Path

from config import client, db
from services.scheduler_lock import with_scheduler_lock

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).parent
COLLECTION = "schema_migrations"


def _discover_migrations() -> list[tuple[str, Path]]:
    """Return [(name, path)] sorted by filename prefix."""
    out: list[tuple[str, Path]] = []
    for p in sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9][0-9]_*.py")):
        out.append((p.stem, p))
    return out


def _hash_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


async def _ensure_index() -> None:
    await db[COLLECTION].create_index("name", unique=True)


async def _applied_names() -> set[str]:
    await _ensure_index()
    cursor = db[COLLECTION].find({}, {"_id": 0, "name": 1})
    return {doc["name"] async for doc in cursor}


async def run_pending(dry_run: bool = False) -> dict:
    """Apply all pending migrations under a distributed lock."""
    async with with_scheduler_lock("schema_migrations", ttl_seconds=300) as got:
        if not got:
            logger.info("Another pod is running migrations; skipping this pod")
            return {"applied": 0, "skipped_locked": True}

        applied = await _applied_names()
        all_migrations = _discover_migrations()
        pending = [(name, path) for name, path in all_migrations if name not in applied]

        if not pending:
            logger.info(f"No pending migrations ({len(applied)} already applied)")
            return {"applied": 0, "already_applied": len(applied)}

        applied_count = 0
        for name, path in pending:
            file_hash = _hash_file(path)
            if dry_run:
                logger.info(f"[DRY-RUN] Would apply: {name} (hash={file_hash})")
                continue
            try:
                mod = importlib.import_module(f"migrations.{name}")
                if not hasattr(mod, "up"):
                    logger.error(f"Migration {name} has no `up(db)` coroutine; skipping")
                    continue
                logger.info(f"Applying migration: {name}")
                await mod.up(db)
                await db[COLLECTION].insert_one(
                    {
                        "name": name,
                        "hash": file_hash,
                        "applied_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
                applied_count += 1
                logger.info(f"✅ Migration {name} applied")
            except Exception as exc:
                logger.error(f"❌ Migration {name} failed: {exc}", exc_info=True)
                # Stop on first failure — do NOT run later migrations that
                # may depend on this one.
                break

        return {
            "applied": applied_count,
            "pending_remaining": len(pending) - applied_count,
            "already_applied": len(applied),
        }


async def list_status() -> dict:
    applied = await _applied_names()
    all_m = _discover_migrations()
    pending = [name for name, _ in all_m if name not in applied]
    return {
        "applied": sorted(applied),
        "pending": pending,
        "total": len(all_m),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="Show applied + pending migrations")
    ap.add_argument("--dry-run", action="store_true", help="Rehearse without writing")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if args.list:
        status = asyncio.run(list_status())
        print(f"Applied ({len(status['applied'])}):")
        for n in status["applied"]:
            print(f"  ✓ {n}")
        print(f"Pending ({len(status['pending'])}):")
        for n in status["pending"]:
            print(f"  ○ {n}")
    else:
        asyncio.run(run_pending(dry_run=args.dry_run))
    client.close()
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
