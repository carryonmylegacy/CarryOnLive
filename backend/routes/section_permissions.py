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
]


class SectionPermissionsUpdate(BaseModel):
    beneficiary_id: str
    sections: dict  # e.g. {"vault": true, "messages": false, ...}


@router.get("/estate/{estate_id}/section-permissions")
async def get_estate_section_permissions(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
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

    beneficiaries = await db.beneficiaries.find(
        {"estate_id": estate_id}, {"_id": 0}
    ).to_list(100)

    result = []
    for ben in beneficiaries:
        perms = await db.section_permissions.find_one(
            {"estate_id": estate_id, "beneficiary_id": ben["id"]}, {"_id": 0}
        )
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
async def get_my_section_permissions(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
    """Get the current beneficiary's section permissions for an estate."""
    # Find the beneficiary record for this user
    ben = await db.beneficiaries.find_one(
        {"estate_id": estate_id, "user_id": current_user["id"]}, {"_id": 0}
    )
    if not ben:
        raise HTTPException(status_code=404, detail="Not a beneficiary of this estate")

    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    is_transitioned = estate and estate.get("status") == "transitioned"

    perms = await db.section_permissions.find_one(
        {"estate_id": estate_id, "beneficiary_id": ben["id"]}, {"_id": 0}
    )
    sections = perms["sections"] if perms else {s: True for s in ALL_SECTIONS}

    return {
        "is_transitioned": is_transitioned,
        "is_primary": ben.get("is_primary", False),
        "sections": sections,
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
            raise HTTPException(
                status_code=403, detail="Only the estate owner can set permissions"
            )

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
