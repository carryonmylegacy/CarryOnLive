"""CarryOn™ Backend — Stripe Subscriptions"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import stripe
from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest,
    StripeCheckout,
)
from fastapi import APIRouter, Depends, Form, HTTPException
from pydantic import BaseModel

from config import db, logger
from utils import get_current_user

# Allowed domains for Stripe redirect URLs (prevents open redirect)
ALLOWED_REDIRECT_DOMAINS = {
    "app.carryon.us",
    "carryon.us",
    "www.carryon.us",
}


def validate_origin_url(origin_url: str) -> str:
    """Validate that the origin URL belongs to an allowed domain."""
    if not origin_url:
        return ""
    try:
        parsed = urlparse(origin_url)
        hostname = parsed.hostname or ""
        # Allow preview/dev domains
        if hostname.endswith(".emergentagent.com") or hostname.endswith(".vercel.app"):
            return origin_url.rstrip("/")
        if hostname in ALLOWED_REDIRECT_DOMAINS:
            return origin_url.rstrip("/")
        if hostname in ("localhost", "127.0.0.1"):
            return origin_url.rstrip("/")
    except Exception:
        pass
    raise HTTPException(status_code=400, detail="Invalid origin URL")


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
        raise HTTPException(
            status_code=500, detail="Payment service error. Please try again."
        )


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
        raise HTTPException(
            status_code=500, detail="Payment service error. Please try again."
        )


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
        "id": "ben_premium",
        "name": "Premium",
        "price": 2.99,
        "quarterly_price": 2.69,
        "annual_price": 2.39,
        "features": [
            "Everything in Standard",
            "Priority human support",
            "Future: Will/Trust Wizard & Eternal Echo",
        ],
    },
    {
        "id": "ben_standard",
        "name": "Standard",
        "price": 3.99,
        "quarterly_price": 3.59,
        "annual_price": 3.19,
        "features": [
            "Everything in Base",
            "Expanded vault access",
            "Estate Guardian analysis",
        ],
    },
    {
        "id": "ben_base",
        "name": "Base",
        "price": 4.99,
        "quarterly_price": 4.49,
        "annual_price": 3.99,
        "features": [
            "Immediate Action Checklist",
            "Basic vault access",
            "Milestone Messages",
        ],
    },
    {
        "id": "ben_hospice",
        "name": "Hospice Transition",
        "price": 4.99,
        "quarterly_price": 4.49,
        "annual_price": 3.99,
        "note": "After benefactor's transition · 30-day grace period",
        "features": [
            "All Base features",
            "Applies post-transition when no paid tier exists",
        ],
    },
]

GRACE_PERIOD_DAYS = 30

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
        settings = {
            "beta_mode": True,
            "plans": DEFAULT_PLANS,
            "family_plan_enabled": True,
        }
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
    trial = (
        calculate_trial_status(user_doc)
        if user_doc
        else {"trial_active": False, "trial_expired": False, "days_remaining": 0}
    )

    # Check verification status
    verification = await db.tier_verifications.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )

    is_beta = settings.get("beta_mode", True)
    has_free_access = override and override.get("free_access", False)
    has_active_sub = sub and sub.get("status") == "active"

    # User has access if: beta mode OR free override OR active subscription OR trial active
    has_access = (
        is_beta or has_free_access or has_active_sub or trial.get("trial_active", False)
    )

    # Determine eligible special tiers based on DOB
    eligible_tiers = []
    if user_doc and user_doc.get("date_of_birth"):
        try:
            dob = datetime.fromisoformat(user_doc["date_of_birth"])
            age = (
                datetime.now(timezone.utc) - dob.replace(tzinfo=timezone.utc)
            ).days // 365
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
            "tier_requested": verification.get("tier_requested")
            if verification
            else None,
        }
        if verification
        else None,
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

    origin = validate_origin_url(data.origin_url)
    success_url = f"{origin}/settings?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/settings"

    # Use backend's own URL for webhook, not frontend origin
    backend_url = os.environ.get(
        "RAILWAY_PUBLIC_URL", os.environ.get("BACKEND_URL", "")
    )
    webhook_url = (
        f"{backend_url}/api/webhook/stripe"
        if backend_url
        else f"{origin}/api/webhook/stripe"
    )

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


# --- User Subscription Management ---


class ChangeSubscriptionRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"
    origin_url: str = ""


class ChangeBillingRequest(BaseModel):
    billing_cycle: str  # monthly, quarterly, annual
    origin_url: str = ""


@router.post("/subscriptions/change-plan")
async def change_subscription_plan(
    data: ChangeSubscriptionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Upgrade or downgrade subscription plan"""
    sub = await db.user_subscriptions.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    if not sub or sub.get("status") != "active":
        raise HTTPException(status_code=400, detail="No active subscription to modify")

    settings = await get_subscription_settings()
    plans = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}
    new_plan = plans.get(data.plan_id)
    if not new_plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Calculate new amount
    role = current_user.get("role", "benefactor")
    if role == "beneficiary":
        amount = new_plan.get("ben_price", new_plan["price"])
    else:
        amount = new_plan["price"]

    # Apply discount
    override = await db.subscription_overrides.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    discount = override.get("custom_discount", 0) if override else 0
    if discount > 0:
        amount = amount * (1 - discount / 100)

    # Apply billing cycle discount and calculate full period amount
    cycle = data.billing_cycle
    if cycle == "quarterly":
        per_month = round(amount * 0.9, 2)
        amount = round(per_month * 3, 2)
    elif cycle == "annual":
        per_month = round(amount * 0.8, 2)
        amount = round(per_month * 12, 2)
    else:
        amount = round(amount, 2)

    # For free plans, update directly
    if amount == 0 or new_plan.get("price", 0) == 0:
        now = datetime.now(timezone.utc)
        await db.user_subscriptions.update_one(
            {"user_id": current_user["id"]},
            {
                "$set": {
                    "plan_id": data.plan_id,
                    "plan_name": new_plan["name"],
                    "billing_cycle": cycle,
                    "amount": 0.0,
                    "free_plan": True,
                    "updated_at": now.isoformat(),
                }
            },
        )
        return {"success": True, "message": f"Switched to {new_plan['name']} plan"}

    # For paid plans, create new checkout session
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")

    origin = validate_origin_url(data.origin_url) if data.origin_url else ""
    success_url = f"{origin}/settings?session_id={{CHECKOUT_SESSION_ID}}&change=true"
    cancel_url = f"{origin}/settings"
    backend_url = os.environ.get(
        "RAILWAY_PUBLIC_URL", os.environ.get("BACKEND_URL", "")
    )
    webhook_url = (
        f"{backend_url}/api/webhook/stripe"
        if backend_url
        else f"{origin}/api/webhook/stripe"
    )

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
            "plan_name": new_plan["name"],
            "billing_cycle": cycle,
            "change_plan": "true",
            "previous_plan": sub.get("plan_id", ""),
        },
    )
    session = await stripe_checkout.create_checkout_session(checkout_request)

    await db.payment_transactions.insert_one(
        {
            "session_id": session.session_id,
            "user_id": current_user["id"],
            "user_email": current_user["email"],
            "plan_id": data.plan_id,
            "plan_name": new_plan["name"],
            "billing_cycle": cycle,
            "amount": amount,
            "currency": "usd",
            "type": "plan_change",
            "previous_plan": sub.get("plan_id", ""),
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    return {"url": session.url, "session_id": session.session_id}


@router.post("/subscriptions/change-billing")
async def change_billing_cycle(
    data: ChangeBillingRequest,
    current_user: dict = Depends(get_current_user),
):
    """Change billing cycle — creates a Stripe checkout for the new cycle amount."""
    sub = await db.user_subscriptions.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    if not sub or sub.get("status") != "active":
        raise HTTPException(status_code=400, detail="No active subscription")

    cycle = data.billing_cycle
    current_cycle = sub.get("billing_cycle", "monthly")
    if cycle == current_cycle:
        return {"success": True, "message": f"Already on {cycle} billing"}

    # Get plan pricing
    settings = await get_subscription_settings()
    plans = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}
    plan = plans.get(sub.get("plan_id"))
    if not plan:
        raise HTTPException(status_code=400, detail="Current plan not found")

    # Calculate full-period amount for new cycle
    monthly_price = float(plan["price"])
    if cycle == "annual":
        amount = round(float(plan.get("annual_price", monthly_price * 0.8)) * 12, 2)
    elif cycle == "quarterly":
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
        # Free — just update cycle
        now = datetime.now(timezone.utc)
        if cycle == "annual":
            period_end = now + timedelta(days=365)
        elif cycle == "quarterly":
            period_end = now + timedelta(days=90)
        else:
            period_end = now + timedelta(days=30)
        await db.user_subscriptions.update_one(
            {"user_id": current_user["id"]},
            {
                "$set": {
                    "billing_cycle": cycle,
                    "current_period_end": period_end.isoformat(),
                    "updated_at": now.isoformat(),
                }
            },
        )
        return {
            "success": True,
            "message": f"Billing changed to {cycle}",
        }

    # Create Stripe checkout for the full period
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")

    origin = data.origin_url.rstrip("/") if data.origin_url else ""
    if origin:
        origin = validate_origin_url(origin)
    success_url = (
        f"{origin}/settings?session_id={{CHECKOUT_SESSION_ID}}&billing_change=true"
    )
    cancel_url = f"{origin}/settings"
    backend_url = os.environ.get(
        "RAILWAY_PUBLIC_URL", os.environ.get("BACKEND_URL", "")
    )
    webhook_url = (
        f"{backend_url}/api/webhook/stripe"
        if backend_url
        else f"{origin}/api/webhook/stripe"
    )

    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
    checkout_request = CheckoutSessionRequest(
        amount=amount,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": current_user["id"],
            "user_email": current_user["email"],
            "plan_id": sub.get("plan_id", ""),
            "plan_name": sub.get("plan_name", ""),
            "billing_cycle": cycle,
            "billing_change": "true",
        },
    )
    session = await stripe_checkout.create_checkout_session(checkout_request)

    await db.payment_transactions.insert_one(
        {
            "session_id": session.session_id,
            "user_id": current_user["id"],
            "user_email": current_user["email"],
            "plan_id": sub.get("plan_id", ""),
            "plan_name": sub.get("plan_name", ""),
            "billing_cycle": cycle,
            "amount": amount,
            "currency": "usd",
            "type": "billing_change",
            "previous_cycle": current_cycle,
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    return {"url": session.url, "session_id": session.session_id}


@router.post("/subscriptions/cancel")
async def cancel_subscription(current_user: dict = Depends(get_current_user)):
    """Cancel current subscription"""
    sub = await db.user_subscriptions.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    if not sub or sub.get("status") != "active":
        raise HTTPException(status_code=400, detail="No active subscription")

    now = datetime.now(timezone.utc)
    await db.user_subscriptions.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }
        },
    )
    return {
        "success": True,
        "message": "Subscription cancelled. Access continues until end of current period.",
    }


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
        raise HTTPException(
            status_code=400, detail=f"Invalid tier. Must be one of: {valid_tiers}"
        )

    # Check for existing pending verification
    existing = await db.tier_verifications.find_one(
        {"user_id": current_user["id"], "status": "pending"}, {"_id": 0}
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="You already have a pending verification request"
        )

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

    verifications = (
        await db.tier_verifications.find({}, {"_id": 0, "file_data": 0})
        .sort("submitted_at", -1)
        .to_list(200)
    )

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
        raise HTTPException(
            status_code=400, detail="Action must be 'approve' or 'deny'"
        )

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

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    total_users = await db.users.count_documents({})
    non_admin_users = await db.users.count_documents({"role": {"$ne": "admin"}})
    active_trials = await db.users.count_documents({"trial_ends_at": {"$gt": now_iso}})
    expired_trials = await db.users.count_documents(
        {
            "trial_ends_at": {"$lte": now_iso},
            "role": {"$ne": "admin"},
        }
    )
    active_subs = await db.user_subscriptions.count_documents({"status": "active"})
    cancelled_subs = await db.user_subscriptions.count_documents(
        {"status": "cancelled"}
    )
    pending_verifications = await db.tier_verifications.count_documents(
        {"status": "pending"}
    )
    free_overrides = await db.subscription_overrides.count_documents(
        {"free_access": True}
    )

    # --- MRR ---
    mrr = 0.0
    active_sub_docs = await db.user_subscriptions.find(
        {"status": "active"}, {"_id": 0}
    ).to_list(5000)
    plan_lookup = {p["id"]: p for p in DEFAULT_PLANS}
    tier_counts = {}
    for sub in active_sub_docs:
        plan_id = sub.get("plan_id", "")
        plan = plan_lookup.get(plan_id)
        if plan:
            monthly = get_price_for_cycle(plan, "monthly")
            mrr += monthly
        tier_counts[plan_id] = tier_counts.get(plan_id, 0) + 1

    # --- Trial conversion % ---
    users_who_left_trial = expired_trials + active_subs + cancelled_subs
    trial_conversion = (
        round((active_subs / users_who_left_trial) * 100, 1)
        if users_who_left_trial > 0
        else 0
    )

    # --- Churn rate ---
    total_ever_subscribed = active_subs + cancelled_subs
    churn_rate = (
        round((cancelled_subs / total_ever_subscribed) * 100, 1)
        if total_ever_subscribed > 0
        else 0
    )

    # --- Tier distribution ---
    tier_distribution = []
    for plan in DEFAULT_PLANS:
        count = tier_counts.get(plan["id"], 0)
        tier_distribution.append(
            {
                "tier": plan["name"],
                "id": plan["id"],
                "count": count,
                "price": plan["price"],
            }
        )

    # --- Signup trend (last 30 days) ---
    signup_trend = []
    for i in range(30):
        day = now - timedelta(days=29 - i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        day_end = day.replace(
            hour=23, minute=59, second=59, microsecond=999999
        ).isoformat()
        count = await db.users.count_documents(
            {"created_at": {"$gte": day_start, "$lte": day_end}}
        )
        signup_trend.append(
            {
                "date": day.strftime("%m/%d"),
                "signups": count,
            }
        )

    # --- Trial status breakdown ---
    trial_breakdown = {
        "active": active_trials,
        "expired_no_sub": max(0, expired_trials - active_subs - cancelled_subs),
        "converted": active_subs,
        "churned": cancelled_subs,
    }

    # --- Revenue by tier ---
    revenue_by_tier = []
    for plan in DEFAULT_PLANS:
        count = tier_counts.get(plan["id"], 0)
        revenue_by_tier.append(
            {
                "tier": plan["name"],
                "id": plan["id"],
                "revenue": round(count * plan["price"], 2),
                "subscribers": count,
            }
        )

    return {
        "total_users": total_users,
        "non_admin_users": non_admin_users,
        "active_trials": active_trials,
        "expired_trials": expired_trials,
        "active_subscriptions": active_subs,
        "cancelled_subscriptions": cancelled_subs,
        "pending_verifications": pending_verifications,
        "free_overrides": free_overrides,
        "mrr": round(mrr, 2),
        "arr": round(mrr * 12, 2),
        "trial_conversion_pct": trial_conversion,
        "churn_rate_pct": churn_rate,
        "tier_distribution": tier_distribution,
        "signup_trend": signup_trend,
        "trial_breakdown": trial_breakdown,
        "revenue_by_tier": revenue_by_tier,
    }


@router.post("/admin/trial-reminders/send")
async def trigger_trial_reminders(current_user: dict = Depends(get_current_user)):
    """Manually trigger trial reminder emails (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    from routes.trial_reminders import send_trial_reminders

    count = await send_trial_reminders()
    return {"success": True, "reminders_sent": count}


# ===================== BENEFICIARY PAYMENT LIFECYCLE =====================


class FamilyPlanRequest(BaseModel):
    benefactor_email: str


@router.post("/subscriptions/family-plan-request")
async def request_family_plan_add(
    data: FamilyPlanRequest,
    current_user: dict = Depends(get_current_user),
):
    """Beneficiary requests a benefactor to add them to their family plan."""
    benefactor = await db.users.find_one(
        {"email": data.benefactor_email, "role": "benefactor"}, {"_id": 0}
    )
    if not benefactor:
        raise HTTPException(
            status_code=404,
            detail="No benefactor account found with that email. Please check the address.",
        )

    # Prevent duplicate requests
    existing = await db.family_plan_requests.find_one(
        {
            "beneficiary_id": current_user["id"],
            "benefactor_id": benefactor["id"],
            "status": "pending",
        },
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=400, detail="Request already pending")

    import uuid

    request_doc = {
        "id": str(uuid.uuid4()),
        "beneficiary_id": current_user["id"],
        "beneficiary_name": current_user.get("name", ""),
        "beneficiary_email": current_user.get("email", ""),
        "benefactor_id": benefactor["id"],
        "benefactor_email": benefactor["email"],
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.family_plan_requests.insert_one(request_doc)

    # Send email notification to the benefactor
    try:
        from services.email import send_email

        await send_email(
            to=benefactor["email"],
            subject="Family Plan Request — CarryOn",
            html=f"""
            <p>Hi {benefactor.get('name', '').split()[0] if benefactor.get('name') else 'there'},</p>
            <p><strong>{current_user.get('name', current_user['email'])}</strong> has requested to join your CarryOn Family Plan.</p>
            <p>Log in to your CarryOn account and go to <strong>Settings → Family Plan</strong> to review and approve this request.</p>
            <p>— The CarryOn Team</p>
            """,
        )
    except Exception as e:
        logger.warning(f"Failed to send family plan request email: {e}")

    return {"success": True, "message": "Request sent to the benefactor"}


@router.get("/subscriptions/beneficiary/lifecycle-status")
async def get_beneficiary_lifecycle(current_user: dict = Depends(get_current_user)):
    """Check the beneficiary's lifecycle status — age events, grace periods, etc."""
    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    dob_str = user_doc.get("date_of_birth")
    age = None
    age_events = []

    if dob_str:
        try:
            dob = datetime.fromisoformat(dob_str.replace("Z", "+00:00"))
            if dob.tzinfo is None:
                dob = dob.replace(tzinfo=timezone.utc)
            age = (now - dob).days // 365

            # Check if turning 18 soon or just turned 18
            eighteenth = dob.replace(year=dob.year + 18)
            if eighteenth.tzinfo is None:
                eighteenth = eighteenth.replace(tzinfo=timezone.utc)
            days_to_18 = (eighteenth - now).days
            if -30 <= days_to_18 <= 90:
                age_events.append(
                    {
                        "event": "turning_18",
                        "age": 18,
                        "date": eighteenth.isoformat(),
                        "days_away": days_to_18,
                        "message": "You are approaching 18 — subscription will be required to maintain access."
                        if days_to_18 > 0
                        else "You have turned 18 — please subscribe to continue using CarryOn.",
                    }
                )

            # Check if aging out of New Adult tier at 26
            twentysixth = dob.replace(year=dob.year + 26)
            if twentysixth.tzinfo is None:
                twentysixth = twentysixth.replace(tzinfo=timezone.utc)
            days_to_26 = (twentysixth - now).days
            if -30 <= days_to_26 <= 90:
                age_events.append(
                    {
                        "event": "turning_26",
                        "age": 26,
                        "date": twentysixth.isoformat(),
                        "days_away": days_to_26,
                        "message": "You are aging out of the New Adult tier — your plan will transition to standard pricing."
                        if days_to_26 > 0
                        else "You have turned 26 — your plan has transitioned to standard pricing.",
                    }
                )
        except (ValueError, TypeError):
            pass

    # Check grace period (e.g., benefactor transition)
    grace = await db.beneficiary_grace_periods.find_one(
        {"beneficiary_id": current_user["id"]}, {"_id": 0}
    )
    grace_info = None
    if grace:
        grace_end = datetime.fromisoformat(grace["grace_ends_at"].replace("Z", "+00:00"))
        if grace_end.tzinfo is None:
            grace_end = grace_end.replace(tzinfo=timezone.utc)
        days_left = max(0, (grace_end - now).days)
        grace_info = {
            "reason": grace.get("reason", "benefactor_transition"),
            "grace_ends_at": grace["grace_ends_at"],
            "days_remaining": days_left,
            "expired": now >= grace_end,
        }

    # Check family plan membership
    family_plan = await db.family_plan_members.find_one(
        {"member_id": current_user["id"], "status": "active"}, {"_id": 0}
    )

    # Check pending family plan requests
    pending_requests = (
        await db.family_plan_requests.find(
            {"beneficiary_id": current_user["id"], "status": "pending"},
            {"_id": 0},
        ).to_list(10)
    )

    return {
        "age": age,
        "age_events": age_events,
        "grace_period": grace_info,
        "in_family_plan": family_plan is not None,
        "family_plan": family_plan,
        "pending_family_requests": len(pending_requests),
        "needs_subscription": not (
            family_plan
            or (grace_info and not grace_info["expired"])
            or (
                await db.user_subscriptions.find_one(
                    {"user_id": current_user["id"], "status": "active"}, {"_id": 0}
                )
            )
        ),
    }


@router.post("/admin/beneficiary/trigger-transition")
async def trigger_benefactor_transition(
    benefactor_id: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Admin triggers a benefactor transition — starts 30-day grace for their beneficiaries."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    benefactor = await db.users.find_one({"id": benefactor_id}, {"_id": 0})
    if not benefactor:
        raise HTTPException(status_code=404, detail="Benefactor not found")

    # Find all estates owned by this benefactor
    estates = await db.estates.find(
        {"owner_id": benefactor_id}, {"_id": 0}
    ).to_list(50)

    # Collect all beneficiary IDs
    beneficiary_ids = set()
    for estate in estates:
        for ben_id in estate.get("beneficiaries", []):
            beneficiary_ids.add(ben_id)

    import uuid

    now = datetime.now(timezone.utc)
    grace_end = now + timedelta(days=GRACE_PERIOD_DAYS)
    created = 0

    for ben_id in beneficiary_ids:
        # Check if beneficiary already has a subscription or grace period
        existing_sub = await db.user_subscriptions.find_one(
            {"user_id": ben_id, "status": "active"}, {"_id": 0}
        )
        if existing_sub:
            continue  # Already has a plan

        existing_grace = await db.beneficiary_grace_periods.find_one(
            {"beneficiary_id": ben_id}, {"_id": 0}
        )
        if existing_grace:
            continue  # Already has grace period

        # Check if part of a family plan
        family_member = await db.family_plan_members.find_one(
            {"member_id": ben_id, "status": "active"}, {"_id": 0}
        )
        if family_member:
            continue  # Covered by family plan

        await db.beneficiary_grace_periods.insert_one(
            {
                "id": str(uuid.uuid4()),
                "beneficiary_id": ben_id,
                "benefactor_id": benefactor_id,
                "reason": "benefactor_transition",
                "grace_starts_at": now.isoformat(),
                "grace_ends_at": grace_end.isoformat(),
                "created_at": now.isoformat(),
            }
        )
        created += 1

        # Notify beneficiary via email
        ben_user = await db.users.find_one({"id": ben_id}, {"_id": 0})
        if ben_user and ben_user.get("email"):
            try:
                from services.email import send_email

                await send_email(
                    to=ben_user["email"],
                    subject="Important: Your CarryOn Access — Grace Period",
                    html=f"""
                    <p>Dear {ben_user.get('name', '').split()[0] if ben_user.get('name') else 'there'},</p>
                    <p>We are reaching out during a difficult time. Your CarryOn access has been placed on a <strong>30-day grace period</strong>.</p>
                    <p>After this period ends on <strong>{grace_end.strftime('%B %d, %Y')}</strong>, you will need to subscribe to continue accessing your estate documents and messages.</p>
                    <p>Log in to your CarryOn account to choose a plan or join a family plan.</p>
                    <p>With care,<br/>The CarryOn Team</p>
                    """,
                )
            except Exception as e:
                logger.warning(f"Failed to send grace period email to {ben_id}: {e}")

    return {
        "success": True,
        "beneficiaries_notified": created,
        "message": f"Transition triggered for {len(beneficiary_ids)} beneficiaries ({created} grace periods created)",
    }


async def check_dob_subscription_events():
    """Background task: check all beneficiaries for DOB-based subscription events.
    Called periodically (e.g., daily) to auto-detect turning 18, turning 26, etc."""
    now = datetime.now(timezone.utc)
    users = await db.users.find(
        {"role": "beneficiary", "date_of_birth": {"$exists": True}},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "date_of_birth": 1},
    ).to_list(5000)

    events_triggered = 0
    for user_doc in users:
        try:
            dob = datetime.fromisoformat(
                user_doc["date_of_birth"].replace("Z", "+00:00")
            )
            if dob.tzinfo is None:
                dob = dob.replace(tzinfo=timezone.utc)
            age = (now - dob).days // 365

            # Turning 18 — needs subscription
            if age == 18:
                eighteenth = dob.replace(year=dob.year + 18)
                if eighteenth.tzinfo is None:
                    eighteenth = eighteenth.replace(tzinfo=timezone.utc)
                days_since = (now - eighteenth).days
                if 0 <= days_since <= 7:
                    # Check not already notified
                    already = await db.lifecycle_events.find_one(
                        {"user_id": user_doc["id"], "event": "turned_18"}
                    )
                    if not already:
                        await db.lifecycle_events.insert_one(
                            {
                                "user_id": user_doc["id"],
                                "event": "turned_18",
                                "triggered_at": now.isoformat(),
                            }
                        )
                        events_triggered += 1
                        try:
                            from services.email import send_email

                            await send_email(
                                to=user_doc["email"],
                                subject="Happy 18th! Time to set up your CarryOn plan",
                                html=f"""
                                <p>Happy Birthday, {user_doc.get('name', '').split()[0] if user_doc.get('name') else 'there'}!</p>
                                <p>Now that you're 18, you can manage your own CarryOn account. Choose a plan to keep your estate documents safe.</p>
                                <p>Log in to get started.</p>
                                <p>— The CarryOn Team</p>
                                """,
                            )
                        except Exception:
                            pass

            # Turning 26 — ages out of New Adult tier
            if age == 26:
                twentysixth = dob.replace(year=dob.year + 26)
                if twentysixth.tzinfo is None:
                    twentysixth = twentysixth.replace(tzinfo=timezone.utc)
                days_since = (now - twentysixth).days
                if 0 <= days_since <= 7:
                    already = await db.lifecycle_events.find_one(
                        {"user_id": user_doc["id"], "event": "turned_26"}
                    )
                    if not already:
                        # Auto-migrate from new_adult to standard pricing
                        sub = await db.user_subscriptions.find_one(
                            {
                                "user_id": user_doc["id"],
                                "plan_id": "new_adult",
                                "status": "active",
                            }
                        )
                        if sub:
                            await db.user_subscriptions.update_one(
                                {"user_id": user_doc["id"]},
                                {
                                    "$set": {
                                        "plan_id": "ben_standard",
                                        "plan_name": "Standard",
                                        "updated_at": now.isoformat(),
                                        "migration_reason": "aged_out_new_adult",
                                    }
                                },
                            )

                        await db.lifecycle_events.insert_one(
                            {
                                "user_id": user_doc["id"],
                                "event": "turned_26",
                                "triggered_at": now.isoformat(),
                            }
                        )
                        events_triggered += 1
                        try:
                            from services.email import send_email

                            await send_email(
                                to=user_doc["email"],
                                subject="Your CarryOn plan has been updated",
                                html=f"""
                                <p>Hi {user_doc.get('name', '').split()[0] if user_doc.get('name') else 'there'},</p>
                                <p>As you've turned 26, your New Adult tier has transitioned to Standard pricing. No action needed — your access continues uninterrupted.</p>
                                <p>— The CarryOn Team</p>
                                """,
                            )
                        except Exception:
                            pass

        except (ValueError, TypeError, KeyError):
            continue

    return events_triggered
