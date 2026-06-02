"""Platform-wide AI spend guardrails.

The founder can enable this from Admin platform settings when CarryOn is
operating in a charitable/free-access posture. It caps the AI/STT surfaces
that were not already protected by the Estate Guardian's own rate limits.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from config import db


DEFAULT_LIMITS = {
    "quickstart_generate": 1,
    "beneficiary_concierge": 10,
    "guardian_generate_iac": 1,
    "guardian_heavy": 3,
    "guardian_chat": 10,
    "ccp_generate": 3,
    "ccp_risk_profile": 5,
    "voice_transcribe": 10,
    "voice_verify": 10,
    "cfp_smart_categorize": 25,
}


async def get_ai_burn_guard_enabled() -> bool:
    settings = await db.platform_settings.find_one(
        {"_id": "global"},
        {"_id": 0, "ai_burn_guard_enabled": 1},
    )
    return bool((settings or {}).get("ai_burn_guard_enabled", False))


async def require_ai_burn_budget(current_user: dict, feature: str, *, limit: int | None = None) -> dict:
    """Record an AI/STT attempt if the guard is enabled and within quota."""
    if not await get_ai_burn_guard_enabled():
        return {"guard_enabled": False}

    if current_user.get("role") == "admin" or current_user.get("ai_unlimited"):
        return {"guard_enabled": True, "bypassed": True}

    daily_limit = int(limit or DEFAULT_LIMITS.get(feature, 10))
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    user_id = current_user.get("id")
    used = await db.ai_burn_guard_usage.count_documents(
        {
            "user_id": user_id,
            "feature": feature,
            "date": today,
        }
    )
    if used >= daily_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily AI limit reached for this feature ({daily_limit}/day). Try again tomorrow.",
        )

    await db.ai_burn_guard_usage.insert_one(
        {
            "user_id": user_id,
            "feature": feature,
            "date": today,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"guard_enabled": True, "limit": daily_limit, "used": used + 1}
