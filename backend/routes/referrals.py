"""CarryOn™ — Referral Code System

A formal user-facing referral program built on top of the existing
funnel/email-based referral path. Each user gets a stable, shareable
short code (e.g. "BARNET-3X7Q"). Visits and signups are attributed
to the code, and both parties receive a 7-day trial extension on a
successful referral signup (matching the existing email-referral bonus
in `routes/funnel.py`).

Endpoints
---------
GET  /api/referrals/me            — issue (or fetch) the caller's referral code + stats
POST /api/referrals/track-visit   — anonymous: record a visit attributed to a code
POST /api/referrals/claim         — bind a code to a newly-created user (called from /signup)
GET  /api/admin/referrals         — admin-only aggregate view: leaderboard + totals

Persistent collections
----------------------
- referral_codes  { user_id, code, created_at, visits, signups, bonus_days_granted }
- referral_visits { code, anon_session_id, ip_hash, ua, created_at }
- referral_attributions { code, referred_user_id, referrer_user_id, created_at }
"""

import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from config import db, logger
from guards import get_current_user_optional, require_admin
from utils import get_current_user

router = APIRouter()

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I — fewer transcription errors


def _mint_code(seed: str) -> str:
    """Generate a deterministic-ish, human-readable referral code keyed off the user."""
    # Use a hash so the code is stable per user but not trivially-guessable.
    h = hashlib.sha256(seed.encode()).hexdigest().upper()
    body = "".join(CODE_ALPHABET[int(h[i : i + 2], 16) % len(CODE_ALPHABET)] for i in range(0, 8, 2))
    return body


def _normalize_code(code: str) -> str:
    if not code:
        return ""
    s = re.sub(r"[^A-Za-z0-9-]", "", code).upper()
    return s[:24]


def _hash_ip(ip: Optional[str]) -> Optional[str]:
    if not ip:
        return None
    return hashlib.sha256(ip.encode()).hexdigest()[:24]


async def _get_or_create_code(user: dict) -> dict:
    user_id = user["id"]
    existing = await db.referral_codes.find_one({"user_id": user_id}, {"_id": 0})
    if existing:
        return existing

    # Build a candidate from first-name slug + 4 hash chars (e.g. BARNET-3X7Q).
    first = (user.get("first_name") or user.get("name") or "FRIEND").upper()
    slug = re.sub(r"[^A-Z]", "", first)[:6] or "FRIEND"
    base_seed = f"{user_id}|{user.get('email', '')}"
    suffix = _mint_code(base_seed)[:4]
    code = f"{slug}-{suffix}"

    # Collision check (extremely unlikely; if hit, append entropy).
    while await db.referral_codes.find_one({"code": code}, {"_id": 0, "id": 1, "user_id": 1}):
        suffix = _mint_code(base_seed + uuid.uuid4().hex)[:4]
        code = f"{slug}-{suffix}"

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "code": code,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "visits": 0,
        "signups": 0,
        "bonus_days_granted": 0,
    }
    await db.referral_codes.insert_one(doc)
    doc.pop("_id", None)
    return doc


class TrackVisitPayload(BaseModel):
    code: str = Field(..., max_length=24)
    anon_session_id: Optional[str] = Field(None, max_length=80)
    path: Optional[str] = Field(None, max_length=120)


class ClaimPayload(BaseModel):
    code: str = Field(..., max_length=24)


@router.get("/referrals/me")
async def my_referral(user=Depends(get_current_user)):
    """Return the caller's referral code + share copy + stats."""
    record = await _get_or_create_code(user)
    return {
        "code": record["code"],
        "share_url": f"https://app.carryon.us/?ref={record['code']}",
        "share_text": (
            f"I just put my family's plan in order with CarryOn. "
            f"Use my code {record['code']} for 7 extra days on me. "
            "https://app.carryon.us/?ref=" + record["code"]
        ),
        "stats": {
            "visits": int(record.get("visits", 0)),
            "signups": int(record.get("signups", 0)),
            "bonus_days_granted": int(record.get("bonus_days_granted", 0)),
        },
    }


