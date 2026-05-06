"""
Founders Circle — Lifetime subscription management.
Handles pricing, checkout (Stripe one-time + installments), and status tracking.
"""

import os
from datetime import datetime, timezone
from uuid import uuid4

import stripe
from fastapi import Depends, HTTPException
from pydantic import BaseModel

from config import db, logger
from utils import get_current_user
from routes.subscriptions.plans import router, get_subscription_settings, validate_origin_url

stripe.api_key = os.environ.get("STRIPE_API_KEY")

# ── Default Founders Circle Lifetime Pricing ──
FC_DEFAULT_PRICING = [
    {"tier": "premium", "name": "Premium", "lifetime_price": 499},
    {"tier": "standard", "name": "Standard", "lifetime_price": 399},
    {"tier": "base", "name": "Base", "lifetime_price": 199},
    {"tier": "new_adult", "name": "New Adult", "lifetime_price": 79},
    {"tier": "military", "name": "Military / First Responder", "lifetime_price": 179},
    {"tier": "veteran", "name": "Veteran", "lifetime_price": 179},
]

FC_INSTALLMENT_DISCOUNTS = {1: 15, 3: 10, 6: 5, 12: 0}


async def get_fc_settings():
    """Get Founders Circle settings from platform rules + subscription settings."""
    from routes.platform_rules import get_platform_rules

    rules = await get_platform_rules()
    rules_map = {r["id"]: r["value"] for r in rules}

    # Campaign active toggle
    campaign_active = rules_map.get("fc_campaign_active", "true") == "true"

    # Installment discounts from rules
    discounts = {
        1: int(rules_map.get("fc_1pay_discount", "15%").replace("%", "")),
        3: int(rules_map.get("fc_3pay_discount", "10%").replace("%", "")),
        6: int(rules_map.get("fc_6pay_discount", "5%").replace("%", "")),
        12: int(rules_map.get("fc_12pay_discount", "0%").replace("%", "")),
    }

    # Lifetime pricing from subscription_settings (admin-adjustable)
    settings = await get_subscription_settings()
    pricing = settings.get("fc_pricing", FC_DEFAULT_PRICING)

    return {
        "campaign_active": campaign_active,
        "discounts": discounts,
        "pricing": pricing,
    }


def calculate_installment(lifetime_price, num_payments, discount_percent):
    """Calculate per-installment amount after discount."""
    discounted_total = round(lifetime_price * (1 - discount_percent / 100))
    per_payment = round(discounted_total / num_payments)
    return {
        "total": discounted_total,
        "per_payment": per_payment,
        "num_payments": num_payments,
        "discount_percent": discount_percent,
    }


# ── Public: Get FC Plans ──


@router.get("/founders-circle/plans")
async def get_fc_plans():
    """Get Founders Circle pricing and availability (public)."""
    fc = await get_fc_settings()
    if not fc["campaign_active"]:
        return {"active": False, "plans": []}

    plans = []
    for tier in fc["pricing"]:
        lp = tier["lifetime_price"]
        installments = {}
        for n in [1, 3, 6, 12]:
            disc = fc["discounts"].get(n, 0)
            installments[str(n)] = calculate_installment(lp, n, disc)
        plans.append(
            {
                "tier": tier["tier"],
                "name": tier["name"],
                "lifetime_price": lp,
                "installments": installments,
            }
        )

    return {"active": True, "plans": plans}


# ── User: Get FC Status ──


@router.get("/founders-circle/status")
async def get_fc_status(current_user: dict = Depends(get_current_user)):
    """Get user's Founders Circle subscription status across all estates."""
    fc_subs = await db.founders_circle.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(50)
    return {"subscriptions": fc_subs}


# ── Checkout ──


class FCCheckoutRequest(BaseModel):
    estate_id: str
    tier: str
    num_payments: int  # 1, 3, 6, or 12
    origin_url: str


