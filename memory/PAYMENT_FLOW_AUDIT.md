# Payment Flow Audit — Stability & Launch Readiness (April 2026)

This document traces every path a payment takes through CarryOn, the critical
invariants that must hold, and known risks for the upcoming nationwide launch.

## Overview

| Flow | Entry | Path | Destination state |
|---|---|---|---|
| **A. Standard subscription** | `/subscription` page | Stripe Checkout → webhook → `user_subscriptions` | `status: active` |
| **B. Founders Circle 1-pay** | `/founders-circle` | Stripe one-time → `/checkout-status` → `founders_circle` + `user_subscriptions` | `plan: fc_*_lifetime`, `status: active` |
| **C. Founders Circle installments** | `/founders-circle` | Stripe recurring (3/6/12mo) → webhook → `founders_circle` + `user_subscriptions` | Same as above, with `payment_schedule` |
| **D. Apple IAP** | Native iOS | StoreKit → `/webhook/apple` → `user_subscriptions` | `status: active`, `payment_provider: apple` |
| **E. Failed payment → grace** | webhook `invoice.payment_failed` | `billing_lifecycle` → `status: past_due` | 30-day grace; daily reminders |
| **F. Grace expired → dormant** | `billing_lifecycle_scheduler` | past_due > 30d → `status: dormant` | read-only, data intact |
| **G. Dormant → reactivation** | User pays via `/subscription` | Stripe checkout → `handle_payment_succeeded` | `status: active` |

## Flow A — Standard subscription (Stripe Checkout)

### Happy path
1. User clicks tier → `POST /api/checkout/create-session` (`routes/subscriptions/checkout.py:220`)
2. Backend creates `payment_transactions` record with `payment_status: pending`
3. Stripe redirects user to checkout.stripe.com
4. On success → Stripe calls `POST /api/webhook/stripe` (`checkout.py:411`)
5. **Webhook path** upserts `user_subscriptions` with `status: active` (line 447-465)
6. **AND** frontend calls `GET /api/checkout/status/{session_id}` (line 353) as fallback

### Dual-write correctness ✅
The webhook + the checkout-status endpoint BOTH can activate the subscription.
Upsert is idempotent. ✅ Safe.

### Critical risk: webhook secret
- Stripe sends `Stripe-Signature` header (line 415).
- `stripe_checkout.handle_webhook(body, sig)` from `emergentintegrations` verifies it internally.
- ⚠️ **Verify STRIPE_WEBHOOK_SECRET is set in prod env** — if missing, attackers could fake payment success!

**Action item**: Run this pre-launch:
```bash
curl -s -X POST $BASE_URL/api/webhook/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: fake" \
  -d '{"type":"checkout.session.completed"}' 
# Expected: 400/401. If returns 200 with {"received":true}, webhook verification is BYPASSED.
```

### Observed race ⚠️
Lines 428-438: if the webhook fires before the frontend calls `/checkout/status/{id}`, the webhook path sets payment_status and activates — all good. If the frontend calls first, the checkout-status path activates. But if BOTH happen simultaneously, both will do the same upsert (Mongo is atomic per-document). Safe.

### Failure mode: webhook lost
If Stripe's webhook delivery fails (network blip, Stripe retries for 3 days), user's subscription stays `pending`. They see success on checkout page, but frontend polls `/checkout/status` which fixes it on page load. **BUT** if they close the tab before the redirect completes, they won't be activated until Stripe retries.

**Recommendation**: Add a reconciliation scheduler:
```python
# services/billing_lifecycle.py — new function
async def reconcile_stripe_pending():
    """Every hour, check `payment_transactions` with status=pending older than 5min,
    fetch session from Stripe, activate if paid."""
```
~1 hour to implement, huge safety net.

## Flow B/C — Founders Circle

### Routes (`routes/subscriptions/founders_circle.py`)
- `POST /api/founders-circle/checkout` — creates Stripe session (1-pay OR recurring)
- `GET /api/founders-circle/checkout-status/{session_id}` — confirmation + activation
- `POST /api/founders-circle/installment-complete` — installments final payment

### Key behaviors observed

**Lines 230-262** (checkout creation):
- Inserts `founders_circle` record with tier, schedule, estate_id, amount
- Plan ID: `fc_{tier}_lifetime` (e.g., `fc_premium_lifetime`)
- Estate selector: correctly scopes FC to a SPECIFIC estate (per PRD "per estate, not per user")

**Lines 268-320** (activation):
- Marks `founders_circle.status = active`
- Upserts `user_subscriptions` with `plan_id: fc_*_lifetime`, `status: active`, `is_lifetime: true`
- ⚠️ **Check**: does this grant `free_access` override to that estate's beneficiaries? The PRD says "Beneficiaries free forever". Let me trace...

Found it — in `routes/subscriptions/founders_circle.py` the activation flow sets `subscription_overrides` with `free_access: true` for all existing beneficiaries of that estate. ✅ But what about beneficiaries ADDED LATER?

### ⚠️ Risk: Beneficiaries added AFTER FC activation

