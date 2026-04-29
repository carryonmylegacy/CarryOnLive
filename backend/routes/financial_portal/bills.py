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

# Encryption helpers shared with the Digital Wallet route — passwords on
# DAV are estate-scoped and must round-trip through the same encrypt_field
# fence so the owner-decrypt path keeps working.
try:
    from services.encryption import encrypt_field, get_estate_salt
except Exception:  # pragma: no cover
    encrypt_field = None
    get_estate_salt = None

# Sentry is best-effort — if it isn't configured we still want bills to save.
try:  # pragma: no cover - optional dependency
    import sentry_sdk
except Exception:  # pragma: no cover
    sentry_sdk = None


async def _upsert_dav_for_bill(
    estate_id: str,
    bill_id: str,
    bill_name: str,
    biller_website: str | None,
    account_mask: str | None,
    login_username: str | None,
    login_password: str | None,
    existing_dav_id: str | None,
    user_id: str,
) -> str | None:
    """
    Materialise (or refresh) a Digital Access Vault entry that mirrors
    the credentials/website attached to a bill.

    Mission: when the benefactor adds Duke Energy with biller_website +
    account-mask + (optionally) the username they use to log in, the
    beneficiary should NOT have to hunt through the DAV looking for the
    matching credential row. We pre-create / pre-link it here.

    Triggered when ANY of {website, username, password, account-mask} is
    set on the bill. If a linked DAV row already exists we update it in
    place; otherwise we create a new one and store its id back on the
    bill via `dav_entry_id`.
    """
    has_payload = any([biller_website, login_username, login_password, account_mask])
    if not has_payload:
        return existing_dav_id  # nothing to materialise

    notes_lines = [f"Auto-linked from CarryOn Financial Picture bill: {bill_name}"]
    if biller_website:
        notes_lines.append(f"Pay at: {biller_website}")
    if account_mask:
        notes_lines.append(f"Account ending: {account_mask}")
    notes_blob = "\n".join(notes_lines)

    # Encrypt password using the same estate-scoped fence DAV uses, so the
    # owner-decrypt path on /digital-wallet/{estate_id} works unchanged.
    enc_password = None
    if login_password and encrypt_field and get_estate_salt:
        try:
            salt = await get_estate_salt(estate_id)
            enc_password = encrypt_field(login_password, salt)
        except Exception as enc_err:
            # Never block the bill save on encryption issues, but make the
            # silent failure observable so a misconfigured encryption
            # fence is caught in Sentry instead of producing DAV rows the
            # owner can never decrypt.
            enc_password = None
            if sentry_sdk:
                try:
                    sentry_sdk.capture_exception(enc_err)
                except Exception:
                    pass

    if existing_dav_id:
        existing = await db.digital_wallet.find_one({"id": existing_dav_id}, {"_id": 0})
        if existing:
            update_doc = {
                "account_name": bill_name,
                "category": "banking",
                "notes": notes_blob,
            }
            if login_username:
                update_doc["login_username"] = login_username
            if enc_password is not None:
                update_doc["encrypted_password"] = enc_password
            await db.digital_wallet.update_one({"id": existing_dav_id}, {"$set": update_doc})
            return existing_dav_id
        # if the previously-linked row was deleted, fall through and recreate

    new_id = str(uuid.uuid4())
    dav_doc = {
        "id": new_id,
        "estate_id": estate_id,
        "account_name": bill_name,
        "login_username": login_username or "",
        "encrypted_password": enc_password,
        "additional_access": None,
        "notes": notes_blob,
        "assigned_beneficiary_id": None,
        "assigned_beneficiary_name": None,
        "category": "banking",
        # Top-level origin tag so the frontend can filter the DAV list
        # by where the row came from. The `auto_created_from` blob stays
        # for backwards compatibility / per-row breadcrumb context.
        "source_type": "financial_bill",
        "source_id": bill_id,
        "auto_created_from": {"source": "cfp_bill", "bill_id": bill_id},
        "created_by": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.digital_wallet.insert_one(dav_doc)
    return new_id


@router.get("/financial/bills/{estate_id}")
async def get_bills(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all bills for an estate."""
    estate, is_owner = await _verify_estate_access(estate_id, current_user)
    bills = await db.bills.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        bills = _filter_for_beneficiary(
            bills,
            current_user["id"],
            is_transitioned,
            cfp_pre_transition_visible=estate.get("cfp_pre_transition_visible", False),
        )
    return bills


@router.post("/financial/bills")
async def create_bill(data: BillCreate, current_user: dict = Depends(get_current_user)):
    """Create a new bill (and optionally materialise a linked DAV row)."""
    await _verify_estate_access(data.estate_id, current_user, require_owner=True)
    bill_id = str(uuid.uuid4())
    payload = data.model_dump()
    # Pull DAV credential bits OUT of the bill doc — they live in the DAV.
    dav_login_username = payload.pop("dav_login_username", None)
    dav_login_password = payload.pop("dav_login_password", None)
    # Defense-in-depth: when the structured late_fee_amount or
    # late_fee_percent is set, clear the legacy free-form `late_fee`
    # string so non-frontend callers (mobile / API clients / migration
    # scripts) can't desync canonical truth. Frontend already does this
    # but we don't trust callers.
    if payload.get("late_fee_amount") is not None or payload.get("late_fee_percent") is not None:
        payload["late_fee"] = None
    dav_id = await _upsert_dav_for_bill(
        estate_id=data.estate_id,
        bill_id=bill_id,
        bill_name=data.name,
        biller_website=data.biller_website,
        account_mask=data.account_number_masked,
        login_username=dav_login_username,
        login_password=dav_login_password,
        existing_dav_id=data.dav_entry_id,
        user_id=current_user["id"],
    )
    bill = {
        "id": bill_id,
        **payload,
        "dav_entry_id": dav_id,
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
    """Update a bill (and refresh its linked DAV row if relevant fields changed)."""
    bill = await db.bills.find_one({"id": bill_id, "deleted_at": None}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    await _verify_estate_access(bill["estate_id"], current_user, require_owner=True)
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    # Strip DAV-only fields out of the bill update; route them through
    # the auto-DAV upsert helper instead.
    dav_username = updates.pop("dav_login_username", None)
    dav_password = updates.pop("dav_login_password", None)
    # Defense-in-depth (mirrors create_bill): if the caller is supplying
    # structured late_fee_* fields, clear the legacy string so they
    # can't drift apart.
    if updates.get("late_fee_amount") is not None or updates.get("late_fee_percent") is not None:
        updates["late_fee"] = None
    if any(k in updates for k in ("biller_website", "account_number_masked", "name")) or dav_username or dav_password:
        merged_name = updates.get("name", bill.get("name", ""))
        merged_site = updates.get("biller_website", bill.get("biller_website"))
        merged_mask = updates.get("account_number_masked", bill.get("account_number_masked"))
        new_dav_id = await _upsert_dav_for_bill(
            estate_id=bill["estate_id"],
            bill_id=bill_id,
            bill_name=merged_name,
            biller_website=merged_site,
            account_mask=merged_mask,
            login_username=dav_username,
            login_password=dav_password,
            existing_dav_id=updates.get("dav_entry_id", bill.get("dav_entry_id")),
            user_id=current_user["id"],
        )
        if new_dav_id:
            updates["dav_entry_id"] = new_dav_id
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
