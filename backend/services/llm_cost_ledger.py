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

from config import db, db_read, logger

# Per-1M-token pricing in USD, authoritative source: GET https://api.x.ai/v1/language-models
# (verified Jun 2026; API returns units of $0.0001 per 1M tokens).
# ⚠️ xAI SILENTLY REDIRECTS retired model names: requests for grok-4, grok-3,
# and grok-3-mini are all SERVED BY grok-4.3 (confirmed via response.model,
# Jun 2026). Always price by the RESPONSE model, never the requested name.
# Reasoning tokens are billed at the output rate but are NOT included in
# usage.completion_tokens — they arrive in completion_tokens_details.
PRICING = {
    "grok-4.3": {"input": 1.25, "output": 2.50},
    "grok-4.20-0309-reasoning": {"input": 1.25, "output": 2.50},
    "grok-4.20-0309-non-reasoning": {"input": 1.25, "output": 2.50},
    "grok-4.20-multi-agent-0309": {"input": 1.25, "output": 2.50},
    "grok-4.5": {"input": 2.00, "output": 6.00},
    "grok-4.6": {"input": 2.00, "output": 6.00},
    "grok-build-0.1": {"input": 1.00, "output": 2.00},
    # Retired names — kept ONLY so stray legacy references price at what
    # actually serves them (the grok-4.3 redirect):
    "grok-4": {"input": 1.25, "output": 2.50},
    "grok-3": {"input": 1.25, "output": 2.50},
    "grok-3-mini": {"input": 1.25, "output": 2.50},
}


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Returns estimated USD cost (rounded to 6 decimals)."""
    p = PRICING.get(model, PRICING["grok-4.3"])  # unknown → flagship pricing
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
    served_model: str | None = None,
    reasoning_tokens: int = 0,
) -> float:
    """Insert a single LLM call record. Returns estimated cost USD.

    `served_model` is the model xAI ACTUALLY used (response.model) — it can
    differ from `model` because xAI silently redirects retired names. Cost is
    priced on the served model, and reasoning tokens bill at the output rate.
    """
    cost = estimate_cost(served_model or model, prompt_tokens, completion_tokens + reasoning_tokens)
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_id,
        "estate_id": estate_id,
        "endpoint": endpoint,
        "model": model,
        "served_model": served_model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "reasoning_tokens": reasoning_tokens,
        "total_tokens": prompt_tokens + completion_tokens + reasoning_tokens,
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


def _extract_usage(response) -> tuple[int, int, int]:
    """Pull (prompt, completion, reasoning) tokens from an xAI response.

    The xAI SDK mirrors OpenAI's `response.usage` shape. Reasoning tokens
    live in usage.completion_tokens_details.reasoning_tokens and are NOT
    included in completion_tokens, but ARE billed at the output rate.
    Defensive both-access handling — never raise; ledger accuracy is
    non-essential to the user-facing response.
    """
    try:
        usage = getattr(response, "usage", None) or {}
        if hasattr(usage, "prompt_tokens"):
            details = getattr(usage, "completion_tokens_details", None)
            reasoning = int(getattr(details, "reasoning_tokens", 0) or 0) if details else 0
            return (
                int(getattr(usage, "prompt_tokens", 0) or 0),
                int(getattr(usage, "completion_tokens", 0) or 0),
                reasoning,
            )
        if isinstance(usage, dict):
            reasoning = int((usage.get("completion_tokens_details") or {}).get("reasoning_tokens", 0) or 0)
            return (
                int(usage.get("prompt_tokens", 0) or 0),
                int(usage.get("completion_tokens", 0) or 0),
                reasoning,
            )
    except Exception:
        pass
    return 0, 0, 0


async def record_xai_response(
    response,
    *,
    endpoint: str,
    model: str,
    user_id: str | None = None,
    estate_id: str | None = None,
    started_at: float | None = None,
    duration_ms: int | None = None,
    success: bool = True,
    error_class: str | None = None,
) -> None:
    """Fire-and-forget convenience wrapper.

    Call AFTER a successful xAI completion to log token usage. Pass
    either `started_at=time.time()` captured BEFORE the call, OR a
    pre-computed `duration_ms`. Failures are swallowed — ledger insert
    is observational, never critical-path.
    """
    try:
        prompt_tokens, completion_tokens, reasoning_tokens = (
            _extract_usage(response) if response is not None else (0, 0, 0)
        )
        served_model = getattr(response, "model", None) if response is not None else None
        if duration_ms is None:
            duration_ms = int((time.time() - started_at) * 1000) if started_at else 0
        await record_llm_call(
            user_id=user_id,
            estate_id=estate_id,
            endpoint=endpoint,
            model=model,
            served_model=served_model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            reasoning_tokens=reasoning_tokens,
            duration_ms=duration_ms,
            success=success,
            error_class=error_class,
        )
    except Exception as exc:
        logger.warning(f"record_xai_response failed (non-fatal): {exc}")


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
        reasoning_tokens = 0
        served_model: str | None = None
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
            served_model=ctx.served_model,
            prompt_tokens=ctx.prompt_tokens,
            completion_tokens=ctx.completion_tokens,
            reasoning_tokens=ctx.reasoning_tokens,
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
    # Aggregation reads route through db_read (secondaryPreferred when configured)
    # — admin dashboard tolerates ~100ms replication lag for these summaries.
    async for row in db_read.llm_cost_ledger.aggregate(pipeline):
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
    async for row in db_read.llm_cost_ledger.aggregate(pipeline):
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
