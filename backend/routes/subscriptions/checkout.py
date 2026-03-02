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
        ben_link = await db.beneficiaries.find_one(
            {"user_id": current_user["id"]}, {"_id": 0, "estate_id": 1}
        )
        if not ben_link:
            ben_link = await db.beneficiaries.find_one(
                {"email": current_user.get("email")}, {"_id": 0, "estate_id": 1}
            )
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
            ben_sub = await db.user_subscriptions.find_one(
                {"user_id": benefactor_id}, {"_id": 0}
            )
            benefactor_user = await db.users.find_one(
                {"id": benefactor_id}, {"_id": 0, "verified_tier": 1}
            )
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
                beneficiary_locked_tier = plan_map.get(
                    benefactor_user["verified_tier"], "ben_base"
                )

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
        "special_status": special_status,
        "is_minor": is_minor,
        "user_role": current_user.get("role", "benefactor"),
        "beneficiary_locked_tier": beneficiary_locked_tier,
        "estate_transitioned": estate_transitioned,
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
        # During beta, still record the benefactor's chosen plan so beneficiaries can see it
        plans_lookup = {p["id"]: p for p in settings.get("plans", DEFAULT_PLANS)}
        plan = plans_lookup.get(data.plan_id)
        if plan and current_user.get("role") == "benefactor":
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
    """Upgrade or downgrade subscription plan with proration.

    - Upgrade: charges only the price difference for the remaining period
    - Downgrade: issues a credit/refund for the unused value difference
    - Same tier, different cycle: treated as a billing change
    """
    sub = await db.user_subscriptions.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
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
            else period_end
            - timedelta(days={"annual": 365, "quarterly": 90}.get(old_cycle, 30))
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
    base_price = (
        new_plan.get("ben_price", new_plan["price"])
        if role == "beneficiary"
        else new_plan["price"]
    )

    # Apply per-user discount
    override = await db.subscription_overrides.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    discount = override.get("custom_discount", 0) if override else 0
    if discount > 0:
        base_price = base_price * (1 - discount / 100)

    cycle = data.billing_cycle
    if cycle == "quarterly":
        new_total = round(
            float(new_plan.get("quarterly_price", base_price * 0.9)) * 3, 2
        )
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
    session = await stripe_checkout.create_checkout_session(checkout_request)

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
    sub = await db.user_subscriptions.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
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


