"""Read-only public subscription plans + per-user subscription status.

Extracted from checkout.py (Monolith Reduction 3/6, Feb 2026).
These two endpoints are pure read paths — they do not interact with Stripe,
do not mutate state, and do not handle webhooks. Live checkout/webhook/
plan-change/cancel paths remain in `checkout.py`.

Endpoints:
  - GET /subscriptions/plans   (public)
  - GET /subscriptions/status  (auth)
"""

from datetime import datetime, timedelta, timezone

from fastapi import Depends

from config import db
from utils import get_current_user
from routes.subscriptions.plans import (
    router,
    DEFAULT_PLANS,
    BENEFICIARY_PLANS,
    get_subscription_settings,
    calculate_trial_status,
)


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
    platform_settings = (
        await db.platform_settings.find_one(
            {"_id": "global"},
            {"_id": 0, "platform_free_mode": 1, "ai_burn_guard_enabled": 1},
        )
        or {}
    )

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
    platform_free_mode = bool(platform_settings.get("platform_free_mode", False))
    ai_burn_guard_enabled = bool(platform_settings.get("ai_burn_guard_enabled", False))
    is_beta_tester = (user_doc or {}).get("is_beta_tester", False)
    has_free_access = override and override.get("free_access", False)
    has_active_sub = sub and sub.get("status") in ("active", "past_due")
    is_grace = sub and sub.get("status") == "past_due"
    is_dormant = sub and sub.get("status") == "dormant"

    # ── Admin-assigned tier (founder-only override on the estate row) ──
    # When a founder uses Admin → Users → Assign Tier, we write to
    # `estates.verified_tier`. Without surfacing that here, the
    # benefactor's own /subscription page kept saying "needs subscription"
    # (they were sent to Stripe even though the founder had granted
    # them the tier), AND the BEC gate kept reading `users.subscription_tier`
    # which never gets populated by the override. Both were the same
    # bug in two places. Now we synthesize a virtual "active" sub from
    # the override and the rest of the response naturally lights up.
    admin_assigned_tier = None
    # First pass: ALWAYS resolve the admin-assigned tier from the
    # estate row (independent of whether there is an active sub). This
    # is surfaced as a top-level `admin_granted_tier` on the response
    # so the paywall can render a "Granted by Founder" attribution
    # even when the user ALSO has a real (or beta) active sub
    # covering the same tier. Without this, the user's reported case
    # (admin grants Premium → user already has active beta Premium →
    # paywall shows "Your Plan" with no admin attribution at all) had
    # zero visible signal that the admin had acted, which is the
    # exact regression flagged on May 22, 2026.
    if current_user.get("role") in ("benefactor", "admin", "operator"):
        admin_estate_any = await db.estates.find_one(
            {"owner_id": current_user["id"], "verified_tier": {"$exists": True, "$ne": ""}},
            {"_id": 0, "id": 1, "verified_tier": 1},
        )
        if admin_estate_any and admin_estate_any.get("verified_tier"):
            admin_assigned_tier = admin_estate_any["verified_tier"]
    if not has_active_sub and admin_assigned_tier:
        # No real/beta sub — synthesize a virtual active sub from the
        # admin grant so the page renders the chosen tile as "Your Plan
        # / Granted by Founder".
        sub = {
            "id": f"admin-override-{current_user['id']}",
            "user_id": current_user["id"],
            "plan_id": admin_assigned_tier,
            "billing_cycle": "annual",
            "status": "active",
            "source": "admin_override",
            "current_period_start": datetime.now(timezone.utc).isoformat(),
            "current_period_end": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        }
        has_active_sub = True

    # User has access if: beta mode OR per-user beta OR free override OR active subscription OR trial active
    has_access = (
        platform_free_mode
        or is_beta
        or is_beta_tester
        or has_free_access
        or has_active_sub
        or trial.get("trial_active", False)
    )
    if platform_free_mode:
        is_grace = False
        is_dormant = False

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
    benefactor_id = None
    ben_estate = None  # hoisted: read by the response builder below
    if current_user.get("role") == "beneficiary":
        # Method 1: Check `beneficiaries` collection (user_id or email match)
        ben_link = await db.beneficiaries.find_one({"user_id": current_user["id"]}, {"_id": 0, "estate_id": 1})
        if not ben_link:
            ben_link = await db.beneficiaries.find_one({"email": current_user.get("email")}, {"_id": 0, "estate_id": 1})
        if ben_link and ben_link.get("estate_id"):
            ben_estate = await db.estates.find_one(
                {"id": ben_link["estate_id"]},
                {"_id": 0, "id": 1, "owner_id": 1, "status": 1, "verified_tier": 1},
            )
            benefactor_id = ben_estate.get("owner_id") if ben_estate else None

        # Method 2: Check estate.beneficiaries array (fallback)
        if not benefactor_id:
            ben_estate = await db.estates.find_one(
                {"beneficiaries": current_user["id"]},
                {"_id": 0, "id": 1, "owner_id": 1, "status": 1, "verified_tier": 1},
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
            # Source-of-truth precedence for the beneficiary's locked tier:
            #   1. Estate-level `verified_tier` — set by Founder via Admin →
            #      Users → Assign Tier. MUST take precedence; otherwise an
            #      admin grant on a benefactor estate would never surface
            #      on the beneficiary's own paywall, which is exactly the
            #      regression the user just reported.
            #   2. Benefactor's real `user_subscriptions` row.
            #   3. Benefactor's legacy `users.verified_tier` (rarely set).
            estate_admin_tier = (ben_estate or {}).get("verified_tier")
            if estate_admin_tier:
                beneficiary_locked_tier = plan_map.get(estate_admin_tier, "ben_base")
            elif ben_sub and ben_sub.get("plan_id"):
                beneficiary_locked_tier = plan_map.get(ben_sub["plan_id"], "ben_base")
            elif benefactor_user and benefactor_user.get("verified_tier"):
                beneficiary_locked_tier = plan_map.get(benefactor_user["verified_tier"], "ben_base")

            # ── Synthesize an active sub for the beneficiary so the
            # paywall lights up the ben_<tier> card as "Current Plan",
            # mirroring what the benefactor sees. Without this, the
            # beneficiary's paywall stays blank (no Current Plan badge)
            # even though the admin granted access — exactly the
            # regression the user reported on May 18, 2026.
            if not has_active_sub and beneficiary_locked_tier:
                sub = {
                    "id": f"beneficiary-locked-{ben_estate.get('id') if ben_estate else 'unknown'}",
                    "user_id": current_user["id"],
                    "plan_id": beneficiary_locked_tier,
                    "billing_cycle": "annual",
                    "status": "active",
                    "source": "estate_admin_tier" if estate_admin_tier else "benefactor_locked",
                    "current_period_start": datetime.now(timezone.utc).isoformat(),
                    "current_period_end": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
                }
                has_active_sub = True
                has_access = True

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

    # ── Optimistic checkout intent ───────────────────────────────────
    # If the user clicked "Subscribe" within the last 30 minutes,
    # `/subscriptions/checkout` wrote an intent row that we surface
    # here so the SubscriptionPage can render the chosen tile with a
    # "Processing payment…" overlay while we wait for the webhook or
    # the user's return to /subscription. The intent is cleared
    # automatically when activation lands or after 30 minutes (TTL).
    # We only surface it when there's no active sub for the same plan
    # already (else it would shadow the real active tile).
    pending_intent = None
    if not has_active_sub:
        intent_doc = await db.subscription_intents.find_one(
            {"user_id": current_user["id"]},
            {"_id": 0, "plan_id": 1, "plan_name": 1, "billing_cycle": 1, "session_id": 1, "created_at": 1},
        )
        if intent_doc:
            pending_intent = intent_doc

    return {
        "subscription": sub,
        "trial": trial,
        "beta_mode": is_beta,
        "platform_free_mode": platform_free_mode,
        "ai_burn_guard_enabled": ai_burn_guard_enabled,
        "is_beta_tester": is_beta_tester,
        "beta_accepted": bool((user_doc or {}).get("beta_accepted_at")),
        "free_access": platform_free_mode or is_beta or is_beta_tester or has_free_access,
        "custom_discount": override.get("custom_discount", 0) if override else 0,
        "has_active_subscription": has_access,
        "needs_subscription": not has_access,
        # Post-trial SDV-only lockdown (founder rule, Aug 2026): expired
        # trial + no sub/overrides → only the Secure Document Vault stays
        # usable. Drives the persistent banner + greyed feature buttons;
        # middleware_subscription_lock.py is the fail-closed API twin.
        "sdv_only_lockdown": bool(not has_access and (user_doc or {}).get("role", "") == "benefactor"),
        "is_grace_period": bool(is_grace),
        "grace_period_end": sub.get("grace_period_end") if is_grace else None,
        "is_dormant": bool(is_dormant),
        "dormant_since": sub.get("dormant_since") if is_dormant else None,
        "pending_intent": pending_intent,
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
        # Top-level admin attribution — always set whenever the founder
        # has assigned a tier to this user's estate (benefactor) or the
        # benefactor's estate (beneficiary). Read by the paywall to
        # render "Granted by Founder" on the matching plan card even
        # when the user ALSO has a real/beta active sub covering the
        # same tier. Independent of `subscription.source` so paid
        # customers don't lose the attribution.
        "admin_granted_tier": (
            admin_assigned_tier
            if admin_assigned_tier
            # For beneficiaries: surface the benefactor's
            # admin-granted tier (mapped to ben_<tier>) so the
            # paywall shows attribution there too.
            else (
                beneficiary_locked_tier
                if (
                    current_user.get("role") == "beneficiary" and ben_estate and (ben_estate.get("verified_tier") or "")  # noqa: E501
                )
                else None
            )
        ),
    }
