from fastapi import APIRouter, Request, Depends, HTTPException
from datetime import datetime, timezone, timedelta
import uuid
import httpx

from config import db
from utils import get_current_user

router = APIRouter()


async def get_geo_from_ip(ip: str) -> dict:
    """Best-effort IP geolocation using ip-api.com (free for server-side, non-commercial batch)."""
    if not ip or ip in ("127.0.0.1", "::1", "localhost"):
        return {}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "success":
                    return {
                        "country": data.get("country", ""),
                        "state": data.get("regionName", ""),
                        "city": data.get("city", ""),
                    }
    except Exception:
        pass
    return {}


def get_client_ip(request: Request) -> str:
    """Extract real client IP from proxy headers."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


@router.post("/funnel/start")
async def funnel_start(request: Request):
    """Create a new funnel session with UTM params and geo data."""
    body = await request.json()

    client_ip = get_client_ip(request)
    user_agent = request.headers.get("user-agent", "")

    # Determine device type from user agent
    ua_lower = user_agent.lower()
    if "mobile" in ua_lower or "iphone" in ua_lower or "android" in ua_lower:
        device_type = "mobile"
    elif "tablet" in ua_lower or "ipad" in ua_lower:
        device_type = "tablet"
    else:
        device_type = "desktop"

    # Geo lookup
    geo = await get_geo_from_ip(client_ip)

    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    session = {
        "session_id": session_id,
        "utm_source": body.get("utm_source", ""),
        "utm_medium": body.get("utm_medium", ""),
        "utm_campaign": body.get("utm_campaign", ""),
        "utm_content": body.get("utm_content", ""),
        "utm_term": body.get("utm_term", ""),
        "referrer_url": body.get("referrer_url", ""),
        "landing_url": body.get("landing_url", ""),
        "ip_address": client_ip,
        "user_agent": user_agent,
        "device_type": device_type,
        "demographics": geo,
        "steps": [],
        "drop_off_step": None,
        "completed": False,
        "converted": False,
        "converted_user_id": None,
        "referral_email": None,
        "created_at": now,
        "updated_at": now,
    }

    await db.funnel_sessions.insert_one(session)
    # Remove _id from response
    session.pop("_id", None)

    return {
        "session_id": session_id,
        "device_type": device_type,
        "demographics": geo,
    }


@router.post("/funnel/step")
async def funnel_step(request: Request):
    """Record a funnel step completion."""
    body = await request.json()

    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    step_data = {
        "step": body.get("step"),
        "name": body.get("name", ""),
        "selections": body.get("selections", {}),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }

    now = datetime.now(timezone.utc).isoformat()

    await db.funnel_sessions.update_one(
        {"session_id": session_id},
        {
            "$push": {"steps": step_data},
            "$set": {
                "drop_off_step": body.get("step"),
                "updated_at": now,
            },
        },
    )

    return {"ok": True}


@router.post("/funnel/complete")
async def funnel_complete(request: Request):
    """Mark funnel as completed (user reached signup)."""
    body = await request.json()

    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    now = datetime.now(timezone.utc).isoformat()

    update = {
        "$set": {
            "completed": True,
            "drop_off_step": None,
            "referral_email": body.get("referral_email"),
            "updated_at": now,
        }
    }

    await db.funnel_sessions.update_one({"session_id": session_id}, update)

    return {"ok": True}


@router.post("/funnel/convert")
async def funnel_convert(request: Request):
    """Link a funnel session to a newly created user (called after signup)."""
    body = await request.json()

    session_id = body.get("session_id")
    user_id = body.get("user_id")

    if not session_id or not user_id:
        raise HTTPException(status_code=400, detail="session_id and user_id required")

    now = datetime.now(timezone.utc).isoformat()

    await db.funnel_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"converted": True, "converted_user_id": user_id, "updated_at": now}},
    )

    # Handle referral bonus: extend trial for both referrer and referred
    session = await db.funnel_sessions.find_one({"session_id": session_id}, {"_id": 0})
    referral_email = session.get("referral_email") if session else None

    if referral_email:
        # Extend referred user's trial by 7 days
        await db.users.update_one(
            {"id": user_id, "subscription_status": "trialing"},
            {"$set": {"trial_ends_at": (datetime.now(timezone.utc) + timedelta(days=37)).isoformat()}},
        )
        # Extend referrer's trial by 7 days (if they exist and are trialing)
        referrer = await db.users.find_one(
            {"email": referral_email.lower().strip()}, {"_id": 0, "id": 1, "trial_ends_at": 1, "subscription_status": 1}
        )
        if referrer and referrer.get("subscription_status") == "trialing":
            try:
                current_end = datetime.fromisoformat(referrer["trial_ends_at"])
                new_end = current_end + timedelta(days=7)
                await db.users.update_one(
                    {"id": referrer["id"]},
                    {"$set": {"trial_ends_at": new_end.isoformat()}},
                )
            except Exception:
                pass

    return {"ok": True}


@router.get("/admin/funnel/analytics")
async def funnel_analytics(user=Depends(get_current_user)):
    """Aggregated funnel analytics for admin dashboard."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    # Total sessions
    total = await db.funnel_sessions.count_documents({})
    completed = await db.funnel_sessions.count_documents({"completed": True})
    converted = await db.funnel_sessions.count_documents({"converted": True})

    # Drop-off by step
    drop_off_pipeline = [
        {"$match": {"drop_off_step": {"$ne": None}}},
        {"$group": {"_id": "$drop_off_step", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    drop_offs_raw = await db.funnel_sessions.aggregate(drop_off_pipeline).to_list(10)
    drop_offs = {str(d["_id"]): d["count"] for d in drop_offs_raw}

    # By UTM source
    source_pipeline = [
        {"$match": {"utm_source": {"$ne": ""}}},
        {
            "$group": {
                "_id": "$utm_source",
                "total": {"$sum": 1},
                "completed": {"$sum": {"$cond": ["$completed", 1, 0]}},
                "converted": {"$sum": {"$cond": ["$converted", 1, 0]}},
            }
        },
        {"$sort": {"total": -1}},
        {"$limit": 20},
    ]
    sources = await db.funnel_sessions.aggregate(source_pipeline).to_list(20)
    by_source = [
        {"source": s["_id"], "total": s["total"], "completed": s["completed"], "converted": s["converted"]}
        for s in sources
    ]

    # By campaign
    campaign_pipeline = [
        {"$match": {"utm_campaign": {"$ne": ""}}},
        {
            "$group": {
                "_id": "$utm_campaign",
                "total": {"$sum": 1},
                "completed": {"$sum": {"$cond": ["$completed", 1, 0]}},
                "converted": {"$sum": {"$cond": ["$converted", 1, 0]}},
            }
        },
        {"$sort": {"total": -1}},
        {"$limit": 20},
    ]
    campaigns = await db.funnel_sessions.aggregate(campaign_pipeline).to_list(20)
    by_campaign = [
        {"campaign": c["_id"], "total": c["total"], "completed": c["completed"], "converted": c["converted"]}
        for c in campaigns
    ]

    # By device type
    device_pipeline = [
        {"$group": {"_id": "$device_type", "count": {"$sum": 1}}},
    ]
    devices_raw = await db.funnel_sessions.aggregate(device_pipeline).to_list(10)
    by_device = {d["_id"]: d["count"] for d in devices_raw if d["_id"]}

    # By geography (top 10 states)
    geo_pipeline = [
        {"$match": {"demographics.state": {"$ne": ""}}},
        {
            "$group": {
                "_id": "$demographics.state",
                "total": {"$sum": 1},
                "converted": {"$sum": {"$cond": ["$converted", 1, 0]}},
            }
        },
        {"$sort": {"total": -1}},
        {"$limit": 10},
    ]
    geos = await db.funnel_sessions.aggregate(geo_pipeline).to_list(10)
    by_state = [{"state": g["_id"], "total": g["total"], "converted": g["converted"]} for g in geos]

    # Interest selections (from step 1)
    interest_pipeline = [
        {"$unwind": "$steps"},
        {"$match": {"steps.step": 1}},
        {"$unwind": "$steps.selections"},
        {"$group": {"_id": "$steps.selections", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    interests_raw = await db.funnel_sessions.aggregate(interest_pipeline).to_list(20)
    by_interest = [{"interest": i["_id"], "count": i["count"]} for i in interests_raw]

    # Recent sessions (last 10)
    recent = (
        await db.funnel_sessions.find(
            {},
            {
                "_id": 0,
                "session_id": 1,
                "utm_source": 1,
                "utm_campaign": 1,
                "device_type": 1,
                "demographics": 1,
                "completed": 1,
                "converted": 1,
                "drop_off_step": 1,
                "referral_email": 1,
                "created_at": 1,
            },
        )
        .sort("created_at", -1)
        .limit(10)
        .to_list(10)
    )

    # Referral stats
    referrals_sent = await db.funnel_sessions.count_documents({"referral_email": {"$ne": None}})

    return {
        "total_sessions": total,
        "completed": completed,
        "converted": converted,
        "completion_rate": round(completed / total * 100, 1) if total > 0 else 0,
        "conversion_rate": round(converted / total * 100, 1) if total > 0 else 0,
        "drop_offs": drop_offs,
        "by_source": by_source,
        "by_campaign": by_campaign,
        "by_device": by_device,
        "by_state": by_state,
        "by_interest": by_interest,
        "referrals_sent": referrals_sent,
        "recent_sessions": recent,
    }