**Current behavior**: When FC is activated, a one-time sweep grants free access to all current beneficiaries of that estate.

**Missing**: When a NEW beneficiary accepts an invitation for an FC-funded estate, do they also get the free_access override?

**Trace**: `routes/beneficiaries.py` + `routes/auth.py` invitation accept logic — I see no check for "is this estate's owner an FC member? If so, grant free_access to this new beneficiary."

**Recommendation**: Add this check to the invitation-accept flow:
```python
# After linking beneficiary to estate in auth.py accept-invitation:
fc = await db.founders_circle.find_one({"estate_id": estate_id, "status": "active"}, {"_id": 0})
if fc:
    await db.subscription_overrides.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "free_access": True, "reason": "fc_benefactor", "granted_at": now.isoformat()}},
        upsert=True,
    )
```
~15 min fix. Failing to do this means a late-added beneficiary would be charged, violating the FC promise.

### FC installment failure path

Per PRD: "Installment failure: 30-day grace → clean cut, revert to monthly."

**Check**: `services/billing_lifecycle.py` — how does it distinguish FC installments from monthly subs?

Looking at verification_and_lifecycle.py line 752 — there's subscription update logic but I'd want to verify the FC-specific grace-then-revert-to-monthly logic before launch. **Launch-blocker? No** — FC installments are net-new, failure rate on first 1000 users will be very low, and the grace system treats them like any other past_due sub. But the "revert to monthly" part I couldn't verify exists.

**Recommendation**: Write `test_fc_installment_failure.py` that:
1. Creates an FC 3-pay subscription
2. Simulates payment failure on payment 2 of 3
3. Asserts: status becomes past_due, then after 30 sim days, reverts to monthly plan at tier rate
If the test fails, this logic is missing and must be built.

## Flow D — Apple IAP

**BLOCKED** by Apple Paid Applications Agreement (known). Code paths look correct:
- `POST /api/webhook/apple` (line 334) — App Store Server Notifications V2
- Stores `apple_transactions` (unique `transaction_id` index prevents replay)
- Updates `user_subscriptions` with `payment_provider: apple`
- `APPLE_SHARED_SECRET` env is set ✅

## Flow E/F — Grace → Dormant

**`services/billing_lifecycle.py`** + **`schedulers.py:grace_period_scheduler`**

- On `invoice.payment_failed` webhook → `status: past_due`, set `grace_period_end` to now+30d
- Daily scheduler: send countdown emails (at 14d, 7d, 3d, 1d)
- On grace expiry: `status: dormant`, no data loss
- Read-only enforcement: `guards.py:require_active_subscription` returns 403 on dormant

✅ Flow is correct. Audit TTL index keeps `audit_trail` from growing unbounded (line 123 of db_indexes.py).

### ⚠️ Edge case: user has BOTH active Stripe sub AND Apple IAP
If they subscribe on web, then also in iOS app, you'd have two `user_subscriptions` with conflict. The schema doesn't prevent this. Practical risk: very low during a 1-week launch window, but worth a pre-launch check:
```python
# Lookup: how many users have >1 active subscription?
await db.user_subscriptions.aggregate([
  {"$match": {"status": "active"}},
  {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
  {"$match": {"count": {"$gt": 1}}},
]).to_list(100)
```
If 0, no action needed. If >0, add "one active sub per user" enforcement.

## Flow G — Reactivation from dormant

When a dormant user pays:
1. Stripe webhook fires `checkout.session.completed` OR frontend calls `/checkout/status`
2. `handle_payment_succeeded(user_id)` in `services/billing_lifecycle.py` is called
3. Sub moves to `active`, `grace_period_end` cleared

✅ Correct.

## Summary — Launch Readiness

| Area | Status | Action |
|---|---|---|
| Stripe Checkout happy path | 🟢 Safe | — |
| Stripe webhook signature verification | 🟡 Verify pre-launch | Run curl test above |
| Stripe webhook reconciliation | 🟡 Gap | Add `reconcile_stripe_pending` scheduler (~1hr) |
| Founders Circle activation | 🟢 Safe | — |
| FC free_access for NEW beneficiaries | 🔴 **GAP** | 15-min fix in invitation accept |
| FC installment failure → revert to monthly | 🟡 Unverified | Write test to verify (~30 min) |
| Apple IAP | 🔵 Blocked (3rd party) | Unblock w/ Apple |
| Grace → dormant → reactivate | 🟢 Safe | — |
| Duplicate active subscriptions | 🟡 Run pre-launch check | 1 query |

## Recommended Launch-Week Sequence

**Wednesday (pre-launch)**:
1. Run Stripe webhook signature verification test → must return 400
2. Run "duplicate active subs" query → must return 0
3. Fix the FC-free-access-for-new-beneficiaries gap (🔴 above)
4. Write + run the FC installment failure test

**Thursday**:
5. Implement Stripe reconciliation scheduler (safety net)
6. Run `k6` load test (see `/app/load_tests/README.md`)

**Friday**:
7. Deploy
8. Watch Sentry + Stripe dashboard live for first 48h

All 7 items fit in 4-5 hours of focused work. You're in good shape.
