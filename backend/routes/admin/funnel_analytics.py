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

# Anonymous/user telemetry sink — mounted WITHOUT the router-level
# `require_scope("marketing")` dependency (see routes/admin/__init__.py).
# The handler itself resolves auth optionally.
public_router = APIRouter()

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


@public_router.post("/diagnostics/funnel-event")
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


PAID_STATUSES = ("active", "past_due")


async def _actors_by_page(event: str, since: datetime) -> dict[str, int]:
    """Distinct visitors (user or anon session) per `meta.page` for one event."""
    pipeline = [
        {"$match": {"event": event, "created_at": {"$gte": since}, "meta.page": {"$type": "string"}}},
        {
            "$group": {
                "_id": {"page": "$meta.page", "actor": {"$ifNull": [{"$toString": "$user_id"}, "$anon_session_id"]}}
            }
        },
        {"$group": {"_id": "$_id.page", "n": {"$sum": 1}}},
    ]
    rows = await db.funnel_events.aggregate(pipeline).to_list(length=100)
    return {r["_id"]: r["n"] for r in rows}


@router.get("/admin/funnel-analytics/landing-pages")
async def admin_landing_pages(
    days: int = Query(30, ge=1, le=180),
    _user: dict = Depends(require_admin),
):
    """Visitors → signups → activated → paid, split by the page a family came in on.

    Visitors/CTA clicks come from `landing_view` / `landing_cta_click` events (meta.page).
    Signups are users tagged `landing_page` at registration. Activated = the account has at
    least one vault document or one milestone message. Paid = a real (non-beta) subscription.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    visitors = await _actors_by_page("landing_view", since)
    cta = await _actors_by_page("landing_cta_click", since)

    users = await db.users.find(
        {"created_at": {"$gte": since.isoformat()}, "role": "benefactor"},
        {"_id": 0, "id": 1, "landing_page": 1},
    ).to_list(length=None)
    ids_by_page: dict[str, list[str]] = {}
    for u in users:
        ids_by_page.setdefault(u.get("landing_page") or "untagged", []).append(u["id"])
    all_ids = [u["id"] for u in users]

    doc_owners = set(await db.documents.distinct("owner_id", {"owner_id": {"$in": all_ids}}))
    msg_owners = set(await db.messages.distinct("user_id", {"user_id": {"$in": all_ids}}))
    activated_ids = doc_owners | msg_owners
    paid_ids = set(
        await db.user_subscriptions.distinct(
            "user_id",
            {"user_id": {"$in": all_ids}, "status": {"$in": list(PAID_STATUSES)}, "beta_plan": {"$ne": True}},
        )
    )

    pct = lambda n, d: round(100 * n / d, 1) if d else 0.0  # noqa: E731
    rows = []
    for page in sorted(set(visitors) | set(cta) | set(ids_by_page), key=lambda p: (-visitors.get(p, 0), p)):
        ids = ids_by_page.get(page, [])
        signups = len(ids)
        activated = sum(1 for i in ids if i in activated_ids)
        paid = sum(1 for i in ids if i in paid_ids)
        v = visitors.get(page, 0)
        rows.append(
            {
                "page": page,
                "visitors": v,
                "cta_clicks": cta.get(page, 0),
                "signups": signups,
                "activated": activated,
                "paid": paid,
                "visitor_to_signup": pct(signups, v),
                "signup_to_activated": pct(activated, signups),
                "activated_to_paid": pct(paid, activated),
            }
        )
    return {
        "days": days,
        "since": since.isoformat(),
        "rows": rows,
        "activation_rule": "1+ vault document or 1+ milestone message",
    }


async def ensure_indexes():
    """TTL on `created_at` (90 days) + compound (event, created_at) for the
    aggregation queries."""
    try:
        await db.funnel_events.create_index("created_at", expireAfterSeconds=90 * 24 * 3600)
        await db.funnel_events.create_index([("event", 1), ("created_at", -1)])
    except Exception:
        pass
