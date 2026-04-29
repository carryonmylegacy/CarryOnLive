"""CarryOn™ Backend — Funnel / Product Analytics

Lightweight in-house analytics — same pattern as download_diagnostics. The
frontend fires `recordFunnelEvent` after meaningful user actions (landing
view, signup-step completion, feature-tile click, etc.). The admin portal
aggregates them under `/admin/funnel-analytics`.

Anonymous visitors are tracked via `anon_session_id` (random local-storage
key) so we can measure landing → signup conversion without dropping a third-
party cookie. Authenticated events also record `user_id`.

TTL: 90 days. Index: (event, created_at) for fast time-bounded counts.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from config import db
from guards import get_current_user_optional, require_admin

router = APIRouter()

VALID_EVENTS = {
    "landing_view",
    "landing_cta_click",
    "signup_step_view",
    "signup_step_complete",
    "signup_completed",
    "login_success",
    "login_failed",
    "feature_view",
    "feature_action",
    "vault_doc_added",
    "message_created",
    "message_scheduled",
    "ega_session_started",
    "ega_message_sent",
    "subscription_view",
    "subscription_upgraded",
    "trial_expired",
    "referral_share",
    "referral_signup",
    "onboarding_step_complete",
    "onboarding_dismissed",
}


class FunnelEvent(BaseModel):
    event: str = Field(..., max_length=64)
    meta: Optional[dict[str, Any]] = None
    platform: Optional[str] = Field(None, max_length=24)
    anon_session_id: Optional[str] = Field(None, max_length=80)
    path: Optional[str] = Field(None, max_length=120)
    referrer: Optional[str] = Field(None, max_length=200)


@router.post("/diagnostics/funnel-event")
async def record_funnel_event(
    payload: FunnelEvent,
    request: Request,
    user: Optional[dict] = Depends(get_current_user_optional),
):
    event = payload.event.strip()
    if event not in VALID_EVENTS:
        # Soft accept unknowns under a single bucket; better than rejecting
        event = "unknown"

    # Cap meta payload size — we don't want runaway data
    meta = payload.meta or {}
    if isinstance(meta, dict) and len(str(meta)) > 1500:
        meta = {"_truncated": True}

    doc = {
        "id": str(uuid4()),
        "event": event,
        "meta": meta,
        "user_id": user["id"] if user else None,
        "anon_session_id": payload.anon_session_id if not user else None,
        "platform": (payload.platform or "unknown")[:24],
        "path": (payload.path or "")[:120] or None,
        "referrer": (payload.referrer or "")[:200] or None,
        "ip_hash": None,  # privacy: we hash in admin aggregation if needed
        "created_at": datetime.now(timezone.utc),
    }
    await db.funnel_events.insert_one(doc)
    return {"ok": True}


@router.get("/admin/funnel-analytics")
async def admin_funnel_analytics(
    days: int = Query(30, ge=1, le=180),
    _user: dict = Depends(require_admin),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Per-event counts
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$event", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    event_rows = await db.funnel_events.aggregate(pipeline).to_list(length=200)
    by_event = {row["_id"]: row["count"] for row in event_rows}

    # Per-platform counts
    plat_pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$platform", "count": {"$sum": 1}}},
    ]
    plat_rows = await db.funnel_events.aggregate(plat_pipeline).to_list(length=20)
    by_platform = {row["_id"] or "unknown": row["count"] for row in plat_rows}

    # Daily timeseries (landing_view + signup_completed for the conversion line)
    ts_pipeline = [
        {
            "$match": {
                "created_at": {"$gte": since},
                "event": {"$in": ["landing_view", "signup_completed", "subscription_upgraded"]},
            }
        },
        {
            "$group": {
                "_id": {
                    "day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "event": "$event",
                },
                "count": {"$sum": 1},
            }
        },
    ]
    ts_rows = await db.funnel_events.aggregate(ts_pipeline).to_list(length=2000)

    daily: dict[str, dict[str, int]] = {}
    for r in ts_rows:
        d = r["_id"]["day"]
        e = r["_id"]["event"]
        daily.setdefault(d, {"landing_view": 0, "signup_completed": 0, "subscription_upgraded": 0})
        daily[d][e] = r["count"]
    timeseries = [{"date": d, **counts} for d, counts in sorted(daily.items())]

    # Funnel snapshot
    landings = by_event.get("landing_view", 0)
    cta_clicks = by_event.get("landing_cta_click", 0)
    signups = by_event.get("signup_completed", 0)
    upgrades = by_event.get("subscription_upgraded", 0)
    referral_signups = by_event.get("referral_signup", 0)

    pct = lambda n, d: round(100 * n / d, 1) if d else 0.0  # noqa: E731

    funnel = {
        "landing_view": landings,
        "landing_cta_click": cta_clicks,
        "signup_completed": signups,
        "subscription_upgraded": upgrades,
        "cta_rate": pct(cta_clicks, landings),
        "signup_rate": pct(signups, cta_clicks),
        "trial_to_paid_rate": pct(upgrades, signups),
        "referral_signups": referral_signups,
    }

    # Unique-ish actor counts (best-effort, treats user_id+anon_session_id as the actor key)
    actor_pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {
            "$group": {
                "_id": {
                    "$ifNull": [{"$toString": "$user_id"}, "$anon_session_id"],
                }
            }
        },
        {"$count": "actors"},
    ]
    actor_rows = await db.funnel_events.aggregate(actor_pipeline).to_list(length=1)
    unique_actors = actor_rows[0]["actors"] if actor_rows else 0

    return {
        "days": days,
        "since": since.isoformat(),
        "totals": {
            "events": sum(by_event.values()),
            "unique_actors": unique_actors,
            "by_event": by_event,
            "by_platform": by_platform,
        },
        "funnel": funnel,
        "timeseries": timeseries,
    }


async def ensure_indexes():
    """TTL on `created_at` (90 days) + compound (event, created_at) for the
    aggregation queries."""
    try:
        await db.funnel_events.create_index("created_at", expireAfterSeconds=90 * 24 * 3600)
        await db.funnel_events.create_index([("event", 1), ("created_at", -1)])
    except Exception:
        pass
