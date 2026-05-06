"""Checkout, plan changes, webhooks, and admin subscription settings."""

import asyncio
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import stripe
from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest,
    StripeCheckout,
)
from fastapi import Depends, Form, HTTPException, Request
from pydantic import BaseModel

from config import db, logger
from utils import get_current_user
from routes.subscriptions.apple_webhook import APPLE_TO_PLAN
from routes.subscriptions.plans import (
    router,
    DEFAULT_PLANS,
    BENEFICIARY_PLANS,
    get_subscription_settings,
    calculate_trial_status,
    validate_origin_url,
    SubscriptionCheckoutRequest,
    AdminSubscriptionSettings,
    AdminUserSubscriptionOverride,
)

stripe.api_key = os.environ.get("STRIPE_API_KEY")


@router.get("/subscriptions/plans")
async def get_subscription_plans():
    """Get available subscription plans (public) with dynamic feature gates."""
    settings = await get_subscription_settings()

    # Include feature gate data so the paywall shows real-time enabled features per tier
    from routes.feature_gates import get_feature_gates, PLATFORM_FEATURES, TIER_IDS

    gates = await get_feature_gates()
    # Build per-tier feature list — ALL features in consistent order, with enabled flag
    tier_features = {}
    for tid in TIER_IDS:
        feature_list = []
        for f in PLATFORM_FEATURES:
            tier_gates = gates.get(f["key"], {})
            feature_list.append(
                {
                    "label": f["label"],
                    "enabled": tier_gates.get(tid, True),
                }
            )
        tier_features[tid] = feature_list

    return {
        "plans": settings.get("plans", DEFAULT_PLANS),
        "beneficiary_plans": settings.get("beneficiary_plans", BENEFICIARY_PLANS),
        "beta_mode": settings.get("beta_mode", True),
        "family_plan_enabled": settings.get("family_plan_enabled", True),
        "family_benefactor_discount_percent": settings.get("family_benefactor_discount_percent", 0),
        "family_beneficiary_discount_percent": settings.get("family_beneficiary_discount_percent", 0),
        "tier_features": tier_features,
    }


