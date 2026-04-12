"""CarryOn™ Backend — Financial Portal (CFP)

Sub-modules:
  - Bill Tracker (CBT): recurring & one-time bills with calendar + reminders
  - Debt Tracker (CDT): all liabilities
  - Accounts Registry (CAR): all financial accounts with funds

All records are scoped to an estate_id and support per-beneficiary
visibility with pre/post-transition timing — same pattern as SDV documents.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from utils import get_current_user

router = APIRouter()


# ===================== PYDANTIC MODELS =====================


class BeneficiaryDesignation(BaseModel):
    beneficiary_ids: List[str] = ["all"]  # ["all"] or list of specific IDs
    visibility_timing: dict = {}  # {ben_id: {"pre": bool, "post": bool}}


class BillCreate(BaseModel):
    estate_id: str
    name: str
    category: str = "other"
    amount: Optional[float] = None
    is_recurring: bool = True
    frequency: str = "monthly"  # monthly, quarterly, semi_annual, annual, custom, one_time
    due_day: Optional[int] = None  # 1-31 for recurring
    due_date: Optional[str] = None  # ISO date for one-time
    grace_period_days: Optional[int] = None
    late_fee: Optional[str] = None
    payment_method: str = "manual_online"  # auto_pay, manual_online, check, phone, in_person
    payment_account: Optional[str] = None
    is_auto_pay: bool = False
    account_number_masked: Optional[str] = None  # last 4 only
    biller_phone: Optional[str] = None
    biller_website: Optional[str] = None
    biller_address: Optional[str] = None
    reminder_days: List[int] = [10, 7, 5, 1]
    priority: str = "important"  # critical, important, optional
    dav_entry_id: Optional[str] = None  # deep-link to Digital Access Vault
    notes: Optional[str] = None
    status: str = "active"  # active, paused, cancelled
    designated_beneficiaries: List[str] = ["all"]
    visibility_timing: dict = {}


class BillUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    is_recurring: Optional[bool] = None
    frequency: Optional[str] = None
    due_day: Optional[int] = None
    due_date: Optional[str] = None
    grace_period_days: Optional[int] = None
    late_fee: Optional[str] = None
    payment_method: Optional[str] = None
    payment_account: Optional[str] = None
    is_auto_pay: Optional[bool] = None
    account_number_masked: Optional[str] = None
    biller_phone: Optional[str] = None
    biller_website: Optional[str] = None
    biller_address: Optional[str] = None
    reminder_days: Optional[List[int]] = None
    priority: Optional[str] = None
    dav_entry_id: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    designated_beneficiaries: Optional[List[str]] = None
    visibility_timing: Optional[dict] = None


class DebtCreate(BaseModel):
    estate_id: str
    name: str
    category: str = "other"
    outstanding_balance: Optional[float] = None
    original_amount: Optional[float] = None
    interest_rate: Optional[float] = None
    monthly_payment: Optional[float] = None
    minimum_payment: Optional[float] = None
    loan_term_months: Optional[int] = None
    origination_date: Optional[str] = None
    estimated_payoff_date: Optional[str] = None
    account_number_masked: Optional[str] = None
    lender_name: Optional[str] = None
    lender_phone: Optional[str] = None
    lender_website: Optional[str] = None
    lender_address: Optional[str] = None
    collateral: Optional[str] = None
    co_signer: Optional[str] = None
    has_life_insurance: bool = False
    life_insurance_policy: Optional[str] = None
    dav_entry_id: Optional[str] = None
    priority: str = "important"  # critical, important, low
    notes: Optional[str] = None
    status: str = "active"  # active, paid_off, forbearance, collections
    designated_beneficiaries: List[str] = ["all"]
    visibility_timing: dict = {}


class DebtUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    outstanding_balance: Optional[float] = None
    original_amount: Optional[float] = None
    interest_rate: Optional[float] = None
    monthly_payment: Optional[float] = None
    minimum_payment: Optional[float] = None
    loan_term_months: Optional[int] = None
    origination_date: Optional[str] = None
    estimated_payoff_date: Optional[str] = None
    account_number_masked: Optional[str] = None
    lender_name: Optional[str] = None
    lender_phone: Optional[str] = None
    lender_website: Optional[str] = None
    lender_address: Optional[str] = None
    collateral: Optional[str] = None
    co_signer: Optional[str] = None
    has_life_insurance: Optional[bool] = None
    life_insurance_policy: Optional[str] = None
    dav_entry_id: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    designated_beneficiaries: Optional[List[str]] = None
    visibility_timing: Optional[dict] = None


class AccountCreate(BaseModel):
    estate_id: str
    name: str
    category: str = "checking"
    approximate_balance: Optional[float] = None
    balance_last_updated: Optional[str] = None
    interest_rate: Optional[float] = None
    institution_name: Optional[str] = None
    account_number_masked: Optional[str] = None
    routing_number: Optional[str] = None
    institution_phone: Optional[str] = None
    institution_website: Optional[str] = None
    branch_address: Optional[str] = None
    ownership_type: str = "individual"  # individual, joint_jtwros, joint_tic, trust, pod_tod, community_property
    joint_owner: Optional[str] = None
    named_beneficiary_at_institution: Optional[str] = None
    beneficiary_on_account: Optional[str] = None
    dav_entry_id: Optional[str] = None
    linked_bill_ids: List[str] = []
    priority: str = "important"  # critical, important, low
    notes: Optional[str] = None
    status: str = "active"  # active, closed, frozen
    designated_beneficiaries: List[str] = ["all"]
    visibility_timing: dict = {}


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    approximate_balance: Optional[float] = None
    balance_last_updated: Optional[str] = None
    interest_rate: Optional[float] = None
    institution_name: Optional[str] = None
    account_number_masked: Optional[str] = None
    routing_number: Optional[str] = None
    institution_phone: Optional[str] = None
    institution_website: Optional[str] = None
    branch_address: Optional[str] = None
    ownership_type: Optional[str] = None
    joint_owner: Optional[str] = None
    named_beneficiary_at_institution: Optional[str] = None
    beneficiary_on_account: Optional[str] = None
    dav_entry_id: Optional[str] = None
    linked_bill_ids: Optional[List[str]] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    designated_beneficiaries: Optional[List[str]] = None
    visibility_timing: Optional[dict] = None


class PropertyAssetCreate(BaseModel):
    estate_id: str
    name: str
    category: str = "other"  # real_estate, vehicle, jewelry, artwork, collectible, business_entity, other
    estimated_value: Optional[float] = None
    value_last_updated: Optional[str] = None
    location_address: Optional[str] = None
    acquisition_date: Optional[str] = None
    ownership_type: str = "individual"  # individual, joint, trust, community_property, llc_owned, corporate
    joint_owner: Optional[str] = None
    entity_type: Optional[str] = None  # llc, corporation, s_corp, partnership, sole_prop, trust
    entity_state: Optional[str] = None  # state of incorporation/formation
    entity_ein: Optional[str] = None  # last 4 digits only
    appraised_by: Optional[str] = None
    appraisal_date: Optional[str] = None
    insurance_policy: Optional[str] = None
    serial_or_vin: Optional[str] = None  # vehicle VIN, serial number, etc.
    description: Optional[str] = None
    dav_entry_id: Optional[str] = None
    priority: str = "important"  # critical, important, low
    notes: Optional[str] = None
    status: str = "active"  # active, sold, transferred, pending
    designated_beneficiaries: List[str] = ["all"]
    visibility_timing: dict = {}


class PropertyAssetUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    estimated_value: Optional[float] = None
    value_last_updated: Optional[str] = None
    location_address: Optional[str] = None
    acquisition_date: Optional[str] = None
    ownership_type: Optional[str] = None
    joint_owner: Optional[str] = None
    entity_type: Optional[str] = None
    entity_state: Optional[str] = None
    entity_ein: Optional[str] = None
    appraised_by: Optional[str] = None
    appraisal_date: Optional[str] = None
    insurance_policy: Optional[str] = None
    serial_or_vin: Optional[str] = None
    description: Optional[str] = None
    dav_entry_id: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    designated_beneficiaries: Optional[List[str]] = None
    visibility_timing: Optional[dict] = None


class CustomCategoryCreate(BaseModel):
    estate_id: str
    module: str  # "bills", "debts", "accounts", "property"
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None


class BillPaymentCreate(BaseModel):
    bill_id: str
    paid_date: Optional[str] = None
    amount_paid: Optional[float] = None
    notes: Optional[str] = None


class DesignationUpdate(BaseModel):
    designated_beneficiaries: List[str]
    visibility_timing: dict = {}


# ===================== HELPERS =====================


async def _verify_estate_access(estate_id: str, user: dict, require_owner: bool = False):
    """Verify user has access to the estate. Returns the estate doc."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    is_owner = estate.get("owner_id") == user["id"]
    is_admin = user.get("role") == "admin"
    is_beneficiary = user["id"] in (estate.get("beneficiaries") or [])
    if require_owner and not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only the estate owner can perform this action")
    if not (is_owner or is_admin or is_beneficiary):
        raise HTTPException(status_code=403, detail="Not authorized")
    return estate, is_owner or is_admin


