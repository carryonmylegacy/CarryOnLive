"""Financial Portal — shared router, Pydantic models, and access helpers.
Sub-modules: categories, bills, debts, accounts, property, designations, summary.
No route handlers in this file.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import db
from services.access_control import (
    emergency_scope_allows,
    require_beneficiary_section_access,
    resolve_estate_actor,
)

# DAV passwords are estate-scoped and must round-trip through the same
# encrypt_field fence the Digital Wallet route uses, so the owner-decrypt
# path keeps working. Best-effort import — CFP saves must never hard-fail
# if encryption is misconfigured (the password is simply not materialised).
try:
    from services.encryption import encrypt_field, get_estate_salt
except Exception:  # pragma: no cover
    encrypt_field = None
    get_estate_salt = None

try:  # Sentry is best-effort; CFP items still save without it.
    import sentry_sdk
except Exception:  # pragma: no cover
    sentry_sdk = None

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
    designated_beneficiaries: List[str] = []
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
    dav_login_username: Optional[str] = None
    dav_login_password: Optional[str] = None
    priority: DebtPriority = "important"
    notes: Optional[str] = None
    notes_first_action: Optional[str] = None
    notes_gotchas: Optional[str] = None
    notes_who_to_call: Optional[str] = None
    status: DebtStatus = "active"
    designated_beneficiaries: List[str] = []
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
    dav_login_username: Optional[str] = None
    dav_login_password: Optional[str] = None
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
    # Auto-DAV: optional login the beneficiary uses to reach this account.
    # Materialises / refreshes a linked DAV credential row on save.
    dav_login_username: Optional[str] = None
    dav_login_password: Optional[str] = None
    linked_bill_ids: List[str] = []
    priority: AccountPriority = "important"
    notes: Optional[str] = None
    notes_first_action: Optional[str] = None
    notes_gotchas: Optional[str] = None
    notes_who_to_call: Optional[str] = None
    status: AccountStatus = "active"
    designated_beneficiaries: List[str] = []
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
    dav_login_username: Optional[str] = None
    dav_login_password: Optional[str] = None
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
    dav_login_username: Optional[str] = None
    dav_login_password: Optional[str] = None
    priority: AssetPriority = "important"
    notes: Optional[str] = None
    notes_first_action: Optional[str] = None
    notes_gotchas: Optional[str] = None
    notes_who_to_call: Optional[str] = None
    status: AssetStatus = "active"
    designated_beneficiaries: List[str] = []
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
    dav_login_username: Optional[str] = None
    dav_login_password: Optional[str] = None
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
    actor = await _resolve_financial_actor(estate_id, user, require_owner=require_owner)
    return actor["estate"], actor["is_owner"] or actor["is_admin"]


async def _resolve_financial_actor(estate_id: str, user: dict, require_owner: bool = False):
    """Resolve financial-portal access using the estate actor identity map."""
    actor = await resolve_estate_actor(estate_id, user)
    is_owner = actor["is_owner"]
    is_admin = actor["is_admin"]
    is_beneficiary = actor["is_beneficiary"]
    if require_owner and not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only the estate owner can perform this action")
    if not (is_owner or is_admin or is_beneficiary):
        raise HTTPException(status_code=403, detail="Not authorized")
    # Section gate — a beneficiary whose "financial_portal" section was disabled
    # is denied at the API for every CFP/CES surface (no-op for owner/admin).
    await require_beneficiary_section_access(actor, "financial_portal")
    return actor


def _clean_id_set(values) -> set[str]:
    result: set[str] = set()
    for value in values or []:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            result.add(text)
    return result


def _timing_for_actor(item: dict, actor: dict) -> dict | None:
    timing = item.get("visibility_timing") or {}
    if not isinstance(timing, dict):
        return None
    for release_id in actor.get("release_ids", set()):
        row = timing.get(release_id)
        if isinstance(row, dict):
            return row
    return None


def _financial_item_visible_for_actor(
    item: dict,
    actor: dict,
    is_transitioned: bool | None = None,
    *,
    cfp_pre_transition_visible: bool = False,
) -> bool:
    """True when this CFP item is visible to the actor right now."""
    if actor.get("is_owner") or actor.get("is_admin"):
        return True
    if not actor.get("is_beneficiary"):
        return False

    transitioned = actor.get("is_transitioned") if is_transitioned is None else is_transitioned

    designated = _clean_id_set(item.get("designated_beneficiaries"))
    if "all" not in designated and not (designated & actor.get("release_ids", set())):
        # FAIL-CLOSED: un-designated financial items are private to the owner.
        return False
    if emergency_scope_allows(actor, "financial_portal"):
        return True
    if not transitioned and not cfp_pre_transition_visible:
        return False

    timing = _timing_for_actor(item, actor)
    if transitioned:
        return True if timing is None else bool(timing.get("post", True))
    return bool(timing and timing.get("pre", False))


def _filter_for_actor(
    items: list,
    actor: dict,
    is_transitioned: bool | None = None,
    *,
    cfp_pre_transition_visible: bool = False,
) -> list:
    return [
        item
        for item in items
        if _financial_item_visible_for_actor(
            item,
            actor,
            is_transitioned,
            cfp_pre_transition_visible=cfp_pre_transition_visible,
        )
    ]


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
    actor = {"is_beneficiary": True, "release_ids": _clean_id_set([user_id])}
    for item in items:
        if _financial_item_visible_for_actor(
            item,
            actor,
            is_transitioned,
            cfp_pre_transition_visible=cfp_pre_transition_visible,
        ):
            visible.append(item)
    return visible


# ===================== DAV <-> CFP SYNC HELPERS =====================


async def _require_dav_entry_in_estate(estate_id: str, dav_entry_id: Optional[str]) -> Optional[str]:
    """Estate-scope every DAV link used by a CFP item (audit d5a54f5e P1).

    When a CFP item (bill/account/debt/property) references a Digital Access
    Vault entry, that entry MUST belong to the SAME estate. Without this a
    multi-estate owner could cross-link a credential from estate A onto an
    item in estate B — leaking it to estate B's beneficiaries. Returns the
    id when valid; raises 400 otherwise. No-op when no link is provided.
    """
    if not dav_entry_id:
        return None
    entry = await db.digital_wallet.find_one(
        {"id": dav_entry_id, "estate_id": estate_id, "deleted_at": None},
        {"_id": 0, "id": 1},
    )
    if not entry:
        raise HTTPException(status_code=400, detail="Linked DAV entry is not part of this estate.")
    return dav_entry_id


async def _upsert_dav_for_cfp_item(
    *,
    estate_id: str,
    item_id: str,
    item_name: str,
    source_type: str,
    source_id: str,
    login_username: Optional[str],
    login_password: Optional[str],
    existing_dav_id: Optional[str],
    user_id: str,
    website: Optional[str] = None,
    account_mask: Optional[str] = None,
    category: str = "banking",
) -> Optional[str]:
    """Materialise / refresh a DAV credential row mirroring a CFP item's
    login (audit d5a54f5e P0 — bi-directional CFP <-> DAV sync).

    Behaviour (per founder decision): if the item already links to a DAV row
    in THIS estate, update it IN PLACE (preserving its beneficiary
    assignments / visibility); otherwise create a new row and return its id
    so the caller can store it on the item. Triggered when any of
    {website, login_username, login_password, account_mask} is present.
    """
    has_payload = any([website, login_username, login_password, account_mask])
    if not has_payload:
        return existing_dav_id

    notes_lines = [f"Auto-linked from CarryOn Financial Picture: {item_name}"]
    if website:
        notes_lines.append(f"Visit: {website}")
    if account_mask:
        notes_lines.append(f"Account ending: {account_mask}")
    notes_blob = "\n".join(notes_lines)

    enc_password = None
    if login_password and encrypt_field and get_estate_salt:
        try:
            salt = await get_estate_salt(estate_id)
            enc_password = encrypt_field(login_password, salt)
        except Exception as enc_err:  # pragma: no cover
            enc_password = None
            if sentry_sdk:
                try:
                    sentry_sdk.capture_exception(enc_err)
                except Exception:
                    pass

    if existing_dav_id:
        # Estate-scoped lookup so existing_dav_id can never update a row in
        # another tenant (defense-in-depth alongside _require_dav_entry_in_estate).
        existing = await db.digital_wallet.find_one(
            {"id": existing_dav_id, "estate_id": estate_id, "deleted_at": None}, {"_id": 0, "id": 1}
        )
        if existing:
            update_doc = {"account_name": item_name, "category": category, "notes": notes_blob}
            if login_username:
                update_doc["login_username"] = login_username
            if enc_password is not None:
                update_doc["encrypted_password"] = enc_password
            # audit #1798 P2 — estate + not-deleted scoped update filter.
            await db.digital_wallet.update_one(
                {"id": existing_dav_id, "estate_id": estate_id, "deleted_at": None}, {"$set": update_doc}
            )
            return existing_dav_id
        # linked row was deleted / cross-estate — fall through and recreate.

    new_id = str(uuid.uuid4())
    dav_doc = {
        "id": new_id,
        "estate_id": estate_id,
        "account_name": item_name,
        "login_username": login_username or "",
        "encrypted_password": enc_password,
        "additional_access": None,
        "notes": notes_blob,
        "assigned_beneficiary_id": None,
        "assigned_beneficiary_name": None,
        "category": category,
        # audit #1798 P2 — auto-created rows are explicitly private + not-deleted.
        "beneficiary_visibility": "private",
        "source_type": source_type,
        "source_id": source_id,
        "auto_created_from": {"source": source_type, "item_id": item_id},
        "created_by": user_id,
        "deleted_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.digital_wallet.insert_one(dav_doc)
    return new_id
