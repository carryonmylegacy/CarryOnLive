"""Admin subscription settings, user overrides, and plan price management.

Extracted from checkout.py (Monolith Reduction 3/6, Feb 2026).
All endpoints in this module are admin/operator-scoped — they DO NOT touch
Stripe or live revenue paths. Live checkout/webhook/plan-change/cancel
endpoints remain in `checkout.py`.
"""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, Form, HTTPException, Request

from config import db, logger
from utils import get_current_user
from routes.subscriptions.plans import (
    router,
    DEFAULT_PLANS,
    BENEFICIARY_PLANS,
    get_subscription_settings,
    AdminSubscriptionSettings,
    AdminUserSubscriptionOverride,
)


@router.get("/admin/subscription-settings")
async def get_admin_subscription_settings(
    current_user: dict = Depends(get_current_user),
):
    """Get platform-wide subscription settings (admin and operators)"""
    if current_user.get("role") not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Staff access required")

    settings = await get_subscription_settings()

    # Get subscription stats
    total_subs = await db.user_subscriptions.count_documents({"status": "active"})
    free_overrides = await db.subscription_overrides.count_documents({"free_access": True})
    discount_overrides = await db.subscription_overrides.count_documents({"custom_discount": {"$gt": 0}})

    return {
        **settings,
        "beneficiary_plans": settings.get("beneficiary_plans", BENEFICIARY_PLANS),
        "family_benefactor_discount_percent": settings.get("family_benefactor_discount_percent", 0),
        "family_beneficiary_discount_percent": settings.get("family_beneficiary_discount_percent", 0),
        "stats": {
            "active_subscriptions": total_subs,
            "free_access_users": free_overrides,
            "discounted_users": discount_overrides,
        },
    }


