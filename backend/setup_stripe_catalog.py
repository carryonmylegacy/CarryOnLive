"""CarryOn™ — Stripe Catalog Setup (idempotent)

Creates Stripe Products and Prices for all subscription tiers and billing cycles.
Run once (or anytime plans change). Uses lookup_keys for price lookup — no hardcoded Price IDs.

Usage: python setup_stripe_catalog.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import stripe
from config import db

stripe.api_key = os.environ.get("STRIPE_API_KEY")

TAX_CODE = "txcd_10103001"  # SaaS / cloud services


async def get_plans_from_db():
    """Read plans from subscription_settings (Founder Portal)."""
    settings = await db.subscription_settings.find_one({"_id": "global"}, {"_id": 0})
    if not settings or not settings.get("plans"):
        from routes.subscriptions.plans import DEFAULT_PLANS

        return DEFAULT_PLANS
    return settings["plans"]


def ensure_product(plan_id, plan_name):
    """Get or create a Stripe Product for a plan."""
    for p in stripe.Product.list(active=True, limit=100).auto_paging_iter():
        if (p.metadata or {}).get("carryon_plan_id") == plan_id:
            return p
    return stripe.Product.create(
        name=f"CarryOn™ {plan_name}",
        tax_code=TAX_CODE,
        metadata={"managed_by": "carryon", "carryon_plan_id": plan_id},
    )


def ensure_price(product_id, plan_id, cycle, amount_cents, interval, interval_count=1):
    """Get or create a Stripe Price with a lookup_key."""
    lookup_key = f"carryon_{plan_id}_{cycle}"
    existing = stripe.Price.list(lookup_keys=[lookup_key], active=True, limit=1).data

    if existing:
        p = existing[0]
        # Check if amount changed
        if p.unit_amount == amount_cents and p.recurring and p.recurring.interval == interval:
            print(f"  {lookup_key}: exists ({amount_cents}c/{interval}) ✓")
            return p
        # Deactivate old price (amount changed)
        stripe.Price.modify(p.id, active=False)
        print(f"  {lookup_key}: deactivated old price (was {p.unit_amount}c)")

    price = stripe.Price.create(
        product=product_id,
        unit_amount=amount_cents,
        currency="usd",
        recurring={"interval": interval, "interval_count": interval_count},
        lookup_key=lookup_key,
        transfer_lookup_key=True,
        metadata={"carryon_plan_id": plan_id, "cycle": cycle},
    )
    print(f"  {lookup_key}: created ({amount_cents}c/{interval}) → {price.id}")
    return price


async def setup_catalog():
    """Create all Stripe Products and Prices from the Founder Portal plans."""
    if not stripe.api_key:
        print("ERROR: STRIPE_API_KEY not set")
        return

    plans = await get_plans_from_db()
    print(f"Setting up Stripe catalog for {len(plans)} plans...\n")

    for plan in plans:
        plan_id = plan["id"]
        name = plan["name"]
        monthly = plan.get("price", 0)

        if monthly <= 0 and plan_id not in ("hospice", "enterprise"):
            print(f"Skipping {name} (price = 0)")
            continue
        if plan_id in ("hospice", "enterprise"):
            print(f"Skipping {name} ($0 plan — no Stripe billing)")
            continue

        print(f"\n{name} (${monthly}/mo):")
        product = ensure_product(plan_id, name)
        print(f"  Product: {product.id}")

        # Monthly price
        monthly_cents = round(monthly * 100)
        ensure_price(product.id, plan_id, "monthly", monthly_cents, "month")

        # Quarterly price (10% off monthly × 3)
        quarterly = plan.get("quarterly_price", round(monthly * 0.9, 2))
        quarterly_cents = round(quarterly * 100 * 3)  # Total for 3 months
        ensure_price(product.id, plan_id, "quarterly", quarterly_cents, "month", 3)

        # Annual price (20% off monthly × 12)
        annual_monthly = float(plan.get("annual_price", round(monthly * 0.8, 2)))
        annual_total_cents = round(annual_monthly * 12 * 100)
        ensure_price(product.id, plan_id, "annual", annual_total_cents, "year")

    print("\n✅ Stripe catalog setup complete!")


def setup_catalog_sync():
    """Synchronous entry point."""
    if not stripe.api_key:
        print("ERROR: STRIPE_API_KEY not set")
        return

    # Read plans synchronously using motor's sync approach
    from pymongo import MongoClient

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = MongoClient(mongo_url)
    sync_db = client[db_name]

    settings = sync_db.subscription_settings.find_one({"_id": "global"})
    if not settings or not settings.get("plans"):
        from routes.subscriptions.plans import DEFAULT_PLANS

        plans = DEFAULT_PLANS
    else:
        plans = settings["plans"]

    print(f"Setting up Stripe catalog for {len(plans)} plans...\n")

    for plan in plans:
        plan_id = plan["id"]
        name = plan["name"]
        monthly = float(plan.get("price", 0))

        if monthly <= 0:
            print(f"Skipping {name} ($0 plan)")
            continue

        print(f"\n{name} (${monthly}/mo):")
        product = ensure_product(plan_id, name)
        print(f"  Product: {product.id}")

        # Monthly
        monthly_cents = round(monthly * 100)
        ensure_price(product.id, plan_id, "monthly", monthly_cents, "month")

        # Quarterly (billed every 3 months at quarterly_price * 3)
        quarterly_monthly = float(plan.get("quarterly_price", round(monthly * 0.9, 2)))
        quarterly_total_cents = round(quarterly_monthly * 3 * 100)
        ensure_price(product.id, plan_id, "quarterly", quarterly_total_cents, "month", 3)

        # Annual (billed yearly at annual_price * 12)
        annual_monthly = float(plan.get("annual_price", round(monthly * 0.8, 2)))
        annual_total_cents = round(annual_monthly * 12 * 100)
        ensure_price(product.id, plan_id, "annual", annual_total_cents, "year")

    print("\n✅ Stripe catalog setup complete!")
    client.close()


if __name__ == "__main__":
    setup_catalog_sync()
