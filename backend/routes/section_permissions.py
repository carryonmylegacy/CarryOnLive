"""CarryOn™ — Beneficiary Section Permissions

Controls what sections each beneficiary can access post-transition.
Benefactors configure these while alive; primary beneficiary inherits management after TVT approval.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from services.access_control import require_estate_actor, resolve_estate_actor
from utils import get_current_user

router = APIRouter()

# All gatable estate sections
ALL_SECTIONS = [
    "vault",
    "messages",
    "checklist",
    "guardian",
    "digital_wallet",
    "timeline",
    "financial_portal",
]


class SectionPermissionsUpdate(BaseModel):
    beneficiary_id: str
    sections: dict  # e.g. {"vault": true, "messages": false, ...}


@router.get("/estate/{estate_id}/section-permissions")
async def get_estate_section_permissions(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get section permissions for all beneficiaries of an estate."""
    actor = await require_estate_actor(estate_id, current_user)
    if not (actor.get("is_owner") or actor.get("is_admin") or actor.get("is_primary_beneficiary")):
        raise HTTPException(
            status_code=403, detail="Only the estate owner or primary beneficiary can view all permissions"
        )

    beneficiaries = await db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)

    result = []
    for ben in beneficiaries:
        perms = await db.section_permissions.find_one({"estate_id": estate_id, "beneficiary_id": ben["id"]}, {"_id": 0})
        sections = perms["sections"] if perms else {s: True for s in ALL_SECTIONS}
        result.append(
            {
                "beneficiary_id": ben["id"],
                "name": ben.get("name", ""),
                "is_primary": ben.get("is_primary", False),
                "sections": sections,
            }
        )

    return result


@router.get("/beneficiary/my-permissions/{estate_id}")
async def get_my_section_permissions(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get the current beneficiary's section permissions for an estate."""
    # Resolve via the canonical estate actor so an UNVERIFIED / freshly-changed
    # email can never be used to inherit a victim's beneficiary record
    # (resolve_estate_actor only trusts current_user.email when email_verified).
    actor = await resolve_estate_actor(estate_id, current_user)
    if not actor["is_beneficiary"]:
        raise HTTPException(status_code=404, detail="Not a beneficiary of this estate")
    ben = (actor.get("beneficiary_records") or [{}])[0]

    # Authoritative check: an approved death certificate MUST exist for transition access.
    # Never trust estate.status alone — it can get out of sync.
    approved_cert = await db.death_certificates.find_one(
        {"estate_id": estate_id, "status": {"$in": ["approved", "authenticated"]}},
        {"_id": 0, "id": 1},
    )
    is_transitioned = bool(approved_cert)

    perms = await db.section_permissions.find_one({"estate_id": estate_id, "beneficiary_id": ben.get("id")}, {"_id": 0})
    sections = perms["sections"] if perms else {s: True for s in ALL_SECTIONS}

    # Tier inheritance rule (May 5, 2026, founder-mandated): the
    # beneficiary's UX visibility is determined by the BENEFACTOR'S
    # subscription tier — never the beneficiary's own tier (which
    # they can't choose anyway). Each *_access flag here is the AND
    # of (a) the per-beneficiary toggle the benefactor set, and
    # (b) whether the benefactor's tier has that feature enabled
    # in the global feature_gates matrix. This is the single
    # filtration point read by Sidebar / MobileNav / Beneficiary
    # Dashboard tiles, so getting it right here cleans up every
    # surface in one shot.
    try:
        from routes.feature_gates import _get_benefactor_tier, get_feature_gates

        gates = await get_feature_gates()
        tier = await _get_benefactor_tier(current_user=current_user, estate_id=estate_id) or "base"
    except Exception:
        gates = {}
        tier = "base"

    def _tier_has(feature_key: str) -> bool:
        # If gates couldn't load or feature missing → fail closed.
        return bool((gates.get(feature_key) or {}).get(tier, False))

    # *_access keys map 1:1 to feature_keys in PLATFORM_FEATURES so the
    # AND-with-tier just walks that map. New features added later
    # only need a row in this dict to inherit the same rule.
    PER_BEN_ACCESS_MAP = {
        "mm_access": "mm",
        "ega_access": "ega",
        "sdv_access": "sdv",
        "iac_access": "iac",
        "ffn_access": "ffn",
        "dav_access": "dav",
        "dts_access": "dts",
        "cfp_access": "cfp",
    }
    feature_access = {
        access_key: bool(ben.get(access_key, True)) and _tier_has(feature_key)
        for access_key, feature_key in PER_BEN_ACCESS_MAP.items()
    }
    # BEC has no per-beneficiary toggle — it's a tier-only AI feature.
    # The hard server-side gate also runs in routes/beneficiary_concierge.py.
    feature_access["bec_access"] = _tier_has("bec")

    return {
        "is_transitioned": is_transitioned,
        "is_primary": ben.get("is_primary", False),
        "sections": sections,
        "feature_access": feature_access,
    }


@router.put("/estate/{estate_id}/section-permissions")
async def update_section_permissions(
    estate_id: str,
    data: SectionPermissionsUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update section permissions for a beneficiary.
    Pre-transition: only the benefactor (estate owner) can update.
    Post-transition: only the primary beneficiary can update."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    is_transitioned = estate.get("status") == "transitioned"
    # Double-check with authoritative certificate lookup
    if is_transitioned:
        approved_cert = await db.death_certificates.find_one(
            {"estate_id": estate_id, "status": {"$in": ["approved", "authenticated"]}},
            {"_id": 0, "id": 1},
        )
        is_transitioned = bool(approved_cert)
    is_owner = estate.get("owner_id") == current_user["id"]
    is_admin = current_user.get("role") == "admin"

    if is_transitioned:
        # Post-transition: only primary beneficiary or admin
        beneficiary_link_or = [{"user_id": current_user["id"]}]
        if current_user.get("email"):
            beneficiary_link_or.append({"email": current_user["email"].lower().strip()})
        primary_ben = await db.beneficiaries.find_one(
            {"estate_id": estate_id, "is_primary": True, "$or": beneficiary_link_or},
            {"_id": 0},
        )
        if not primary_ben and not is_admin:
            raise HTTPException(
                status_code=403,
                detail="Only the primary beneficiary can manage permissions after transition",
            )
    else:
        # Pre-transition: only owner or admin
        if not is_owner and not is_admin:
            raise HTTPException(status_code=403, detail="Only the estate owner can set permissions")

    # Validate sections
    clean_sections = {s: bool(data.sections.get(s, True)) for s in ALL_SECTIONS}

    now = datetime.now(timezone.utc).isoformat()
    await db.section_permissions.update_one(
        {"estate_id": estate_id, "beneficiary_id": data.beneficiary_id},
        {
            "$set": {
                "estate_id": estate_id,
                "beneficiary_id": data.beneficiary_id,
                "sections": clean_sections,
                "updated_by": current_user["id"],
                "updated_at": now,
            }
        },
        upsert=True,
    )

    return {"success": True, "sections": clean_sections}
