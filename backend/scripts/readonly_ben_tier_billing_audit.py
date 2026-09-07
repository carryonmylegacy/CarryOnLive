"""READ-ONLY audit: beneficiaries whose benefactor is on the seniors / new_adult tier,
and what they were actually charged.

Run in a Render shell (production) or locally (preview):
    python scripts/readonly_ben_tier_billing_audit.py --quick   # 2 count_documents calls, nothing else
    python scripts/readonly_ben_tier_billing_audit.py           # full audit

Reads only: users, estates, beneficiaries, user_subscriptions, payment_transactions
(find / count_documents). Writes nothing. stdout carries counts, plan ids, amounts,
timestamps, the first 8 chars of internal user ids and masked emails — no names, no
full emails, no phone numbers.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

TIERS = ("seniors", "new_adult")
EXPECTED_BEN_PLAN = {"seniors": "ben_seniors", "new_adult": "ben_new_adult"}


def _short(uid: str) -> str:
    return (uid or "?")[:8]


def _mask(email: str) -> str:
    if not email or "@" not in email:
        return "?"
    local, dom = email.split("@", 1)
    return f"{local[:2]}***@{dom}"


async def quick():
    """Fastest possible answer to: are there ANY paid beneficiary subscriptions at all?"""
    from config import db

    paid_subs = await db.user_subscriptions.count_documents({"plan_id": {"$regex": "^ben_"}, "amount": {"$gt": 0}})
    paid_txns = await db.payment_transactions.count_documents({"plan_id": {"$regex": "^ben_"}, "status": "paid"})
    print(f"user_subscriptions with plan_id ben_* and amount > 0: {paid_subs}")
    print(f"payment_transactions with plan_id ben_* and status paid: {paid_txns}")
    if paid_subs == 0 and paid_txns == 0:
        print("=> no beneficiary has ever paid through the web checkout; the exposure question is closed")


async def main():
    from config import db

    # Benefactor tier precedence mirrors routes/subscriptions/status.py: estate.verified_tier,
    # then user_subscriptions.plan_id, then users.verified_tier.
    estates = await db.estates.find({}, {"_id": 0, "id": 1, "owner_id": 1, "verified_tier": 1}).to_list(100000)
    owner_ids = list({e.get("owner_id") for e in estates if e.get("owner_id")})
    subs = {
        s["user_id"]: s
        for s in await db.user_subscriptions.find({"user_id": {"$in": owner_ids}}, {"_id": 0}).to_list(100000)
    }
    owners = {
        u["id"]: u
        for u in await db.users.find(
            {"id": {"$in": owner_ids}}, {"_id": 0, "id": 1, "verified_tier": 1, "email": 1}
        ).to_list(100000)
    }

    def benefactor_tier(estate):
        if estate.get("verified_tier"):
            return estate["verified_tier"]
        s = subs.get(estate.get("owner_id"))
        if s and s.get("plan_id"):
            return s["plan_id"]
        o = owners.get(estate.get("owner_id")) or {}
        return o.get("verified_tier")

    affected_estates = {e["id"]: benefactor_tier(e) for e in estates if benefactor_tier(e) in TIERS}
    print(f"estates on seniors/new_adult: {len(affected_estates)}")

    ben_rows = await db.beneficiaries.find(
        {"estate_id": {"$in": list(affected_estates)}, "deleted_at": None},
        {"_id": 0, "estate_id": 1, "user_id": 1, "email": 1},
    ).to_list(100000)
    ben_user_ids = list({b.get("user_id") for b in ben_rows if b.get("user_id")})
    print(f"beneficiary records on those estates: {len(ben_rows)} (with a linked user account: {len(ben_user_ids)})")

    ben_subs = await db.user_subscriptions.find({"user_id": {"$in": ben_user_ids}}, {"_id": 0}).to_list(100000)
    txns = await db.payment_transactions.find({"user_id": {"$in": ben_user_ids}, "status": "paid"}, {"_id": 0}).to_list(
        100000
    )
    ben_users = {
        u["id"]: u
        for u in await db.users.find({"id": {"$in": ben_user_ids}}, {"_id": 0, "id": 1, "email": 1}).to_list(100000)
    }
    tier_by_user = {}
    for b in ben_rows:
        if b.get("user_id"):
            tier_by_user[b["user_id"]] = affected_estates[b["estate_id"]]

    overcharged = []
    for s in ben_subs:
        expected = EXPECTED_BEN_PLAN.get(tier_by_user.get(s["user_id"]))
        amt = float(s.get("amount") or 0)
        flag = ""
        if s.get("plan_id") and s.get("plan_id") != expected:
            flag = f"  <-- plan mismatch (expected {expected})"
        if amt > 1.99 * (
            12 if s.get("billing_cycle") == "annual" else 3 if s.get("billing_cycle") == "quarterly" else 1
        ):
            flag += "  <-- amount above $1.99/mo catalog price"
            overcharged.append(s["user_id"])
        print(
            f"  sub user={_short(s['user_id'])} {_mask(ben_users.get(s['user_id'], {}).get('email'))} "
            f"plan={s.get('plan_id')} status={s.get('status')} cycle={s.get('billing_cycle')} amount={amt}{flag}"
        )
    print(f"beneficiary subscriptions on those estates: {len(ben_subs)}; above catalog price: {len(overcharged)}")

    paid_over = [t for t in txns if float(t.get("amount") or 0) > 1.99 and str(t.get("plan_id", "")).startswith("ben_")]
    for t in paid_over:
        print(
            f"  PAID txn user={_short(t['user_id'])} {_mask(ben_users.get(t['user_id'], {}).get('email'))} "
            f"plan={t.get('plan_id')} amount={t.get('amount')} at={t.get('updated_at') or t.get('created_at')}"
        )
    print(f"paid Stripe transactions above $1.99 for these beneficiaries: {len(paid_over)}")


if __name__ == "__main__":
    asyncio.run(quick() if "--quick" in sys.argv else main())
