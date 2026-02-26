"""CarryOn™ Backend — Stripe Subscriptions"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status, Response, Form
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from config import db, logger
from utils import get_current_user
import uuid
import os
import asyncio
import base64
import json as json_module
import random

router = APIRouter()

import stripe
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
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
        user_doc = await db.users.find_one({"id": user["id"]})
        stripe_customer_id = user_doc.get("stripe_customer_id") if user_doc else None
        
        if not stripe_customer_id:
            customer = stripe.Customer.create(
                email=user.get("email"),
                name=user.get("name", user.get("email")),
                metadata={"carryon_user_id": user["id"]}
            )
            stripe_customer_id = customer.id
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"stripe_customer_id": stripe_customer_id}}
            )
        
        # Create SetupIntent for saving payment method
        setup_intent = stripe.SetupIntent.create(
            customer=stripe_customer_id,
            payment_method_types=["card"],
            metadata={"carryon_user_id": user["id"]}
        )
        
        return SetupIntentResponse(
            client_secret=setup_intent.client_secret,
            setup_intent_id=setup_intent.id
        )
    except Exception as e:
        logger.error(f"Error creating setup intent: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/dts/tasks/{task_id}/payment-method")
async def save_dts_payment_method(
    task_id: str,
    request: SavePaymentMethodRequest,
    user: dict = Depends(get_current_user)
):
    """Save a payment method to a DTS task for charging upon transition"""
    try:
        # Verify task belongs to user's estate
        task = await db.dts_tasks.find_one({"id": task_id})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        estate = await db.estates.find_one({"id": task["estate_id"], "user_id": user["id"]})
        if not estate:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # Update task with payment method info
        payment_info = {
            "payment_method_id": request.payment_method_id,
            "last4": request.card_last4,
            "exp": f"{request.card_exp_month:02d}/{str(request.card_exp_year)[-2:]}",
            "name": request.card_holder_name or user.get("name", ""),
            "saved_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.dts_tasks.update_one(
            {"id": task_id},
            {"$set": {
                "payment_method": payment_info,
                "status": "ready"
            }}
        )
        
        return {"success": True, "message": "Payment method saved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving payment method: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===================== STRIPE SUBSCRIPTIONS =====================


DEFAULT_PLANS = [
    {"id": "premium", "name": "Premium", "price": 8.99, "launch_price": 8.99, "final_price": 9.99, "ben_price": 2.99, "adjustable": True},
    {"id": "standard", "name": "Standard", "price": 7.99, "launch_price": 7.99, "final_price": 8.99, "ben_price": 3.99, "adjustable": True},
    {"id": "base", "name": "Base", "price": 6.99, "launch_price": 6.99, "final_price": 7.99, "ben_price": 4.99, "adjustable": True},
    {"id": "new_adult", "name": "New Adult", "price": 3.99, "launch_price": 3.99, "final_price": 3.99, "ben_price": 1.99, "adjustable": False, "note": "Ages 18-25"},
    {"id": "military", "name": "Military / First Responder", "price": 5.99, "launch_price": 5.99, "final_price": 5.99, "ben_price": 1.99, "adjustable": False},
    {"id": "hospice", "name": "Hospice", "price": 0.00, "launch_price": 0.00, "final_price": 0.00, "ben_price": 4.99, "adjustable": False, "note": "Requires hospice verification"},
]

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

async def get_subscription_settings():
    """Get platform-wide subscription settings"""
    settings = await db.subscription_settings.find_one({"_id": "global"}, {"_id": 0})
    if not settings:
        settings = {"beta_mode": True, "plans": DEFAULT_PLANS}
        await db.subscription_settings.update_one(
            {"_id": "global"}, {"$set": settings}, upsert=True
        )
    return settings

@router.get("/subscriptions/plans")
async def get_subscription_plans():
    """Get available subscription plans (public)"""
    settings = await get_subscription_settings()
    return {"plans": settings.get("plans", DEFAULT_PLANS), "beta_mode": settings.get("beta_mode", True)}

@router.get("/subscriptions/status")
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    """Get current user's subscription status"""
    sub = await db.user_subscriptions.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    settings = await get_subscription_settings()
    
    # Check admin overrides
    override = await db.subscription_overrides.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    
    is_free = settings.get("beta_mode", True) or (override and override.get("free_access", False))
    
    return {
        "subscription": sub,
        "beta_mode": settings.get("beta_mode", True),
        "free_access": is_free,
        "custom_discount": override.get("custom_discount", 0) if override else 0,
        "has_active_subscription": is_free or (sub and sub.get("status") == "active"),
    }