@router.post("/founders-circle/checkout")
async def fc_checkout(data: FCCheckoutRequest, current_user: dict = Depends(get_current_user)):
    """Create a Stripe checkout session for a Founders Circle lifetime subscription."""
    fc = await get_fc_settings()
    if not fc["campaign_active"]:
        raise HTTPException(status_code=400, detail="Founders Circle campaign is not currently active")

    if data.num_payments not in (1, 3, 6, 12):
        raise HTTPException(status_code=400, detail="Invalid payment schedule. Choose 1, 3, 6, or 12.")

    # Find tier pricing
    tier_info = next((t for t in fc["pricing"] if t["tier"] == data.tier), None)
    if not tier_info:
        raise HTTPException(status_code=400, detail=f"Invalid tier: {data.tier}")

    # Verify user owns the estate
    estate = await db.estates.find_one({"id": data.estate_id}, {"_id": 0, "id": 1, "owner_id": 1, "name": 1})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    # Allow admin users or estate owners
    is_owner = estate["owner_id"] == current_user["id"]
    is_admin = current_user.get("role") == "admin"
    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="You must be the estate owner to purchase Founders Circle")

    # Check if already has FC for this estate
    existing = await db.founders_circle.find_one(
        {"user_id": current_user["id"], "estate_id": data.estate_id, "status": {"$in": ["active", "completed"]}},
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already have a Founders Circle subscription for this estate")

    # Calculate pricing
    discount = fc["discounts"].get(data.num_payments, 0)
    calc = calculate_installment(tier_info["lifetime_price"], data.num_payments, discount)

    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")

    origin = validate_origin_url(data.origin_url)
    fc_id = str(uuid4())

    if data.num_payments == 1:
        # One-time payment via Stripe Checkout
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": calc["total"] * 100,  # cents
                        "product_data": {
                            "name": f"Founders Circle — {tier_info['name']} (Lifetime)",
                            "description": f"Lifetime access to CarryOn {tier_info['name']} tier. Beneficiaries free forever.",
                        },
                    },
                    "quantity": 1,
                }
            ],
            success_url=f"{origin}/subscription?fc_session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/founders-circle",
            metadata={
                "fc_id": fc_id,
                "user_id": current_user["id"],
                "estate_id": data.estate_id,
                "tier": data.tier,
                "num_payments": "1",
                "type": "founders_circle",
            },
        )
    else:
        # Recurring payments with a fixed number of cycles
        price = stripe.Price.create(
            currency="usd",
            unit_amount=calc["per_payment"] * 100,
            recurring={"interval": "month", "interval_count": 1},
            product_data={
                "name": f"Founders Circle — {tier_info['name']} ({data.num_payments}-pay)",
            },
        )
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price.id, "quantity": 1}],
            subscription_data={
                "metadata": {
                    "fc_id": fc_id,
                    "user_id": current_user["id"],
                    "estate_id": data.estate_id,
                    "tier": data.tier,
                    "num_payments": str(data.num_payments),
                    "type": "founders_circle",
                },
            },
            success_url=f"{origin}/subscription?fc_session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/founders-circle",
            metadata={
                "fc_id": fc_id,
                "type": "founders_circle",
            },
        )

    # Create pending FC record
    now = datetime.now(timezone.utc).isoformat()
    await db.founders_circle.insert_one(
        {
            "id": fc_id,
            "user_id": current_user["id"],
            "estate_id": data.estate_id,
            "estate_name": estate.get("name", ""),
            "tier": data.tier,
            "tier_name": tier_info["name"],
            "lifetime_price": tier_info["lifetime_price"],
            "discount_percent": discount,
            "total_amount": calc["total"],
            "per_payment": calc["per_payment"],
            "num_payments": data.num_payments,
            "payments_made": 0,
            "status": "pending",
            "stripe_session_id": session.id,
            "created_at": now,
            "updated_at": now,
        }
    )

    return {"url": session.url, "session_id": session.id, "fc_id": fc_id}


# ── Checkout confirmation ──


@router.get("/founders-circle/checkout-status/{session_id}")
async def fc_checkout_status(session_id: str, current_user: dict = Depends(get_current_user)):
    """Check FC checkout status and activate if paid."""
    fc_doc = await db.founders_circle.find_one({"stripe_session_id": session_id}, {"_id": 0})
    if not fc_doc:
        raise HTTPException(status_code=404, detail="Founders Circle session not found")

    if fc_doc["status"] in ("active", "completed"):
        return {"status": fc_doc["status"], "fc": fc_doc}

    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except Exception as e:
        logger.error(f"Stripe session retrieve error: {e}")
        raise HTTPException(status_code=500, detail="Could not verify payment")

    if session.payment_status == "paid":
        now = datetime.now(timezone.utc).isoformat()
        new_status = "completed" if fc_doc["num_payments"] == 1 else "active"
        payments_made = 1

        await db.founders_circle.update_one(
            {"id": fc_doc["id"]},
            {
                "$set": {
                    "status": new_status,
                    "payments_made": payments_made,
                    "activated_at": now,
                    "updated_at": now,
                }
            },
        )

        # Grant free access to all beneficiaries of this estate
        await _grant_beneficiary_free_access(fc_doc["estate_id"], fc_doc["tier"])

        # Also ensure benefactor has an active subscription at this tier
        await db.user_subscriptions.update_one(
            {"user_id": fc_doc["user_id"]},
            {
                "$set": {
                    "user_id": fc_doc["user_id"],
                    "plan_id": fc_doc["tier"],
                    "plan_name": fc_doc["tier_name"],
                    "status": "active",
                    "billing_cycle": "lifetime",
                    "amount": 0.0,
                    "founders_circle": True,
                    "fc_id": fc_doc["id"],
                    "activated_at": now,
                }
            },
            upsert=True,
        )

        fc_doc["status"] = new_status
        fc_doc["payments_made"] = payments_made
        return {"status": new_status, "fc": fc_doc}

    return {"status": "pending", "payment_status": session.payment_status}


