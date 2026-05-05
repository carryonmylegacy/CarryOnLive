"""CarryOn™ — Beneficiary Section Permissions

Controls what sections each beneficiary can access post-transition.
Benefactors configure these while alive; primary beneficiary inherits management after TVT approval.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
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
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Only benefactor (owner), admin, or a beneficiary of this estate can read
    is_owner = estate.get("owner_id") == current_user["id"]
    is_admin = current_user.get("role") == "admin"
    is_beneficiary = current_user["id"] in (estate.get("beneficiaries") or [])
    if not (is_owner or is_admin or is_beneficiary):
        raise HTTPException(status_code=403, detail="Not authorized")

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
    # Find the beneficiary record for this user
    ben = await db.beneficiaries.find_one({"estate_id": estate_id, "user_id": current_user["id"]}, {"_id": 0})
    if not ben:
        raise HTTPException(status_code=404, detail="Not a beneficiary of this estate")

    # Authoritative check: an approved death certificate MUST exist for transition access.
    # Never trust estate.status alone — it can get out of sync.
    approved_cert = await db.death_certificates.find_one(
        {"estate_id": estate_id, "status": {"$in": ["approved", "authenticated"]}},
        {"_id": 0, "id": 1},
    )
    is_transitioned = bool(approved_cert)

    perms = await db.section_permissions.find_one({"estate_id": estate_id, "beneficiary_id": ben["id"]}, {"_id": 0})
    sections = perms["sections"] if perms else {s: True for s in ALL_SECTIONS}

    # Benefactor-set feature access flags (stored on the beneficiary record).
    # `bec_access` is computed dynamically (Premium-tier-only AI feature)
    # rather than per-beneficiary toggle: it gates the post-transition
    # Beneficiary Estate Concierge tile in the dashboard. The hard gate
    # still runs server-side in routes/beneficiary_concierge.py.
    feature_access = {
        "mm_access": ben.get("mm_access", True),
        "ega_access": ben.get("ega_access", True),
        "sdv_access": ben.get("sdv_access", True),
        "iac_access": ben.get("iac_access", True),
        "ffn_access": ben.get("ffn_access", True),
        "dav_access": ben.get("dav_access", True),
        "dts_access": ben.get("dts_access", True),
        "cfp_access": ben.get("cfp_access", True),
    }
    # Resolve BEC availability via the global feature_gates matrix.
    # The tile shows whenever the benefactor's tier has BEC enabled —
    # both pre- AND post-transition (per founder's May 5, 2026
    # directive). Pre-transition the page renders an empty-state if
    # no documents have been shared yet; post-transition it renders
    # the full chat. Tier-disabled = tile fully hidden in nav.
    # The hard gate still runs server-side in
    # routes/beneficiary_concierge.py.
    try:
        from routes.feature_gates import get_feature_gates

        estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1})
        owner_id = estate.get("owner_id") if estate else None
        owner = (
            await db.users.find_one({"id": owner_id}, {"_id": 0, "id": 1, "subscription_tier": 1, "plan": 1})
            if owner_id
            else None
        )
        tier = (owner or {}).get("subscription_tier") or (owner or {}).get("plan") or "base"
        gates = await get_feature_gates()
        feature_access["bec_access"] = bool((gates.get("bec") or {}).get(tier, False))
    except Exception:
        feature_access["bec_access"] = False

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
        primary_ben = await db.beneficiaries.find_one(
            {"estate_id": estate_id, "is_primary": True, "user_id": current_user["id"]},
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
