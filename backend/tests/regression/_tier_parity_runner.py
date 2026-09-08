"""Subprocess runner for test_tier_price_parity.py — DB-backed stages.

Bound to a throwaway scratch database via DB_NAME (set by the test). Seeds one benefactor
+ one beneficiary + one estate + one family plan per catalog tier (plus dedicated users
for change-plan / change-billing / beta / Apple / lifecycle stages), then drives the real
route handlers and prints one JSON document with everything the test asserts on.
Stripe is replaced with a capture stub and outbound email is stubbed — no network call
is ever made.
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402

load_dotenv("/app/backend/.env")

BENEFACTOR_DISC = 30
BENEFICIARY_DISC = 50
CUSTOM_DISCOUNT = 25
ORIGIN = "https://www.carryon.us"
CYCLES = ("monthly", "quarterly", "annual")
NOW = datetime.now(timezone.utc)


def _user(uid, role, dob=None):
    doc = {"id": uid, "email": f"{uid}@carryontest.io", "role": role, "name": uid.upper()}
    if dob is not None:
        doc["date_of_birth"] = dob.isoformat()
    return doc


def _sub(uid, plan_id, amount, cycle="monthly"):
    return {"user_id": uid, "plan_id": plan_id, "status": "active", "billing_cycle": cycle, "amount": amount}


def _years_ago(years, extra_days=0):
    return NOW.replace(year=NOW.year - years) - timedelta(days=extra_days)


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
    ben_price = {p["id"]: p["price"] for p in ben_plans}
    users, subs = [], []
    for t in tiers:
        b = f"ben_{t}"
        users += [
            _user(f"bf-{t}", "benefactor"),
            _user(f"bn-{t}", "beneficiary"),
            _user(f"fm-{t}", "benefactor"),
            _user(f"cp-{t}", "benefactor"),  # change-plan target t
            _user(f"cb-{t}", "beneficiary"),  # change-plan target ben_t
            _user(f"cd-{t}", "benefactor"),  # change-plan with custom_discount
            _user(f"cbl-{t}", "benefactor"),  # change-billing on t
            _user(f"cbb-{t}", "beneficiary"),  # change-billing on ben_t
            _user(f"bb-{t}", "benefactor"),  # beta checkout t
            _user(f"bbn-{t}", "beneficiary"),  # beta checkout ben_t
        ]
        subs += [
            _sub(f"bf-{t}", t, price[t]),
            _sub(f"fm-{t}", t, price[t]),
            _sub(f"cp-{t}", "base", price["base"]),
            _sub(f"cb-{t}", "ben_base", ben_price["ben_base"]),
            _sub(f"cd-{t}", "base", price["base"]),
            _sub(f"cbl-{t}", t, price[t]),
            _sub(f"cbb-{t}", b, ben_price[b]),
        ]
        db.subscription_overrides.insert_one({"user_id": f"cd-{t}", "custom_discount": CUSTOM_DISCOUNT})
        db.estates.insert_one(
            {"id": f"es-{t}", "owner_id": f"bf-{t}", "status": "pre-transition", "beneficiaries": [f"bn-{t}"]}
        )
        db.beneficiaries.insert_one(
            {
                "id": f"br-{t}",
                "estate_id": f"es-{t}",
                "user_id": f"bn-{t}",
                "email": f"bn-{t}@carryontest.io",
                "name": f"BN {t}",
                "relation": "Child",
                "deleted_at": None,
            }
        )
        db.family_plans.insert_one(
            {"id": f"fp-{t}", "fpo_user_id": f"bf-{t}", "fpo_plan_id": t, "status": "active", "members": []}
        )
    users += [
        _user("dob-new_adult", "benefactor", _years_ago(20, 10)),
        _user("dob-seniors", "benefactor", _years_ago(70, 10)),
        _user("ao-1", "beneficiary", _years_ago(26, 2)),  # turned 26 two days ago
    ]
    subs.append(_sub("ao-1", "new_adult", price["new_adult"]))
    db.users.insert_many(users)
    db.user_subscriptions.insert_many(subs)


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


class _Req:
    def __init__(self, body):
        self._body = body

    async def json(self):
        return self._body


async def run(tiers, paid, paid_ben):
    from fastapi import HTTPException

    import routes.family_plan as fam
    import routes.subscriptions.admin as adm
    import routes.subscriptions.apple_iap as iap
    import routes.subscriptions.checkout as co
    import routes.subscriptions.status as st
    import routes.subscriptions.verification_and_lifecycle as vl
    import routes.trial_reminders as tr
    import services.email as email_svc
    from config import db
    from routes.subscriptions.plans import SubscriptionCheckoutRequest, get_subscription_settings

    co.StripeCheckout = _FakeStripeCheckout  # never touch Stripe

    async def _no_mail(*a, **k):
        return True

    email_svc.send_email = _no_mail  # lifecycle emails resolve this attribute at call time

    captured = _FakeStripeCheckout.captured

    async def call(coro):
        captured.clear()
        try:
            return await coro, None
        except HTTPException as e:
            return None, {"error": f"HTTP {e.status_code}: {e.detail}"}

    async def sub_row(uid):
        return await db.user_subscriptions.find_one({"user_id": uid}, {"_id": 0, "plan_id": 1, "plan_name": 1}) or {}

    async def checkout_amount(user, plan_id, cycle):
        req = SubscriptionCheckoutRequest(plan_id=plan_id, billing_cycle=cycle, origin_url=ORIGIN)
        _, err = await call(co.create_subscription_checkout(req, request=None, current_user=user))
        return err or {"amount": captured[0] if captured else None}

    async def change_plan_amount(user, plan_id, cycle):
        req = co.ChangeSubscriptionRequest(plan_id=plan_id, billing_cycle=cycle, origin_url=ORIGIN)
        _, err = await call(co.change_subscription_plan(req, current_user=user))
        if err:
            return err
        if captured:
            return {"amount": captured[0]}
        sub = await db.user_subscriptions.find_one({"user_id": user["id"]}, {"_id": 0, "amount": 1})
        return {"amount": (sub or {}).get("amount")}

    async def change_billing_amount(user, cycle):
        req = co.ChangeBillingRequest(billing_cycle=cycle, origin_url=ORIGIN)
        _, err = await call(co.change_billing_cycle(req, current_user=user))
        return err or {"amount": captured[0] if captured else 0.0}

    out = {"plans_payload": await st.get_subscription_plans(), "tiers": {}}

    out["dob_eligibility"] = {}
    for key in ("new_adult", "seniors"):
        status = await st.get_subscription_status(current_user=_user(f"dob-{key}", "benefactor"))
        out["dob_eligibility"][key] = status.get("eligible_tiers")

    for t in tiers:
        b = f"ben_{t}"
        bf, bn = _user(f"bf-{t}", "benefactor"), _user(f"bn-{t}", "beneficiary")
        row = {}
        ben_status = await st.get_subscription_status(current_user=bn)
        row["beneficiary_locked_tier"] = ben_status.get("beneficiary_locked_tier")
        row["beneficiary_synth_plan_id"] = (ben_status.get("subscription") or {}).get("plan_id")
        bf_status = await st.get_subscription_status(current_user=bf)
        row["benefactor_plan_id"] = (bf_status.get("subscription") or {}).get("plan_id")

        await fam.add_family_member(
            f"fp-{t}", fam.FamilyPlanInvite(email=f"fm-{t}@carryontest.io", role="benefactor"), current_user=bf
        )
        await fam.add_family_member(
            f"fp-{t}", fam.FamilyPlanInvite(email=f"bn-{t}@carryontest.io", role="beneficiary"), current_user=bf
        )
        fp = await db.family_plans.find_one({"id": f"fp-{t}"}, {"_id": 0})
        row["family_members"] = {m["member_type"]: m for m in fp["members"]}
        preview = await fam.preview_family_savings(current_user=bf)
        row["preview_fpo"] = preview["family_tree"][0]
        row["preview_tree"] = preview["family_tree"]

        row["checkout"] = {
            "benefactor": {c: await checkout_amount(bf, t, c) for c in CYCLES},
            "beneficiary": {c: await checkout_amount(bn, b, c) for c in CYCLES},
        }
        cp, cb, cd = _user(f"cp-{t}", "benefactor"), _user(f"cb-{t}", "beneficiary"), _user(f"cd-{t}", "benefactor")
        row["change_plan"] = {
            "benefactor": {c: await change_plan_amount(cp, t, c) for c in CYCLES},
            "beneficiary": {c: await change_plan_amount(cb, b, c) for c in CYCLES},
            "discounted_benefactor": {c: await change_plan_amount(cd, t, c) for c in CYCLES},
        }
        cbl, cbb = _user(f"cbl-{t}", "benefactor"), _user(f"cbb-{t}", "beneficiary")
        row["change_billing"] = {
            "benefactor": {c: await change_billing_amount(cbl, c) for c in ("quarterly", "annual")},
            "beneficiary": {c: await change_billing_amount(cbb, c) for c in ("quarterly", "annual")},
        }
        out["tiers"][t] = row

    # Beta-mode checkout records the chosen plan without charging.
    await db.subscription_settings.update_one({"_id": "global"}, {"$set": {"beta_mode": True}})
    for t in tiers:
        for uid, pid in ((f"bb-{t}", t), (f"bbn-{t}", f"ben_{t}")):
            role = "beneficiary" if pid.startswith("ben_") else "benefactor"
            req = SubscriptionCheckoutRequest(plan_id=pid, billing_cycle="monthly", origin_url=ORIGIN)
            await call(co.create_subscription_checkout(req, request=None, current_user=_user(uid, role)))
        out["tiers"][t]["beta_checkout"] = {
            "benefactor": await sub_row(f"bb-{t}"),
            "beneficiary": await sub_row(f"bbn-{t}"),
        }
    await db.subscription_settings.update_one({"_id": "global"}, {"$set": {"beta_mode": False}})

    # Lifecycle: new_adult ages out at 26.
    await vl.check_dob_subscription_events()
    out["age_out"] = await sub_row("ao-1")

    # Trial emails quote the catalog's starting price (helper exists only once B11 is fixed).
    starting = getattr(tr, "starting_monthly_price", None)
    if starting:
        price = await starting()
        out["trial_emails"] = {
            "starting_price": price,
            "reminder": tr.build_trial_reminder_email("Pat", 3, ORIGIN, 10, price)[1],
            "expired": tr.build_trial_expired_email("Pat", ORIGIN, 10, price)[1],
        }
    else:
        out["trial_emails"] = None

    # Apple IAP activation for every paid product (monthly).
    out["apple"] = {}
    for t in list(paid) + list(paid_ben):
        uid = f"ap-{t}"
        role = "beneficiary" if t.startswith("ben_") else "benefactor"
        body = {"transaction_id": f"txn-{t}", "product_id": f"us.carryon.app.v2.{t}_monthly"}
        _, err = await call(iap.validate_apple_receipt(_Req(body), current_user=_user(uid, role)))
        out["apple"][t] = err or await sub_row(uid)

    # C8b — stored beneficiary_plans drift (preview 2026-09-08: flat-rate rows saved 1.99/1.79/1.59 by the
    # pre-fix admin edit). get_subscription_settings() must heal ONLY quarterly_price / annual_price (and
    # merge a missing allows_billing_toggle) and leave every family-plan and discount field byte-identical.
    async def snapshot():
        doc = await db.subscription_settings.find_one({"_id": "global"}, {"_id": 0})
        return {
            "settings_other": {k: v for k, v in doc.items() if k != "beneficiary_plans"},
            "beneficiary_plans": {p["id"]: p for p in doc["beneficiary_plans"]},
            "family_plans": await db.family_plans.find({}, {"_id": 0}).sort("id", 1).to_list(1000),
            "subscription_overrides": await db.subscription_overrides.find({}, {"_id": 0})
            .sort("user_id", 1)
            .to_list(1000),
            "user_subscriptions": await db.user_subscriptions.find({}, {"_id": 0}).sort("user_id", 1).to_list(1000),
        }

    def same(a, b):
        return json.dumps(a, sort_keys=True, default=str) == json.dumps(b, sort_keys=True, default=str)

    doc = await db.subscription_settings.find_one({"_id": "global"}, {"_id": 0, "beneficiary_plans": 1})
    drift = {"ben_military": (1.79, 1.59), "ben_premium": (9.99, 9.99)}
    for p in doc["beneficiary_plans"]:
        if p["id"] in drift:
            p["quarterly_price"], p["annual_price"] = drift[p["id"]]
    legacy_row = next(p for p in doc["beneficiary_plans"] if p["id"] == "ben_military")
    for key in ("allows_billing_toggle", "quarterly_discount_percent", "annual_discount_percent"):
        legacy_row.pop(key, None)  # stored rows that predate the derived / percent fields
    await db.subscription_settings.update_one(
        {"_id": "global"}, {"$set": {"beneficiary_plans": doc["beneficiary_plans"]}}
    )
    before = await snapshot()
    await get_subscription_settings()
    after = await snapshot()
    keys = ("price", "quarterly_price", "annual_price", "allows_billing_toggle")
    out["settings_ben_cycle_heal"] = {pid: {k: after["beneficiary_plans"][pid].get(k) for k in keys} for pid in drift}
    out["heal_integrity"] = {
        "settings_other_identical": same(before["settings_other"], after["settings_other"]),
        "settings_other_keys": sorted(before["settings_other"]),
        "family_plans_identical": same(before["family_plans"], after["family_plans"]),
        "family_plans_count": len(before["family_plans"]),
        "family_member_fields": sorted({k for fp in before["family_plans"] for m in fp.get("members", []) for k in m}),
        "subscription_overrides_identical": same(before["subscription_overrides"], after["subscription_overrides"]),
        "subscription_overrides_count": len(before["subscription_overrides"]),
        "user_subscriptions_identical": same(before["user_subscriptions"], after["user_subscriptions"]),
        "beneficiary_plan_changed_keys": {
            pid: sorted(
                k
                for k in set(b) | set(after["beneficiary_plans"][pid])
                if b.get(k) != after["beneficiary_plans"][pid].get(k)
            )
            for pid, b in before["beneficiary_plans"].items()
        },
    }

    # Admin beneficiary price edit — LAST, it mutates catalog prices in the scratch DB.
    admin = {"id": "adm-1", "email": "adm-1@carryontest.io", "role": "admin"}
    out["admin_ben_price_edit"] = {}
    for pid in ("ben_military", "ben_premium"):
        await adm.update_beneficiary_plan_price(pid, price=2.49, current_user=admin)
        settings = await get_subscription_settings()
        bp = next(p for p in settings["beneficiary_plans"] if p["id"] == pid)
        out["admin_ben_price_edit"][pid] = {k: bp.get(k) for k in keys}

    # Founder pricing rules — per-plan quarterly/annual discount percents drive cycle prices and charges.
    from routes.subscriptions.plans import PlanPricingUpdate, plan_lookup

    def frozen(plan):
        return json.loads(json.dumps(plan, sort_keys=True, default=str))

    base_before = frozen(plan_lookup(await get_subscription_settings())["base"])
    edits = (
        ("premium", PlanPricingUpdate(quarterly_discount_percent=15, annual_discount_percent=25)),
        ("standard", PlanPricingUpdate(quarterly_discount_percent=0, annual_discount_percent=0)),
        ("ben_military", PlanPricingUpdate(quarterly_discount_percent=5, annual_discount_percent=10)),
        ("ben_premium", PlanPricingUpdate(price=6.99)),
    )
    for pid, data in edits:
        await adm.update_plan_pricing(pid, data, current_user=admin)
    by_id = plan_lookup(await get_subscription_settings())
    fields = (
        "price",
        "quarterly_discount_percent",
        "annual_discount_percent",
        "quarterly_price",
        "annual_price",
        "allows_billing_toggle",
        "ben_price",
    )
    out["pricing_rules"] = {
        "plans": {
            pid: {k: by_id[pid].get(k) for k in fields if k in by_id[pid]}
            for pid in ("premium", "standard", "base", "ben_military", "ben_premium")
        },
        "base_untouched": frozen(by_id["base"]) == base_before,
        "checkout": {
            pid: {c: await checkout_amount(_user(f"pr-{pid}", role), pid, c) for c in CYCLES}
            for pid, role in (("premium", "benefactor"), ("standard", "benefactor"), ("ben_military", "beneficiary"))
        },
    }
    return out


def main():
    from pymongo import MongoClient

    from routes.subscriptions.plans import BENEFICIARY_PLANS, DEFAULT_PLANS, PLAN_ORDER

    paid = [p["id"] for p in DEFAULT_PLANS if float(p["price"]) > 0]
    paid_ben = [p["id"] for p in BENEFICIARY_PLANS if float(p["price"]) > 0]
    client = MongoClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    try:
        seed(db, [dict(p) for p in DEFAULT_PLANS], [dict(p) for p in BENEFICIARY_PLANS], PLAN_ORDER)
        out = asyncio.run(run(PLAN_ORDER, paid, paid_ben))
        print("RESULT " + json.dumps(out, default=str, sort_keys=True))
    finally:
        client.drop_database(os.environ["DB_NAME"])


if __name__ == "__main__":
    main()