async def _grant_beneficiary_free_access(estate_id: str, tier: str):
    """Grant free subscription access to all beneficiaries of an estate."""
    # Find all beneficiaries linked to this estate
    beneficiaries = await db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0, "user_id": 1}).to_list(500)

    ben_user_ids = [b["user_id"] for b in beneficiaries if b.get("user_id")]

    # Also check estates.beneficiaries array
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "beneficiaries": 1})
    if estate and estate.get("beneficiaries"):
        for uid in estate["beneficiaries"]:
            if uid not in ben_user_ids:
                ben_user_ids.append(uid)

    # Grant free access override to each beneficiary
    now = datetime.now(timezone.utc).isoformat()
    for uid in ben_user_ids:
        await db.subscription_overrides.update_one(
            {"user_id": uid},
            {
                "$set": {
                    "user_id": uid,
                    "free_access": True,
                    "reason": f"Founders Circle beneficiary (estate: {estate_id}, tier: {tier})",
                    "fc_estate_id": estate_id,
                    "fc_tier": tier,
                    "granted_at": now,
                }
            },
            upsert=True,
        )


# ── Admin: Update FC Pricing ──


class FCPricingUpdate(BaseModel):
    tier: str
    lifetime_price: int


@router.put("/admin/founders-circle/pricing")
async def update_fc_pricing(data: FCPricingUpdate, current_user: dict = Depends(get_current_user)):
    """Update lifetime price for a tier. Founder only."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    is_founder = current_user.get("admin_scope") == "founder" or current_user.get("operator_role") == "founder"
    if not is_founder:
        raise HTTPException(status_code=403, detail="Only the founder can update FC pricing")

    settings = await get_subscription_settings()
    pricing = settings.get("fc_pricing", [dict(p) for p in FC_DEFAULT_PRICING])

    found = False
    for p in pricing:
        if p["tier"] == data.tier:
            p["lifetime_price"] = data.lifetime_price
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail=f"Tier not found: {data.tier}")

    await db.subscription_settings.update_one(
        {"_id": "global"},
        {"$set": {"fc_pricing": pricing}},
    )
    return {"success": True, "pricing": pricing}


@router.get("/admin/founders-circle/subscriptions")
async def get_fc_subscriptions(current_user: dict = Depends(get_current_user)):
    """Get all Founders Circle subscriptions. Admin only."""
    if current_user.get("role") not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Admin access required")
    subs = await db.founders_circle.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"subscriptions": subs, "total": len(subs)}


@router.delete("/admin/founders-circle/subscriptions/pending")
async def clear_pending_fc_subscriptions(current_user: dict = Depends(get_current_user)):
    """Delete `pending` Founders Circle rows older than 1 hour. Admin only.

    Safety net: a Stripe checkout session is valid for ~24 hours; an
    `pending` row in `db.founders_circle` is created the instant the
    user clicks Subscribe, BEFORE Stripe redirects them. Deleting all
    pending rows blindly would torpedo an in-flight payment, so we cap
    the delete to rows whose `created_at` is older than 1h — which
    safely excludes anyone currently mid-checkout while clearing every
    abandoned-tab leftover. Returns the count deleted.
    """
    if current_user.get("role") not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Admin access required")

    # 1-hour grace window — long enough to never race a real checkout,
    # short enough that founders don't see day-old click-throughs as
    # "members" in the admin panel.
    from datetime import timedelta

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

    result = await db.founders_circle.delete_many(
        {
            "status": "pending",
            "created_at": {"$lt": cutoff},
        }
    )
    logger.info(
        "fc admin clear-pending: user=%s deleted=%s",
        current_user.get("id"),
        result.deleted_count,
    )
    return {"deleted": result.deleted_count}