@router.post("/subscriptions/checkout")
async def create_subscription_checkout(
    data: SubscriptionCheckoutRequest,
    request: Any = None,
    current_user: dict = Depends(get_current_user)
):
    """Create a Stripe checkout session for a subscription"""
    settings = await get_subscription_settings()
    
    if settings.get("beta_mode", True):
        raise HTTPException(status_code=400, detail="Subscriptions are free during beta period")
    
    plans = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}
    plan = plans.get(data.plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {data.plan_id}")
    
    # Calculate price based on billing cycle
    monthly_price = float(plan["price"])
    if data.billing_cycle == "annual":
        amount = round(monthly_price * 10.0, 2)  # 10 months for annual
    elif data.billing_cycle == "quarterly":
        amount = round(monthly_price * 2.7, 2)  # 2.7 months for quarterly
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
            {"$set": {
                "user_id": current_user["id"],
                "plan_id": data.plan_id,
                "plan_name": plan["name"],
                "status": "active",
                "billing_cycle": data.billing_cycle,
                "amount": 0.0,
                "free_plan": True,
                "activated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True
        )
        return {"free": True, "message": f"{plan['name']} plan activated (free)"}
    
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")
    
    origin = data.origin_url.rstrip('/')
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
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Record transaction
    await db.payment_transactions.insert_one({
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
    })
    
    return {"url": session.url, "session_id": session.session_id}

@router.get("/subscriptions/checkout-status/{session_id}")
async def get_checkout_status(session_id: str, current_user: dict = Depends(get_current_user)):
    """Poll checkout session status"""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")
    
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
    checkout_status = await stripe_checkout.get_checkout_status(session_id)
    
    # Update transaction
    txn = await db.payment_transactions.find_one({"session_id": session_id})
    if txn and txn.get("payment_status") != "paid":
        new_status = checkout_status.payment_status
        update_data = {"payment_status": new_status, "status": checkout_status.status, "updated_at": datetime.now(timezone.utc).isoformat()}
        await db.payment_transactions.update_one({"session_id": session_id}, {"$set": update_data})
        
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
                {"$set": {
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
                }},
                upsert=True
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
    from starlette.requests import Request
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return {"received": True}
    
    try:
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
        event = await stripe_checkout.handle_webhook(body, sig)
        
        if event.payment_status == "paid" and event.session_id:
            txn = await db.payment_transactions.find_one({"session_id": event.session_id})
            if txn and txn.get("payment_status") != "paid":
                await db.payment_transactions.update_one(
                    {"session_id": event.session_id},
                    {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
        
        return {"received": True}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"received": True}

# --- Admin Subscription Management ---

@router.get("/admin/subscription-settings")
async def get_admin_subscription_settings(current_user: dict = Depends(get_current_user)):
    """Get platform-wide subscription settings (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    settings = await get_subscription_settings()
    
    # Get subscription stats
    total_subs = await db.user_subscriptions.count_documents({"status": "active"})
    free_overrides = await db.subscription_overrides.count_documents({"free_access": True})
    discount_overrides = await db.subscription_overrides.count_documents({"custom_discount": {"$gt": 0}})
    
    return {
        **settings,
        "stats": {
            "active_subscriptions": total_subs,
            "free_access_users": free_overrides,
            "discounted_users": discount_overrides,
        }
    }

@router.put("/admin/subscription-settings")
async def update_admin_subscription_settings(
    data: AdminSubscriptionSettings,
    current_user: dict = Depends(get_current_user)
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
        override = await db.subscription_overrides.find_one({"user_id": user["id"]}, {"_id": 0})
        user["subscription"] = sub
        user["override"] = override
    
    return users

@router.put("/admin/user-subscription/{user_id}")
async def update_admin_user_subscription(
    user_id: str,
    data: AdminUserSubscriptionOverride,
    current_user: dict = Depends(get_current_user)
):
    """Set per-user subscription overrides (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    user = await db.users.find_one({"id": user_id})
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
    
    return {"success": True, "message": f"Subscription override updated for user {user_id}"}

@router.put("/admin/plans/{plan_id}/price")
async def update_plan_price(
    plan_id: str,
    price: float = Form(...),
    current_user: dict = Depends(get_current_user)
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
                raise HTTPException(status_code=400, detail=f"{plan['name']} pricing is fixed")
            plan["price"] = price
            found = True
            break
    
    if not found:
        raise HTTPException(status_code=404, detail=f"Plan not found: {plan_id}")
    
    await db.subscription_settings.update_one(
        {"_id": "global"}, {"$set": {"plans": plans, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"success": True, "message": f"Price updated to ${price:.2f}"}


