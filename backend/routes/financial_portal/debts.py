"""Financial Portal — Debt Tracker: CRUD."""

from ._core import (
    router,
    _verify_estate_access,
    _filter_for_beneficiary,
    DebtCreate,
    DebtUpdate,
)
from fastapi import Depends, HTTPException
from utils import get_current_user
from config import db
from datetime import datetime, timezone
import uuid


@router.get("/financial/debts/{estate_id}")
async def get_debts(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all debts for an estate."""
    estate, is_owner = await _verify_estate_access(estate_id, current_user)
    debts = await db.debts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        debts = _filter_for_beneficiary(debts, current_user["id"], is_transitioned)
    return debts


@router.post("/financial/debts")
async def create_debt(data: DebtCreate, current_user: dict = Depends(get_current_user)):
    """Create a new debt."""
    await _verify_estate_access(data.estate_id, current_user, require_owner=True)
    debt = {
        "id": str(uuid.uuid4()),
        **data.model_dump(),
        "created_by": current_user["id"],
        "deleted_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.debts.insert_one(debt)
    debt.pop("_id", None)
    return debt


@router.put("/financial/debts/{debt_id}")
async def update_debt(debt_id: str, data: DebtUpdate, current_user: dict = Depends(get_current_user)):
    """Update a debt."""
    debt = await db.debts.find_one({"id": debt_id, "deleted_at": None}, {"_id": 0})
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    await _verify_estate_access(debt["estate_id"], current_user, require_owner=True)
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.debts.update_one({"id": debt_id}, {"$set": updates})
    updated = await db.debts.find_one({"id": debt_id}, {"_id": 0})
    return updated


@router.delete("/financial/debts/{debt_id}")
async def delete_debt(debt_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete a debt."""
    debt = await db.debts.find_one({"id": debt_id, "deleted_at": None}, {"_id": 0})
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    await _verify_estate_access(debt["estate_id"], current_user, require_owner=True)
    await db.debts.update_one({"id": debt_id}, {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}})
    return {"success": True}


# ===================== ACCOUNTS CRUD =====================
