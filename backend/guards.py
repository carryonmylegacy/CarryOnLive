"""CarryOn™ Backend — Subscription Access Guards

Enforces subscription requirements:
- During trial (30 days): Full access
- After trial, no subscription: Read-only (existing content accessible, no new uploads/creates)
- Living Will + POA always accessible to beneficiaries regardless of subscription
- Active subscription: Full access
"""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException

from config import db
from utils import get_current_user


async def get_subscription_access(current_user: dict = Depends(get_current_user)):
    """Check if user has active access (trial or subscription)."""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin always has access
    if user.get("role") == "admin":
        return {"has_access": True, "reason": "admin"}

    # Check for free access override (B2B, beta, etc.)
    override = await db.subscription_overrides.find_one({"user_id": user["id"]}, {"_id": 0})
    if override and override.get("free_access"):
        return {"has_access": True, "reason": "free_access"}

    # Check active subscription (including Apple grace period)
    sub = await db.subscriptions.find_one(
        {"user_id": user["id"], "status": {"$in": ["active", "past_due"]}}, {"_id": 0}
    )
    if sub:
        return {"has_access": True, "reason": "subscription"}

    # Check trial
    trial_ends = user.get("trial_ends_at")
    if trial_ends:
        try:
            ends = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) < ends:
                return {"has_access": True, "reason": "trial"}
        except (ValueError, TypeError):
            pass

    # Check beta mode
    settings = await db.subscription_settings.find_one({"_id": "global"}, {"_id": 0})
    if settings and settings.get("beta_mode"):
        return {"has_access": True, "reason": "beta"}

    return {"has_access": False, "reason": "expired"}


async def require_active_subscription(
    access: dict = Depends(get_subscription_access),
):
    """Dependency that blocks write operations if no active subscription/trial."""
    if not access["has_access"]:
        raise HTTPException(
            status_code=403,
            detail="Your free trial has ended. Subscribe to continue adding content. Your existing documents and messages are still accessible.",
        )
    return access


async def require_account_not_locked(
    current_user: dict = Depends(get_current_user),
):
    """Block all write operations if the benefactor's account is locked (post-transition)."""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "account_locked": 1})
    if user and user.get("account_locked"):
        raise HTTPException(
            status_code=403,
            detail="This estate has been sealed following transition. No further changes are permitted.",
        )
    return current_user


def require_benefactor_role(current_user: dict, action: str = "perform this action"):
    """Verify user is a benefactor, admin, or has is_also_benefactor flag.

    Used across all endpoints that restrict write access to benefactors.
    Supports the cross-pollination model where beneficiaries can also be benefactors.
    """
    if current_user["role"] not in ("benefactor", "admin") and not current_user.get("is_also_benefactor"):
        raise HTTPException(status_code=403, detail=f"Only benefactors can {action}")


def is_benefactor_or_admin(current_user: dict):
    """Check if user is a benefactor, is_also_benefactor, or admin. Returns bool."""
    return current_user["role"] in ("benefactor", "admin") or current_user.get("is_also_benefactor")
