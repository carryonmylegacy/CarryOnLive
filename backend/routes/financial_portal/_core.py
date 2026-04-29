"""Financial Portal — shared router, Pydantic models, and access helpers.
Sub-modules: categories, bills, debts, accounts, property, designations, summary.
No route handlers in this file.
"""

from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import db

router = APIRouter()


# ===================== STRICT ENUMS =====================
# Only fields that are NOT user-extensible. `category` is intentionally
# left as a free `str` because users can define custom categories via
# /financial/categories — a Literal there would lock users out of their
# own data.

BillFrequency = Literal["monthly", "quarterly", "semi_annual", "annual", "custom", "one_time"]
BillPaymentMethod = Literal["auto_pay", "manual_online", "check", "phone", "in_person"]
BillPriority = Literal["critical", "important", "optional"]
BillStatus = Literal["active", "paused", "cancelled"]

DebtPriority = Literal["critical", "important", "low"]
DebtStatus = Literal["active", "paid_off", "forbearance", "collections"]

AccountPriority = Literal["critical", "important", "low"]
AccountStatus = Literal["active", "closed", "frozen"]
AccountOwnership = Literal["individual", "joint_jtwros", "joint_tic", "trust", "pod_tod", "community_property"]

AssetPriority = Literal["critical", "important", "low"]
AssetStatus = Literal["active", "sold", "transferred", "pending"]
AssetOwnership = Literal["individual", "joint", "trust", "community_property", "llc_owned", "corporate"]


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
    frequency: BillFrequency = "monthly"
    due_day: Optional[int] = None  # 1-31 for recurring
    due_date: Optional[str] = None  # ISO date for one-time
    grace_period_days: Optional[int] = None
    late_fee: Optional[str] = None  # legacy free-form string, kept for backwards compatibility
    # Structured replacements introduced in batch 2 of deferred items.
    # Either or both may be set: a $25 flat penalty + 5% APR penalty is
    # not unusual on commercial leases. Always store both as decimals.
    late_fee_amount: Optional[float] = None  # flat $ penalty
    late_fee_percent: Optional[float] = None  # % of unpaid balance
    payment_method: BillPaymentMethod = "manual_online"
    payment_account: Optional[str] = None
    is_auto_pay: bool = False
    account_number_masked: Optional[str] = None  # last 4 only
    biller_phone: Optional[str] = None
    biller_website: Optional[str] = None
    biller_address: Optional[str] = None
    reminder_days: List[int] = [10, 7, 5, 1]
    priority: BillPriority = "important"
    dav_entry_id: Optional[str] = None  # deep-link to Digital Access Vault
    # Auto-DAV: when CFP adds a bill, the beneficiary needs to know how to
    # log in and pay it. These fields, if provided, materialise a linked
    # DAV credential row so the data lives in exactly one place.
    dav_login_username: Optional[str] = None
    dav_login_password: Optional[str] = None
    notes: Optional[str] = None
    # Mission-aligned hand-off prompts (replacing free-form `notes` in UI).
    # Stored alongside `notes` so existing data is preserved.
    notes_first_action: Optional[str] = None  # "What does my beneficiary do FIRST?"
    notes_gotchas: Optional[str] = None  # "What's tricky / non-obvious?"
    notes_who_to_call: Optional[str] = None  # "Who else can help / co-signs?"
    status: BillStatus = "active"
    designated_beneficiaries: List[str] = ["all"]
    visibility_timing: dict = {}


class BillUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    is_recurring: Optional[bool] = None
    frequency: Optional[BillFrequency] = None
    due_day: Optional[int] = None
    due_date: Optional[str] = None
    grace_period_days: Optional[int] = None
    late_fee: Optional[str] = None  # legacy
    late_fee_amount: Optional[float] = None
    late_fee_percent: Optional[float] = None
    payment_method: Optional[BillPaymentMethod] = None
    payment_account: Optional[str] = None
    is_auto_pay: Optional[bool] = None
    account_number_masked: Optional[str] = None
    biller_phone: Optional[str] = None
    biller_website: Optional[str] = None
    biller_address: Optional[str] = None
    reminder_days: Optional[List[int]] = None
    priority: Optional[BillPriority] = None
    dav_entry_id: Optional[str] = None
    dav_login_username: Optional[str] = None
    dav_login_password: Optional[str] = None
    notes: Optional[str] = None
    notes_first_action: Optional[str] = None
    notes_gotchas: Optional[str] = None
    notes_who_to_call: Optional[str] = None
    status: Optional[BillStatus] = None
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
    priority: DebtPriority = "important"
    notes: Optional[str] = None
    notes_first_action: Optional[str] = None
    notes_gotchas: Optional[str] = None
    notes_who_to_call: Optional[str] = None
    status: DebtStatus = "active"
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
    priority: Optional[DebtPriority] = None
    notes: Optional[str] = None
    notes_first_action: Optional[str] = None
    notes_gotchas: Optional[str] = None
    notes_who_to_call: Optional[str] = None
    status: Optional[DebtStatus] = None
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
    ownership_type: AccountOwnership = "individual"
    joint_owner: Optional[str] = None
    named_beneficiary_at_institution: Optional[str] = None
    beneficiary_on_account: Optional[str] = None
    dav_entry_id: Optional[str] = None
    linked_bill_ids: List[str] = []
    priority: AccountPriority = "important"
    notes: Optional[str] = None
    notes_first_action: Optional[str] = None
    notes_gotchas: Optional[str] = None
    notes_who_to_call: Optional[str] = None
    status: AccountStatus = "active"
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
    ownership_type: Optional[AccountOwnership] = None
    joint_owner: Optional[str] = None
    named_beneficiary_at_institution: Optional[str] = None
    beneficiary_on_account: Optional[str] = None
    dav_entry_id: Optional[str] = None
    linked_bill_ids: Optional[List[str]] = None
    priority: Optional[AccountPriority] = None
    notes: Optional[str] = None
    notes_first_action: Optional[str] = None
    notes_gotchas: Optional[str] = None
    notes_who_to_call: Optional[str] = None
    status: Optional[AccountStatus] = None
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
    ownership_type: AssetOwnership = "individual"
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
    priority: AssetPriority = "important"
    notes: Optional[str] = None
    notes_first_action: Optional[str] = None
    notes_gotchas: Optional[str] = None
    notes_who_to_call: Optional[str] = None
    status: AssetStatus = "active"
    designated_beneficiaries: List[str] = ["all"]
    visibility_timing: dict = {}


class PropertyAssetUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    estimated_value: Optional[float] = None
    value_last_updated: Optional[str] = None
    location_address: Optional[str] = None
    acquisition_date: Optional[str] = None
    ownership_type: Optional[AssetOwnership] = None
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
    priority: Optional[AssetPriority] = None
    notes: Optional[str] = None
    notes_first_action: Optional[str] = None
    notes_gotchas: Optional[str] = None
    notes_who_to_call: Optional[str] = None
    status: Optional[AssetStatus] = None
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


def _filter_for_beneficiary(
    items: list, user_id: str, is_transitioned: bool, *, cfp_pre_transition_visible: bool = False
) -> list:
    """Filter items to those visible to a specific beneficiary based on
    designation + timing.

    Layered gates (most-restrictive wins, in order):
      1. Estate-level CFP global toggle (`cfp_pre_transition_visible`).
         When False AND the estate has not transitioned, the entire CFP is
         hidden from this beneficiary — return [].
      2. Per-item beneficiary designation (`designated_beneficiaries`).
         Item is invisible to anyone not in the list (or "all").
      3. Per-item timing (`visibility_timing[user_id]` = {pre, post}).
         The benefactor's per-item pre/post preference is preserved EVEN
         when the global toggle is on — so a bill marked "post only" stays
         hidden during a Eurotrip.
    """
    # Gate 1: estate-level global. If the estate has transitioned we don't
    # apply this gate — death-time visibility is governed solely by the
    # per-item `post` flag.
    if not is_transitioned and not cfp_pre_transition_visible:
        return []

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
