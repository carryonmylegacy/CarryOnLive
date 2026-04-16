"""CarryOn™ — Distributed Scheduler Lock (MongoDB-backed)

Prevents double-firing of background schedulers when multiple API pods are
running. Uses MongoDB's atomic `findOneAndUpdate` for leader election +
heartbeat-based liveness. No Redis required.

Usage:
    from services.scheduler_lock import with_scheduler_lock

    async def my_scheduler_loop():
        while True:
            async with with_scheduler_lock("weekly_digest", ttl_seconds=300):
                # only ONE pod runs this block; others fall through
                await do_work()
            await asyncio.sleep(3600)

If MongoDB is unreachable the lock degrades open (allows run) so that single-pod
deployments never break. In multi-pod deployments with a healthy Mongo (the
production reality) exactly one pod acquires the lock at a time.
"""

import asyncio
import os
import socket
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from config import db, logger

# A unique instance id per process. Used to identify lock holders in logs
# and for safe release (a pod only releases locks it owns).
INSTANCE_ID = f"{socket.gethostname()}-{os.getpid()}"


async def _ensure_lock_index():
    """Create TTL index on scheduler_locks. Idempotent."""
    try:
        await db.scheduler_locks.create_index("expires_at", expireAfterSeconds=0)
        await db.scheduler_locks.create_index("name", unique=True)
    except Exception as e:
        logger.debug(f"scheduler_locks index creation skipped: {e}")


async def acquire(name: str, ttl_seconds: int = 300) -> bool:
    """Try to acquire a distributed lock. Returns True if acquired, else False."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(seconds=ttl_seconds)
    try:
        # Upsert only if expired or missing: atomic leader election.
        res = await db.scheduler_locks.find_one_and_update(
            {
                "name": name,
                "$or": [
                    {"expires_at": {"$lt": now}},
                    {"holder": INSTANCE_ID},
                ],
            },
            {
                "$set": {
                    "holder": INSTANCE_ID,
                    "acquired_at": now,
                    "expires_at": expires,
                },
                "$setOnInsert": {"name": name},
            },
            upsert=True,
            return_document=True,
        )
        return bool(res and res.get("holder") == INSTANCE_ID)
    except Exception as e:
        # Duplicate key on a simultaneous upsert = another pod won.
        if "duplicate key" in str(e).lower() or "E11000" in str(e):
            return False
        # Mongo unreachable or otherwise broken: degrade open (single-pod safe).
        logger.warning(f"scheduler_lock acquire failed for {name}; degrading open: {e}")
        return True


async def release(name: str) -> None:
    """Release the lock ONLY if this instance holds it."""
    try:
        await db.scheduler_locks.delete_one({"name": name, "holder": INSTANCE_ID})
    except Exception as e:
        logger.debug(f"scheduler_lock release for {name} failed (ignored): {e}")


@asynccontextmanager
async def with_scheduler_lock(name: str, ttl_seconds: int = 300, heartbeat: bool = True):
    """Async context manager. Body runs only if the lock was acquired.

    Yields True if we are the leader (run the work) or False if another pod
    holds the lock (fall through / sleep).

    While body is running, a heartbeat task renews the lock TTL every ~30% of
    the TTL so long-running work doesn't get revoked.
    """
    await _ensure_lock_index()
    got = await acquire(name, ttl_seconds)

    async def _heartbeat():
        interval = max(10, int(ttl_seconds * 0.3))
        while True:
            await asyncio.sleep(interval)
            try:
                new_expires = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
                await db.scheduler_locks.update_one(
                    {"name": name, "holder": INSTANCE_ID},
                    {"$set": {"expires_at": new_expires}},
                )
            except Exception:
                return

    hb_task = None
    try:
        if got and heartbeat:
            hb_task = asyncio.create_task(_heartbeat())
        yield got
    finally:
        if hb_task:
            hb_task.cancel()
            try:
                await hb_task
            except (asyncio.CancelledError, Exception):
                pass
        if got:
            await release(name)
