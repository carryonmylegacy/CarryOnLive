"""CarryOn™ Backend — Estate Routes"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from models import Estate, EstateCreate, EstateUpdate
from services.encryption import generate_estate_salt
from services.readiness import calculate_estate_readiness, ensure_default_checklist
from utils import get_current_user, log_activity

router = APIRouter()

# ===================== ESTATE ROUTES =====================


@router.get("/estates")
async def get_estates(current_user: dict = Depends(get_current_user)):
    """List all estates for the current user."""
    if current_user["role"] == "benefactor":
        estates = await db.estates.find(
            {"owner_id": current_user["id"]}, {"_id": 0}
        ).to_list(100)
    elif current_user["role"] == "beneficiary":
        estates = await db.estates.find(
            {"beneficiaries": current_user["id"]}, {"_id": 0}
        ).to_list(100)
        # Enrich with benefactor photo for display (check for beneficiary override first)
        for estate in estates:
            override = await db.beneficiary_display_overrides.find_one(
                {"user_id": current_user["id"], "estate_id": estate["id"]},
                {"_id": 0, "owner_photo_url": 1},
            )
            if override and override.get("owner_photo_url"):
                estate["owner_photo_url"] = override["owner_photo_url"]
            else:
                owner = await db.users.find_one(
                    {"id": estate.get("owner_id")}, {"_id": 0, "photo_url": 1}
                )
                if owner and owner.get("photo_url"):
                    estate["owner_photo_url"] = owner["photo_url"]
    else:  # admin
        estates = await db.estates.find({}, {"_id": 0}).to_list(100)
    return estates


@router.get("/beneficiary/family-connections")
async def get_family_connections(current_user: dict = Depends(get_current_user)):
    """Get all family connections for a beneficiary with relationship data for orbit visualization"""
    if current_user["role"] != "beneficiary":
        raise HTTPException(
            status_code=403, detail="Only beneficiaries can access family connections"
        )

    # Find all beneficiary records for this user (to get relationship info)
    beneficiary_records = await db.beneficiaries.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).to_list(100)

    connections = []
    for ben_record in beneficiary_records:
        # Get the estate
        estate = await db.estates.find_one({"id": ben_record["estate_id"]}, {"_id": 0})
        if not estate:
            continue

        # Get the benefactor (estate owner)
        benefactor = await db.users.find_one(
            {"id": estate.get("owner_id")}, {"_id": 0, "password": 0}
        )
        if not benefactor:
            continue

        # Check for beneficiary display override (beneficiary-side only, never touches benefactor)
        override = await db.beneficiary_display_overrides.find_one(
            {"user_id": current_user["id"], "estate_id": estate["id"]},
            {"_id": 0, "owner_photo_url": 1},
        )
        display_photo = (
            override.get("owner_photo_url", "")
            if override and override.get("owner_photo_url")
            else benefactor.get("photo_url", "")
        )

        # Combine estate and relationship info
        connections.append(
            {
                "id": estate["id"],
                "estate_id": estate["id"],
                "name": benefactor.get("name", "Unknown"),
                "first_name": benefactor.get("first_name"),
                "last_name": benefactor.get("last_name"),
                "relation": ben_record.get("relation", "Other"),
                "status": estate.get("status", "pre-transition"),
                "readiness_score": estate.get("readiness_score", 0),
                "benefactor_id": benefactor.get("id"),
                "photo_url": display_photo,
            }
        )

    return connections


class DisplayOverrideUpdate(BaseModel):
    estate_id: str
    owner_photo_url: str


@router.put("/beneficiary/display-override")
async def update_display_override(
    data: DisplayOverrideUpdate, current_user: dict = Depends(get_current_user)
):
    """Beneficiary sets a display override for how they see a benefactor's photo.
    This NEVER modifies the benefactor's actual data — it's stored separately
    in beneficiary_display_overrides and only affects the beneficiary's view."""
    if current_user["role"] != "beneficiary":
        raise HTTPException(
            status_code=403, detail="Only beneficiaries can set display overrides"
        )

    # Verify this user is actually a beneficiary of this estate
    estate = await db.estates.find_one({"id": data.estate_id}, {"_id": 0})
    if not estate or current_user["id"] not in (estate.get("beneficiaries") or []):
        raise HTTPException(status_code=403, detail="Not a beneficiary of this estate")

    await db.beneficiary_display_overrides.update_one(
        {"user_id": current_user["id"], "estate_id": data.estate_id},
        {
            "$set": {
                "user_id": current_user["id"],
                "estate_id": data.estate_id,
                "owner_photo_url": data.owner_photo_url,
            }
        },
        upsert=True,
    )
    return {"success": True}


