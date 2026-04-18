"""Financial Portal — Custom categories CRUD."""

from ._core import (
    router,
    _verify_estate_access,
    CustomCategoryCreate,
)
from fastapi import Depends, HTTPException
from utils import get_current_user
from config import db
from datetime import datetime, timezone
import uuid


@router.get("/financial/categories/{estate_id}")
async def get_custom_categories(estate_id: str, module: str = "bills", current_user: dict = Depends(get_current_user)):
    """Get custom categories for a module."""
    await _verify_estate_access(estate_id, current_user)
    cats = await db.bill_categories.find(
        {"estate_id": estate_id, "module": module, "deleted_at": None},
        {"_id": 0, "name_lower": 0},
    ).to_list(100)
    return cats


@router.post("/financial/categories")
async def create_custom_category(data: CustomCategoryCreate, current_user: dict = Depends(get_current_user)):
    """Create a custom category."""
    await _verify_estate_access(data.estate_id, current_user, require_owner=True)
    # Check for duplicate name in same module
    existing = await db.bill_categories.find_one(
        {
            "estate_id": data.estate_id,
            "module": data.module,
            "name_lower": data.name.strip().lower(),
            "deleted_at": None,
        },
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = {
        "id": str(uuid.uuid4()),
        "estate_id": data.estate_id,
        "module": data.module,
        "name": data.name.strip(),
        "name_lower": data.name.strip().lower(),
        "color": data.color,
        "icon": data.icon,
        "deleted_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bill_categories.insert_one(cat)
    cat.pop("_id", None)
    cat.pop("name_lower", None)
    return cat


@router.delete("/financial/categories/{category_id}")
async def delete_custom_category(category_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete a custom category. Bills in this category move to 'other'."""
    cat = await db.bill_categories.find_one({"id": category_id, "deleted_at": None}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await _verify_estate_access(cat["estate_id"], current_user, require_owner=True)
    now = datetime.now(timezone.utc).isoformat()
    await db.bill_categories.update_one({"id": category_id}, {"$set": {"deleted_at": now}})
    # Move bills/debts/accounts using this category to "other"
    collection_map = {"bills": db.bills, "debts": db.debts, "accounts": db.financial_accounts}
    coll = collection_map.get(cat["module"])
    if coll is not None:
        await coll.update_many(
            {"estate_id": cat["estate_id"], "category": cat["name"]},
            {"$set": {"category": "other"}},
        )
    return {"success": True}


# ===================== BILLS CRUD =====================