@router.get("/subscriptions/status")
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    """Get current user's subscription status including trial info"""
    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    sub = await db.user_subscriptions.find_one({"user_id": current_user["id"]}, {"_id": 0})
    settings = await get_subscription_settings()

    # Check admin overrides
    override = await db.subscription_overrides.find_one({"user_id": current_user["id"]}, {"_id": 0})

    # Calculate trial status
    trial = (
        calculate_trial_status(user_doc)
        if user_doc
        else {"trial_active": False, "trial_expired": False, "days_remaining": 0}
    )

    # Check verification status
    verification = await db.tier_verifications.find_one({"user_id": current_user["id"]}, {"_id": 0})

    is_beta = settings.get("beta_mode", True)
    is_beta_tester = (user_doc or {}).get("is_beta_tester", False)
    has_free_access = override and override.get("free_access", False)
    has_active_sub = sub and sub.get("status") in ("active", "past_due")
    is_grace = sub and sub.get("status") == "past_due"
    is_dormant = sub and sub.get("status") == "dormant"

    # User has access if: beta mode OR per-user beta OR free override OR active subscription OR trial active
    has_access = is_beta or is_beta_tester or has_free_access or has_active_sub or trial.get("trial_active", False)

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

    # Include eligible_tier and special_status from user profile
    if user_doc and user_doc.get("eligible_tier"):
        if user_doc["eligible_tier"] not in eligible_tiers:
            eligible_tiers.append(user_doc["eligible_tier"])
    special_status = (user_doc or {}).get("special_status", [])

    # Determine beneficiary locked tier from benefactor's majority plan
    beneficiary_locked_tier = None
    estate_transitioned = False
    if current_user.get("role") == "beneficiary":
        benefactor_id = None
        ben_estate = None

        # Method 1: Check `beneficiaries` collection (user_id or email match)
        ben_link = await db.beneficiaries.find_one({"user_id": current_user["id"]}, {"_id": 0, "estate_id": 1})
        if not ben_link:
            ben_link = await db.beneficiaries.find_one({"email": current_user.get("email")}, {"_id": 0, "estate_id": 1})
        if ben_link and ben_link.get("estate_id"):
            ben_estate = await db.estates.find_one(
                {"id": ben_link["estate_id"]}, {"_id": 0, "owner_id": 1, "status": 1}
            )
            benefactor_id = ben_estate.get("owner_id") if ben_estate else None

        # Method 2: Check estate.beneficiaries array (fallback)
        if not benefactor_id:
            ben_estate = await db.estates.find_one(
                {"beneficiaries": current_user["id"]},
                {"_id": 0, "owner_id": 1, "status": 1},
            )
            if ben_estate:
                benefactor_id = ben_estate.get("owner_id")

        # Check if estate has transitioned
        if ben_estate:
            estate_transitioned = ben_estate.get("status") == "transitioned"

        if benefactor_id:
            ben_sub = await db.user_subscriptions.find_one({"user_id": benefactor_id}, {"_id": 0})
            benefactor_user = await db.users.find_one({"id": benefactor_id}, {"_id": 0, "verified_tier": 1})
            plan_map = {
                "premium": "ben_premium",
                "standard": "ben_standard",
                "base": "ben_base",
                "military": "ben_military",
                "hospice": "ben_hospice",
                "veteran": "ben_veteran",
                "enterprise": "ben_enterprise",
            }
            if ben_sub and ben_sub.get("plan_id"):
                beneficiary_locked_tier = plan_map.get(ben_sub["plan_id"], "ben_base")
            elif benefactor_user and benefactor_user.get("verified_tier"):
                beneficiary_locked_tier = plan_map.get(benefactor_user["verified_tier"], "ben_base")

    # Check if beneficiary is a minor (under 18)
    is_minor = False
    if current_user.get("role") == "beneficiary" and user_doc and user_doc.get("date_of_birth"):
        try:
            dob = datetime.fromisoformat(user_doc["date_of_birth"])
            age = (datetime.now(timezone.utc) - dob.replace(tzinfo=timezone.utc)).days // 365
            if age < 18:
                is_minor = True
        except (ValueError, TypeError):
            pass

    # Determine paired pricing if estate has transitioned
    paired_price = None
    if estate_transitioned and benefactor_id:
        settings = await get_subscription_settings()
        benefactor_plan_id = None
        ben_sub_doc = await db.user_subscriptions.find_one({"user_id": benefactor_id}, {"_id": 0, "plan_id": 1})
        if ben_sub_doc:
            benefactor_plan_id = ben_sub_doc.get("plan_id")
        if benefactor_plan_id:
            for p in settings.get("plans", DEFAULT_PLANS):
                if p["id"] == benefactor_plan_id:
                    paired_price = p.get("paired_price")
                    break

    return {
        "subscription": sub,
        "trial": trial,
        "beta_mode": is_beta,
        "is_beta_tester": is_beta_tester,
        "beta_accepted": bool((user_doc or {}).get("beta_accepted_at")),
        "free_access": is_beta or is_beta_tester or has_free_access,
        "custom_discount": override.get("custom_discount", 0) if override else 0,
        "has_active_subscription": has_access,
        "needs_subscription": not has_access,
        "is_grace_period": bool(is_grace),
        "grace_period_end": sub.get("grace_period_end") if is_grace else None,
        "is_dormant": bool(is_dormant),
        "dormant_since": sub.get("dormant_since") if is_dormant else None,
        "verification": {
            "status": verification.get("status", "none") if verification else "none",
            "tier_requested": verification.get("tier_requested") if verification else None,
        }
        if verification
        else None,
        "eligible_tiers": eligible_tiers,
        "special_status": special_status,
        "is_minor": is_minor,
        "user_role": current_user.get("role", "benefactor"),
        "beneficiary_locked_tier": beneficiary_locked_tier,
        "estate_transitioned": estate_transitioned,
        "paired_price": paired_price,
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
        # During beta, still record the user's chosen plan preference
        plans_lookup = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}
        plan = plans_lookup.get(data.plan_id)
        if plan:
            now = datetime.now(timezone.utc)
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
                        "beta_plan": True,
                        "activated_at": now.isoformat(),
                    }
                },
                upsert=True,
            )
        return {
            "free": True,
            "message": f"All features are free during beta! Your {plan['name'] if plan else ''} plan preference has been saved.",
        }

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
    override = await db.subscription_overrides.find_one({"user_id": current_user["id"]}, {"_id": 0})
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
    success_url = f"{origin}/subscription?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/subscription"

    # Use backend's own URL for webhook, not frontend origin
    backend_url = os.environ.get("RAILWAY_PUBLIC_URL", os.environ.get("BACKEND_URL", ""))
    webhook_url = f"{backend_url}/api/webhook/stripe" if backend_url else f"{origin}/api/webhook/stripe"

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

    # Hard 15s budget on the Stripe round-trip. The previous code path
    # could hang indefinitely on a wedged HTTPS connection (no inner
    # timeout), spinning the user's Subscribe button forever — a hard
    # credibility hit in B2B pitches. If Stripe doesn't respond within
    # the budget we surface a clean retry message and clear the spinner
    # client-side instead of holding the request open.
    try:
        session = await asyncio.wait_for(
            stripe_checkout.create_checkout_session(checkout_request),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        logger.error(
            "stripe checkout timeout: user=%s plan=%s billing=%s amount=%s",
            current_user.get("id"),
            data.plan_id,
            data.billing_cycle,
            amount,
        )
        raise HTTPException(
            status_code=504,
            detail="Stripe is taking longer than usual to respond. Please try again in a moment.",
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("stripe checkout error: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Could not reach Stripe right now. Please try again in a moment.",
        )

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
async def get_checkout_status(session_id: str, current_user: dict = Depends(get_current_user)):
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

            # Cancel any active grace periods — user re-subscribed
            from services.grace_period import cancel_grace_period

            user_estates = await db.estates.find({"owner_id": txn["user_id"]}, {"_id": 0, "id": 1}).to_list(50)
            for est in user_estates:
                await cancel_grace_period(est["id"], txn["user_id"], "re-subscribed")

    return {
        "status": checkout_status.status,
        "payment_status": checkout_status.payment_status,
        "amount_total": checkout_status.amount_total,
        "currency": checkout_status.currency,
    }


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks — payment success, failure, and subscription events.

    Security: We verify the Stripe-Signature header using STRIPE_WEBHOOK_SECRET
    BEFORE processing the event. If STRIPE_WEBHOOK_SECRET is unset, we log a
    critical warning but still accept the webhook (backward compatibility with
    environments that haven't set the secret yet). In production, setting the
    secret is MANDATORY — without it an attacker could forge payment_succeeded
    events.
    """
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")

    api_key = os.environ.get("STRIPE_API_KEY")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if not api_key:
        return {"received": True}

    # ── Belt-and-suspenders signature verification ──
    # Uses the official stripe-python library if webhook_secret is set.
    if webhook_secret:
        try:
            import stripe as stripe_sdk

            # Raises stripe.error.SignatureVerificationError on bad sig
            stripe_sdk.Webhook.construct_event(payload=body, sig_header=sig, secret=webhook_secret)
        except Exception as e:
            logger.warning(f"Stripe webhook signature verification FAILED: {type(e).__name__}")
            # Return 400 so Stripe retries (real events) AND to refuse forgeries.
            raise HTTPException(status_code=400, detail="Invalid signature")
    else:
        # SECURITY: If webhook secret is not configured, reject ALL incoming webhooks.
        # Processing unverified webhooks allows anyone to forge payment events.
        # Fix: go to Stripe Dashboard → Developers → Webhooks → your endpoint → Signing Secret
        # and add STRIPE_WEBHOOK_SECRET to your Railway environment variables.
        logger.critical(
            "STRIPE_WEBHOOK_SECRET is NOT set — rejecting webhook to prevent forged events. "
            "Add STRIPE_WEBHOOK_SECRET to your Railway environment variables immediately."
        )
        raise HTTPException(
            status_code=400,
            detail="Webhook signature verification is not configured. Contact support.",
        )

    try:
        # Try structured webhook handling first
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
        event = await stripe_checkout.handle_webhook(body, sig)

        if event.payment_status == "paid" and event.session_id:
            txn = await db.payment_transactions.find_one({"session_id": event.session_id}, {"_id": 0})
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
                # Also activate the subscription (critical fallback if checkout-status wasn't called)
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
                            "plan_id": txn.get("plan_id", ""),
                            "plan_name": txn.get("plan_name", ""),
                            "status": "active",
                            "billing_cycle": cycle,
                            "amount": txn.get("amount", 0),
                            "stripe_session_id": event.session_id,
                            "current_period_start": now.isoformat(),
                            "current_period_end": period_end.isoformat(),
                            "activated_at": now.isoformat(),
                            "payment_provider": "stripe",
                        }
                    },
                    upsert=True,
                )

                # Reactivate if was in grace/dormant
                from services.billing_lifecycle import handle_payment_succeeded

                await handle_payment_succeeded(txn["user_id"])

                # Notification
                from services.notifications import notify

                asyncio.create_task(
                    notify.founder(
                        "Subscription Payment Received",
                        f"Payment confirmed for {txn.get('plan_name', 'plan')} ({cycle})",
                        url="/admin/subscriptions",
                    )
                )

        return {"received": True}
    except Exception:
        pass

    # Fallback: parse raw Stripe event for invoice/subscription events
    try:
        import json

        raw_event = json.loads(body)
        event_type = raw_event.get("type", "")
        data_obj = raw_event.get("data", {}).get("object", {})

        if event_type == "invoice.payment_failed":
            # Payment charge failed — start grace period
            customer_email = data_obj.get("customer_email", "")
            if customer_email:
                user = await db.users.find_one({"email": customer_email}, {"_id": 0, "id": 1})
                if user:
                    from services.billing_lifecycle import handle_payment_failed

                    await handle_payment_failed(user["id"])
                    logger.info(f"Payment failed webhook processed for {customer_email}")

        elif event_type == "invoice.payment_succeeded":
            # Payment succeeded — reactivate if in grace/dormant
            customer_email = data_obj.get("customer_email", "")
            if customer_email:
                user = await db.users.find_one({"email": customer_email}, {"_id": 0, "id": 1})
                if user:
                    from services.billing_lifecycle import handle_payment_succeeded

                    await handle_payment_succeeded(user["id"])
                    logger.info(f"Payment succeeded webhook processed for {customer_email}")

        elif event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
            customer_email = data_obj.get("customer_email", "") or ""
            sub_status = data_obj.get("status", "")
            if customer_email and sub_status in ("unpaid", "canceled", "incomplete_expired"):
                user = await db.users.find_one({"email": customer_email}, {"_id": 0, "id": 1})
                if user:
                    from services.billing_lifecycle import handle_payment_failed

                    await handle_payment_failed(user["id"])

                    # Create grace period for each estate owned by this user
                    from services.grace_period import create_grace_period

                    estates = await db.estates.find(
                        {"owner_id": user["id"]},
                        {"_id": 0, "id": 1, "is_transitioned": 1},
                    ).to_list(50)
                    for est in estates:
                        await create_grace_period(
                            estate_id=est["id"],
                            user_id=user["id"],
                            trigger="subscription_expired",
                            is_transitioned=est.get("is_transitioned", False),
                        )

    except Exception as e:
        logger.error(f"Webhook fallback error: {e}")

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
    """Upgrade or downgrade subscription plan with proration.

    - Upgrade: charges only the price difference for the remaining period
    - Downgrade: issues a credit/refund for the unused value difference
    - Same tier, different cycle: treated as a billing change
    """
    sub = await db.user_subscriptions.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not sub or sub.get("status") != "active":
        raise HTTPException(status_code=400, detail="No active subscription to modify")

    settings = await get_subscription_settings()

    # During beta, just switch the plan directly
    if settings.get("beta_mode", True):
        all_plans = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}
        new_plan = all_plans.get(data.plan_id)
        if not new_plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        now = datetime.now(timezone.utc)
        await db.user_subscriptions.update_one(
            {"user_id": current_user["id"]},
            {
                "$set": {
                    "plan_id": data.plan_id,
                    "plan_name": new_plan["name"],
                    "billing_cycle": data.billing_cycle,
                    "beta_plan": True,
                    "updated_at": now.isoformat(),
                }
            },
        )
        return {
            "success": True,
            "message": f"Switched to {new_plan['name']} ({data.billing_cycle}). Free during beta!",
        }

    plans = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}
    new_plan = plans.get(data.plan_id)
    if not new_plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # --- Calculate current subscription's remaining value ---
    old_cycle = sub.get("billing_cycle", "monthly")
    old_total_paid = float(sub.get("amount", 0))

    # Calculate days remaining in current period
    now = datetime.now(timezone.utc)
    period_end_str = sub.get("current_period_end")
    if period_end_str:
        period_end = datetime.fromisoformat(period_end_str.replace("Z", "+00:00"))
        if period_end.tzinfo is None:
            period_end = period_end.replace(tzinfo=timezone.utc)
        period_start_str = sub.get("current_period_start")
        period_start = (
            datetime.fromisoformat(period_start_str.replace("Z", "+00:00"))
            if period_start_str
            else period_end - timedelta(days={"annual": 365, "quarterly": 90}.get(old_cycle, 30))
        )
        if period_start.tzinfo is None:
            period_start = period_start.replace(tzinfo=timezone.utc)
        total_days = max(1, (period_end - period_start).days)
        days_remaining = max(0, (period_end - now).days)
        unused_fraction = days_remaining / total_days
    else:
        unused_fraction = 0.0

    remaining_credit = round(old_total_paid * unused_fraction, 2)

    # --- Calculate new plan cost ---
    role = current_user.get("role", "benefactor")
    base_price = new_plan.get("ben_price", new_plan["price"]) if role == "beneficiary" else new_plan["price"]

    # Apply per-user discount
    override = await db.subscription_overrides.find_one({"user_id": current_user["id"]}, {"_id": 0})
    discount = override.get("custom_discount", 0) if override else 0
    if discount > 0:
        base_price = base_price * (1 - discount / 100)

    cycle = data.billing_cycle
    if cycle == "quarterly":
        new_total = round(float(new_plan.get("quarterly_price", base_price * 0.9)) * 3, 2)
    elif cycle == "annual":
        new_total = round(float(new_plan.get("annual_price", base_price * 0.8)) * 12, 2)
    else:
        new_total = round(base_price, 2)

    # --- Proration ---
    net_amount = round(new_total - remaining_credit, 2)
    is_downgrade = net_amount < 0
    refund_amount = abs(net_amount) if is_downgrade else 0
    charge_amount = net_amount if net_amount > 0 else 0

    # For free plans or zero/negative net, update directly
    if new_plan.get("price", 0) == 0 or charge_amount <= 0:
        if cycle == "annual":
            new_period_end = now + timedelta(days=365)
        elif cycle == "quarterly":
            new_period_end = now + timedelta(days=90)
        else:
            new_period_end = now + timedelta(days=30)

        await db.user_subscriptions.update_one(
            {"user_id": current_user["id"]},
            {
                "$set": {
                    "plan_id": data.plan_id,
                    "plan_name": new_plan["name"],
                    "billing_cycle": cycle,
                    "amount": new_total,
                    "free_plan": new_plan.get("price", 0) == 0,
                    "current_period_start": now.isoformat(),
                    "current_period_end": new_period_end.isoformat(),
                    "updated_at": now.isoformat(),
                    "previous_plan": sub.get("plan_id"),
                    "previous_cycle": old_cycle,
                }
            },
        )

        # Record the refund/credit if applicable
        if refund_amount > 0:
            import uuid

            await db.payment_transactions.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": current_user["id"],
                    "user_email": current_user["email"],
                    "type": "proration_credit",
                    "plan_id": data.plan_id,
                    "plan_name": new_plan["name"],
                    "billing_cycle": cycle,
                    "amount": -refund_amount,
                    "remaining_credit": remaining_credit,
                    "new_plan_cost": new_total,
                    "currency": "usd",
                    "payment_status": "credited",
                    "previous_plan": sub.get("plan_id"),
                    "previous_cycle": old_cycle,
                    "created_at": now.isoformat(),
                }
            )

        msg = f"Switched to {new_plan['name']} ({cycle})."
        if refund_amount > 0:
            msg += f" ${refund_amount:.2f} credit applied from your previous plan."
        return {"success": True, "message": msg, "refund_amount": refund_amount}

    # For upgrades requiring payment, create Stripe checkout for the prorated amount
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")

    origin = validate_origin_url(data.origin_url) if data.origin_url else ""
    success_url = f"{origin}/settings?session_id={{CHECKOUT_SESSION_ID}}&change=true"
    cancel_url = f"{origin}/settings"
    backend_url = os.environ.get("RAILWAY_PUBLIC_URL", os.environ.get("BACKEND_URL", ""))
    webhook_url = f"{backend_url}/api/webhook/stripe" if backend_url else f"{origin}/api/webhook/stripe"

    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
    checkout_request = CheckoutSessionRequest(
        amount=charge_amount,
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
            "proration_credit": str(remaining_credit),
            "original_new_cost": str(new_total),
        },
    )
    # Same 15s timeout protection as /subscriptions/checkout above.
    try:
        session = await asyncio.wait_for(
            stripe_checkout.create_checkout_session(checkout_request),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        logger.error("stripe change-plan timeout: user=%s", current_user.get("id"))
        raise HTTPException(
            status_code=504, detail="Stripe is taking longer than usual to respond. Please try again in a moment."
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("stripe change-plan error: %s", exc)
        raise HTTPException(status_code=502, detail="Could not reach Stripe right now. Please try again in a moment.")

    import uuid

    await db.payment_transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "session_id": session.session_id,
            "user_id": current_user["id"],
            "user_email": current_user["email"],
            "plan_id": data.plan_id,
            "plan_name": new_plan["name"],
            "billing_cycle": cycle,
            "amount": charge_amount,
            "remaining_credit": remaining_credit,
            "new_plan_cost": new_total,
            "currency": "usd",
            "type": "plan_change_prorated",
            "previous_plan": sub.get("plan_id", ""),
            "previous_cycle": old_cycle,
            "payment_status": "pending",
            "created_at": now.isoformat(),
        }
    )

    return {
        "url": session.url,
        "session_id": session.session_id,
        "proration": {
            "previous_credit": remaining_credit,
            "new_plan_cost": new_total,
            "charge_amount": charge_amount,
        },
    }


@router.post("/subscriptions/change-billing")
async def change_billing_cycle(
    data: ChangeBillingRequest,
    current_user: dict = Depends(get_current_user),
):
    """Change billing cycle — creates a Stripe checkout for the new cycle amount."""
    sub = await db.user_subscriptions.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not sub or sub.get("status") != "active":
        raise HTTPException(status_code=400, detail="No active subscription")

    cycle = data.billing_cycle
    current_cycle = sub.get("billing_cycle", "monthly")
    if cycle == current_cycle:
        return {"success": True, "message": f"Already on {cycle} billing"}

    # During beta, just update the billing preference
    settings = await get_subscription_settings()
    if settings.get("beta_mode", True):
        await db.user_subscriptions.update_one(
            {"user_id": current_user["id"]},
            {
                "$set": {
                    "billing_cycle": cycle,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        return {"success": True, "message": f"Billing switched to {cycle}"}

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
    override = await db.subscription_overrides.find_one({"user_id": current_user["id"]}, {"_id": 0})
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
    success_url = f"{origin}/settings?session_id={{CHECKOUT_SESSION_ID}}&billing_change=true"
    cancel_url = f"{origin}/settings"
    backend_url = os.environ.get("RAILWAY_PUBLIC_URL", os.environ.get("BACKEND_URL", ""))
    webhook_url = f"{backend_url}/api/webhook/stripe" if backend_url else f"{origin}/api/webhook/stripe"

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
    # Same 15s timeout protection as /subscriptions/checkout above.
    try:
        session = await asyncio.wait_for(
            stripe_checkout.create_checkout_session(checkout_request),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        logger.error("stripe change-billing timeout: user=%s", current_user.get("id"))
        raise HTTPException(
            status_code=504, detail="Stripe is taking longer than usual to respond. Please try again in a moment."
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("stripe change-billing error: %s", exc)
        raise HTTPException(status_code=502, detail="Could not reach Stripe right now. Please try again in a moment.")

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
    sub = await db.user_subscriptions.find_one({"user_id": current_user["id"]}, {"_id": 0})
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

    from routes.subscriptions.plans import TRIAL_DURATION_DAYS

    now = datetime.now(timezone.utc)
    if expire_trial:
        # Set trial to yesterday so user immediately sees the paywall
        new_trial_end = now - timedelta(days=1)
    else:
        new_trial_end = now + timedelta(days=TRIAL_DURATION_DAYS)

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

    from routes.subscriptions.plans import BENEFICIARY_PLANS

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


# ═══════════════════════════════════════════════════
# APPLE IN-APP PURCHASE VALIDATION
# ═══════════════════════════════════════════════════


async def verify_apple_receipt_with_server(receipt_data: str) -> dict:
    """Verify an Apple IAP receipt with Apple's verifyReceipt endpoint.
    Tries production first, falls back to sandbox (App Store review uses sandbox)."""
    import httpx

    apple_shared_secret = os.environ.get("APPLE_SHARED_SECRET", "")
    payload = {
        "receipt-data": receipt_data,
        "password": apple_shared_secret,
        "exclude-old-transactions": True,
    }

    # Try production first
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            prod_res = await client.post("https://buy.itunes.apple.com/verifyReceipt", json=payload)
            prod_data = prod_res.json()

            # Status 21007 means sandbox receipt sent to production
            if prod_data.get("status") == 21007:
                sandbox_res = await client.post(
                    "https://sandbox.itunes.apple.com/verifyReceipt",
                    json=payload,
                )
                return sandbox_res.json()

            return prod_data
        except Exception as e:
            logger.error(f"Apple receipt verification failed: {e}")
            return {"status": -1, "error": str(e)}


@router.post("/subscriptions/validate-apple-receipt")
async def validate_apple_receipt(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Validate an Apple IAP receipt and activate the subscription."""
    data = await request.json()
    transaction_id = data.get("transaction_id")
    product_id = data.get("product_id")
    receipt_data = data.get("receipt")

    if not transaction_id or not product_id:
        raise HTTPException(status_code=400, detail="Missing transaction_id or product_id")

    plan_id = APPLE_TO_PLAN.get(product_id)
    if not plan_id:
        raise HTTPException(status_code=400, detail=f"Unknown product: {product_id}")

    # Prevent transaction replay attacks — check if already used
    existing_txn = await db.apple_transactions.find_one({"transaction_id": transaction_id}, {"_id": 0})
    if existing_txn:
        if existing_txn.get("user_id") == current_user["id"]:
            return {
                "valid": True,
                "plan_id": plan_id,
                "message": "Transaction already validated for this account",
            }
        raise HTTPException(status_code=400, detail="This transaction has already been used")

    # Server-side receipt verification with Apple
    apple_shared_secret = os.environ.get("APPLE_SHARED_SECRET", "")
    if receipt_data and apple_shared_secret:
        verification = await verify_apple_receipt_with_server(receipt_data)
        apple_status = verification.get("status", -1)
        if apple_status != 0:
            logger.warning(
                f"Apple receipt verification status={apple_status} for user "
                f"{current_user['id']}, product={product_id}, txn={transaction_id}"
            )
            raise HTTPException(
                status_code=400,
                detail="Receipt verification failed with Apple",
            )
        logger.info(f"Apple receipt verified successfully for user {current_user['id']}")
    else:
        # No receipt data or no shared secret — trust the StoreKit 2 transaction
        # (StoreKit 2 transactions are already verified by the OS before delivery)
        logger.info(
            f"Skipping server receipt validation for user {current_user['id']} "
            f"(receipt={'present' if receipt_data else 'empty'}, "
            f"secret={'set' if apple_shared_secret else 'missing'})"
        )

    billing_cycle = "annual" if "annual" in product_id else "quarterly" if "quarterly" in product_id else "monthly"

    now = datetime.now(timezone.utc)
    if billing_cycle == "annual":
        period_end = now + timedelta(days=365)
    elif billing_cycle == "quarterly":
        period_end = now + timedelta(days=90)
    else:
        period_end = now + timedelta(days=30)

    # Record the transaction to prevent replay attacks
    await db.apple_transactions.insert_one(
        {
            "transaction_id": transaction_id,
            "user_id": current_user["id"],
            "product_id": product_id,
            "plan_id": plan_id,
            "validated_at": now.isoformat(),
        }
    )

    # Store the Apple subscription
    await db.user_subscriptions.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "user_id": current_user["id"],
                "plan_id": plan_id,
                "plan_name": plan_id.replace("_", " ").title(),
                "status": "active",
                "billing_cycle": billing_cycle,
                "payment_provider": "apple_iap",
                "apple_transaction_id": transaction_id,
                "apple_product_id": product_id,
                "current_period_start": now.isoformat(),
                "current_period_end": period_end.isoformat(),
                "activated_at": now.isoformat(),
            }
        },
        upsert=True,
    )

    return {
        "valid": True,
        "plan_id": plan_id,
        "billing_cycle": billing_cycle,
        "message": "Subscription activated via Apple In-App Purchase",
    }


@router.post("/subscriptions/sync-apple")
async def sync_apple_subscriptions(
    current_user: dict = Depends(get_current_user),
):
    """Sync/restore Apple IAP subscriptions."""
    active_sub = await db.user_subscriptions.find_one(
        {
            "user_id": current_user["id"],
            "payment_provider": "apple_iap",
            "status": "active",
        },
        {"_id": 0},
    )

    if active_sub:
        return {"has_subscription": True, "plan_id": active_sub.get("plan_id")}

    return {"has_subscription": False}
