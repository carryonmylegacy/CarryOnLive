"""Financial Portal — Bill Tracker: CRUD + payment logging."""

from ._core import (
    router,
    _verify_estate_access,
    _filter_for_beneficiary,
    BillCreate,
    BillUpdate,
    BillPaymentCreate,
)
from fastapi import Depends, HTTPException
from utils import get_current_user
from config import db
from datetime import datetime, timezone
import uuid


@router.get("/financial/bills/{estate_id}")
async def get_bills(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all bills for an estate."""
    estate, is_owner = await _verify_estate_access(estate_id, current_user)
    bills = await db.bills.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        bills = _filter_for_beneficiary(bills, current_user["id"], is_transitioned)
    return bills


@router.post("/financial/bills")
async def create_bill(data: BillCreate, current_user: dict = Depends(get_current_user)):
    """Create a new bill."""
    await _verify_estate_access(data.estate_id, current_user, require_owner=True)
    bill = {
        "id": str(uuid.uuid4()),
        **data.model_dump(),
        "created_by": current_user["id"],
        "deleted_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bills.insert_one(bill)
    bill.pop("_id", None)
    return bill


@router.put("/financial/bills/{bill_id}")
async def update_bill(bill_id: str, data: BillUpdate, current_user: dict = Depends(get_current_user)):
    """Update a bill."""
    bill = await db.bills.find_one({"id": bill_id, "deleted_at": None}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    await _verify_estate_access(bill["estate_id"], current_user, require_owner=True)
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.bills.update_one({"id": bill_id}, {"$set": updates})
    updated = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    return updated


@router.delete("/financial/bills/{bill_id}")
async def delete_bill(bill_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete a bill."""
    bill = await db.bills.find_one({"id": bill_id, "deleted_at": None}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    await _verify_estate_access(bill["estate_id"], current_user, require_owner=True)
    await db.bills.update_one({"id": bill_id}, {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}})
    return {"success": True}


# ===================== DEBTS CRUD =====================


@router.get("/financial/bills/{bill_id}/payments")
async def get_bill_payments(bill_id: str, current_user: dict = Depends(get_current_user)):
    """Get payment history for a bill."""
    bill = await db.bills.find_one({"id": bill_id, "deleted_at": None}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    await _verify_estate_access(bill["estate_id"], current_user)
    payments = (
        await db.bill_payments.find(
            {"bill_id": bill_id, "deleted_at": None},
            {"_id": 0},
        )
        .sort("paid_date", -1)
        .to_list(100)
    )
    return payments


@router.post("/financial/bills/{bill_id}/pay")
async def mark_bill_paid(bill_id: str, data: BillPaymentCreate, current_user: dict = Depends(get_current_user)):
    """Mark a bill as paid for the current cycle."""
    bill = await db.bills.find_one({"id": bill_id, "deleted_at": None}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    await _verify_estate_access(bill["estate_id"], current_user)
    now = datetime.now(timezone.utc).isoformat()
    payment = {
        "id": str(uuid.uuid4()),
        "bill_id": bill_id,
        "estate_id": bill["estate_id"],
        "paid_by": current_user["id"],
        "paid_by_name": current_user.get("name", ""),
        "paid_date": data.paid_date or now,
        "amount_paid": data.amount_paid or bill.get("amount"),
        "notes": data.notes,
        "deleted_at": None,
        "created_at": now,
    }
    await db.bill_payments.insert_one(payment)
    payment.pop("_id", None)
    return payment


@router.delete("/financial/payments/{payment_id}")
async def undo_bill_payment(payment_id: str, current_user: dict = Depends(get_current_user)):
    """Undo a bill payment (soft delete)."""
    payment = await db.bill_payments.find_one({"id": payment_id, "deleted_at": None}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    await _verify_estate_access(payment["estate_id"], current_user)
    await db.bill_payments.update_one(
        {"id": payment_id}, {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True}


# ===================== BENEFICIARY DESIGNATION =====================
