"""CarryOn™ — Notification Preferences & Admin Categories

User-level push notification preference controls.
Admin-managed notification categories (Founder can add/edit/remove categories).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import db
from guards import require_admin
from utils import get_current_user

router = APIRouter()

# Default notification categories — seeded if none exist
DEFAULT_CATEGORIES = [
    {
        "id": "emergency_alerts",
        "label": "Emergency Alerts (CCP)",
        "description": "Emergency activations, check-in updates, deactivation notices",
        "default_enabled": True,
        "is_critical": True,
        "order": 0,
    },
    {
        "id": "estate_chat",
        "label": "Estate Chat (ECT)",
        "description": "New messages in estate conversations",
        "default_enabled": True,
        "is_critical": False,
        "order": 1,
    },
    {
        "id": "estate_updates",
        "label": "Estate Updates",
        "description": "Document uploads, beneficiary changes, checklist updates",
        "default_enabled": True,
        "is_critical": False,
        "order": 2,
    },
    {
        "id": "milestone_messages",
        "label": "Milestone Messages",
        "description": "New milestone messages and delivery notifications",
        "default_enabled": True,
        "is_critical": False,
        "order": 3,
    },
    {
        "id": "system",
        "label": "System",
        "description": "Account security, subscription, and support responses",
        "default_enabled": True,
        "is_critical": False,
        "order": 4,
    },
]


async def _ensure_categories() -> list[dict]:
    """Seed default categories if none exist. Return all categories."""
    count = await db.notification_categories.count_documents({})
    if count == 0:
        now = datetime.now(timezone.utc).isoformat()
        for cat in DEFAULT_CATEGORIES:
            doc = {**cat, "created_at": now, "updated_at": now, "deleted_at": None}
            await db.notification_categories.insert_one({k: v for k, v in doc.items()})
    cats = await db.notification_categories.find({"deleted_at": None}, {"_id": 0}).sort("order", 1).to_list(50)
    return cats


async def _get_user_prefs(user_id: str) -> dict:
    """Get user's notification preferences, creating defaults if needed."""
    prefs = await db.notification_preferences.find_one({"user_id": user_id}, {"_id": 0})
    if prefs:
        return prefs
    categories = await _ensure_categories()
    toggles = {}
    for cat in categories:
        toggles[cat["id"]] = cat.get("default_enabled", True)
    now = datetime.now(timezone.utc).isoformat()
    prefs = {
        "user_id": user_id,
        "master_enabled": True,
        "toggles": toggles,
        "created_at": now,
        "updated_at": now,
    }
    await db.notification_preferences.insert_one({k: v for k, v in prefs.items()})
    return prefs


async def should_notify(user_id: str, category_id: str) -> bool:
    """Check if a user should receive a notification for a given category."""
    prefs = await _get_user_prefs(user_id)
    if not prefs.get("master_enabled", True):
        return False
    return prefs.get("toggles", {}).get(category_id, True)


# ===================== USER PREFERENCES =====================


class UpdatePrefsRequest(BaseModel):
    master_enabled: Optional[bool] = None
    toggles: Optional[dict[str, bool]] = None


@router.get("/notification-prefs")
async def get_prefs(current_user: dict = Depends(get_current_user)):
    """Get current user's notification preferences with available categories."""
    prefs = await _get_user_prefs(current_user["id"])
    categories = await _ensure_categories()
    # Ensure toggles include any new categories added by admin
    changed = False
    for cat in categories:
        if cat["id"] not in prefs.get("toggles", {}):
            prefs.setdefault("toggles", {})[cat["id"]] = cat.get("default_enabled", True)
            changed = True
    if changed:
        await db.notification_preferences.update_one(
            {"user_id": current_user["id"]},
            {"$set": {"toggles": prefs["toggles"]}},
        )
    return {"preferences": prefs, "categories": categories}


@router.put("/notification-prefs")
async def update_prefs(
    data: UpdatePrefsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update user's notification preferences."""
    await _get_user_prefs(current_user["id"])  # ensure exists
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.master_enabled is not None:
        updates["master_enabled"] = data.master_enabled
    if data.toggles is not None:
        # Merge with existing toggles
        existing = await db.notification_preferences.find_one(
            {"user_id": current_user["id"]}, {"_id": 0, "id": 1, "toggles": 1}
        )
        merged = {**(existing or {}).get("toggles", {}), **data.toggles}
        updates["toggles"] = merged
    await db.notification_preferences.update_one({"user_id": current_user["id"]}, {"$set": updates})
    return {"success": True}


# ===================== ADMIN: NOTIFICATION CATEGORIES =====================


class CategoryCreate(BaseModel):
    label: str
    description: str = ""
    default_enabled: bool = True
    is_critical: bool = False


class CategoryUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    default_enabled: Optional[bool] = None
    is_critical: Optional[bool] = None
    order: Optional[int] = None


@router.get("/admin/notification-categories")
async def get_categories(current_user: dict = Depends(require_admin)):
    """Admin: Get all notification categories."""
    cats = await _ensure_categories()
    return cats


@router.post("/admin/notification-categories")
async def create_category(
    data: CategoryCreate,
    current_user: dict = Depends(require_admin),
):
    """Admin: Create a new notification category."""
    if not data.label.strip():
        raise HTTPException(status_code=400, detail="Label is required")
    # Auto-generate ID from label
    cat_id = data.label.strip().lower().replace(" ", "_").replace("(", "").replace(")", "")
    existing = await db.notification_categories.find_one({"id": cat_id, "deleted_at": None}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Category with this name already exists")
    max_order = await db.notification_categories.find_one(
        {"deleted_at": None}, {"_id": 0, "id": 1, "order": 1}, sort=[("order", -1)]
    )
    next_order = (max_order.get("order", 0) + 1) if max_order else 0
    now = datetime.now(timezone.utc).isoformat()
    cat = {
        "id": cat_id,
        "label": data.label.strip(),
        "description": data.description.strip(),
        "default_enabled": data.default_enabled,
        "is_critical": data.is_critical,
        "order": next_order,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
    }
    await db.notification_categories.insert_one({k: v for k, v in cat.items()})
    return cat


@router.put("/admin/notification-categories/{category_id}")
async def update_category(
    category_id: str,
    data: CategoryUpdate,
    current_user: dict = Depends(require_admin),
):
    """Admin: Update a notification category."""
    cat = await db.notification_categories.find_one({"id": category_id, "deleted_at": None}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in ["label", "description", "default_enabled", "is_critical", "order"]:
        val = getattr(data, field)
        if val is not None:
            updates[field] = val.strip() if isinstance(val, str) else val
    await db.notification_categories.update_one({"id": category_id}, {"$set": updates})
    updated = await db.notification_categories.find_one({"id": category_id}, {"_id": 0})
    return updated


@router.delete("/admin/notification-categories/{category_id}")
async def delete_category(
    category_id: str,
    current_user: dict = Depends(require_admin),
):
    """Admin: Soft-delete a notification category."""
    cat = await db.notification_categories.find_one({"id": category_id, "deleted_at": None}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.notification_categories.update_one(
        {"id": category_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True}
