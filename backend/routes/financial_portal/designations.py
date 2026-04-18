"""Financial Portal — Beneficiary designations on financial items."""

from ._core import (
    router,
    _verify_estate_access,
    DesignationUpdate,
)
from fastapi import Depends, HTTPException
from utils import get_current_user
from config import db
from datetime import datetime, timezone


@router.put("/financial/{module}/{item_id}/designation")
async def update_designation(
    module: str,
    item_id: str,
    data: DesignationUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update beneficiary designation for a bill/debt/account/property."""
    collection_map = {
        "bills": db.bills,
        "debts": db.debts,
        "accounts": db.financial_accounts,
        "property": db.property_assets,
    }
    coll = collection_map.get(module)
    if coll is None:
        raise HTTPException(status_code=400, detail="Invalid module")
    item = await coll.find_one({"id": item_id, "deleted_at": None}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await _verify_estate_access(item["estate_id"], current_user, require_owner=True)
    await coll.update_one(
        {"id": item_id},
        {
            "$set": {
                "designated_beneficiaries": data.designated_beneficiaries,
                "visibility_timing": data.visibility_timing,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {"success": True}


# ===================== FINANCIAL SUMMARY =====================
