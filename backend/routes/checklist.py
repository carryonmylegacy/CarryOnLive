"""CarryOn™ Backend — Checklist Routes (IAC — Immediate Action Checklist)"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from config import db
from models import ChecklistItem, ChecklistItemCreate, ChecklistItemUpdate
from utils import get_current_user, update_estate_readiness

router = APIRouter()

# ===================== BENEFACTOR CRUD =====================


@router.get("/checklists/{estate_id}")
async def get_checklists(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
    """Get all checklist items for an estate."""
    checklists = (
        await db.checklists.find(
            {"estate_id": estate_id, "deleted_at": None}, {"_id": 0}
        )
        .sort("order", 1)
        .to_list(200)
    )
    return checklists


@router.post("/checklists")
async def create_checklist_item(
    data: ChecklistItemCreate, current_user: dict = Depends(get_current_user)
):
    """Benefactor creates a new IAC item."""
    if current_user["role"] not in ("benefactor", "admin"):
        raise HTTPException(
            status_code=403, detail="Only benefactors can create checklist items"
        )

    # Enforce subscription requirement
    from guards import get_subscription_access

    access = await get_subscription_access(current_user)
    if not access["has_access"]:
        raise HTTPException(
            status_code=403,
            detail="Your free trial has ended. Subscribe to continue adding checklist items.",
        )

    # Auto-set order if not provided
    if data.order == 0:
        count = await db.checklists.count_documents({"estate_id": data.estate_id})
        data.order = count + 1

    item = ChecklistItem(
        estate_id=data.estate_id,
        title=data.title,
        description=data.description,
        category=data.category,
        priority=data.priority,
        action_type=data.action_type,
        contact_name=data.contact_name,
        contact_phone=data.contact_phone,
        contact_email=data.contact_email,
        contact_address=data.contact_address,
        notes=data.notes,
        due_timeframe=data.due_timeframe,
        order=data.order,
        created_by="benefactor",
    )
    await db.checklists.insert_one(item.model_dump())
    await update_estate_readiness(data.estate_id)
    return item.model_dump()


@router.put("/checklists/{item_id}")
async def update_checklist_item(
    item_id: str,
    data: ChecklistItemUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Benefactor edits an existing IAC item."""
    if current_user["role"] not in ("benefactor", "admin"):
        raise HTTPException(
            status_code=403, detail="Only benefactors can edit checklist items"
        )

    item = await db.checklists.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.checklists.update_one({"id": item_id}, {"$set": update_fields})
    updated = await db.checklists.find_one({"id": item_id}, {"_id": 0})
    return updated


@router.delete("/checklists/{item_id}")
async def delete_checklist_item(
    item_id: str, current_user: dict = Depends(get_current_user)
):
    """Benefactor deletes an IAC item."""
    if current_user["role"] not in ("benefactor", "admin"):
        raise HTTPException(
            status_code=403, detail="Only benefactors can delete checklist items"
        )

    item = await db.checklists.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    await db.checklists.update_one(
        {"id": item_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )  # soft_delete
    await update_estate_readiness(item["estate_id"])
    return {"success": True, "message": "Checklist item deleted"}


# ===================== BENEFICIARY TOGGLE =====================


@router.patch("/checklists/{item_id}/toggle")
async def toggle_checklist_item(
    item_id: str, current_user: dict = Depends(get_current_user)
):
    """Beneficiary (or benefactor) toggles completion status."""
    item = await db.checklists.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    new_status = not item.get("is_completed", False)
    update_data = {
        "is_completed": new_status,
        "completed_at": datetime.now(timezone.utc).isoformat() if new_status else None,
        "completed_by": current_user["id"] if new_status else None,
    }
    await db.checklists.update_one({"id": item_id}, {"$set": update_data})
    await update_estate_readiness(item["estate_id"])

    # Log to edit_history for timeline
    import uuid as _uuid

    await db.edit_history.insert_one(
        {
            "id": str(_uuid.uuid4()),
            "item_type": "checklist",
            "item_id": item_id,
            "estate_id": item["estate_id"],
            "user_id": current_user["id"],
            "user_name": current_user.get("name", ""),
            "action": "completed" if new_status else "uncompleted",
            "changed_fields": ["is_completed"],
            "title": item.get("title", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    return {"is_completed": new_status}


# ===================== REORDER =====================


@router.post("/checklists/reorder")
async def reorder_checklists(
    data: dict, current_user: dict = Depends(get_current_user)
):
    """Benefactor reorders IAC items. Expects: {item_ids: ["id1", "id2", ...]}"""
    if current_user["role"] not in ("benefactor", "admin"):
        raise HTTPException(status_code=403, detail="Only benefactors can reorder")

    item_ids = data.get("item_ids", [])
    for idx, item_id in enumerate(item_ids):
        await db.checklists.update_one({"id": item_id}, {"$set": {"order": idx + 1}})

    return {"success": True, "message": "Order updated"}


@router.post("/checklists/{item_id}/accept")
async def accept_ai_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Accept an AI-suggested checklist item."""
    if current_user["role"] != "benefactor" and not current_user.get(
        "is_also_benefactor"
    ):
        raise HTTPException(status_code=403, detail="Only benefactors can accept items")
    await db.checklists.update_one(
        {"id": item_id},
        {
            "$set": {
                "ai_accepted": True,
                "accepted_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {"success": True}


@router.post("/checklists/{item_id}/reject")
async def reject_ai_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Reject an AI-suggested checklist item with optional feedback."""
    if current_user["role"] != "benefactor" and not current_user.get(
        "is_also_benefactor"
    ):
        raise HTTPException(status_code=403, detail="Only benefactors can reject items")
    return {"success": True}


@router.post("/checklists/{item_id}/reject-with-feedback")
async def reject_ai_item_with_feedback(
    item_id: str, request: Request, current_user: dict = Depends(get_current_user)
):
    """Reject an AI-suggested checklist item with feedback."""
    if current_user["role"] != "benefactor" and not current_user.get(
        "is_also_benefactor"
    ):
        raise HTTPException(status_code=403, detail="Only benefactors can reject items")
    data = await request.json()
    feedback = data.get("feedback", "")
    await db.checklists.update_one(
        {"id": item_id},
        {
            "$set": {
                "ai_accepted": False,
                "rejected_at": datetime.now(timezone.utc).isoformat(),
                "rejection_feedback": feedback,
            }
        },
    )
    # Store feedback for AI learning
    await db.ai_feedback.insert_one(
        {
            "user_id": current_user["id"],
            "type": "checklist_rejection",
            "item_id": item_id,
            "feedback": feedback,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    # Delete the rejected item
    await db.checklists.update_one(
        {"id": item_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )  # soft_delete
    return {"success": True}