def _filter_for_beneficiary(items: list, user_id: str, is_transitioned: bool) -> list:
    """Filter items to those visible to a specific beneficiary based on designation + timing."""
    visible = []
    for item in items:
        designated = item.get("designated_beneficiaries", ["all"])
        if "all" not in designated and user_id not in designated:
            continue
        # Check timing
        timing = item.get("visibility_timing", {}).get(user_id, {"pre": False, "post": True})
        if is_transitioned and timing.get("post", True):
            visible.append(item)
        elif not is_transitioned and timing.get("pre", False):
            visible.append(item)
    return visible


# ===================== CUSTOM CATEGORIES =====================


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


@router.get("/financial/accounts/{estate_id}")
async def get_accounts(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all financial accounts for an estate."""
    estate, is_owner = await _verify_estate_access(estate_id, current_user)
    accounts = await db.financial_accounts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        accounts = _filter_for_beneficiary(accounts, current_user["id"], is_transitioned)
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


@router.get("/financial/property/{estate_id}")
async def get_property_assets(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all property assets for an estate."""
    estate, is_owner = await _verify_estate_access(estate_id, current_user)
    items = await db.property_assets.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        items = _filter_for_beneficiary(items, current_user["id"], is_transitioned)
    return items


@router.post("/financial/property")
async def create_property_asset(data: PropertyAssetCreate, current_user: dict = Depends(get_current_user)):
    """Create a new property asset."""
    await _verify_estate_access(data.estate_id, current_user, require_owner=True)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        **data.model_dump(),
        "deleted_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.property_assets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/financial/property/{property_id}")
