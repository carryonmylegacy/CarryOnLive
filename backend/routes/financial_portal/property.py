"""Financial Portal — Property Assets: CRUD."""

from ._core import (
    router,
    _verify_estate_access,
    _filter_for_actor,
    _resolve_financial_actor,
    PropertyAssetCreate,
    PropertyAssetUpdate,
)
from fastapi import Depends, HTTPException
from utils import get_current_user
from config import db
from datetime import datetime, timezone
import uuid


@router.get("/financial/property/{estate_id}")
async def get_property_assets(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all property assets for an estate."""
    actor = await _resolve_financial_actor(estate_id, current_user)
    estate = actor["estate"]
    is_owner = actor["is_owner"] or actor["is_admin"]
    items = await db.property_assets.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        items = _filter_for_actor(
            items,
            actor,
            is_transitioned,
            cfp_pre_transition_visible=estate.get("cfp_pre_transition_visible", False),
        )
    return items


@router.post("/financial/property")
async def create_property_asset(data: PropertyAssetCreate, current_user: dict = Depends(get_current_user)):
    """Create a new property asset."""
    await _verify_estate_access(data.estate_id, current_user, require_owner=True)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        **data.model_dump(),
        "deleted_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.property_assets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/financial/property/{property_id}")
async def update_property_asset(
    property_id: str, data: PropertyAssetUpdate, current_user: dict = Depends(get_current_user)
):
    """Update a property asset."""
    prop = await db.property_assets.find_one({"id": property_id, "deleted_at": None}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property asset not found")
    await _verify_estate_access(prop["estate_id"], current_user, require_owner=True)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.property_assets.update_one({"id": property_id}, {"$set": updates})
    return {"success": True}


@router.delete("/financial/property/{property_id}")
async def delete_property_asset(
    property_id: str,
    delete_dav: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """Soft-delete a property asset; optionally cascade the linked DAV entry."""
    prop = await db.property_assets.find_one({"id": property_id, "deleted_at": None}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property asset not found")
    await _verify_estate_access(prop["estate_id"], current_user, require_owner=True)
    now = datetime.now(timezone.utc).isoformat()
    await db.property_assets.update_one({"id": property_id}, {"$set": {"deleted_at": now}})
    dav_id = prop.get("dav_entry_id")
    if delete_dav and dav_id:
        await db.digital_wallet.update_one(
            {"id": dav_id, "estate_id": prop["estate_id"], "deleted_at": None},
            {"$set": {"deleted_at": now}},
        )
    return {"success": True, "dav_deleted": bool(delete_dav and dav_id)}


# ===================== BILL PAYMENTS (Mark as Paid) =====================
