"""CarryOn™ Backend — Stripe Subscriptions"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import stripe
from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest,
    StripeCheckout,
)
from fastapi import APIRouter, Depends, Form, HTTPException
from pydantic import BaseModel

from config import db, logger
from utils import get_current_user

router = APIRouter()

# ===================== STRIPE PAYMENT METHOD =====================

# Initialize Stripe
stripe.api_key = os.environ.get("STRIPE_API_KEY")


class SetupIntentResponse(BaseModel):
    client_secret: str
    setup_intent_id: str


class SavePaymentMethodRequest(BaseModel):
    task_id: str
    payment_method_id: str
    card_last4: str
    card_exp_month: int
    card_exp_year: int
    card_holder_name: Optional[str] = None


@router.post("/stripe/create-setup-intent", response_model=SetupIntentResponse)
async def create_setup_intent(user: dict = Depends(get_current_user)):
    """Create a Stripe SetupIntent for saving a payment method for later use"""
    try:
        # Create a customer if one doesn't exist
        user_doc = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        stripe_customer_id = user_doc.get("stripe_customer_id") if user_doc else None

        if not stripe_customer_id:
            customer = stripe.Customer.create(
                email=user.get("email"),
                name=user.get("name", user.get("email")),
                metadata={"carryon_user_id": user["id"]},
            )
            stripe_customer_id = customer.id
            await db.users.update_one(
                {"id": user["id"]}, {"$set": {"stripe_customer_id": stripe_customer_id}}
            )

        # Create SetupIntent for saving payment method
        setup_intent = stripe.SetupIntent.create(
            customer=stripe_customer_id,
            payment_method_types=["card"],
            metadata={"carryon_user_id": user["id"]},
        )

        return SetupIntentResponse(
            client_secret=setup_intent.client_secret, setup_intent_id=setup_intent.id
        )
    except Exception as e:
        logger.error(f"Error creating setup intent: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dts/tasks/{task_id}/payment-method")
async def save_dts_payment_method(
    task_id: str,
    request: SavePaymentMethodRequest,
    user: dict = Depends(get_current_user),
):
    """Save a payment method to a DTS task for charging upon transition"""
    try:
        # Verify task belongs to user's estate
        task = await db.dts_tasks.find_one({"id": task_id}, {"_id": 0})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        estate = await db.estates.find_one(
            {"id": task["estate_id"], "user_id": user["id"]}, {"_id": 0}
        )
        if not estate:
            raise HTTPException(status_code=403, detail="Not authorized")

        # Update task with payment method info
        payment_info = {
            "payment_method_id": request.payment_method_id,
            "last4": request.card_last4,
            "exp": f"{request.card_exp_month:02d}/{str(request.card_exp_year)[-2:]}",
            "name": request.card_holder_name or user.get("name", ""),
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }

        await db.dts_tasks.update_one(
            {"id": task_id},
            {"$set": {"payment_method": payment_info, "status": "ready"}},
        )

        return {"success": True, "message": "Payment method saved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving payment method: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===================== STRIPE SUBSCRIPTIONS =====================


DEFAULT_PLANS = [
    {
        "id": "premium",
        "name": "Premium",
        "price": 9.99,
        "quarterly_price": 8.99,
        "annual_price": 7.99,
        "ben_price": 2.99,
        "adjustable": True,
        "features": [
            "Everything in Standard",
            "Unlimited beneficiaries",
            "Priority human support (CST)",
            "Future: Will/Trust Wizard & Eternal Echo",
        ],
    },
    {
        "id": "standard",
        "name": "Standard",
        "price": 8.99,
        "quarterly_price": 8.09,
        "annual_price": 7.19,
        "ben_price": 3.99,
        "adjustable": True,
        "features": [
            "Everything in Base",
            "Milestone Messages",
            "Estate Guardian analysis",
            "Expanded vault storage",
        ],
    },
    {
        "id": "base",
        "name": "Base",
        "price": 7.99,
        "quarterly_price": 7.19,
        "annual_price": 6.39,
        "ben_price": 4.99,
        "adjustable": True,
        "features": [
            "Immediate Action Checklist",
            "Basic Secure Document Vault",
            "Beneficiary management (up to 3)",
        ],
    },
    {
        "id": "new_adult",
        "name": "New Adult",
        "price": 3.99,
        "quarterly_price": 3.59,
        "annual_price": 3.19,
        "ben_price": 1.99,
        "adjustable": False,
        "note": "Ages 18-25 · Auto-detected",
        "requires_age_verification": True,
        "features": [
            "Full platform access",
            "Life Milestone onboarding",
            "Plan grows with you",
        ],
    },
    {
        "id": "military",
        "name": "Military / First Responder",
        "price": 5.99,
        "quarterly_price": 5.39,
        "annual_price": 4.79,
        "ben_price": 1.99,
        "adjustable": False,
        "note": "Requires verification",
        "requires_verification": True,
        "verification_docs": ["Military ID", "First Responder Badge"],
        "features": [
            "Full platform access",
            "Priority support",
            "Flat rate — no launch delta",
        ],
    },
    {
        "id": "hospice",
        "name": "Hospice",
        "price": 0.00,
        "quarterly_price": 0.00,
        "annual_price": 0.00,
        "ben_price": 4.99,
        "adjustable": False,
        "note": "Requires hospice verification",
        "requires_verification": True,
        "verification_docs": ["Hospice enrollment documentation"],
        "features": [
            "Full platform access at no cost",
            "For U.S. citizens/residents in certified hospice care",
            "Compassionate support",
        ],
    },
]

BENEFICIARY_PLANS = [
    {
        "id": "ben_base",
        "name": "Base Beneficiary",
        "price": 4.99,
        "note": "Flat rate",
        "features": ["Immediate Action Checklist", "Basic vault access", "Milestone Messages"],
    },
    {
        "id": "ben_standard",
        "name": "Standard Beneficiary",
        "price": 3.99,
        "note": "Flat rate",
        "features": ["Everything in Base", "Expanded vault access", "Estate Guardian analysis"],
    },
    {
        "id": "ben_premium",
        "name": "Premium Beneficiary",
        "price": 2.99,
        "note": "Flat rate",
        "features": ["Everything in Standard", "Priority human support", "Future: Will/Trust Wizard & Eternal Echo"],
    },
    {
        "id": "ben_hospice",
        "name": "Hospice Beneficiary",
        "price": 4.99,
        "note": "Post-transition · Flat rate",
        "features": ["All Base features", "Applies when no prior paid tier"],
    },
]

TRIAL_DURATION_DAYS = 30


class SubscriptionCheckoutRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"  # monthly, quarterly, annual
    origin_url: str


class AdminSubscriptionSettings(BaseModel):
    beta_mode: Optional[bool] = None
    plans: Optional[List[Dict[str, Any]]] = None


class AdminUserSubscriptionOverride(BaseModel):
    free_access: Optional[bool] = None
    custom_discount: Optional[float] = None  # 0-100 percentage


class VerificationReviewRequest(BaseModel):
    action: str  # "approve" or "deny"
    notes: Optional[str] = None


async def get_subscription_settings():
    """Get platform-wide subscription settings"""
    settings = await db.subscription_settings.find_one({"_id": "global"}, {"_id": 0})
    if not settings:
        settings = {"beta_mode": True, "plans": DEFAULT_PLANS, "family_plan_enabled": True}
        await db.subscription_settings.update_one(
            {"_id": "global"}, {"$set": settings}, upsert=True
        )
    return settings


def calculate_trial_status(user_doc):
    """Calculate trial status for a user"""
    trial_ends_at = user_doc.get("trial_ends_at")
    if not trial_ends_at:
        return {"trial_active": False, "trial_expired": False, "days_remaining": 0}

    if isinstance(trial_ends_at, str):
        trial_end = datetime.fromisoformat(trial_ends_at.replace("Z", "+00:00"))
    else:
        trial_end = trial_ends_at

    now = datetime.now(timezone.utc)
    if trial_end.tzinfo is None:
        trial_end = trial_end.replace(tzinfo=timezone.utc)

    days_remaining = max(0, (trial_end - now).days)
    return {
        "trial_active": now < trial_end,
        "trial_expired": now >= trial_end,
        "days_remaining": days_remaining,
        "trial_ends_at": trial_end.isoformat(),
    }


def get_price_for_cycle(plan, billing_cycle):
    """Get the correct price based on billing cycle"""
    if billing_cycle == "quarterly":
        return plan.get("quarterly_price", round(plan["price"] * 0.9, 2))
    elif billing_cycle == "annual":
        return plan.get("annual_price", round(plan["price"] * 0.8, 2))
    return plan["price"]


@router.get("/subscriptions/plans")
async def get_subscription_plans():
    """Get available subscription plans (public)"""
    settings = await get_subscription_settings()
    return {
        "plans": settings.get("plans", DEFAULT_PLANS),
        "beneficiary_plans": BENEFICIARY_PLANS,
        "beta_mode": settings.get("beta_mode", True),
        "family_plan_enabled": settings.get("family_plan_enabled", True),
    }


@router.get("/subscriptions/status")
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    """Get current user's subscription status including trial info"""
    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    sub = await db.user_subscriptions.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    settings = await get_subscription_settings()

    # Check admin overrides
    override = await db.subscription_overrides.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )

    # Calculate trial status
    trial = calculate_trial_status(user_doc) if user_doc else {
        "trial_active": False, "trial_expired": False, "days_remaining": 0
    }

    # Check verification status
    verification = await db.tier_verifications.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )

    is_beta = settings.get("beta_mode", True)
    has_free_access = override and override.get("free_access", False)
    has_active_sub = sub and sub.get("status") == "active"

    # User has access if: beta mode OR free override OR active subscription OR trial active
    has_access = is_beta or has_free_access or has_active_sub or trial.get("trial_active", False)

    # Determine eligible special tiers based on DOB
    eligible_tiers = []
    if user_doc and user_doc.get("date_of_birth"):
        try:
            dob = datetime.fromisoformat(user_doc["date_of_birth"])
            age = (datetime.now(timezone.utc) - dob.replace(tzinfo=timezone.utc)).days // 365
            if 18 <= age <= 25:
                eligible_tiers.append("new_adult")
        except (ValueError, TypeError):
            pass

    return {
        "subscription": sub,
        "trial": trial,
        "beta_mode": is_beta,
        "free_access": is_beta or has_free_access,
        "custom_discount": override.get("custom_discount", 0) if override else 0,
        "has_active_subscription": has_access,
        "needs_subscription": not has_access,
        "verification": {
            "status": verification.get("status", "none") if verification else "none",
            "tier_requested": verification.get("tier_requested") if verification else None,
        } if verification else None,
        "eligible_tiers": eligible_tiers,
        "user_role": current_user.get("role", "benefactor"),
    }