@router.get("/estates/{estate_id}")
async def get_estate(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single estate by ID."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Check access
    if (
        current_user["role"] == "benefactor"
        and estate["owner_id"] != current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Access denied")
    if (
        current_user["role"] == "beneficiary"
        and current_user["id"] not in estate["beneficiaries"]
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    return estate


@router.post("/beneficiary/become-benefactor")
async def beneficiary_become_benefactor(current_user: dict = Depends(get_current_user)):
    """Upgrade a beneficiary account to also function as a benefactor.
    Creates their estate and updates their role. They retain all beneficiary access."""
    import uuid
    from datetime import datetime, timezone

    if current_user["role"] != "beneficiary":
        raise HTTPException(status_code=400, detail="Already a benefactor")

    # Check if they already own an estate (shouldn't happen, but guard)
    existing = await db.estates.find_one(
        {"owner_id": current_user["id"]}, {"_id": 0, "id": 1}
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already have an estate")

    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    last_name = user.get(
        "last_name", user.get("name", "").split()[-1] if user.get("name") else "Family"
    )

    # Create estate
    estate_id = str(uuid.uuid4())
    estate = {
        "id": estate_id,
        "owner_id": current_user["id"],
        "name": f"{last_name} Family Estate",
        "status": "pre-transition",
        "beneficiaries": [],
        "encryption_salt": generate_estate_salt().hex(),
        "created_at": now.isoformat(),
    }
    await db.estates.insert_one(estate)

    # Upgrade role to benefactor (they keep beneficiary access through estate.beneficiaries links)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"role": "benefactor"}},
    )

    # Seed default checklist
    default_checklist = [
        {
            "id": str(uuid.uuid4()),
            "estate_id": estate_id,
            "title": "Call your designated executor — they have instructions",
            "category": "immediate",
            "priority": "critical",
            "order": 1,
            "is_default": True,
            "created_at": now.isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "estate_id": estate_id,
            "title": "Contact employer HR to report the death and ask about benefits",
            "category": "immediate",
            "priority": "critical",
            "order": 2,
            "is_default": True,
            "created_at": now.isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "estate_id": estate_id,
            "title": "Request 10 certified copies of the death certificate",
            "category": "immediate",
            "priority": "high",
            "order": 3,
            "is_default": True,
            "created_at": now.isoformat(),
        },
    ]
    await db.checklists.insert_many(default_checklist)

    return {
        "success": True,
        "estate_id": estate_id,
        "message": "Your estate has been created. You are now a benefactor.",
    }


@router.post("/estates")
async def create_estate(
    data: EstateCreate, current_user: dict = Depends(get_current_user)
):
    """Create a new estate."""
    if current_user["role"] != "benefactor":
        raise HTTPException(
            status_code=403, detail="Only benefactors can create estates"
        )

    estate = Estate(owner_id=current_user["id"], name=data.name)
    estate_dict = estate.model_dump()
    # Generate per-estate encryption salt for AES-256-GCM
    estate_dict["encryption_salt"] = generate_estate_salt().hex()
    await db.estates.insert_one(estate_dict)

    # Log activity
    await log_activity(
        estate_id=estate.id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="estate_created",
        description=f"Created estate: {data.name}",
    )

    # Create default checklist items for new estate
    await ensure_default_checklist(estate.id)

    return estate


@router.patch("/estates/{estate_id}")
async def update_estate(
    estate_id: str, data: EstateUpdate, current_user: dict = Depends(get_current_user)
):
    """Update an existing estate."""
    if current_user["role"] != "benefactor":
        raise HTTPException(
            status_code=403, detail="Only benefactors can update estates"
        )

    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    if estate["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = {}
    if data.name:
        update_data["name"] = data.name
    if data.description:
        update_data["description"] = data.description
    if data.state is not None:
        update_data["state"] = data.state

    if update_data:
        await db.estates.update_one({"id": estate_id}, {"$set": update_data})
        await log_activity(
            estate_id=estate_id,
            user_id=current_user["id"],
            user_name=current_user["name"],
            action="estate_updated",
            description="Updated estate settings",
        )

    return {"message": "Estate updated"}


@router.delete("/estates/{estate_id}")
async def delete_estate(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an estate and all associated data."""
    if current_user["role"] != "benefactor":
        raise HTTPException(
            status_code=403, detail="Only benefactors can delete estates"
        )

    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    if estate["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Delete all related data
    await db.documents.delete_many({"estate_id": estate_id})
    await db.messages.delete_many({"estate_id": estate_id})
    await db.beneficiaries.delete_many({"estate_id": estate_id})
    await db.checklists.delete_many({"estate_id": estate_id})
    await db.activity_logs.delete_many({"estate_id": estate_id})
    await db.estates.delete_one({"id": estate_id})

    return {"message": "Estate deleted"}


# ===================== READINESS SCORE ROUTES =====================


@router.get("/estate/{estate_id}/readiness")
async def get_estate_readiness(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
    """Get detailed estate readiness score breakdown"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Ensure default checklist exists
    await ensure_default_checklist(estate_id)

    # Calculate fresh readiness
    result = await calculate_estate_readiness(estate_id)

    # Persist updated score
    await db.estates.update_one(
        {"id": estate_id},
        {
            "$set": {
                "readiness_score": result["overall_score"],
                "readiness_breakdown": {
                    "documents": result["documents"],
                    "messages": result["messages"],
                    "checklist": result["checklist"],
                },
            }
        },
    )

    return result


@router.post("/estate/{estate_id}/readiness")
async def recalculate_estate_readiness(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
    """Recalculate and return estate readiness score"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    await ensure_default_checklist(estate_id)
    result = await calculate_estate_readiness(estate_id)

    await db.estates.update_one(
        {"id": estate_id},
        {
            "$set": {
                "readiness_score": result["overall_score"],
                "readiness_breakdown": {
                    "documents": result["documents"],
                    "messages": result["messages"],
                    "checklist": result["checklist"],
                },
            }
        },
    )

    return result


# ===================== ACTIVITY LOG ROUTES =====================


@router.get("/activity/{estate_id}")
async def get_activity_log(
    estate_id: str, limit: int = 50, current_user: dict = Depends(get_current_user)
):
    """Get activity log for an estate"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Check access
    if (
        current_user["role"] == "benefactor"
        and estate["owner_id"] != current_user["id"]
    ):
        raise HTTPException(status_code=403, detail="Access denied")
    if current_user["role"] == "beneficiary" and current_user["id"] not in estate.get(
        "beneficiaries", []
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    activities = (
        await db.activity_logs.find({"estate_id": estate_id}, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
        .to_list(limit)
    )

    return activities