@router.post("/referrals/track-visit")
async def track_visit(
    payload: TrackVisitPayload,
    request: Request,
    user=Depends(get_current_user_optional),
):
    """Record an anonymous landing visit attributed to a referral code.
    Idempotent per (code, anon_session_id) within 24h to avoid count spam."""
    code = _normalize_code(payload.code)
    if not code:
        return {"ok": True, "skipped": "invalid_code"}

    rc = await db.referral_codes.find_one({"code": code}, {"_id": 0, "id": 1, "user_id": 1})
    if not rc:
        return {"ok": True, "skipped": "code_not_found"}

    # Don't count self-clicks.
    if user and user.get("id") == rc.get("user_id"):
        return {"ok": True, "skipped": "self_visit"}

    anon = (payload.anon_session_id or "")[:80]
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    ip_hash = _hash_ip(ip)

    # Dedup window
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    dup = await db.referral_visits.find_one(
        {
            "code": code,
            "anon_session_id": anon or None,
            "created_at": {"$gte": cutoff.isoformat()},
        },
        {"_id": 0, "id": 1, "code": 1},
    )
    if dup:
        return {"ok": True, "skipped": "deduped"}

    await db.referral_visits.insert_one(
        {
            "id": str(uuid.uuid4()),
            "code": code,
            "anon_session_id": anon or None,
            "ip_hash": ip_hash,
            "path": (payload.path or "")[:120] or None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    await db.referral_codes.update_one({"code": code}, {"$inc": {"visits": 1}})
    return {"ok": True}


@router.post("/referrals/claim")
async def claim_referral(payload: ClaimPayload, user=Depends(get_current_user)):
    """Bind a referral code to the authenticated user (called once after signup).
    Grants 7-day trial extensions to BOTH parties (matches the existing
    email-referral bonus in routes/funnel.py). Idempotent — first claim wins."""
    code = _normalize_code(payload.code)
    if not code:
        return {"ok": False, "reason": "invalid_code"}

    rc = await db.referral_codes.find_one({"code": code}, {"_id": 0})
    if not rc:
        return {"ok": False, "reason": "code_not_found"}

    referrer_id = rc.get("user_id")
    referred_id = user["id"]
    if referrer_id == referred_id:
        return {"ok": False, "reason": "self_referral"}

    # Idempotency: a user can only ever attribute to one referrer.
    existing = await db.referral_attributions.find_one(
        {"referred_user_id": referred_id}, {"_id": 0, "id": 1, "code": 1}
    )
    if existing:
        return {"ok": False, "reason": "already_attributed", "code": existing.get("code")}

    now = datetime.now(timezone.utc)
    await db.referral_attributions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "code": code,
            "referrer_user_id": referrer_id,
            "referred_user_id": referred_id,
            "created_at": now.isoformat(),
        }
    )

    bonus_days = 7

    # Extend the new user's trial by 7 days.
    new_user = await db.users.find_one(
        {"id": referred_id, "subscription_status": "trialing"},
        {"_id": 0, "id": 1, "trial_ends_at": 1},
    )
    if new_user:
        try:
            current_end = datetime.fromisoformat(new_user["trial_ends_at"])
            new_end = current_end + timedelta(days=bonus_days)
            await db.users.update_one(
                {"id": referred_id},
                {"$set": {"trial_ends_at": new_end.isoformat()}},
            )
        except Exception:
            pass

    # Extend the referrer's trial by 7 days if they're still in trial.
    referrer = await db.users.find_one(
        {"id": referrer_id, "subscription_status": "trialing"},
        {"_id": 0, "id": 1, "trial_ends_at": 1},
    )
    if referrer:
        try:
            current_end = datetime.fromisoformat(referrer["trial_ends_at"])
            new_end = current_end + timedelta(days=bonus_days)
            await db.users.update_one(
                {"id": referrer_id},
                {"$set": {"trial_ends_at": new_end.isoformat()}},
            )
        except Exception:
            pass

    await db.referral_codes.update_one(
        {"code": code},
        {"$inc": {"signups": 1, "bonus_days_granted": bonus_days}},
    )

    logger.info(f"referral attribution: {code} → user={referred_id} (+{bonus_days}d both sides)")
    return {"ok": True, "bonus_days": bonus_days}


@router.get("/admin/referrals")
async def admin_referrals(
    days: int = 30,
    _user: dict = Depends(require_admin),
):
    """Founder-only aggregate view of the referral program."""
    days = max(1, min(180, int(days)))
    since = datetime.now(timezone.utc) - timedelta(days=days)
    since_iso = since.isoformat()

    total_codes = await db.referral_codes.count_documents({})
    total_visits = await db.referral_visits.count_documents({})
    visits_in_window = await db.referral_visits.count_documents({"created_at": {"$gte": since_iso}})
    total_attributions = await db.referral_attributions.count_documents({})
    attributions_in_window = await db.referral_attributions.count_documents({"created_at": {"$gte": since_iso}})

    # Top 25 by signups (lifetime)
    top_cursor = (
        db.referral_codes.find(
            {"signups": {"$gt": 0}},
            {"_id": 0, "id": 1, "code": 1, "user_id": 1, "visits": 1, "signups": 1, "bonus_days_granted": 1},
        )
        .sort([("signups", -1), ("visits", -1)])
        .limit(25)
    )
    leaderboard = []
    async for row in top_cursor:
        u = await db.users.find_one(
            {"id": row.get("user_id")}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1}
        )
        leaderboard.append(
            {
                "code": row["code"],
                "user_id": row.get("user_id"),
                "user_name": (
                    f"{(u or {}).get('first_name', '')} {(u or {}).get('last_name', '')}".strip()
                    or (u or {}).get("email", "—")
                ),
                "user_email": (u or {}).get("email", ""),
                "visits": int(row.get("visits", 0)),
                "signups": int(row.get("signups", 0)),
                "bonus_days_granted": int(row.get("bonus_days_granted", 0)),
            }
        )

    return {
        "totals": {
            "codes_issued": total_codes,
            "lifetime_visits": total_visits,
            "lifetime_signups": total_attributions,
            f"visits_{days}d": visits_in_window,
            f"signups_{days}d": attributions_in_window,
            "conversion_rate_pct": (round(100 * total_attributions / total_visits, 1) if total_visits else 0.0),
        },
        "leaderboard": leaderboard,
    }


async def ensure_indexes():
    """Indexes for the referral program. Best-effort."""
    try:
        await db.referral_codes.create_index("user_id", unique=True)
        await db.referral_codes.create_index("code", unique=True)
        await db.referral_visits.create_index([("code", 1), ("created_at", -1)])
        await db.referral_visits.create_index("created_at", expireAfterSeconds=180 * 24 * 3600)  # TTL: 180 days
        await db.referral_attributions.create_index("referred_user_id", unique=True)
        await db.referral_attributions.create_index("referrer_user_id")
    except Exception:
        pass