async def update_property_asset(
    property_id: str, data: PropertyAssetUpdate, current_user: dict = Depends(get_current_user)
):
    """Update a property asset."""
    prop = await db.property_assets.find_one({"id": property_id, "deleted_at": None}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property asset not found")
    await _verify_estate_access(prop["estate_id"], current_user, require_owner=True)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.property_assets.update_one({"id": property_id}, {"$set": updates})
    return {"success": True}


@router.delete("/financial/property/{property_id}")
async def delete_property_asset(property_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete a property asset."""
    prop = await db.property_assets.find_one({"id": property_id, "deleted_at": None}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property asset not found")
    await _verify_estate_access(prop["estate_id"], current_user, require_owner=True)
    await db.property_assets.update_one(
        {"id": property_id}, {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True}


# ===================== BILL PAYMENTS (Mark as Paid) =====================


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


@router.get("/financial/summary/{estate_id}")
async def get_financial_summary(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get aggregated financial summary for the dashboard tile."""
    estate, is_owner = await _verify_estate_access(estate_id, current_user)

    bills = await db.bills.find({"estate_id": estate_id, "deleted_at": None, "status": "active"}, {"_id": 0}).to_list(
        500
    )
    debts = await db.debts.find({"estate_id": estate_id, "deleted_at": None, "status": "active"}, {"_id": 0}).to_list(
        500
    )
    accounts = await db.financial_accounts.find(
        {"estate_id": estate_id, "deleted_at": None, "status": "active"}, {"_id": 0}
    ).to_list(500)
    property_assets = await db.property_assets.find(
        {"estate_id": estate_id, "deleted_at": None, "status": "active"}, {"_id": 0}
    ).to_list(500)

    # Filter for beneficiary visibility if not owner
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        bills = _filter_for_beneficiary(bills, current_user["id"], is_transitioned)
        debts = _filter_for_beneficiary(debts, current_user["id"], is_transitioned)
        accounts = _filter_for_beneficiary(accounts, current_user["id"], is_transitioned)
        property_assets = _filter_for_beneficiary(property_assets, current_user["id"], is_transitioned)

    # Calculate monthly bills total
    monthly_total = 0.0
    for bill in bills:
        amt = bill.get("amount") or 0
        freq = bill.get("frequency", "monthly")
        if freq == "monthly":
            monthly_total += amt
        elif freq == "quarterly":
            monthly_total += amt / 3
        elif freq == "semi_annual":
            monthly_total += amt / 6
        elif freq == "annual":
            monthly_total += amt / 12
        else:
            monthly_total += amt  # one_time or custom treated as monthly for snapshot

    auto_pay_count = sum(1 for b in bills if b.get("is_auto_pay"))
    manual_count = len(bills) - auto_pay_count

    total_debt = sum(d.get("outstanding_balance") or 0 for d in debts)
    account_assets = sum(a.get("approximate_balance") or 0 for a in accounts)
    property_value = sum(p.get("estimated_value") or 0 for p in property_assets)
    total_assets = account_assets + property_value

    # Upcoming bills (next 7 days)
    today = datetime.now(timezone.utc)
    upcoming = []
    for bill in bills:
        due_day = bill.get("due_day")
        if due_day:
            # Calculate days until next due
            import calendar

            _, last_day = calendar.monthrange(today.year, today.month)
            effective_due = min(due_day, last_day)
            if effective_due >= today.day:
                days_until = effective_due - today.day
            else:
                # Next month
                next_month = today.month + 1 if today.month < 12 else 1
                next_year = today.year if today.month < 12 else today.year + 1
                _, next_last = calendar.monthrange(next_year, next_month)
                days_until = (min(due_day, next_last) - today.day) + last_day
            if days_until <= 7:
                upcoming.append(
                    {
                        "id": bill["id"],
                        "name": bill["name"],
                        "amount": bill.get("amount"),
                        "category": bill.get("category", "other"),
                        "due_day": due_day,
                        "days_until": days_until,
                        "is_auto_pay": bill.get("is_auto_pay", False),
                    }
                )
    upcoming.sort(key=lambda x: x["days_until"])

    return {
        "bills_count": len(bills),
        "monthly_total": round(monthly_total, 2),
        "auto_pay_count": auto_pay_count,
        "manual_count": manual_count,
        "debts_count": len(debts),
        "total_debt": round(total_debt, 2),
        "accounts_count": len(accounts),
        "property_count": len(property_assets),
        "account_assets": round(account_assets, 2),
        "property_value": round(property_value, 2),
        "total_assets": round(total_assets, 2),
        "net_position": round(total_assets - total_debt, 2),
        "upcoming_bills": upcoming[:5],
    }


# ===================== FINANCIAL COVERAGE SCORE =====================


@router.get("/financial/health-score/{estate_id}")
async def get_financial_coverage_score(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Calculate a Financial Coverage score (0-100) measuring how thoroughly
    the benefactor has documented their financial position for beneficiaries.
    This is NOT a judgment of financial health — it measures completeness
    of documentation on the platform."""
    await _verify_estate_access(estate_id, current_user)

    bills = await db.bills.find({"estate_id": estate_id, "deleted_at": None, "status": "active"}, {"_id": 0}).to_list(
        500
    )
    debts = await db.debts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    accounts = await db.financial_accounts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    property_assets = await db.property_assets.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(
        500
    )

    all_items = bills + debts + accounts + property_assets
    total_items = len(all_items)

    if total_items == 0:
        return {
            "score": 0,
            "label": "Not Started",
            "breakdown": {
                "coverage": 0,
                "detail": 0,
                "designations": 0,
                "dav_links": 0,
                "notes": 0,
            },
        }

    # 1. Coverage (30 pts): Has the benefactor documented each financial area?
    coverage_score = 0
    if len(bills) > 0:
        coverage_score += 8
    if len(debts) > 0:
        coverage_score += 7
    if len(accounts) > 0:
        coverage_score += 8
    if len(property_assets) > 0:
        coverage_score += 7

    # 2. Detail Completeness (20 pts): How thoroughly are items filled out?
    detail_total = 0
    detail_filled = 0
    for b in bills:
        detail_total += 4
        if b.get("amount"):
            detail_filled += 1
        if b.get("due_day"):
            detail_filled += 1
        if b.get("provider_phone") or b.get("provider_website"):
            detail_filled += 1
        if b.get("account_number_masked"):
            detail_filled += 1
    for d in debts:
        detail_total += 3
        if d.get("outstanding_balance"):
            detail_filled += 1
        if d.get("interest_rate"):
            detail_filled += 1
        if d.get("institution_name"):
            detail_filled += 1
    for a in accounts:
        detail_total += 3
        if a.get("approximate_balance"):
            detail_filled += 1
        if a.get("institution_name"):
            detail_filled += 1
        if a.get("account_number_masked"):
            detail_filled += 1
    for p in property_assets:
        detail_total += 3
        if p.get("estimated_value"):
            detail_filled += 1
        if p.get("location_address") or p.get("description"):
            detail_filled += 1
        if p.get("ownership_type") and p.get("ownership_type") != "individual":
            detail_filled += 1
        elif p.get("entity_type"):
            detail_filled += 1
    detail_score = round((detail_filled / detail_total) * 20) if detail_total > 0 else 0

    # 3. Beneficiary Designations (25 pts): % of items with customized designations
    designation_count = 0
    for item in all_items:
        designated = item.get("designated_beneficiaries", ["all"])
        timing = item.get("visibility_timing", {})
        if designated != ["all"] or len(timing) > 0:
            designation_count += 1
    designation_score = round((designation_count / total_items) * 25) if total_items > 0 else 0

    # 4. DAV Links (10 pts): % of items linked to Digital Access Vault
    dav_count = sum(1 for item in all_items if item.get("dav_entry_id"))
    dav_score = round((dav_count / total_items) * 10) if total_items > 0 else 0

    # 5. Beneficiary Notes (15 pts): % of items with notes/instructions
    notes_count = sum(1 for item in all_items if item.get("notes"))
    notes_score = round((notes_count / total_items) * 15) if total_items > 0 else 0

    total_score = min(100, coverage_score + detail_score + designation_score + dav_score + notes_score)

    # Labels reflect documentation completeness, not financial judgment
    if total_score >= 85:
        label = "Comprehensive"
    elif total_score >= 65:
        label = "Thorough"
    elif total_score >= 40:
        label = "Building"
    elif total_score > 0:
        label = "Getting Started"
    else:
        label = "Not Started"

    return {
        "score": total_score,
        "label": label,
        "breakdown": {
            "coverage": coverage_score,
            "detail": detail_score,
            "designations": designation_score,
            "dav_links": dav_score,
            "notes": notes_score,
        },
    }


# ===================== SMART BILL CATEGORIZATION =====================


class SmartCategorizeRequest(BaseModel):
    bill_name: str
    module: str = "bills"  # bills, debts, accounts


@router.post("/financial/smart-categorize")
async def smart_categorize(data: SmartCategorizeRequest, current_user: dict = Depends(get_current_user)):
    """Use AI to auto-categorize a bill/debt/account and suggest biller details."""
    from config import xai_client, XAI_MODEL_LIGHT, logger

    if not xai_client:
        raise HTTPException(status_code=503, detail="AI service not available")

    bill_categories = (
        "mortgage_rent, utilities, insurance, subscriptions, credit_card, "
        "auto_vehicle, medical_health, taxes, hoa_condo, education_student, "
        "phone_internet, childcare, other"
    )
    debt_categories = (
        "mortgage, auto_loan, student_loan, credit_card, personal_loan, medical_debt, business_loan, heloc, other"
    )
    account_categories = (
        "checking, savings, money_market, cd, investment, retirement, "
        "pension, hsa_fsa, trust_account, life_insurance_cv, annuity, "
        "real_estate, business, crypto, other"
    )

    cat_list = bill_categories
    if data.module == "debts":
        cat_list = debt_categories
    elif data.module == "accounts":
        cat_list = account_categories

    prompt = f"""Given the {data.module.rstrip("s")} name "{data.bill_name}", respond with ONLY a JSON object (no markdown, no explanation) with these fields:
- "category": one of [{cat_list}]
- "biller_phone": the customer service phone number if you know it (or null)
- "biller_website": the bill pay or login portal URL if you know it (or null)
- "payment_method": likely payment method, one of [auto_pay, manual_online, check, phone, in_person] (or null)
- "is_auto_pay": boolean, true if this type of bill is commonly auto-paid
- "frequency": one of [monthly, quarterly, semi_annual, annual, one_time] (best guess)

Example: {{"category":"utilities","biller_phone":"(800) 777-9898","biller_website":"https://www.duke-energy.com/my-account","payment_method":"auto_pay","is_auto_pay":true,"frequency":"monthly"}}"""

    try:
        import asyncio

        response = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: xai_client.chat.completions.create(
                model=XAI_MODEL_LIGHT,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300,
                temperature=0.1,
            ),
        )
        text = response.choices[0].message.content.strip()
        # Parse JSON from response
        import json

        # Handle markdown code blocks
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        result = json.loads(text)
        # Validate category is in the allowed list
        allowed = [c.strip() for c in cat_list.split(",")]
        if result.get("category") not in allowed:
            result["category"] = "other"
        return result
    except Exception as e:
        logger.warning(f"Smart categorize failed: {e}")
        return {
            "category": "other",
            "biller_phone": None,
            "biller_website": None,
            "payment_method": None,
            "is_auto_pay": False,
            "frequency": "monthly",
        }
