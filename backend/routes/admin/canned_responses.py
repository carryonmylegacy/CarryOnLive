"""CarryOn™ — Canned Response Templates

Reusable response templates for common support scenarios.
Operators can use these in support conversations.
Founder/Manager can create/edit/delete templates.
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import db
from utils import get_current_user

router = APIRouter()


def require_staff(user: dict):
    if user.get("role") not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Staff access required")


def require_manager_or_founder(user: dict):
    if user.get("role") == "admin":
        return
    if user.get("role") == "operator" and user.get("operator_role") == "manager":
        return
    raise HTTPException(status_code=403, detail="Manager or Founder access required")


class CannedResponseCreate(BaseModel):
    title: str
    body: str
    category: str = "general"  # general, billing, technical, onboarding, transition
    tags: list[str] = []


class CannedResponseUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None


@router.get("/ops/canned-responses")
async def list_canned_responses(current_user: dict = Depends(get_current_user)):
    """List all canned response templates."""
    require_staff(current_user)
    items = (
        await db.canned_responses.find(
            {"deleted": {"$ne": True}},
            {"_id": 0},
        )
        .sort("category", 1)
        .to_list(200)
    )
    return items


@router.post("/ops/canned-responses")
async def create_canned_response(
    data: CannedResponseCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a canned response template. Manager or Founder only."""
    require_manager_or_founder(current_user)

    doc = {
        "id": str(uuid4()),
        "title": data.title,
        "body": data.body,
        "category": data.category,
        "tags": data.tags,
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "use_count": 0,
    }
    await db.canned_responses.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/ops/canned-responses/{response_id}")
async def update_canned_response(
    response_id: str,
    data: CannedResponseUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update a canned response template. Manager or Founder only."""
    require_manager_or_founder(current_user)

    update = {}
    if data.title is not None:
        update["title"] = data.title
    if data.body is not None:
        update["body"] = data.body
    if data.category is not None:
        update["category"] = data.category
    if data.tags is not None:
        update["tags"] = data.tags

    if not update:
        return {"updated": False}

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.canned_responses.update_one({"id": response_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"updated": True}


@router.delete("/ops/canned-responses/{response_id}")
async def delete_canned_response(
    response_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Soft-delete a canned response. Manager or Founder only."""
    require_manager_or_founder(current_user)

    result = await db.canned_responses.update_one(
        {"id": response_id},
        {"$set": {"deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"deleted": True}


@router.post("/ops/canned-responses/{response_id}/use")
async def track_canned_response_use(
    response_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Track usage of a canned response (increment counter)."""
    require_staff(current_user)
    await db.canned_responses.update_one(
        {"id": response_id},
        {"$inc": {"use_count": 1}},
    )
    return {"tracked": True}
