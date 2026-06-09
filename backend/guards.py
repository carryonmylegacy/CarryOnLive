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
    """Check if user has active access (trial or subscription).

    Result is cached in-process for 30s (services/hot_cache.py) — every
    Stripe webhook handler that flips a user's billing status calls
    `invalidate_subscription_cache(user_id)` so changes propagate fast.
    """
    from services.hot_cache import (
        get_cached_subscription as _cache_get,
        set_cached_subscription as _cache_set,
    )

    cached = _cache_get(current_user["id"])
    if cached is not None:
        return cached

    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin always has access
    if user.get("role") == "admin":
        result = {"has_access": True, "reason": "admin", "is_dormant": False, "is_grace": False}
        _cache_set(current_user["id"], result)
        return result

    # Check for free access override (B2B, beta, etc.)
    override = await db.subscription_overrides.find_one({"user_id": user["id"]}, {"_id": 0})
    if override and override.get("free_access"):
        result = {"has_access": True, "reason": "free_access", "is_dormant": False, "is_grace": False}
        _cache_set(current_user["id"], result)
        return result

    # Check per-user beta tester status
    if user.get("is_beta_tester"):
        result = {"has_access": True, "reason": "beta", "is_dormant": False, "is_grace": False}
        _cache_set(current_user["id"], result)
        return result

    # Check global beta mode (legacy fallback)
    settings = await db.subscription_settings.find_one({"_id": "global"}, {"_id": 0})
    if settings and settings.get("beta_mode"):
        result = {"has_access": True, "reason": "beta", "is_dormant": False, "is_grace": False}
        _cache_set(current_user["id"], result)
        return result

    platform_settings = await db.platform_settings.find_one(
        {"_id": "global"},
        {"_id": 0, "platform_free_mode": 1},
    )
    if platform_settings and platform_settings.get("platform_free_mode"):
        result = {
            "has_access": True,
            "reason": "platform_free_mode",
            "is_dormant": False,
            "is_grace": False,
            "platform_free_mode": True,
        }
        _cache_set(current_user["id"], result)
        return result

    # Check subscription status
    sub = await db.user_subscriptions.find_one({"user_id": user["id"]}, {"_id": 0})
    if sub:
        status = sub.get("status", "")
        if status == "active":
            result = {"has_access": True, "reason": "subscription", "is_dormant": False, "is_grace": False}
            _cache_set(current_user["id"], result)
            return result
        if status == "past_due":
            result = {
                "has_access": True,
                "reason": "grace_period",
                "is_dormant": False,
                "is_grace": True,
                "grace_period_end": sub.get("grace_period_end"),
            }
            _cache_set(current_user["id"], result)
            return result
        if status == "dormant":
            result = {
                "has_access": False,
                "reason": "dormant",
                "is_dormant": True,
                "is_grace": False,
                "dormant_since": sub.get("dormant_since"),
            }
            _cache_set(current_user["id"], result)
            return result

    # Check trial
    trial_ends = user.get("trial_ends_at")
    if trial_ends:
        try:
            ends = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) < ends:
                result = {"has_access": True, "reason": "trial", "is_dormant": False, "is_grace": False}
                _cache_set(current_user["id"], result)
                return result
        except (ValueError, TypeError):
            pass

    result = {"has_access": False, "reason": "expired", "is_dormant": False, "is_grace": False}
    _cache_set(current_user["id"], result)
    return result


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


async def require_benefactor_role(current_user: dict, action: str = "perform this action"):
    """Verify the caller may act as a benefactor (write access).

    Allows: role benefactor/admin, the stored `is_also_benefactor` flag, OR
    ACTUAL estate ownership (live lookup). The live-ownership fallback is the
    authoritative signal and covers dual-role users who were invited as a
    beneficiary first and later created their own estate: `get_current_user`
    returns the RAW user doc, which NEVER carries the DERIVED
    `is_also_benefactor` flag (login/`/auth/me` compute it on the fly as
    `stored_flag OR owns_estate`), so the stored field can be False even
    though they legitimately operate a Benefactor Portal. Trustee-acting-as
    sessions resolve to the benefactor's own doc (role=benefactor) and pass
    intentionally. Every such endpoint then scopes its mutation to the
    caller's own estate, so this only ever grants access to the user's OWN
    data — no cross-estate exposure.
    """
    if current_user.get("role") in ("benefactor", "admin") or current_user.get("is_also_benefactor"):
        return
    if await db.estates.find_one({"owner_id": current_user["id"]}, {"_id": 0, "id": 1}):
        return
    raise HTTPException(status_code=403, detail=f"Only benefactors can {action}")


async def is_benefactor_or_admin(current_user: dict) -> bool:
    """Bool form of `require_benefactor_role` (does not raise).

    Recognizes role benefactor/admin, the stored `is_also_benefactor` flag, OR
    live estate ownership — so dual-role estate owners are never wrongly denied.
    """
    if current_user.get("role") in ("benefactor", "admin") or current_user.get("is_also_benefactor"):
        return True
    return bool(await db.estates.find_one({"owner_id": current_user["id"]}, {"_id": 0, "id": 1}))


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


def require_scope(*allowed_scopes: str):
    """FastAPI dependency FACTORY that enforces admin/operator scope at the
    router level (SOC2 CC6.1 — server-side least privilege, not UI-only).

    Behavior (audit 735b3b7 #1 — operators are now SCOPE-ENFORCED, not waved
    through):
      • Operators are mapped to their least-privilege scope via
        `derive_operator_scopes` (manager → 'ops_manager', else 'ops_team') and
        must hold one of `allowed_scopes` — exactly like a scoped admin. An
        ops_team worker can therefore NOT reach finance / compliance / founder /
        platform_health routers.
      • Admins must hold the 'founder' scope (god mode) OR one of
        `allowed_scopes`.
      • Legacy admins with NO `admin_scope` are treated as founder (default
        ["founder"]) so no existing founder account is ever locked out.
      • Non-admin / non-operator callers get 403.
    """

    async def _dep(current_user: dict = Depends(get_current_user)):
        role = current_user.get("role")
        if role == "operator":
            op_scopes = derive_operator_scopes(current_user)
            if any(s in allowed_scopes for s in op_scopes):
                return current_user
            raise HTTPException(
                status_code=403,
                detail=f"This section requires one of: {', '.join(allowed_scopes)} access",
            )
        if role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        raw = current_user.get("admin_scope") or "founder"
        scopes = raw if isinstance(raw, list) else [raw]
        if "founder" in scopes or any(s in allowed_scopes for s in scopes):
            return current_user
        raise HTTPException(
            status_code=403,
            detail=f"This section requires one of: {', '.join(allowed_scopes)} access",
        )

    return _dep


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


def derive_operator_scopes(user: dict) -> list[str]:
    """Map an operator account to its least-privilege admin scope (SOC2 #2).

    operator_role 'manager' → ['ops_manager']; anything else → ['ops_team'].
    Non-operators return []. Mirrors routes/admin/scoped_roles.py so the
    operator → scope mapping has one consistent definition.
    """
    if user.get("role") != "operator":
        return []
    return ["ops_manager"] if user.get("operator_role") == "manager" else ["ops_team"]


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
