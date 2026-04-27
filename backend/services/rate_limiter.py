"""CarryOn™ — MongoDB-backed sliding-window rate limiter.

Replaces in-memory `defaultdict` rate limiting with a distributed implementation
that survives multi-instance deployments. Uses MongoDB's `$push` + `$pull` for
sliding windows; per-key TTL index prevents unbounded collection growth.

Falls back gracefully to in-memory (original behavior) if Mongo is unavailable.
"""

import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from config import db, logger

_ensured = False
_memory_buckets = defaultdict(list)


async def _ensure_index():
    global _ensured
    if _ensured:
        return
    try:
        await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
        await db.rate_limits.create_index("key", unique=True)
        _ensured = True
    except Exception as e:
        logger.debug(f"rate_limits index init skipped: {e}")


async def check_and_increment(key: str, limit: int, window_seconds: int) -> bool:
    """Return True if the request is allowed, False if over limit.

    Uses MongoDB sliding-window counters keyed on (scope + client ip).
    Degrades to a per-pod in-memory bucket if Mongo write fails.
    """
    now_ts = time.time()
    cutoff_ts = now_ts - window_seconds

    try:
        await _ensure_index()
        # Atomic: drop expired timestamps, append the new one, set TTL.
        # We use an aggregation-pipeline update so we can mutate the same
        # `hits` array twice in one operation — a classic ($pull + $push)
        # pair would be rejected by the server with `ConflictingUpdateOperators`.
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=window_seconds * 2)
        result = await db.rate_limits.find_one_and_update(
            {"key": key},
            [
                {
                    "$set": {
                        "key": key,
                        "expires_at": expires_at,
                        "hits": {
                            "$concatArrays": [
                                {
                                    "$filter": {
                                        "input": {"$ifNull": ["$hits", []]},
                                        "as": "h",
                                        "cond": {"$gte": ["$$h", cutoff_ts]},
                                    }
                                },
                                [now_ts],
                            ]
                        },
                    }
                }
            ],
            upsert=True,
            return_document=True,
        )
        count = len(result.get("hits", [])) if result else 1
        return count <= limit
    except Exception as e:
        # Fallback: in-memory sliding window (per-pod best effort).
        logger.debug(f"rate_limiter Mongo path failed, using memory: {e}")
        bucket = _memory_buckets[key]
        _memory_buckets[key] = [t for t in bucket if now_ts - t < window_seconds]
        if len(_memory_buckets[key]) >= limit:
            return False
        _memory_buckets[key].append(now_ts)
        return True
