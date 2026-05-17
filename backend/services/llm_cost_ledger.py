"""CarryOn™ — LLM cost ledger (Feb 2026).

Records every xAI Grok call into `db.llm_cost_ledger` with:
  * timestamp, user_id, estate_id (if applicable), endpoint (caller route)
  * model, prompt_tokens, completion_tokens, total_tokens
  * estimated cost in USD (using current xAI public pricing)
  * duration_ms
  * success/failure + error class

Why this matters:
  * **Cost control**: a runaway LLM loop costs real money. We see it within
    minutes, not at the end of the month.
  * **B2B procurement**: "Show me your LLM spend per user" — answerable.
  * **Per-customer billing**: when we layer in enterprise contracts, the
    LLM cost ledger becomes the source-of-truth for usage-based billing.

PRICING (xAI grok-4 as of Feb 2026, USD per 1M tokens):
  * Input:  $3.00 / 1M
  * Output: $15.00 / 1M

Use `track_llm_call(...)` as an async context manager around xAI calls.
The collection has a TTL index on `created_at` (180 days) for compliance.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from config import db, logger

# Per-1M-token pricing in USD. Update when pricing changes.
PRICING = {
    "grok-4": {"input": 3.00, "output": 15.00},
    "grok-3": {"input": 1.50, "output": 7.50},
    "grok-3-mini": {"input": 0.50, "output": 2.00},
    "grok-2-vision-1212": {"input": 2.00, "output": 10.00},
}


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Returns estimated USD cost (rounded to 6 decimals)."""
    p = PRICING.get(model, PRICING["grok-3"])  # default to grok-3 pricing for unknown
    cost = (prompt_tokens / 1_000_000) * p["input"] + (completion_tokens / 1_000_000) * p["output"]
    return round(cost, 6)


async def ensure_indexes() -> None:
    await db.llm_cost_ledger.create_index([("user_id", 1), ("created_at", -1)])
    await db.llm_cost_ledger.create_index([("endpoint", 1), ("created_at", -1)])
    # TTL — 180 days
    await db.llm_cost_ledger.create_index("created_at_ttl", expireAfterSeconds=180 * 24 * 3600)


async def record_llm_call(
    *,
    user_id: str | None,
    estate_id: str | None,
    endpoint: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    duration_ms: int,
    success: bool,
    error_class: str | None = None,
) -> float:
    """Insert a single LLM call record. Returns estimated cost USD."""
    cost = estimate_cost(model, prompt_tokens, completion_tokens)
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_id,
        "estate_id": estate_id,
        "endpoint": endpoint,
        "model": model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
        "estimated_cost_usd": cost,
        "duration_ms": duration_ms,
        "success": success,
        "error_class": error_class,
        "created_at": now,
        "created_at_ttl": now,  # TTL field
    }
    try:
        await db.llm_cost_ledger.insert_one(doc)
    except Exception as exc:
        # Cost-ledger insert failures must NEVER block the user-facing
        # response. Log loudly so the on-call sees it.
        logger.error(f"LLM cost ledger insert failed: {exc}", exc_info=True)
    return cost


@asynccontextmanager
async def track_llm_call(
    *,
    user_id: str | None,
    estate_id: str | None,
    endpoint: str,
    model: str,
):
    """Context manager that records the call automatically.

    Usage:
        async with track_llm_call(user_id=u, estate_id=e, endpoint='guardian', model='grok-4') as ctx:
            resp = await xai_client.chat.completions.create(...)
            ctx.prompt_tokens = resp.usage.prompt_tokens
            ctx.completion_tokens = resp.usage.completion_tokens
    """

    class _Ctx:
        prompt_tokens = 0
        completion_tokens = 0
        success = True
        error_class: str | None = None

    ctx = _Ctx()
    started = time.time()
    try:
        yield ctx
    except Exception as exc:
        ctx.success = False
        ctx.error_class = type(exc).__name__
        raise
    finally:
        duration_ms = int((time.time() - started) * 1000)
        await record_llm_call(
            user_id=user_id,
            estate_id=estate_id,
            endpoint=endpoint,
            model=model,
            prompt_tokens=ctx.prompt_tokens,
            completion_tokens=ctx.completion_tokens,
            duration_ms=duration_ms,
            success=ctx.success,
            error_class=ctx.error_class,
        )


# ── Reporting helpers (used by admin dashboard) ──────────────────────────────


async def summary_for_user(user_id: str, days: int = 30) -> dict:
    """Returns {total_calls, total_tokens, total_cost_usd, by_endpoint{}}."""
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {"user_id": user_id, "created_at": {"$gte": cutoff}}},
        {
            "$group": {
                "_id": "$endpoint",
                "calls": {"$sum": 1},
                "tokens": {"$sum": "$total_tokens"},
                "cost": {"$sum": "$estimated_cost_usd"},
            }
        },
    ]
    by_endpoint: dict[str, dict] = {}
    total_calls = total_tokens = 0
    total_cost = 0.0
    async for row in db.llm_cost_ledger.aggregate(pipeline):
        by_endpoint[row["_id"]] = {
            "calls": row["calls"],
            "tokens": row["tokens"],
            "cost_usd": round(row["cost"], 4),
        }
        total_calls += row["calls"]
        total_tokens += row["tokens"]
        total_cost += row["cost"]
    return {
        "user_id": user_id,
        "window_days": days,
        "total_calls": total_calls,
        "total_tokens": total_tokens,
        "total_cost_usd": round(total_cost, 4),
        "by_endpoint": by_endpoint,
    }


async def summary_global(days: int = 7) -> dict:
    """Returns platform-wide LLM spend summary for admin dashboard."""
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {"created_at": {"$gte": cutoff}}},
        {
            "$group": {
                "_id": {"endpoint": "$endpoint", "model": "$model"},
                "calls": {"$sum": 1},
                "tokens": {"$sum": "$total_tokens"},
                "cost": {"$sum": "$estimated_cost_usd"},
                "errors": {"$sum": {"$cond": ["$success", 0, 1]}},
            }
        },
        {"$sort": {"cost": -1}},
    ]
    rows: list[dict] = []
    total_cost = 0.0
    total_calls = 0
    async for row in db.llm_cost_ledger.aggregate(pipeline):
        rows.append(
            {
                "endpoint": row["_id"]["endpoint"],
                "model": row["_id"]["model"],
                "calls": row["calls"],
                "tokens": row["tokens"],
                "cost_usd": round(row["cost"], 4),
                "errors": row["errors"],
            }
        )
        total_cost += row["cost"]
        total_calls += row["calls"]
    return {
        "window_days": days,
        "total_calls": total_calls,
        "total_cost_usd": round(total_cost, 4),
        "by_endpoint_model": rows,
    }
