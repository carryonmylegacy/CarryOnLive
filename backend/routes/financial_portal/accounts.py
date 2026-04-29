"""Financial Portal — Accounts Registry: CRUD."""

from ._core import (
    router,
    _verify_estate_access,
    _filter_for_beneficiary,
    AccountCreate,
    AccountUpdate,
)
from fastapi import Depends, HTTPException
from utils import get_current_user
from config import db
from datetime import datetime, timezone
import uuid


@router.get("/financial/accounts/{estate_id}")
async def get_accounts(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all financial accounts for an estate."""
    estate, is_owner = await _verify_estate_access(estate_id, current_user)
    accounts = await db.financial_accounts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        accounts = _filter_for_beneficiary(
            accounts,
            current_user["id"],
            is_transitioned,
            cfp_pre_transition_visible=estate.get("cfp_pre_transition_visible", False),
        )
    return accounts


@router.post("/financial/accounts")
async def create_account(data: AccountCreate, current_user: dict = Depends(get_current_user)):
    """Create a new financial account."""
    await _verify_estate_access(data.estate_id, current_user, require_owner=True)
    account = {
        "id": str(uuid.uuid4()),
        **data.model_dump(),
        "created_by": current_user["id"],
        "deleted_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.financial_accounts.insert_one(account)
    account.pop("_id", None)
    return account


@router.put("/financial/accounts/{account_id}")
async def update_account(account_id: str, data: AccountUpdate, current_user: dict = Depends(get_current_user)):
    """Update a financial account."""
    acct = await db.financial_accounts.find_one({"id": account_id, "deleted_at": None}, {"_id": 0})
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    await _verify_estate_access(acct["estate_id"], current_user, require_owner=True)
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.financial_accounts.update_one({"id": account_id}, {"$set": updates})
    updated = await db.financial_accounts.find_one({"id": account_id}, {"_id": 0})
    return updated


@router.delete("/financial/accounts/{account_id}")
async def delete_account(account_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete a financial account."""
    acct = await db.financial_accounts.find_one({"id": account_id, "deleted_at": None}, {"_id": 0})
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    await _verify_estate_access(acct["estate_id"], current_user, require_owner=True)
    await db.financial_accounts.update_one(
        {"id": account_id}, {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True}


# ===================== PROPERTY & ASSETS =====================
