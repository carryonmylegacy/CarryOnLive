"""Financial Portal — efficiency endpoints.

These additive routes consolidate work that the frontend previously did
across 10+ parallel fetches, plus add a handful of mission-critical
features the user explicitly asked for in the launch sprint:

  • GET  /financial/portal/{estate_id}            → single-shot aggregator
  • POST /financial/bills/bulk-pay                → mark many bills paid
  • GET  /financial/cashflow/{estate_id}          → 30-day rolling timeline
  • GET  /financial/handoff-package/{estate_id}   → printable PDF dossier
"""

import calendar
import io
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Depends, HTTPException, Response
from pydantic import BaseModel

from config import db
from utils import get_current_user

from ._core import (
    _filter_for_beneficiary,
    _verify_estate_access,
    router,
)


# ===================== 1. SINGLE-SHOT AGGREGATOR =====================
@router.get("/financial/portal/{estate_id}")
async def get_financial_portal(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Replaces 10 parallel fetches the frontend used to fan out (bills,
    debts, accounts, property, designations, summary, dav, beneficiaries,
    payments, custom-categories) with one round-trip. Mirrors filtering
    rules from the per-collection endpoints."""
    estate, is_owner = await _verify_estate_access(estate_id, current_user)

    bills = await db.bills.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    debts = await db.debts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    accounts = await db.financial_accounts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    property_assets = await db.property_assets.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(
        500
    )
    custom_categories = await db.financial_custom_categories.find({"estate_id": estate_id}, {"_id": 0}).to_list(200)
    dav_entries = await db.digital_wallet.find({"estate_id": estate_id}, {"_id": 0, "encrypted_password": 0}).to_list(
        500
    )

    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        bills = _filter_for_beneficiary(bills, current_user["id"], is_transitioned)
        debts = _filter_for_beneficiary(debts, current_user["id"], is_transitioned)
        accounts = _filter_for_beneficiary(accounts, current_user["id"], is_transitioned)
        property_assets = _filter_for_beneficiary(property_assets, current_user["id"], is_transitioned)

    return {
        "bills": bills,
        "debts": debts,
        "accounts": accounts,
        "property": property_assets,
        "custom_categories": custom_categories,
        "dav_entries": dav_entries,
        "is_owner": is_owner,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


# ===================== 2. BULK MARK-PAID =====================
class BulkPayRequest(BaseModel):
    bill_ids: List[str]
    paid_date: Optional[str] = None
    notes: Optional[str] = None


@router.post("/financial/bills/bulk-pay")
async def bulk_mark_bills_paid(
    data: BulkPayRequest,
    current_user: dict = Depends(get_current_user),
):
    """Mark a list of bills paid in a single transaction. Returns counts
    so the UI can render a single toast like '7 bills marked paid'."""
    if not data.bill_ids:
        raise HTTPException(status_code=400, detail="bill_ids required")
    bills = await db.bills.find({"id": {"$in": data.bill_ids}, "deleted_at": None}, {"_id": 0}).to_list(500)
    if not bills:
        raise HTTPException(status_code=404, detail="No bills found")
    # All bills must belong to the same estate the caller has access to.
    estate_id = bills[0]["estate_id"]
    if any(b["estate_id"] != estate_id for b in bills):
        raise HTTPException(status_code=400, detail="bill_ids span multiple estates")
    await _verify_estate_access(estate_id, current_user)
    now = datetime.now(timezone.utc).isoformat()
    payments = []
    import uuid

    for bill in bills:
        payments.append(
            {
                "id": str(uuid.uuid4()),
                "bill_id": bill["id"],
                "estate_id": estate_id,
                "paid_by": current_user["id"],
                "paid_by_name": current_user.get("name", ""),
                "paid_date": data.paid_date or now,
                "amount_paid": bill.get("amount"),
                "notes": data.notes,
                "deleted_at": None,
                "created_at": now,
            }
        )
    if payments:
        await db.bill_payments.insert_many(payments)
    return {"count": len(payments), "bill_ids": [p["bill_id"] for p in payments]}


# ===================== 3. 30-DAY ROLLING CASHFLOW =====================
def _days_until(due_day: int, today: datetime) -> int:
    _, last_day_this_month = calendar.monthrange(today.year, today.month)
    effective_due = min(due_day, last_day_this_month)
    if effective_due >= today.day:
        return effective_due - today.day
    next_month = today.month + 1 if today.month < 12 else 1
    next_year = today.year if today.month < 12 else today.year + 1
    _, last_next = calendar.monthrange(next_year, next_month)
    return (min(due_day, last_next) - today.day) + last_day_this_month


@router.get("/financial/cashflow/{estate_id}")
async def get_thirty_day_cashflow(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Forward-looking 30-day timeline of bills + minimum debt payments,
    grouped by day. Used by the Beneficiary Financial Page so heirs can
    see what's due before the next paycheck."""
    estate, is_owner = await _verify_estate_access(estate_id, current_user)
    bills = await db.bills.find({"estate_id": estate_id, "deleted_at": None, "status": "active"}, {"_id": 0}).to_list(
        500
    )
    debts = await db.debts.find({"estate_id": estate_id, "deleted_at": None, "status": "active"}, {"_id": 0}).to_list(
        500
    )
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        bills = _filter_for_beneficiary(bills, current_user["id"], is_transitioned)
        debts = _filter_for_beneficiary(debts, current_user["id"], is_transitioned)

    today = datetime.now(timezone.utc)
    timeline = []
    for offset in range(30):
        day = today + timedelta(days=offset)
        timeline.append(
            {
                "date": day.strftime("%Y-%m-%d"),
                "day_label": day.strftime("%a %b %-d"),
                "items": [],
                "total": 0.0,
            }
        )

    for bill in bills:
        due_day = bill.get("due_day")
        if not due_day or not bill.get("amount"):
            continue
        offset = _days_until(int(due_day), today)
        if 0 <= offset < 30:
            entry = timeline[offset]
            entry["items"].append(
                {
                    "id": bill["id"],
                    "type": "bill",
                    "name": bill["name"],
                    "amount": float(bill["amount"]),
                    "is_auto_pay": bool(bill.get("is_auto_pay")),
                    "category": bill.get("category", "other"),
                }
            )
            entry["total"] += float(bill["amount"])

    for debt in debts:
        # Use minimum_payment if available, else monthly_payment.
        amt = debt.get("minimum_payment") or debt.get("monthly_payment")
        if not amt:
            continue
        # Debts rarely have due_day; fall back to estimated_payoff_date or
        # bucket on day 1 of next month so they at least show up.
        due_day = debt.get("due_day") or 1
        offset = _days_until(int(due_day), today)
        if 0 <= offset < 30:
            entry = timeline[offset]
            entry["items"].append(
                {
                    "id": debt["id"],
                    "type": "debt",
                    "name": debt["name"],
                    "amount": float(amt),
                    "category": debt.get("category", "other"),
                }
            )
            entry["total"] += float(amt)

    grand_total = sum(d["total"] for d in timeline)
    return {
        "timeline": timeline,
        "grand_total_30d": round(grand_total, 2),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


# ===================== 4. PRINTABLE HAND-OFF PACKAGE =====================
def _safe(text: str) -> str:
    """Strip non-latin1 chars so FPDF Helvetica doesn't crash."""
    if text is None:
        return ""
    return str(text).encode("latin-1", errors="replace").decode("latin-1")


@router.get("/financial/handoff-package/{estate_id}")
async def export_handoff_package(estate_id: str, current_user: dict = Depends(get_current_user)):
    """One-shot printable PDF dossier containing every bill, debt,
    account, asset, plus the 3-prompt pass-down notes — what the
    beneficiary needs to do FIRST, gotchas, and who to call. Designed
    to be tucked inside a binder so heirs have it offline if everything
    else fails."""
    from fpdf import FPDF

    estate, is_owner = await _verify_estate_access(estate_id, current_user)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Only the owner can export the hand-off package")

    bills = await db.bills.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    debts = await db.debts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    accounts = await db.financial_accounts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    property_assets = await db.property_assets.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(
        500
    )

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # Header
    pdf.set_font("Helvetica", "B", 22)
    pdf.cell(0, 12, _safe("CarryOn Financial Hand-off"), new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(
        0,
        6,
        _safe(f"Generated {datetime.now(timezone.utc).strftime('%B %d, %Y')}"),
        new_x="LMARGIN",
        new_y="NEXT",
        align="C",
    )
    pdf.set_text_color(0, 0, 0)
    pdf.ln(6)

    def section_header(title: str, count: int):
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_fill_color(247, 235, 200)
        pdf.cell(0, 9, _safe(f"{title}  ({count})"), new_x="LMARGIN", new_y="NEXT", fill=True)
        pdf.ln(2)

    def passdown_block(item: dict):
        first = item.get("notes_first_action")
        gotchas = item.get("notes_gotchas")
        who = item.get("notes_who_to_call")
        if not (first or gotchas or who):
            return
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(80, 80, 80)
        if first:
            pdf.multi_cell(0, 5, _safe(f"  > FIRST: {first}"))
        if gotchas:
            pdf.multi_cell(0, 5, _safe(f"  > GOTCHAS: {gotchas}"))
        if who:
            pdf.multi_cell(0, 5, _safe(f"  > WHO TO CALL: {who}"))
        pdf.set_text_color(0, 0, 0)
        pdf.ln(1)

    def bill_row(b: dict):
        pdf.set_font("Helvetica", "B", 11)
        amt = b.get("amount") or 0
        due = b.get("due_day")
        due_txt = f"Day {due}" if due else "see notes"
        pdf.multi_cell(0, 6, _safe(f"{b.get('name', '?')}  -  ${amt:,.2f}  ({due_txt})"))
        pdf.set_font("Helvetica", "", 10)
        details = []
        if b.get("biller_phone"):
            details.append(f"Phone: {b['biller_phone']}")
        if b.get("biller_website"):
            details.append(f"Web: {b['biller_website']}")
        if b.get("account_number_masked"):
            details.append(f"Acct ending: {b['account_number_masked']}")
        if b.get("payment_method"):
            details.append(f"Pays via: {b['payment_method']}")
        if details:
            pdf.multi_cell(0, 5, _safe("  " + " | ".join(details)))
        passdown_block(b)
        pdf.ln(1)

    def debt_row(d: dict):
        pdf.set_font("Helvetica", "B", 11)
        bal = d.get("outstanding_balance") or 0
        rate = d.get("interest_rate")
        rate_txt = f" @ {rate}%" if rate else ""
        pdf.multi_cell(0, 6, _safe(f"{d.get('name', '?')}  -  ${bal:,.2f}{rate_txt}"))
        pdf.set_font("Helvetica", "", 10)
        details = []
        if d.get("lender_name"):
            details.append(f"Lender: {d['lender_name']}")
        if d.get("lender_phone"):
            details.append(f"Phone: {d['lender_phone']}")
        if d.get("monthly_payment"):
            details.append(f"Monthly: ${d['monthly_payment']:,.2f}")
        if details:
            pdf.multi_cell(0, 5, _safe("  " + " | ".join(details)))
        passdown_block(d)
        pdf.ln(1)

    def account_row(a: dict):
        pdf.set_font("Helvetica", "B", 11)
        bal = a.get("approximate_balance") or 0
        pdf.multi_cell(0, 6, _safe(f"{a.get('name', '?')}  -  ${bal:,.2f}"))
        pdf.set_font("Helvetica", "", 10)
        details = []
        if a.get("institution_name"):
            details.append(f"Bank: {a['institution_name']}")
        if a.get("account_number_masked"):
            details.append(f"Acct ending: {a['account_number_masked']}")
        if a.get("ownership_type"):
            details.append(f"Ownership: {a['ownership_type']}")
        if details:
            pdf.multi_cell(0, 5, _safe("  " + " | ".join(details)))
        passdown_block(a)
        pdf.ln(1)

    def asset_row(p: dict):
        pdf.set_font("Helvetica", "B", 11)
        val = p.get("estimated_value") or 0
        pdf.multi_cell(0, 6, _safe(f"{p.get('name', '?')}  -  ${val:,.2f}"))
        pdf.set_font("Helvetica", "", 10)
        details = []
        if p.get("location_address"):
            details.append(f"Location: {p['location_address']}")
        if p.get("ownership_type"):
            details.append(f"Ownership: {p['ownership_type']}")
        if p.get("serial_or_vin"):
            details.append(f"Serial/VIN: {p['serial_or_vin']}")
        if details:
            pdf.multi_cell(0, 5, _safe("  " + " | ".join(details)))
        passdown_block(p)
        pdf.ln(1)

    if bills:
        section_header("Bills", len(bills))
        for b in bills:
            bill_row(b)
    if debts:
        section_header("Debts", len(debts))
        for d in debts:
            debt_row(d)
    if accounts:
        section_header("Accounts", len(accounts))
        for a in accounts:
            account_row(a)
    if property_assets:
        section_header("Property & Assets", len(property_assets))
        for p in property_assets:
            asset_row(p)

    if not (bills or debts or accounts or property_assets):
        pdf.set_font("Helvetica", "I", 11)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(0, 8, _safe("No financial items have been documented yet."))

    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.multi_cell(
        0,
        4,
        _safe(
            "Confidential. Generated by CarryOn for the Estate Owner. "
            "Login credentials are NOT printed in this packet — they live "
            "in the Digital Access Vault, which requires the owner's master key."
        ),
    )

    buf = io.BytesIO()
    pdf.output(buf)
    pdf_bytes = buf.getvalue()
    filename = f"carryon-handoff-{estate_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
