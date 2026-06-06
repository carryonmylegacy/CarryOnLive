"""Financial Portal — Debt Tracker: CRUD."""

from ._core import (
    router,
    _verify_estate_access,
    _filter_for_actor,
    _resolve_financial_actor,
    _require_dav_entry_in_estate,
    _upsert_dav_for_cfp_item,
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
    actor = await _resolve_financial_actor(estate_id, current_user)
    estate = actor["estate"]
    is_owner = actor["is_owner"] or actor["is_admin"]
    debts = await db.debts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        debts = _filter_for_actor(
            debts,
            actor,
            is_transitioned,
            cfp_pre_transition_visible=estate.get("cfp_pre_transition_visible", False),
        )
    return debts


@router.post("/financial/debts")
async def create_debt(data: DebtCreate, current_user: dict = Depends(get_current_user)):
    """Create a new debt (and optionally a linked DAV row)."""
    await _verify_estate_access(data.estate_id, current_user, require_owner=True)
    await _require_dav_entry_in_estate(data.estate_id, data.dav_entry_id)
    payload = data.model_dump()
    dav_username = payload.pop("dav_login_username", None)
    dav_password = payload.pop("dav_login_password", None)
    debt_id = str(uuid.uuid4())
    dav_id = await _upsert_dav_for_cfp_item(
        estate_id=data.estate_id,
        item_id=debt_id,
        item_name=data.name,
        source_type="financial_debt",
        source_id=debt_id,
        login_username=dav_username,
        login_password=dav_password,
        existing_dav_id=data.dav_entry_id,
        user_id=current_user["id"],
        website=data.lender_website,
        account_mask=data.account_number_masked,
        category="banking",
    )
    debt = {
        "id": debt_id,
        **payload,
        "dav_entry_id": dav_id,
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
    """Update a debt (refresh its linked DAV row if relevant)."""
    debt = await db.debts.find_one({"id": debt_id, "deleted_at": None}, {"_id": 0})
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    await _verify_estate_access(debt["estate_id"], current_user, require_owner=True)
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    dav_username = updates.pop("dav_login_username", None)
    dav_password = updates.pop("dav_login_password", None)
    if "dav_entry_id" in updates:
        await _require_dav_entry_in_estate(debt["estate_id"], updates["dav_entry_id"])
    if any(k in updates for k in ("lender_website", "account_number_masked", "name")) or dav_username or dav_password:
        merged_name = updates.get("name", debt.get("name", ""))
        merged_site = updates.get("lender_website", debt.get("lender_website"))
        merged_mask = updates.get("account_number_masked", debt.get("account_number_masked"))
        new_dav_id = await _upsert_dav_for_cfp_item(
            estate_id=debt["estate_id"],
            item_id=debt_id,
            item_name=merged_name,
            source_type="financial_debt",
            source_id=debt_id,
            login_username=dav_username,
            login_password=dav_password,
            existing_dav_id=updates.get("dav_entry_id", debt.get("dav_entry_id")),
            user_id=current_user["id"],
            website=merged_site,
            account_mask=merged_mask,
            category="banking",
        )
        if new_dav_id:
            updates["dav_entry_id"] = new_dav_id
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.debts.update_one({"id": debt_id}, {"$set": updates})
    updated = await db.debts.find_one({"id": debt_id}, {"_id": 0})
    return updated


@router.delete("/financial/debts/{debt_id}")
async def delete_debt(
    debt_id: str,
    delete_dav: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """Soft-delete a debt; optionally cascade the linked DAV entry."""
    debt = await db.debts.find_one({"id": debt_id, "deleted_at": None}, {"_id": 0})
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    await _verify_estate_access(debt["estate_id"], current_user, require_owner=True)
    now = datetime.now(timezone.utc).isoformat()
    await db.debts.update_one({"id": debt_id}, {"$set": {"deleted_at": now}})
    dav_id = debt.get("dav_entry_id")
    if delete_dav and dav_id:
        await db.digital_wallet.update_one(
            {"id": dav_id, "estate_id": debt["estate_id"], "deleted_at": None},
            {"$set": {"deleted_at": now}},
        )
    return {"success": True, "dav_deleted": bool(delete_dav and dav_id)}


# ===================== ACCOUNTS CRUD =====================