@router.put("/admin/subscription-settings")
async def update_admin_subscription_settings(
    data: AdminSubscriptionSettings, current_user: dict = Depends(get_current_user)
):
    """Update platform-wide subscription settings (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    update = {}
    if data.beta_mode is not None:
        update["beta_mode"] = data.beta_mode
    if data.plans is not None:
        update["plans"] = data.plans

    if update:
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.subscription_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)

    return {"success": True, "message": "Subscription settings updated"}


@router.get("/admin/user-subscriptions")
async def get_admin_user_subscriptions(current_user: dict = Depends(get_current_user)):
    """Get all users with subscription info including billing status flags (admin and operators)"""
    if current_user.get("role") not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Staff access required")

    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    now = datetime.now(timezone.utc)

    for user in users:
        sub = await db.user_subscriptions.find_one({"user_id": user["id"]}, {"_id": 0})
        override = await db.subscription_overrides.find_one({"user_id": user["id"]}, {"_id": 0})
        user["subscription"] = sub
        user["override"] = override

        # Compute billing status flags for admin UI highlighting
        billing_status = "active"  # default
        grace_days_remaining = None
        if sub:
            if sub.get("status") == "past_due":
                billing_status = "grace_period"
                if sub.get("grace_period_end"):
                    try:
                        gpe = datetime.fromisoformat(sub["grace_period_end"].replace("Z", "+00:00"))
                        if gpe.tzinfo is None:
                            gpe = gpe.replace(tzinfo=timezone.utc)
                        grace_days_remaining = max(0, (gpe - now).days)
                    except (ValueError, TypeError):
                        pass
            elif sub.get("status") == "dormant":
                billing_status = "dormant"
            elif sub.get("status") == "cancelled":
                billing_status = "cancelled"

        # Check trial status
        is_trial = False
        trial_days_remaining = None
        trial_ends = user.get("trial_ends_at")
        if trial_ends and billing_status == "active" and not (sub and sub.get("status") == "active"):
            try:
                ends = datetime.fromisoformat(trial_ends.replace("Z", "+00:00"))
                if ends.tzinfo is None:
                    ends = ends.replace(tzinfo=timezone.utc)
                if now < ends:
                    is_trial = True
                    trial_days_remaining = max(0, (ends - now).days)
                    billing_status = "trial"
            except (ValueError, TypeError):
                pass

        user["billing_status"] = billing_status
        user["grace_days_remaining"] = grace_days_remaining
        user["is_trial"] = is_trial
        user["trial_days_remaining"] = trial_days_remaining

    return users


@router.put("/admin/user-subscription/{user_id}")
async def update_admin_user_subscription(
    user_id: str,
    data: AdminUserSubscriptionOverride,
    current_user: dict = Depends(get_current_user),
):
    """Set per-user subscription overrides (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update = {"user_id": user_id, "updated_at": datetime.now(timezone.utc).isoformat()}
    if data.free_access is not None:
        update["free_access"] = data.free_access
    if data.custom_discount is not None:
        if data.custom_discount < 0 or data.custom_discount > 100:
            raise HTTPException(status_code=400, detail="Discount must be 0-100")
        update["custom_discount"] = data.custom_discount

    await db.subscription_overrides.update_one({"user_id": user_id}, {"$set": update}, upsert=True)

    return {
        "success": True,
        "message": f"Subscription override updated for user {user_id}",
    }


@router.post("/admin/reset-subscription/{user_id}")
async def admin_reset_subscription(
    user_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Reset a user to pre-subscription, first-day-of-trial state.
    Clears all subscription, payment, and Apple transaction records.
    Admin (founder) only.

    Optional JSON body: { "expire_trial": true } — sets trial_ends_at to
    yesterday so the user immediately sees the paywall (for App Store review).
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Parse optional body
    expire_trial = False
    try:
        body = await request.json()
        expire_trial = body.get("expire_trial", False)
    except Exception:
        pass

    from routes.admin.trial_policy import get_trial_days

    trial_days = await get_trial_days()
    now = datetime.now(timezone.utc)
    if expire_trial:
        # Set trial to yesterday so user immediately sees the paywall
        new_trial_end = now - timedelta(days=1)
    else:
        new_trial_end = now + timedelta(days=trial_days)

    # 1. Delete subscription record
    sub_del = await db.user_subscriptions.delete_many({"user_id": user_id})

    # 2. Delete Apple IAP transaction records (prevents replay-attack blocks)
    apple_del = await db.apple_transactions.delete_many({"user_id": user_id})

    # 3. Delete payment transaction records
    pay_del = await db.payment_transactions.delete_many({"user_id": user_id})

    # 4. Delete subscription overrides (free access, discounts)
    override_del = await db.subscription_overrides.delete_many({"user_id": user_id})

    # 5. Reset trial and clear beta_accepted_at
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "trial_ends_at": new_trial_end.isoformat(),
            },
            "$unset": {
                "beta_accepted_at": "",
            },
        },
    )

    # 6. Log the reset for audit
    await db.admin_audit_log.insert_one(
        {
            "action": "subscription_reset",
            "target_user_id": user_id,
            "target_email": user.get("email", ""),
            "performed_by": current_user["id"],
            "performed_at": now.isoformat(),
            "details": {
                "subscriptions_deleted": sub_del.deleted_count,
                "apple_transactions_deleted": apple_del.deleted_count,
                "payment_transactions_deleted": pay_del.deleted_count,
                "overrides_deleted": override_del.deleted_count,
                "new_trial_ends_at": new_trial_end.isoformat(),
                "trial_expired": expire_trial,
            },
        }
    )

    logger.info(
        f"Admin {current_user['id']} reset subscription for user {user_id} "
        f"({user.get('email', '')}): subs={sub_del.deleted_count}, "
        f"apple_txns={apple_del.deleted_count}, payments={pay_del.deleted_count}, "
        f"trial_expired={expire_trial}"
    )

    return {
        "success": True,
        "message": f"Subscription fully reset for {user.get('email', user_id)}"
        + (" (trial expired — paywall active)" if expire_trial else " (fresh 30-day trial)"),
        "details": {
            "subscriptions_cleared": sub_del.deleted_count,
            "apple_transactions_cleared": apple_del.deleted_count,
            "payment_transactions_cleared": pay_del.deleted_count,
            "overrides_cleared": override_del.deleted_count,
            "new_trial_ends_at": new_trial_end.isoformat(),
            "trial_expired": expire_trial,
        },
    }


