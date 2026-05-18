"""Stripe checkout, webhook, plan changes, and cancellation — LIVE REVENUE PATHS.

Read-only status/plans endpoints live in `status.py`.
Admin subscription/plan-price/discount endpoints live in `admin.py`.
Apple IAP receipt validation/sync lives in `apple_iap.py`.
"""

import asyncio
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import stripe
from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest,
    StripeCheckout,
)
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from config import db, logger
from utils import get_current_user
from routes.subscriptions.plans import (
    router,
    DEFAULT_PLANS,
    get_subscription_settings,
    validate_origin_url,
    SubscriptionCheckoutRequest,
)

stripe.api_key = os.environ.get("STRIPE_API_KEY")


# NOTE: The read-only `/subscriptions/plans` (public) and
# `/subscriptions/status` (auth) endpoints that used to live here moved
# to `status.py` during Monolith Reduction 3/6 (Feb 2026). They are
# pure read paths and never touch Stripe.


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


@router.post("/subscriptions/reconcile")
async def reconcile_pending_subscriptions(current_user: dict = Depends(get_current_user)):
    """Safety net: reconcile any pending Stripe payment for the calling user.

    Why this exists
    ───────────────
    When a user pays via Stripe Checkout from a standalone PWA (macOS
    dock app, iOS Add-to-Home-Screen), the post-payment redirect lands
    in a fresh browser window — NOT the PWA. The browser doesn't carry
    the user's JWT, so they get bounced to /login. After re-login the
    `?session_id=…` query param is lost and the frontend's normal
    "/checkout-status/{session_id}" reconciliation never fires. The
    server-side webhook DOES activate the subscription, but the user's
    in-app `subscriptionStatus` stays stale and the Subscription page
    looks like the payment failed → screams prototype.

    What this does
    ──────────────
    On any /subscription page mount we POST here once. The endpoint:
      1. Finds every `pending` row in `payment_transactions` for this
         user that's < 24h old.
      2. For each, pings Stripe `get_checkout_status` to see if it
         settled. If yes, it activates `user_subscriptions` (same
         logic as the polled /checkout-status endpoint).
      3. Returns the latest `user_subscriptions` row + a list of any
         transactions that just transitioned to paid, so the frontend
         can pop the celebration banner even when the URL has lost
         its `session_id`.

    Idempotent: rerunning is a no-op once everything is settled.
    """
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return {"activated": [], "current": None, "stripe_unavailable": True}

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    pending = await db.payment_transactions.find(
        {
            "user_id": current_user["id"],
            "payment_status": {"$ne": "paid"},
            "created_at": {"$gte": cutoff},
        },
        {"_id": 0},
    ).to_list(20)

    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
    activated: list[dict] = []

    for txn in pending:
        session_id = txn.get("session_id")
        if not session_id:
            continue
        try:
            status = await asyncio.wait_for(
                stripe_checkout.get_checkout_status(session_id),
                timeout=10.0,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "reconcile: stripe lookup failed for txn=%s user=%s: %s",
                session_id,
                current_user["id"],
                exc,
            )
            continue

        if status.payment_status not in ("paid", "complete"):
            continue

        # Mark txn paid + activate subscription (mirror of /checkout-status).
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "payment_status": "paid",
                    "status": status.status,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "reconciled": True,
                }
            },
        )

        plan_id = txn.get("plan_id", "")
        cycle = txn.get("billing_cycle", "monthly")
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
                    "user_id": current_user["id"],
                    "plan_id": plan_id,
                    "plan_name": txn.get("plan_name", ""),
                    "status": "active",
                    "billing_cycle": cycle,
                    "amount": txn.get("amount", 0),
                    "stripe_session_id": session_id,
                    "current_period_start": now.isoformat(),
                    "current_period_end": period_end.isoformat(),
                    "activated_at": now.isoformat(),
                    "payment_provider": "stripe",
                }
            },
            upsert=True,
        )

        # Cancel any active grace periods — user re-subscribed.
        try:
            from services.grace_period import cancel_grace_period

            user_estates = await db.estates.find(
                {"owner_id": current_user["id"]},
                {"_id": 0, "id": 1},
            ).to_list(50)
            for est in user_estates:
                await cancel_grace_period(est["id"], current_user["id"], "re-subscribed")
        except Exception as exc:  # noqa: BLE001
            logger.debug(f"reconcile: grace cancel skipped: {exc}")

        activated.append(
            {
                "session_id": session_id,
                "plan_id": plan_id,
                "plan_name": txn.get("plan_name", ""),
                "billing_cycle": cycle,
                "amount": txn.get("amount", 0),
            }
        )

    current = await db.user_subscriptions.find_one(
        {"user_id": current_user["id"]},
        {"_id": 0},
    )
    return {"activated": activated, "current": current}


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
