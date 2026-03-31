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
    """Build the default feature gates: every feature ON for every tier."""
    return {f["key"]: {tid: True for tid in TIER_IDS} for f in PLATFORM_FEATURES}


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
async def get_user_enabled_features(current_user: dict = Depends(get_current_user)):
    """Return list of feature keys enabled for the current user's tier.

    Feature gates are a VISIBILITY decision, not a payment decision.
    Per-user beta access / free overrides / trial control whether users pay.
    Feature gates control what users can SEE.  These are orthogonal.
    Therefore: per-user beta, free_access, trial do NOT bypass feature gates.
    """

    # Admin / operator → everything
    if current_user.get("role") in ("admin", "operator"):
        return {"enabled_features": FEATURE_KEYS, "all_enabled": True}

    # Determine the user's effective tier (subscription > verified_tier)
    effective_tier = None
    sub = await db.user_subscriptions.find_one({"user_id": current_user["id"]}, {"_id": 0})

    if sub and sub.get("status") in ("active", "past_due"):
        effective_tier = sub.get("plan_id")

    # Fallback: check verified_tier on user document
    if not effective_tier:
        user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "verified_tier": 1})
        if user_doc and user_doc.get("verified_tier"):
            effective_tier = user_doc["verified_tier"]

    if sub and sub.get("status") in ("active", "past_due"):
        effective_tier = sub.get("plan_id")

    # Beneficiary post-transition: use benefactor's tier
    if current_user.get("role") == "beneficiary":
        benefactor_tier = await _get_benefactor_tier(current_user)
        if benefactor_tier:
            effective_tier = benefactor_tier

    # No tier determined → all features (paywall handles access control)
    if not effective_tier:
        return {"enabled_features": FEATURE_KEYS, "all_enabled": True}

    gates = await get_feature_gates()
    enabled = get_enabled_features_for_tier(gates, effective_tier)
    return {"enabled_features": enabled, "all_enabled": len(enabled) == len(FEATURE_KEYS)}


async def _get_benefactor_tier(current_user: dict) -> str | None:
    """For a beneficiary, find the benefactor's subscription tier."""
    ben_link = await db.beneficiaries.find_one({"user_id": current_user["id"]}, {"_id": 0, "id": 1, "estate_id": 1})
    if not ben_link:
        ben_link = await db.beneficiaries.find_one(
            {"email": current_user.get("email")}, {"_id": 0, "id": 1, "estate_id": 1}
        )
    if not ben_link or not ben_link.get("estate_id"):
        return None

    estate = await db.estates.find_one({"id": ben_link["estate_id"]}, {"_id": 0, "id": 1, "owner_id": 1, "status": 1})
    if not estate:
        return None

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
