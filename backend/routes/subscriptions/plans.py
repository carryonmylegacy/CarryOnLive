"""CarryOn™ Backend — Stripe Subscriptions"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db, logger
from utils import get_current_user

# Apple bundle ID — used by webhook to verify notifications are for our app
APPLE_BUNDLE_ID = "us.carryon.app"

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
            await db.users.update_one({"id": user["id"]}, {"$set": {"stripe_customer_id": stripe_customer_id}})

        # Create SetupIntent for saving payment method
        setup_intent = stripe.SetupIntent.create(
            customer=stripe_customer_id,
            payment_method_types=["card"],
            metadata={"carryon_user_id": user["id"]},
        )

        return SetupIntentResponse(client_secret=setup_intent.client_secret, setup_intent_id=setup_intent.id)
    except Exception as e:
        logger.error(f"Error creating setup intent: {e}")
        raise HTTPException(status_code=500, detail="Payment service error. Please try again.")


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

        estate = await db.estates.find_one({"id": task["estate_id"], "user_id": user["id"]}, {"_id": 0})
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
        raise HTTPException(status_code=500, detail="Payment service error. Please try again.")


# ===================== STRIPE SUBSCRIPTIONS =====================


DEFAULT_PLANS = [
    {
        "id": "premium",
        "name": "Premium",
        "price": 9.99,
        "quarterly_price": 8.99,
        "annual_price": 7.99,
        "ben_price": 2.99,
        "paired_price": 4.99,
        "adjustable": True,
        "features": [
            "Everything in Standard",
            "Unlimited beneficiaries",
            "Priority human support (CST)",
        ],
    },
    {
        "id": "standard",
        "name": "Standard",
        "price": 8.99,
        "quarterly_price": 8.09,
        "annual_price": 7.19,
        "ben_price": 3.99,
        "paired_price": 5.99,
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
        "paired_price": 6.99,
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
        "paired_price": 3.99,
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
        "paired_price": 3.99,
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
        "paired_price": 6.99,
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
    {
        "id": "veteran",
        "name": "Veteran",
        "price": 5.99,
        "quarterly_price": 5.39,
        "annual_price": 4.79,
        "ben_price": 1.99,
        "paired_price": 3.99,
        "adjustable": False,
        "note": "Requires verification",
        "requires_verification": True,
        "verification_docs": ["DD214", "Veterans Administration Benefits Letter"],
        "features": [
            "Full platform access",
            "Priority support",
            "Honoring those who served",
        ],
    },
    {
        "id": "enterprise",
        "name": "Enterprise / B2B Partner",
        "price": 0.00,
        "quarterly_price": 0.00,
        "annual_price": 0.00,
        "ben_price": 0.00,
        "paired_price": 0.00,
        "adjustable": False,
        "note": "Requires partner code",
        "requires_verification": True,
        "verification_docs": ["Partner access code"],
        "features": [
            "Full platform access",
            "Provided by your employer or partner",
            "Free or discounted based on agreement",
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
        "allows_billing_toggle": True,
        "features": [
            "Everything in Standard",
            "Priority human support",
        ],
    },
    {
        "id": "ben_standard",
        "name": "Standard",
        "price": 3.99,
        "quarterly_price": 3.59,
        "annual_price": 3.19,
        "allows_billing_toggle": True,
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
        "allows_billing_toggle": True,
        "features": [
            "Immediate Action Checklist",
            "Basic vault access",
            "Milestone Messages",
        ],
    },
    {
        "id": "ben_new_adult",
        "name": "New Adult",
        "price": 1.99,
        "quarterly_price": 1.99,
        "annual_price": 1.99,
        "allows_billing_toggle": False,
        "note": "Ages 18-25",
        "features": [
            "Full platform access",
            "Parents, grandparents, siblings, spouse, children",
        ],
    },
    {
        "id": "ben_military",
        "name": "Military / First Responder",
        "price": 1.99,
        "quarterly_price": 1.99,
        "annual_price": 1.99,
        "allows_billing_toggle": False,
        "note": "",
        "features": [
            "Full platform access",
            "Priority support",
        ],
    },
    {
        "id": "ben_hospice",
        "name": "Hospice Transition",
        "price": 4.99,
        "quarterly_price": 4.49,
        "annual_price": 3.99,
        "allows_billing_toggle": True,
        "note": "After benefactor's transition · 30-day grace period",
        "features": [
            "All Base features",
            "Applies post-transition when no paid tier exists",
        ],
    },
    {
        "id": "ben_veteran",
        "name": "Veteran",
        "price": 1.99,
        "quarterly_price": 1.99,
        "annual_price": 1.99,
        "allows_billing_toggle": False,
        "note": "",
        "features": [
            "Full platform access",
            "Priority support",
        ],
    },
    {
        "id": "ben_enterprise",
        "name": "Enterprise / B2B",
        "price": 0.00,
        "quarterly_price": 0.00,
        "annual_price": 0.00,
        "allows_billing_toggle": False,
        "note": "Covered by partner agreement",
        "features": [
            "Full platform access",
            "Covered by employer or partner",
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
        await db.subscription_settings.update_one({"_id": "global"}, {"$set": settings}, upsert=True)
    else:
        # Ensure any new plans from code are added to stored settings
        # and merge new fields from DEFAULT_PLANS into existing stored plans
        # Also sync 'features' field to ensure code-defined features take precedence
        stored_ids = {p["id"] for p in settings.get("plans", [])}
        needs_update = False
        for plan in DEFAULT_PLANS:
            if plan["id"] not in stored_ids:
                settings.setdefault("plans", []).append(plan)
                needs_update = True
            else:
                # Merge new fields from code into stored plan
                for stored_plan in settings.get("plans", []):
                    if stored_plan["id"] == plan["id"]:
                        for key in plan:
                            if key not in stored_plan:
                                stored_plan[key] = plan[key]
                                needs_update = True
                        # Always sync features from code to ensure they're up-to-date
                        if stored_plan.get("features") != plan.get("features"):
                            stored_plan["features"] = plan["features"]
                            needs_update = True
                        break
        if needs_update:
            await db.subscription_settings.update_one({"_id": "global"}, {"$set": {"plans": settings["plans"]}})
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
