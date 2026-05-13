"""CarryOn™ Backend — Feature Gating System

Admin-controlled per-tier feature visibility.
Features can be toggled on/off per subscription tier.
When a feature is toggled off for a tier, it is hidden from the
entire UX for users on that tier: navigation, dashboard, and API access.

Core features (MM, SDV, IAC) default to ON for every tier.
All other features default to ON but are treated as explicitly toggled.
Future new features should default to OFF.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from config import db
from guards import require_admin
from utils import get_current_user

router = APIRouter()

# ─── Feature registry ──────────────────────────────────────────
# key: internal identifier used in gates map and frontend routing
# label: human-readable name shown in admin UI
# route: frontend route path (used for nav filtering)
# core: if True, defaults to ON for every tier (MM / SDV / IAC)

PLATFORM_FEATURES = [
    {"key": "beneficiaries", "label": "Beneficiaries", "route": "/beneficiaries", "core": False},
    {"key": "mm", "label": "Milestone Messages (MM)", "route": "/messages", "core": True},
    {"key": "iac", "label": "Immediate Action Checklist (IAC)", "route": "/checklist", "core": True},
    {"key": "sdv", "label": "Secure Document Vault (SDV)", "route": "/vault", "core": True},
    {"key": "ega", "label": "Estate Guardian AI (EGA)", "route": "/guardian", "core": False},
    {"key": "ffn", "label": "Family & Friends Notification (FFN)", "route": "/ffn", "core": False},
    {"key": "dav", "label": "Digital Access Vault (DAV)", "route": "/digital-wallet", "core": False},
    {"key": "dts", "label": "Designated Trustee Services (DTS)", "route": "/trustee", "core": False},
    {"key": "timeline", "label": "Estate Plan Timeline", "route": "/timeline", "core": False},
    {"key": "ect", "label": "Estate Comms (ECT)", "route": "/estate-chat", "core": False, "default_off": True},
    {
        "key": "ccp",
        "label": "CarryOn Contingency Protocols (CCP)",
        "route": "/connected-protocol",
        "core": False,
        "default_off": True,
    },
    {
        "key": "cfp",
        "label": "Financial Picture (CFP)",
        "route": "/financial",
        "core": False,
        "default_off": True,
    },
    {
        # Beneficiary Estate Concierge AI — POST-transition AI for the
        # beneficiary side. Reads ONLY the documents the beneficiary has
        # been granted access to, and answers questions like "what did
        # mom want for the house?" Distinct from EGA (which is a
        # benefactor-side estate-law gap analyzer). Default OFF for
        # every tier; founder enables it for Premium (and any other
        # tier they choose) via Admin → Subs → Feature Gates.
        "key": "bec",
        "label": "Beneficiary Estate Concierge AI (BEC)",
        "route": "/beneficiary/concierge",
        "core": False,
        "default_off": True,
    },
]

FEATURE_KEYS = [f["key"] for f in PLATFORM_FEATURES]

# All benefactor tier IDs from DEFAULT_PLANS
TIER_IDS = [
    "premium",
    "standard",
    "base",
    "new_adult",
    "military",
    "hospice",
    "veteran",
    "enterprise",
]


def _build_default_gates() -> dict:
    """Build the default feature gates: every feature ON for every tier, except default_off features."""
    return {f["key"]: {tid: not f.get("default_off", False) for tid in TIER_IDS} for f in PLATFORM_FEATURES}


async def get_feature_gates() -> dict:
    """Load feature gates from DB, falling back to defaults if not set."""
    settings = await db.subscription_settings.find_one({"_id": "global"}, {"_id": 0})
    gates = (settings or {}).get("feature_gates")
    if not gates:
        gates = _build_default_gates()
        await db.subscription_settings.update_one(
            {"_id": "global"},
            {"$set": {"feature_gates": gates}},
            upsert=True,
        )
    else:
        # Ensure any new features added to code are present with defaults
        changed = False
        for f in PLATFORM_FEATURES:
            if f["key"] not in gates:
                # New features default to OFF for all tiers
                gates[f["key"]] = {tid: False for tid in TIER_IDS}
                changed = True
            else:
                # Ensure any new tiers added to code are present
                for tid in TIER_IDS:
                    if tid not in gates[f["key"]]:
                        gates[f["key"]][tid] = True
                        changed = True
        if changed:
            await db.subscription_settings.update_one(
                {"_id": "global"},
                {"$set": {"feature_gates": gates}},
            )
    return gates


def get_enabled_features_for_tier(gates: dict, tier_id: str) -> list[str]:
    """Return list of feature keys enabled for a specific tier."""
    enabled = []
    for key in FEATURE_KEYS:
        tier_gates = gates.get(key, {})
        if tier_gates.get(tier_id, True):
            enabled.append(key)
    return enabled


# ─── Admin API ──────────────────────────────────────────────────


@router.get("/admin/feature-gates")
async def get_admin_feature_gates(current_user: dict = Depends(require_admin)):
    """Return current feature gates config plus feature metadata."""
    gates = await get_feature_gates()
    return {
        "features": PLATFORM_FEATURES,
        "tiers": TIER_IDS,
        "gates": gates,
    }


@router.put("/admin/feature-gates")
async def publish_feature_gates(request: Request, current_user: dict = Depends(require_admin)):
    """Save & Publish feature gate changes (replaces live gates)."""
    data = await request.json()
    new_gates = data.get("gates")
    if not new_gates or not isinstance(new_gates, dict):
        raise HTTPException(status_code=400, detail="Invalid gates payload")

    # Validate structure
    for key in FEATURE_KEYS:
        if key not in new_gates:
            raise HTTPException(status_code=400, detail=f"Missing feature: {key}")
        if not isinstance(new_gates[key], dict):
            raise HTTPException(status_code=400, detail=f"Invalid gate for {key}")
        for tid in TIER_IDS:
            if tid not in new_gates[key]:
                raise HTTPException(status_code=400, detail=f"Missing tier {tid} in {key}")

    await db.subscription_settings.update_one(
        {"_id": "global"},
        {
            "$set": {
                "feature_gates": new_gates,
                "feature_gates_published_at": datetime.now(timezone.utc).isoformat(),
                "feature_gates_published_by": current_user.get("email", ""),
            }
        },
        upsert=True,
    )

    return {"success": True, "message": "Feature gates published"}


# ─── User-facing endpoint ──────────────────────────────────────


@router.get("/subscriptions/enabled-features")
async def get_user_enabled_features(
    estate_id: str = None,
    current_user: dict = Depends(get_current_user),
):
    """Return list of feature keys enabled for the current user's tier.

    Feature gates are a VISIBILITY decision, not a payment decision.
    Per-user beta access / free overrides / trial control whether users pay.
    Feature gates control what users can SEE.  These are orthogonal.

    Tier resolution order:
    1. Active subscription plan_id  (Stripe)
    2. Estate-level verified_tier   (admin-assigned, per-account)
    3. User-level verified_tier     (legacy fallback)
    4. No tier → fall back to "premium" so the published gates still apply.
       Prior behaviour ("all features enabled") let trial/demo/freshly-
       seeded accounts bypass the admin's published gates entirely.

    Admins/operators are NOT short-circuited: they must see the same
    gated navigation a real benefactor would, otherwise previewing the
    customer experience via "My Benefactor Portal" is impossible.
    Administrative routes remain protected by `require_admin`, so this
    has no effect on admin-panel access.
    """

    effective_tier = None

    # Tier inheritance rule (May 5, 2026, founder-mandated): when the
    # caller is viewing the platform AS A BENEFICIARY of someone
    # else's estate (estate_id supplied AND caller is not the owner
    # of that estate), the benefactor's tier is authoritative — the
    # caller's OWN subscription is irrelevant to what they see in
    # that beneficiary view. Beneficiaries cannot choose their tier.
    if estate_id:
        viewing_estate = await db.estates.find_one(
            {"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1, "verified_tier": 1}
        )
        if viewing_estate and viewing_estate.get("owner_id") and viewing_estate["owner_id"] != current_user["id"]:
            ben_link = await db.beneficiaries.find_one(
                {"estate_id": estate_id, "user_id": current_user["id"]},
                {"_id": 0, "id": 1},
            )
            if ben_link:
                effective_tier = await _get_benefactor_tier(current_user, estate_id)

    # 1. Check active subscription (own tier, only if not in a
    #    beneficiary-of-someone-else's-estate context)
    if not effective_tier:
        sub = await db.user_subscriptions.find_one({"user_id": current_user["id"]}, {"_id": 0})
        if sub and sub.get("status") in ("active", "past_due"):
            effective_tier = sub.get("plan_id")

    # 2. Check estate-level verified_tier
    if not effective_tier and estate_id:
        estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "verified_tier": 1})
        if estate and estate.get("verified_tier"):
            effective_tier = estate["verified_tier"]

    # 3. No estate_id supplied — find any owned estate with a tier
    if not effective_tier and not estate_id:
        user_estate = await db.estates.find_one(
            {"owner_id": current_user["id"], "verified_tier": {"$exists": True, "$ne": ""}},
            {"_id": 0, "id": 1, "verified_tier": 1},
        )
        if user_estate and user_estate.get("verified_tier"):
            effective_tier = user_estate["verified_tier"]

    # 4. Legacy: user-level verified_tier
    if not effective_tier:
        user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "verified_tier": 1})
        if user_doc and user_doc.get("verified_tier"):
            effective_tier = user_doc["verified_tier"]

    # Beneficiary post-transition: use the estate's tier
    if current_user.get("role") == "beneficiary" and not effective_tier:
        benefactor_tier = await _get_benefactor_tier(current_user, estate_id)
        if benefactor_tier:
            effective_tier = benefactor_tier

    if not effective_tier:
        # Nobody should bypass the published feature gates. If we can't
        # determine a tier from subscription, estate, or legacy user
        # record, fall back to the top tier ("premium") so the admin's
        # published gates are ALWAYS the source of truth for what's
        # visible. Trial / demo / freshly-seeded accounts previously
        # short-circuited to "all features enabled," which produced
        # ghost menu items for features that had been turned off for
        # every real tier. Paywall and per-route guards handle actual
        # access enforcement — this decides visibility only.
        effective_tier = "premium"

    gates = await get_feature_gates()
    enabled = get_enabled_features_for_tier(gates, effective_tier)

    # ─── B2B partner override (LIVE, single source of truth) ──────
    # When the user redeemed a white-label partner code during
    # signup, `user.partner_id` is set as the LINK to their partner
    # record. The actual gates are read LIVE from the
    # `b2b_partners` collection on every request — never from a
    # snapshot on the user. This guarantees that when an admin
    # toggles a feature for a partner in the Partners tab, ALL of
    # that partner's members see the change immediately. No drift.
    #
    # Backwards-compat: legacy users redeemed before live-read
    # rollout have a `partner_feature_gates` blob on their record.
    # That blob is now IGNORED — we always go to `b2b_partners`. If
    # the partner row has been deleted or deactivated, the user
    # falls back to their normal tier gates (no orphaned access).
    user_doc = await db.users.find_one(
        {"id": current_user["id"]},
        {"_id": 0, "id": 1, "partner_id": 1},
    )
    if user_doc and user_doc.get("partner_id"):
        partner_doc = await db.b2b_partners.find_one(
            {"id": user_doc["partner_id"], "active": True},
            {"_id": 0, "id": 1, "feature_gates": 1},
        )
        if partner_doc and isinstance(partner_doc.get("feature_gates"), dict):
            partner_gates = partner_doc["feature_gates"]
            enabled = [k for k in FEATURE_KEYS if partner_gates.get(k, False)]
            return {
                "enabled_features": enabled,
                "all_enabled": len(enabled) == len(FEATURE_KEYS),
                "partner_override": True,
            }
        # Partner inactive or deleted → silently fall through to
        # tier-based gates rather than locking the user out.

    return {"enabled_features": enabled, "all_enabled": len(enabled) == len(FEATURE_KEYS)}


async def _get_benefactor_tier(current_user: dict, estate_id: str = None) -> str | None:
    """For a beneficiary, find the benefactor estate's tier.

    Priority: estate.verified_tier > benefactor subscription > benefactor user.verified_tier
    """
    target_estate_id = estate_id

    if not target_estate_id:
        ben_link = await db.beneficiaries.find_one({"user_id": current_user["id"]}, {"_id": 0, "id": 1, "estate_id": 1})
        if not ben_link:
            ben_link = await db.beneficiaries.find_one(
                {"email": current_user.get("email")}, {"_id": 0, "id": 1, "estate_id": 1}
            )
        if not ben_link or not ben_link.get("estate_id"):
            return None
        target_estate_id = ben_link["estate_id"]

    estate = await db.estates.find_one(
        {"id": target_estate_id},
        {"_id": 0, "id": 1, "owner_id": 1, "verified_tier": 1},
    )
    if not estate:
        return None

    # Estate-level tier takes priority
    if estate.get("verified_tier"):
        return estate["verified_tier"]

    benefactor_id = estate.get("owner_id")
    if not benefactor_id:
        return None

    ben_sub = await db.user_subscriptions.find_one({"user_id": benefactor_id}, {"_id": 0, "id": 1, "plan_id": 1})
    if ben_sub and ben_sub.get("plan_id"):
        return ben_sub["plan_id"]

    benefactor_user = await db.users.find_one({"id": benefactor_id}, {"_id": 0, "id": 1, "verified_tier": 1})
    if benefactor_user and benefactor_user.get("verified_tier"):
        return benefactor_user["verified_tier"]

    return None
