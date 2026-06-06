"""Financial Portal — Accounts Registry: CRUD."""

from ._core import (
    router,
    _verify_estate_access,
    _filter_for_actor,
    _resolve_financial_actor,
    _require_dav_entry_in_estate,
    _upsert_dav_for_cfp_item,
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
    actor = await _resolve_financial_actor(estate_id, current_user)
    estate = actor["estate"]
    is_owner = actor["is_owner"] or actor["is_admin"]
    accounts = await db.financial_accounts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        accounts = _filter_for_actor(
            accounts,
            actor,
            is_transitioned,
            cfp_pre_transition_visible=estate.get("cfp_pre_transition_visible", False),
        )
    return accounts


@router.post("/financial/accounts")
async def create_account(data: AccountCreate, current_user: dict = Depends(get_current_user)):
    """Create a new financial account (and optionally a linked DAV row)."""
    await _verify_estate_access(data.estate_id, current_user, require_owner=True)
    await _require_dav_entry_in_estate(data.estate_id, data.dav_entry_id)
    payload = data.model_dump()
    dav_username = payload.pop("dav_login_username", None)
    dav_password = payload.pop("dav_login_password", None)
    account_id = str(uuid.uuid4())
    dav_id = await _upsert_dav_for_cfp_item(
        estate_id=data.estate_id,
        item_id=account_id,
        item_name=data.name,
        source_type="financial_account",
        source_id=account_id,
        login_username=dav_username,
        login_password=dav_password,
        existing_dav_id=data.dav_entry_id,
        user_id=current_user["id"],
        website=data.institution_website,
        account_mask=data.account_number_masked,
        category="banking",
    )
    account = {
        "id": account_id,
        **payload,
        "dav_entry_id": dav_id,
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
    """Update a financial account (refresh its linked DAV row if relevant)."""
    acct = await db.financial_accounts.find_one({"id": account_id, "deleted_at": None}, {"_id": 0})
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    await _verify_estate_access(acct["estate_id"], current_user, require_owner=True)
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    dav_username = updates.pop("dav_login_username", None)
    dav_password = updates.pop("dav_login_password", None)
    if "dav_entry_id" in updates:
        await _require_dav_entry_in_estate(acct["estate_id"], updates["dav_entry_id"])
    if (
        any(k in updates for k in ("institution_website", "account_number_masked", "name"))
        or dav_username
        or dav_password
    ):
        merged_name = updates.get("name", acct.get("name", ""))
        merged_site = updates.get("institution_website", acct.get("institution_website"))
        merged_mask = updates.get("account_number_masked", acct.get("account_number_masked"))
        new_dav_id = await _upsert_dav_for_cfp_item(
            estate_id=acct["estate_id"],
            item_id=account_id,
            item_name=merged_name,
            source_type="financial_account",
            source_id=account_id,
            login_username=dav_username,
            login_password=dav_password,
            existing_dav_id=updates.get("dav_entry_id", acct.get("dav_entry_id")),
            user_id=current_user["id"],
            website=merged_site,
            account_mask=merged_mask,
            category="banking",
        )
        if new_dav_id:
            updates["dav_entry_id"] = new_dav_id
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.financial_accounts.update_one({"id": account_id}, {"$set": updates})
    updated = await db.financial_accounts.find_one({"id": account_id}, {"_id": 0})
    return updated


@router.delete("/financial/accounts/{account_id}")
async def delete_account(
    account_id: str,
    delete_dav: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """Soft-delete a financial account; optionally cascade the linked DAV entry."""
    acct = await db.financial_accounts.find_one({"id": account_id, "deleted_at": None}, {"_id": 0})
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    await _verify_estate_access(acct["estate_id"], current_user, require_owner=True)
    now = datetime.now(timezone.utc).isoformat()
    await db.financial_accounts.update_one({"id": account_id}, {"$set": {"deleted_at": now}})
    dav_id = acct.get("dav_entry_id")
    if delete_dav and dav_id:
        await db.digital_wallet.update_one(
            {"id": dav_id, "estate_id": acct["estate_id"], "deleted_at": None},
            {"$set": {"deleted_at": now}},
        )
    return {"success": True, "dav_deleted": bool(delete_dav and dav_id)}


# ===================== PROPERTY & ASSETS =====================