@router.put("/admin/plans/{plan_id}/price")
async def update_plan_price(
    plan_id: str,
    price: float = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Update a plan's price (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    settings = await get_subscription_settings()
    plans = settings.get("plans", DEFAULT_PLANS)

    found = False
    for plan in plans:
        if plan["id"] == plan_id:
            plan["price"] = price
            # Recalculate quarterly and annual prices to stay in sync
            plan["quarterly_price"] = round(price * 0.9, 2)
            plan["annual_price"] = round(price * 0.8, 2)
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    await db.subscription_settings.update_one(
        {"_id": "global"},
        {
            "$set": {
                "plans": plans,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    return {"success": True, "message": f"Price updated to ${price:.2f}"}


@router.put("/admin/beneficiary-plans/{plan_id}/price")
async def update_beneficiary_plan_price(
    plan_id: str,
    price: float = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Update a beneficiary plan's price (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    # Beneficiary plans are stored in code, sync to DB
    settings = await get_subscription_settings()
    ben_plans = settings.get("beneficiary_plans", BENEFICIARY_PLANS[:])

    found = False
    for plan in ben_plans:
        if plan["id"] == plan_id:
            plan["price"] = price
            # Recalculate quarterly and annual prices to stay in sync
            plan["quarterly_price"] = round(price * 0.9, 2)
            plan["annual_price"] = round(price * 0.8, 2)
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"Beneficiary plan not found: {plan_id}")

    # Also sync ben_price on the corresponding benefactor plan
    # Mapping: ben_premium → premium, ben_standard → standard, etc.
    benefactor_plan_id = plan_id.replace("ben_", "", 1)
    plans = settings.get("plans", DEFAULT_PLANS)
    for p in plans:
        if p["id"] == benefactor_plan_id:
            p["ben_price"] = price
            break

    await db.subscription_settings.update_one(
        {"_id": "global"},
        {
            "$set": {
                "beneficiary_plans": ben_plans,
                "plans": plans,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    return {"success": True, "message": f"Beneficiary price updated to ${price:.2f}"}


@router.get("/admin/family-discount-settings")
async def get_family_discount_settings(current_user: dict = Depends(get_current_user)):
    """Get family discount percentages (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    settings = await get_subscription_settings()
    return {
        "family_benefactor_discount_percent": settings.get("family_benefactor_discount_percent", 0),
        "family_beneficiary_discount_percent": settings.get("family_beneficiary_discount_percent", 0),
    }


@router.put("/admin/family-discount-settings")
async def update_family_discount_settings(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Update family discount percentages (admin only).
    Accepts: { family_benefactor_discount_percent: float, family_beneficiary_discount_percent: float }
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    data = await request.json()
    update = {}

    if "family_benefactor_discount_percent" in data:
        val = float(data["family_benefactor_discount_percent"])
        if val < 0 or val > 100:
            raise HTTPException(status_code=400, detail="Benefactor discount must be 0-100%")
        update["family_benefactor_discount_percent"] = val

    if "family_beneficiary_discount_percent" in data:
        val = float(data["family_beneficiary_discount_percent"])
        if val < 0 or val > 100:
            raise HTTPException(status_code=400, detail="Beneficiary discount must be 0-100%")
        update["family_beneficiary_discount_percent"] = val

    if not update:
        raise HTTPException(status_code=400, detail="No valid fields provided")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.subscription_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)

    return {
        "success": True,
        "message": "Family discount settings updated",
        **{k: v for k, v in update.items() if k != "updated_at"},
    }


@router.put("/admin/plans/{plan_id}/paired-price")
async def update_paired_price(
    plan_id: str,
    price: float = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Update a plan's paired price — the price beneficiaries pay post-transition (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    settings = await get_subscription_settings()
    plans = settings.get("plans", DEFAULT_PLANS)

    found = False
    for plan in plans:
        if plan["id"] == plan_id:
            plan["paired_price"] = price
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")

    await db.subscription_settings.update_one(
        {"_id": "global"},
        {
            "$set": {
                "plans": plans,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    return {"success": True, "message": f"Paired price updated to ${price:.2f}"}