@router.post("/subscriptions/checkout")
async def create_subscription_checkout(
    data: SubscriptionCheckoutRequest,
    request: Any = None,
    current_user: dict = Depends(get_current_user),
):
    """Create a Stripe checkout session for a subscription"""
    settings = await get_subscription_settings()

    if settings.get("beta_mode", True):
        raise HTTPException(
            status_code=400, detail="Subscriptions are free during beta period"
        )

    plans = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}
    plan = plans.get(data.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {data.plan_id}")

    # Calculate price based on billing cycle
    monthly_price = float(plan["price"])
    if data.billing_cycle == "annual":
        amount = round(float(plan.get("annual_price", monthly_price * 0.8)) * 12, 2)
    elif data.billing_cycle == "quarterly":
        amount = round(float(plan.get("quarterly_price", monthly_price * 0.9)) * 3, 2)
    else:
        amount = monthly_price

    # Apply per-user discount
    override = await db.subscription_overrides.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    discount = override.get("custom_discount", 0) if override else 0
    if discount > 0:
        amount = round(amount * (1 - discount / 100), 2)

    if amount <= 0:
        # Free plan, just activate
        await db.user_subscriptions.update_one(
            {"user_id": current_user["id"]},
            {
                "$set": {
                    "user_id": current_user["id"],
                    "plan_id": data.plan_id,
                    "plan_name": plan["name"],
                    "status": "active",
                    "billing_cycle": data.billing_cycle,
                    "amount": 0.0,
                    "free_plan": True,
                    "activated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )
        return {"free": True, "message": f"{plan['name']} plan activated (free)"}

    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")

    origin = data.origin_url.rstrip("/")
    success_url = f"{origin}/settings?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/settings"
    webhook_url = f"{origin}/api/webhook/stripe"

    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)

    checkout_request = CheckoutSessionRequest(
        amount=amount,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": current_user["id"],
            "user_email": current_user["email"],
            "plan_id": data.plan_id,
            "plan_name": plan["name"],
            "billing_cycle": data.billing_cycle,
            "discount_applied": str(discount),
        },
    )

    session = await stripe_checkout.create_checkout_session(checkout_request)

    # Record transaction
    await db.payment_transactions.insert_one(
        {
            "session_id": session.session_id,
            "user_id": current_user["id"],
            "user_email": current_user["email"],
            "plan_id": data.plan_id,
            "plan_name": plan["name"],
            "billing_cycle": data.billing_cycle,
            "amount": amount,
            "currency": "usd",
            "discount_applied": discount,
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    return {"url": session.url, "session_id": session.session_id}


@router.get("/subscriptions/checkout-status/{session_id}")
async def get_checkout_status(
    session_id: str, current_user: dict = Depends(get_current_user)
):
    """Poll checkout session status"""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")

    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
    checkout_status = await stripe_checkout.get_checkout_status(session_id)

    # Update transaction
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if txn and txn.get("payment_status") != "paid":
        new_status = checkout_status.payment_status
        update_data = {
            "payment_status": new_status,
            "status": checkout_status.status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.payment_transactions.update_one(
            {"session_id": session_id}, {"$set": update_data}
        )

        # If paid, activate subscription
        if new_status == "paid":
            plan_id = txn.get("plan_id", "")
            now = datetime.now(timezone.utc)
            cycle = txn.get("billing_cycle", "monthly")
            if cycle == "annual":
                period_end = now + timedelta(days=365)
            elif cycle == "quarterly":
                period_end = now + timedelta(days=90)
            else:
                period_end = now + timedelta(days=30)

            await db.user_subscriptions.update_one(
                {"user_id": txn["user_id"]},
                {
                    "$set": {
                        "user_id": txn["user_id"],
                        "plan_id": plan_id,
                        "plan_name": txn.get("plan_name", ""),
                        "status": "active",
                        "billing_cycle": cycle,
                        "amount": txn.get("amount", 0),
                        "stripe_session_id": session_id,
                        "current_period_start": now.isoformat(),
                        "current_period_end": period_end.isoformat(),
                        "activated_at": now.isoformat(),
                    }
                },
                upsert=True,
            )

    return {
        "status": checkout_status.status,
        "payment_status": checkout_status.payment_status,
        "amount_total": checkout_status.amount_total,
        "currency": checkout_status.currency,
    }


@router.post("/webhook/stripe")
async def stripe_webhook(request: Any):
    """Handle Stripe webhooks"""
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")

    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return {"received": True}

    try:
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
        event = await stripe_checkout.handle_webhook(body, sig)

        if event.payment_status == "paid" and event.session_id:
            txn = await db.payment_transactions.find_one(
                {"session_id": event.session_id}, {"_id": 0}
            )
            if txn and txn.get("payment_status") != "paid":
                await db.payment_transactions.update_one(
                    {"session_id": event.session_id},
                    {
                        "$set": {
                            "payment_status": "paid",
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }
                    },
                )

        return {"received": True}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"received": True}


# --- Admin Subscription Management ---


@router.get("/admin/subscription-settings")
async def get_admin_subscription_settings(
    current_user: dict = Depends(get_current_user),
):
    """Get platform-wide subscription settings (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    settings = await get_subscription_settings()

    # Get subscription stats
    total_subs = await db.user_subscriptions.count_documents({"status": "active"})
    free_overrides = await db.subscription_overrides.count_documents(
        {"free_access": True}
    )
    discount_overrides = await db.subscription_overrides.count_documents(
        {"custom_discount": {"$gt": 0}}
    )

    return {
        **settings,
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
        await db.subscription_settings.update_one(
            {"_id": "global"}, {"$set": update}, upsert=True
        )

    return {"success": True, "message": "Subscription settings updated"}


@router.get("/admin/user-subscriptions")
async def get_admin_user_subscriptions(current_user: dict = Depends(get_current_user)):
    """Get all users with subscription info (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)

    for user in users:
        sub = await db.user_subscriptions.find_one({"user_id": user["id"]}, {"_id": 0})
        override = await db.subscription_overrides.find_one(
            {"user_id": user["id"]}, {"_id": 0}
        )
        user["subscription"] = sub
        user["override"] = override

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

    await db.subscription_overrides.update_one(
        {"user_id": user_id}, {"$set": update}, upsert=True
    )

    return {
        "success": True,
        "message": f"Subscription override updated for user {user_id}",
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
            if not plan.get("adjustable", True):
                raise HTTPException(
                    status_code=400, detail=f"{plan['name']} pricing is fixed"
                )
            plan["price"] = price
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


# ===================== TIER VERIFICATION =====================


@router.post("/verification/upload")
async def upload_verification_document(
    tier_requested: str = Form(...),
    doc_type: str = Form(...),
    file_data: str = Form(...),
    file_name: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a verification document for a special tier (Military/Hospice)"""
    valid_tiers = ["military", "hospice"]
    if tier_requested not in valid_tiers:
        raise HTTPException(status_code=400, detail=f"Invalid tier. Must be one of: {valid_tiers}")

    # Check for existing pending verification
    existing = await db.tier_verifications.find_one(
        {"user_id": current_user["id"], "status": "pending"}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending verification request")

    import uuid
    verification = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "user_email": current_user.get("email", ""),
        "tier_requested": tier_requested,
        "doc_type": doc_type,
        "file_name": file_name,
        "file_data": file_data,
        "status": "pending",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_at": None,
        "reviewed_by": None,
        "review_notes": None,
    }

    await db.tier_verifications.insert_one(verification)

    return {
        "success": True,
        "verification_id": verification["id"],
        "message": f"Verification document submitted for {tier_requested} tier. We'll review it within 24-48 hours.",
    }


@router.get("/verification/status")
async def get_verification_status(current_user: dict = Depends(get_current_user)):
    """Get current user's verification status"""
    verification = await db.tier_verifications.find_one(
        {"user_id": current_user["id"]},
        {"_id": 0, "file_data": 0},
        sort=[("submitted_at", -1)],
    )
    return verification or {"status": "none"}


# ===================== ADMIN VERIFICATION MANAGEMENT =====================


@router.get("/admin/verifications")
async def get_all_verifications(current_user: dict = Depends(get_current_user)):
    """Get all verification requests (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    verifications = await db.tier_verifications.find(
        {}, {"_id": 0, "file_data": 0}
    ).sort("submitted_at", -1).to_list(200)

    return verifications


@router.get("/admin/verifications/{verification_id}/document")
async def get_verification_document(
    verification_id: str, current_user: dict = Depends(get_current_user)
):
    """Download a verification document (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    verification = await db.tier_verifications.find_one(
        {"id": verification_id}, {"_id": 0}
    )
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")

    return {
        "file_data": verification.get("file_data", ""),
        "file_name": verification.get("file_name", "document"),
        "doc_type": verification.get("doc_type", ""),
    }


@router.post("/admin/verifications/{verification_id}/review")
async def review_verification(
    verification_id: str,
    data: VerificationReviewRequest,
    current_user: dict = Depends(get_current_user),
):
    """Approve or deny a verification request (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if data.action not in ["approve", "deny"]:
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'deny'")

    verification = await db.tier_verifications.find_one(
        {"id": verification_id}, {"_id": 0}
    )
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")

    new_status = "approved" if data.action == "approve" else "denied"

    await db.tier_verifications.update_one(
        {"id": verification_id},
        {
            "$set": {
                "status": new_status,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
                "reviewed_by": current_user["id"],
                "review_notes": data.notes,
            }
        },
    )

    # If approved, update user's verified tier
    if data.action == "approve":
        await db.users.update_one(
            {"id": verification["user_id"]},
            {
                "$set": {
                    "verified_tier": verification["tier_requested"],
                    "verification_status": "approved",
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

    action_label = "approved" if data.action == "approve" else "denied"
    return {
        "success": True,
        "message": f"Verification {action_label} for {verification.get('user_name', '')}",
    }


@router.get("/admin/subscription-stats")
async def get_subscription_stats(current_user: dict = Depends(get_current_user)):
    """Get detailed subscription statistics (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    total_users = await db.users.count_documents({})
    active_trials = await db.users.count_documents({
        "trial_ends_at": {"$gt": datetime.now(timezone.utc).isoformat()}
    })
    active_subs = await db.user_subscriptions.count_documents({"status": "active"})
    pending_verifications = await db.tier_verifications.count_documents({"status": "pending"})

    return {
        "total_users": total_users,
        "active_trials": active_trials,
        "active_subscriptions": active_subs,
        "pending_verifications": pending_verifications,
    }


@router.post("/admin/trial-reminders/send")
async def trigger_trial_reminders(current_user: dict = Depends(get_current_user)):
    """Manually trigger trial reminder emails (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    from routes.trial_reminders import send_trial_reminders
    count = await send_trial_reminders()
    return {"success": True, "reminders_sent": count}
