"""Subprocess runner for test_tier_price_parity.py — DB-backed stages.

Bound to a throwaway scratch database via DB_NAME (set by the test). Seeds one benefactor
+ one beneficiary + one estate + one family plan per catalog tier, then drives the real
route handlers (status, plans payload, family-plan quote, checkout) and prints one JSON
document with everything the test asserts on. Stripe is replaced with a capture stub —
no network call is ever made.
"""

import asyncio
import json
import os
import sys

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")

BENEFACTOR_DISC = 30
BENEFICIARY_DISC = 50


def seed(db, plans, ben_plans, tiers):
    db.subscription_settings.insert_one(
        {
            "_id": "global",
            "beta_mode": False,
            "plans": plans,
            "beneficiary_plans": ben_plans,
            "family_plan_enabled": True,
            "family_benefactor_discount_percent": BENEFACTOR_DISC,
            "family_beneficiary_discount_percent": BENEFICIARY_DISC,
        }
    )
    price = {p["id"]: p["price"] for p in plans}
    for t in tiers:
        db.users.insert_many(
            [
                {"id": f"bf-{t}", "email": f"bf-{t}@carryontest.io", "role": "benefactor", "name": f"BF {t}"},
                {"id": f"bn-{t}", "email": f"bn-{t}@carryontest.io", "role": "beneficiary", "name": f"BN {t}"},
                {"id": f"fm-{t}", "email": f"fm-{t}@carryontest.io", "role": "benefactor", "name": f"FM {t}"},
            ]
        )
        db.user_subscriptions.insert_many(
            [
                {"user_id": f"bf-{t}", "plan_id": t, "status": "active", "billing_cycle": "monthly", "amount": price[t]},
                {"user_id": f"fm-{t}", "plan_id": t, "status": "active", "billing_cycle": "monthly", "amount": price[t]},
            ]
        )
        db.estates.insert_one({"id": f"es-{t}", "owner_id": f"bf-{t}", "status": "pre-transition", "beneficiaries": [f"bn-{t}"]})
        db.beneficiaries.insert_one(
            {"id": f"br-{t}", "estate_id": f"es-{t}", "user_id": f"bn-{t}", "email": f"bn-{t}@carryontest.io", "deleted_at": None}
        )
        db.family_plans.insert_one(
            {"id": f"fp-{t}", "fpo_user_id": f"bf-{t}", "fpo_plan_id": t, "status": "active", "members": []}
        )


class _FakeSession:
    url = "https://stripe.test/session"
    session_id = "cs_test_fake"


class _FakeStripeCheckout:
    captured = []

    def __init__(self, api_key=None, webhook_url=None):
        pass

    async def create_checkout_session(self, req):
        _FakeStripeCheckout.captured.append(req.amount)
        return _FakeSession()


async def run(tiers):
    from fastapi import HTTPException

    import routes.family_plan as fam
    import routes.subscriptions.checkout as co
    import routes.subscriptions.status as st
    from routes.subscriptions.plans import SubscriptionCheckoutRequest

    co.StripeCheckout = _FakeStripeCheckout  # never touch Stripe

    async def checkout_amount(user, plan_id, cycle):
        _FakeStripeCheckout.captured.clear()
        try:
            await co.create_subscription_checkout(
                SubscriptionCheckoutRequest(plan_id=plan_id, billing_cycle=cycle, origin_url="https://www.carryon.us"),
                request=None,
                current_user=user,
            )
        except HTTPException as e:
            return {"error": f"HTTP {e.status_code}: {e.detail}"}
        return {"amount": _FakeStripeCheckout.captured[0] if _FakeStripeCheckout.captured else None}

    plans_payload = await st.get_subscription_plans()
    out = {"plans_payload": plans_payload, "tiers": {}}
    for t in tiers:
        bf = {"id": f"bf-{t}", "email": f"bf-{t}@carryontest.io", "role": "benefactor", "name": f"BF {t}"}
        bn = {"id": f"bn-{t}", "email": f"bn-{t}@carryontest.io", "role": "beneficiary", "name": f"BN {t}"}
        row = {}
        ben_status = await st.get_subscription_status(current_user=bn)
        row["beneficiary_locked_tier"] = ben_status.get("beneficiary_locked_tier")
        row["beneficiary_synth_plan_id"] = (ben_status.get("subscription") or {}).get("plan_id")
        bf_status = await st.get_subscription_status(current_user=bf)
        row["benefactor_plan_id"] = (bf_status.get("subscription") or {}).get("plan_id")

        await fam.add_family_member(f"fp-{t}", fam.FamilyPlanInvite(email=f"fm-{t}@carryontest.io", role="benefactor"), current_user=bf)
        await fam.add_family_member(f"fp-{t}", fam.FamilyPlanInvite(email=f"bn-{t}@carryontest.io", role="beneficiary"), current_user=bf)
        from config import db

        fp = await db.family_plans.find_one({"id": f"fp-{t}"}, {"_id": 0})
        row["family_members"] = {m["member_type"]: m for m in fp["members"]}
        preview = await fam.preview_family_savings(current_user=bf)
        row["preview_fpo"] = preview["family_tree"][0]

        row["checkout"] = {
            "benefactor": {c: await checkout_amount(bf, t, c) for c in ("monthly", "quarterly", "annual")},
            "beneficiary": {c: await checkout_amount(bn, f"ben_{t}", c) for c in ("monthly", "quarterly", "annual")},
        }
        out["tiers"][t] = row
    return out


def main():
    from pymongo import MongoClient

    from routes.subscriptions.plans import BENEFICIARY_PLANS, DEFAULT_PLANS, PLAN_ORDER

    client = MongoClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    try:
        seed(db, [dict(p) for p in DEFAULT_PLANS], [dict(p) for p in BENEFICIARY_PLANS], PLAN_ORDER)
        out = asyncio.run(run(PLAN_ORDER))
        print("RESULT " + json.dumps(out, default=str, sort_keys=True))
    finally:
        client.drop_database(os.environ["DB_NAME"])


if __name__ == "__main__":
    main()
