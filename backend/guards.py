"""CarryOn™ Backend — Subscription Access Guards

Enforces subscription requirements:
- During trial (30 days): Full access
- After trial, no subscription: Read-only (existing content accessible, no new uploads/creates)
- Grace period (past_due): Full access but payment reminders active
- Dormant: Read-only, no uploads/edits/DTS, beneficiaries cannot transition
- Living Will + POA always accessible to beneficiaries regardless of subscription
- Active subscription: Full access
"""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException

from config import db
from utils import get_current_user, get_current_user_optional

# Re-exported for convenience: optional auth helper for endpoints that
# meaningfully serve both anonymous and authenticated callers.
__all__ = ["get_current_user_optional"]


async def get_subscription_access(current_user: dict = Depends(get_current_user)):
    """Check if user has active access (trial or subscription)."""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin always has access
    if user.get("role") == "admin":
        return {"has_access": True, "reason": "admin", "is_dormant": False, "is_grace": False}

    # Check for free access override (B2B, beta, etc.)
    override = await db.subscription_overrides.find_one({"user_id": user["id"]}, {"_id": 0})
    if override and override.get("free_access"):
        return {"has_access": True, "reason": "free_access", "is_dormant": False, "is_grace": False}

    # Check per-user beta tester status
    if user.get("is_beta_tester"):
        return {"has_access": True, "reason": "beta", "is_dormant": False, "is_grace": False}

    # Check global beta mode (legacy fallback)
    settings = await db.subscription_settings.find_one({"_id": "global"}, {"_id": 0})
    if settings and settings.get("beta_mode"):
        return {"has_access": True, "reason": "beta", "is_dormant": False, "is_grace": False}

    # Check subscription status
    sub = await db.user_subscriptions.find_one({"user_id": user["id"]}, {"_id": 0})
    if sub:
        status = sub.get("status", "")
        if status == "active":
            return {"has_access": True, "reason": "subscription", "is_dormant": False, "is_grace": False}
        if status == "past_due":
            return {
                "has_access": True,
                "reason": "grace_period",
                "is_dormant": False,
                "is_grace": True,
                "grace_period_end": sub.get("grace_period_end"),
            }
        if status == "dormant":
            return {
                "has_access": False,
                "reason": "dormant",
                "is_dormant": True,
                "is_grace": False,
                "dormant_since": sub.get("dormant_since"),
            }

    # Check trial
    trial_ends = user.get("trial_ends_at")
    if trial_ends:
        try:
            ends = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) < ends:
                return {"has_access": True, "reason": "trial", "is_dormant": False, "is_grace": False}
        except (ValueError, TypeError):
            pass

    return {"has_access": False, "reason": "expired", "is_dormant": False, "is_grace": False}


async def require_active_subscription(
    access: dict = Depends(get_subscription_access),
):
    """Dependency that blocks write operations if no active subscription/trial.
    Allows reads during grace period but blocks during dormant."""
    if access.get("is_dormant"):
        raise HTTPException(
            status_code=403,
            detail="Your account is dormant due to an expired payment. Update your payment method in Settings to restore full access. Your existing data is still accessible in read-only mode.",
        )
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


async def require_admin(current_user: dict = Depends(get_current_user)):
    """Dependency that ensures the current user is an admin.
    Use as: current_user: dict = Depends(require_admin)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def require_staff(current_user: dict = Depends(get_current_user)):
    """Dependency that ensures the current user is admin or operator.
    Use as: current_user: dict = Depends(require_staff)"""
    if current_user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Staff access required")
    return current_user


def require_admin_scope(current_user: dict, allowed_scopes: list[str]):
    """Check if admin has one of the allowed scopes.
    Founder ('founder' scope) always passes.
    Supports both legacy string and new array admin_scope format."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    raw = current_user.get("admin_scope", "founder")
    user_scopes = raw if isinstance(raw, list) else [raw] if raw else ["founder"]
    if "founder" in user_scopes:
        return  # Founder is God — always passes
    if not any(s in allowed_scopes for s in user_scopes):
        raise HTTPException(
            status_code=403,
            detail=f"This section requires one of: {', '.join(allowed_scopes)} access",
        )


def check_staff_role(user: dict):
    """Inline staff role check — use when user is already resolved via get_current_user.
    Raises 403 if user is not admin or operator."""
    if user.get("role") not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Staff access required")


def check_founder_role(user: dict):
    """Inline founder role check — use when user is already resolved.
    Raises 403 if user is not admin."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Founder access required")


def is_founder_scope(user: dict) -> bool:
    """Check if admin has founder scope. Handles both string and array formats."""
    raw = user.get("admin_scope", "founder")
    scopes = raw if isinstance(raw, list) else [raw] if raw else ["founder"]
    return "founder" in scopes


def check_manager_or_admin(user: dict):
    """Inline check for manager or admin role."""
    if user.get("role") != "admin" and user.get("operator_role") != "manager":
        raise HTTPException(status_code=403, detail="Manager or admin access required")


# ── IDOR (Insecure Direct Object Reference) guards ──────────────────────────
# Use these on every endpoint that takes an estate_id (or fetches by item id
# and then needs to authorize the calling user). Added Feb 2026 after an
# audit found 13 endpoints leaking PII / accepting cross-tenant mutations.
#
# - `require_estate_member` — read access: owner OR listed beneficiary OR admin
# - `require_estate_owner`  — write access on owner-only resources: owner OR admin
#
# Both raise HTTPException(403) on failure with a consistent detail string so
# the frontend doesn't have to disambiguate.
from services.estate_auth import is_estate_member, is_estate_owner  # noqa: E402


async def require_estate_member(estate_id: str, current_user: dict) -> None:
    """403 unless the caller is the estate's owner, a listed beneficiary, or
    a CarryOn admin. Use on READ endpoints scoped to an estate."""
    if not estate_id:
        raise HTTPException(status_code=400, detail="estate_id required")
    if current_user.get("role") == "admin":
        return
    if await is_estate_member(current_user["id"], estate_id):
        return
    raise HTTPException(status_code=403, detail="Not authorized for this estate")


async def require_estate_owner(estate_id: str, current_user: dict) -> None:
    """403 unless the caller is the estate's owner or a CarryOn admin. Use on
    WRITE endpoints that should NOT be exercisable by listed beneficiaries
    (e.g. editing the benefactor's messages, checklist, beneficiary roster)."""
    if not estate_id:
        raise HTTPException(status_code=400, detail="estate_id required")
    if await is_estate_owner(current_user["id"], estate_id):
        return
    raise HTTPException(status_code=403, detail="Not authorized for this estate")
