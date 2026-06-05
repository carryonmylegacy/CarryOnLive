"""CarryOn™ Backend — Friends & Family Notification (FFN) Routes
A simple CRUD list of contacts the benefactor wants their beneficiaries to notify upon transition.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from utils import get_current_user
from services.access_control import resolve_estate_actor, beneficiary_can_view_ffn

router = APIRouter()


class FFNContactCreate(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    address: str = ""
    relationship: str = ""
    notes: str = ""


class FFNContactUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    relationship: str | None = None
    notes: str | None = None


@router.get("/ffn/{estate_id}")
async def get_ffn_contacts(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all FFN contacts for an estate.

    The roster (names, phones, emails) is benefactor-owned post-transition
    notification data — it is NOT visible to beneficiaries while the benefactor
    is alive (audit 05c1776 P1.1)."""
    actor = await resolve_estate_actor(estate_id, current_user)
    if not actor.get("is_estate_member") and not actor.get("is_staff"):
        raise HTTPException(status_code=403, detail="Access denied")
    if not beneficiary_can_view_ffn(actor):
        # A recognized estate member who isn't yet entitled to the FFN roster
        # (e.g. a pre-transition beneficiary) gets an empty list rather than a
        # hard 403, so the portal renders cleanly without leaking the roster.
        return []

    contacts = (
        await db.ffn_contacts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0})
        .sort("created_at", 1)
        .to_list(500)
    )
    return contacts


@router.post("/ffn/{estate_id}")
async def create_ffn_contact(estate_id: str, data: FFNContactCreate, current_user: dict = Depends(get_current_user)):
    """Add a new FFN contact."""
    from guards import get_subscription_access

    access = await get_subscription_access(current_user)
    if not access["has_access"]:
        raise HTTPException(status_code=403, detail="An active subscription is required to add FFN contacts.")

    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    if estate["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the estate owner can manage FFN contacts")

    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    now = datetime.now(timezone.utc)
    contact = {
        "id": str(uuid.uuid4()),
        "estate_id": estate_id,
        "name": data.name.strip(),
        "phone": data.phone.strip(),
        "email": data.email.strip(),
        "address": data.address.strip(),
        "relationship": data.relationship.strip(),
        "notes": data.notes.strip(),
        "created_at": now.isoformat(),
        "deleted_at": None,
    }
    await db.ffn_contacts.insert_one(contact)
    contact.pop("_id", None)
    return contact


@router.put("/ffn/{contact_id}")
async def update_ffn_contact(contact_id: str, data: FFNContactUpdate, current_user: dict = Depends(get_current_user)):
    """Update an existing FFN contact."""
    from guards import get_subscription_access

    access = await get_subscription_access(current_user)
    if not access["has_access"]:
        raise HTTPException(status_code=403, detail="An active subscription is required to edit FFN contacts.")

    contact = await db.ffn_contacts.find_one({"id": contact_id, "deleted_at": None}, {"_id": 0})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    estate = await db.estates.find_one({"id": contact["estate_id"]}, {"_id": 0, "id": 1, "owner_id": 1})
    if not estate or estate["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the estate owner can manage FFN contacts")

    update = {}
    for field in ("name", "phone", "email", "address", "relationship", "notes"):
        val = getattr(data, field)
        if val is not None:
            update[field] = val.strip()

    if update:
        await db.ffn_contacts.update_one({"id": contact_id}, {"$set": update})

    updated = await db.ffn_contacts.find_one({"id": contact_id}, {"_id": 0})
    return updated


@router.delete("/ffn/{contact_id}")
async def delete_ffn_contact(contact_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete an FFN contact."""
    contact = await db.ffn_contacts.find_one({"id": contact_id, "deleted_at": None}, {"_id": 0})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    estate = await db.estates.find_one({"id": contact["estate_id"]}, {"_id": 0, "id": 1, "owner_id": 1})
    if not estate or estate["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the estate owner can manage FFN contacts")

    now = datetime.now(timezone.utc)
    await db.ffn_contacts.update_one({"id": contact_id}, {"$set": {"deleted_at": now.isoformat()}})
    return {"success": True}
