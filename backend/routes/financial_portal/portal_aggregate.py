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
from services.access_control import emergency_scope_allows
from utils import get_current_user

from ._core import (
    _filter_for_actor,
    _financial_item_visible_for_actor,
    _resolve_financial_actor,
    _verify_estate_access,
    router,
)


def _dav_visible_for_actor(entry: dict, actor: dict) -> bool:
    if actor.get("is_owner") or actor.get("is_admin"):
        return True
    if not actor.get("is_beneficiary"):
        return False
    assigned = entry.get("assigned_beneficiary_id")
    if not assigned or str(assigned) not in actor.get("release_ids", set()):
        return False
    if emergency_scope_allows(actor, "digital_wallet"):
        return True
    if actor.get("is_transitioned"):
        return True
    return entry.get("beneficiary_visibility") == "show_now"


# ===================== 1. SINGLE-SHOT AGGREGATOR =====================
@router.get("/financial/portal/{estate_id}")
async def get_financial_portal(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Replaces 10 parallel fetches the frontend used to fan out (bills,
    debts, accounts, property, designations, summary, dav, beneficiaries,
    payments, custom-categories) with one round-trip. Mirrors filtering
    rules from the per-collection endpoints."""
    actor = await _resolve_financial_actor(estate_id, current_user)
    estate = actor["estate"]
    is_owner = actor["is_owner"] or actor["is_admin"]

    bills = await db.bills.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    debts = await db.debts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    accounts = await db.financial_accounts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    property_assets = await db.property_assets.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(
        500
    )
    custom_categories = await db.financial_custom_categories.find({"estate_id": estate_id}, {"_id": 0}).to_list(200)
    dav_entries = await db.digital_wallet.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0, "encrypted_password": 0, "encrypted_additional": 0, "password": 0, "additional_access": 0},
    ).to_list(500)

    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        cfp_pre = estate.get("cfp_pre_transition_visible", False)
        bills = _filter_for_actor(bills, actor, is_transitioned, cfp_pre_transition_visible=cfp_pre)
        debts = _filter_for_actor(debts, actor, is_transitioned, cfp_pre_transition_visible=cfp_pre)
        accounts = _filter_for_actor(accounts, actor, is_transitioned, cfp_pre_transition_visible=cfp_pre)
        property_assets = _filter_for_actor(property_assets, actor, is_transitioned, cfp_pre_transition_visible=cfp_pre)
        dav_entries = [entry for entry in dav_entries if _dav_visible_for_actor(entry, actor)]
        # Only surface custom-category labels actually attached to an item this
        # beneficiary can see — hidden owner-created labels must not leak via the
        # estate-level category list (audit fa1ad83 #9).
        used_categories = {
            item.get("category") for item in (bills + debts + accounts + property_assets) if item.get("category")
        }
        custom_categories = [
            c for c in custom_categories if c.get("name") in used_categories or c.get("id") in used_categories
        ]

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
    actor = await _resolve_financial_actor(estate_id, current_user)
    requested_ids = set(data.bill_ids)
    found_ids = {bill["id"] for bill in bills}
    if requested_ids != found_ids:
        raise HTTPException(status_code=404, detail="One or more bills were not found")
    if not (actor["is_owner"] or actor["is_admin"]):
        visible_ids = {
            bill["id"]
            for bill in bills
            if _financial_item_visible_for_actor(
                bill,
                actor,
                cfp_pre_transition_visible=actor["estate"].get("cfp_pre_transition_visible", False),
            )
        }
        if requested_ids != visible_ids:
            raise HTTPException(status_code=403, detail="One or more bills are not visible to this beneficiary")
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
    actor = await _resolve_financial_actor(estate_id, current_user)
    estate = actor["estate"]
    is_owner = actor["is_owner"] or actor["is_admin"]
    bills = await db.bills.find({"estate_id": estate_id, "deleted_at": None, "status": "active"}, {"_id": 0}).to_list(
        500
    )
    debts = await db.debts.find({"estate_id": estate_id, "deleted_at": None, "status": "active"}, {"_id": 0}).to_list(
        500
    )
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        cfp_pre = estate.get("cfp_pre_transition_visible", False)
        bills = _filter_for_actor(bills, actor, is_transitioned, cfp_pre_transition_visible=cfp_pre)
        debts = _filter_for_actor(debts, actor, is_transitioned, cfp_pre_transition_visible=cfp_pre)

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


def _shorten_token(token: str, max_len: int = 40) -> str:
    """FPDF multi_cell raises 'Not enough horizontal space to render a single
    character' when an unbroken token (e.g. a long signed-URL) is wider than
    the page. Truncate any oversized token with an ellipsis."""
    if len(token) <= max_len:
        return token
    return token[: max_len - 3] + "..."


def _safe_line(parts: list[str], max_token: int = 40) -> str:
    """Build a ' | '-joined detail line where every token is bounded.
    Each input string is itself split on whitespace and every word is
    individually capped so no single token can overflow the page."""
    out = []
    for p in parts:
        if not p:
            continue
        safe = _safe(p)
        # Cap each whitespace-separated word individually.
        capped = " ".join(_shorten_token(w, max_token) for w in safe.split())
        out.append(capped)
    return " | ".join(out)


def _safe_pdf_write(pdf, text: str, line_height: int = 5):
    """multi_cell wrapper that NEVER raises — falls back to ever-shorter
    truncations if FPDF's line-break engine still can't fit a token.
    Resets cursor X to the left margin between attempts because a failed
    multi_cell can leave the X position at the right edge of the page,
    which then makes EVERY subsequent multi_cell raise the same error."""
    from fpdf.errors import FPDFException

    safe = _safe(text)
    # Pre-cap any obviously-too-long unbroken tokens so the line break
    # engine has somewhere to wrap.
    capped = " ".join(_shorten_token(w, 40) for w in safe.split())

    def _reset_x():
        try:
            pdf.set_x(pdf.l_margin)
        except Exception:
            pass

    try:
        pdf.multi_cell(0, line_height, capped)
        return
    except FPDFException:
        _reset_x()
    try:
        more = " ".join(_shorten_token(w, 20) for w in safe.split())
        pdf.multi_cell(0, line_height, more)
        return
    except FPDFException:
        _reset_x()
    try:
        pdf.multi_cell(0, line_height, "(line omitted - too long)")
    except FPDFException:
        # Absolute last resort — silently swallow, page integrity > content.
        _reset_x()


def _fmt_today() -> str:
    """Cross-platform 'Month D, YYYY' (avoid Linux-only %-d)."""
    now = datetime.now(timezone.utc)
    return f"{now.strftime('%B')} {now.day}, {now.year}"


@router.get("/financial/handoff-package/{estate_id}")
async def export_handoff_package(estate_id: str, current_user: dict = Depends(get_current_user)):
    """One-shot printable PDF dossier — the entire financial picture of
    the estate (everything EXCEPT E&S, by user request). Designed to be
    stuck on the fridge and followed in order to keep the estate
    operating during a hand-off. Contains:
      • A 4-tile snapshot (Monthly Bills, Total Debt, Total Assets, Net Position)
      • Weekly cash required to cover bills
      • A 30-day calendar showing what's due each day, with weekly subtotals
      • Detailed bills list (phone, web, account, auto-pay flag, pass-down notes)
      • Detailed debts, accounts, property/asset lists
    """
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
    # E&S entities — only used to compute the 4-tile totals (so the
    # handoff numbers MATCH the dashboard), per user direction:
    # "Capture everything EXCEPT the E&S" — we exclude the entity
    # *roster* from the PDF, but the dashboard tile values still need
    # to roll in their assets/debts so the snapshot is accurate.
    entities = await db.cfp_entities.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)

    # ===== Snapshot tile totals (match dashboard math) =====
    monthly_total = 0.0
    for bill in bills:
        amt = bill.get("amount") or 0
        freq = (bill.get("frequency") or "monthly").lower()
        if freq == "monthly":
            monthly_total += amt
        elif freq == "quarterly":
            monthly_total += amt / 3
        elif freq == "semi_annual":
            monthly_total += amt / 6
        elif freq == "annual":
            monthly_total += amt / 12
        else:
            monthly_total += amt
    bills_count = len(bills)
    weekly_required = monthly_total * 12 / 52

    bill_debt_total = sum(d.get("outstanding_balance") or 0 for d in debts)
    entity_debts = sum(e.get("gross_debts") or 0 for e in entities)
    total_debt = bill_debt_total + entity_debts

    account_assets = sum(a.get("approximate_balance") or 0 for a in accounts)
    property_value = sum(p.get("estimated_value") or 0 for p in property_assets)
    entity_assets = sum(e.get("gross_assets") or 0 for e in entities)
    total_assets = account_assets + property_value + entity_assets
    net_position = total_assets - total_debt

    # ===== 30-day cashflow timeline =====
    today = datetime.now(timezone.utc)
    timeline = []
    for offset in range(30):
        day = today + timedelta(days=offset)
        timeline.append({"date": day, "items": [], "total": 0.0})
    for bill in bills:
        due_day = bill.get("due_day")
        amt = bill.get("amount") or 0
        if not due_day or not amt or (bill.get("status") and bill.get("status") != "active"):
            continue
        try:
            offset = _days_until(int(due_day), today)
        except Exception:
            continue
        if 0 <= offset < 30:
            entry = timeline[offset]
            entry["items"].append(
                {
                    "name": bill.get("name", "?"),
                    "amount": float(amt),
                    "is_auto_pay": bool(bill.get("is_auto_pay")),
                }
            )
            entry["total"] += float(amt)
    thirty_day_outflow = sum(d["total"] for d in timeline)

    # ===== PDF =====
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.add_page()

    # Header
    pdf.set_font("Helvetica", "B", 22)
    pdf.cell(0, 12, _safe("CarryOn Financial Hand-off"), new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(
        0, 6, _safe(f"Generated {_fmt_today()} - Stick this on the fridge."), new_x="LMARGIN", new_y="NEXT", align="C"
    )
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)

    # ===== Four-tile snapshot =====
    # 2x2 grid of tiles, each 88mm wide x 26mm tall.
    def _fmt_money(v: float) -> str:
        if abs(v) >= 1_000_000:
            return f"${v / 1_000_000:.1f}M"
        if abs(v) >= 1_000:
            return f"${v / 1_000:.1f}K"
        return f"${v:,.0f}"

    tiles = [
        (
            "Monthly Bills",
            _fmt_money(monthly_total),
            f"{bills_count} bill{'s' if bills_count != 1 else ''}",
            (220, 245, 232),
        ),
        ("Total Debt", _fmt_money(total_debt), f"{len(debts)} debt{'s' if len(debts) != 1 else ''}", (250, 220, 220)),
        ("Total Assets", _fmt_money(total_assets), f"{len(accounts) + len(property_assets)} items", (220, 232, 250)),
        (
            "Net Position",
            _fmt_money(net_position),
            "Positive" if net_position >= 0 else "Negative",
            (220, 245, 232) if net_position >= 0 else (250, 220, 220),
        ),
    ]
    tile_w, tile_h = 88, 26
    gap = 4
    start_x = pdf.l_margin
    start_y = pdf.get_y()
    for idx, (label, value, sub, color) in enumerate(tiles):
        col = idx % 2
        row = idx // 2
        x = start_x + col * (tile_w + gap)
        y = start_y + row * (tile_h + gap)
        pdf.set_fill_color(*color)
        pdf.rect(x, y, tile_w, tile_h, "F")
        pdf.set_xy(x + 4, y + 3)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(tile_w - 8, 4, _safe(label))
        pdf.set_xy(x + 4, y + 9)
        pdf.set_font("Helvetica", "B", 18)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(tile_w - 8, 9, _safe(value))
        pdf.set_xy(x + 4, y + 19)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(40, 120, 80) if "Positive" in sub else pdf.set_text_color(120, 120, 120)
        pdf.cell(tile_w - 8, 4, _safe(sub))
    pdf.set_text_color(0, 0, 0)
    pdf.set_y(start_y + 2 * (tile_h + gap) + 2)

    # ===== Weekly cash strip =====
    pdf.set_fill_color(247, 235, 200)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(
        0,
        8,
        _safe(
            f"Cash needed per week to cover bills: {_fmt_money(weekly_required)} "
            f"(30-day total: {_fmt_money(thirty_day_outflow)})"
        ),
        new_x="LMARGIN",
        new_y="NEXT",
        fill=True,
        align="C",
    )
    pdf.ln(4)

    # ===== 30-day calendar =====
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_fill_color(247, 235, 200)
    pdf.cell(0, 9, _safe("Next 30 Days - Bill Calendar"), new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.ln(2)
    # Walk timeline in weeks; print a "Week N (subtotal)" header, then
    # one line per day with bills. Empty days printed as "-" to make
    # the document a complete checklist (nothing-due is still useful).
    week_total = 0.0
    for i, day_entry in enumerate(timeline):
        if i % 7 == 0:
            if i > 0:
                # close previous week's subtotal line
                pdf.set_font("Helvetica", "BI", 9)
                pdf.set_text_color(80, 80, 80)
                pdf.cell(0, 5, _safe(f"    Week subtotal: {_fmt_money(week_total)}"), new_x="LMARGIN", new_y="NEXT")
                pdf.set_text_color(0, 0, 0)
                pdf.ln(1)
            week_total = 0.0
            pdf.set_font("Helvetica", "B", 10)
            week_num = (i // 7) + 1
            wk_start = day_entry["date"].strftime("%b %-d")
            wk_end = timeline[min(i + 6, len(timeline) - 1)]["date"].strftime("%b %-d")
            pdf.set_fill_color(235, 240, 250)
            pdf.cell(0, 6, _safe(f"Week {week_num}  ({wk_start} - {wk_end})"), new_x="LMARGIN", new_y="NEXT", fill=True)
        # Day row
        d = day_entry["date"]
        day_label = d.strftime("%a %b %-d")
        pdf.set_font("Helvetica", "B", 10)
        if day_entry["items"]:
            items_str = ", ".join(
                f"{it['name']} {_fmt_money(it['amount'])}{' (auto)' if it['is_auto_pay'] else ''}"
                for it in day_entry["items"]
            )
            _safe_pdf_write(pdf, f"  {day_label}: {items_str} = {_fmt_money(day_entry['total'])}")
            week_total += day_entry["total"]
        else:
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(150, 150, 150)
            pdf.cell(0, 5, _safe(f"  {day_label}: -"), new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
    # final week's subtotal
    pdf.set_font("Helvetica", "BI", 9)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 5, _safe(f"    Week subtotal: {_fmt_money(week_total)}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)

    # ===== Detail sections =====
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
        for label, val in (("FIRST", first), ("GOTCHAS", gotchas), ("WHO TO CALL", who)):
            if not val:
                continue
            _safe_pdf_write(pdf, f"  > {label}: {val}")
        pdf.set_text_color(0, 0, 0)
        pdf.ln(1)

    def bill_row(b: dict):
        pdf.set_font("Helvetica", "B", 11)
        amt = b.get("amount") or 0
        due = b.get("due_day")
        due_txt = f"Day {due}" if due else "see notes"
        _safe_pdf_write(pdf, f"{b.get('name', '?')}  -  ${amt:,.2f}  ({due_txt})", 6)
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
            _safe_pdf_write(pdf, "  " + _safe_line(details))
        passdown_block(b)
        pdf.ln(1)

    def debt_row(d: dict):
        pdf.set_font("Helvetica", "B", 11)
        bal = d.get("outstanding_balance") or 0
        rate = d.get("interest_rate")
        rate_txt = f" @ {rate}%" if rate else ""
        _safe_pdf_write(pdf, f"{d.get('name', '?')}  -  ${bal:,.2f}{rate_txt}", 6)
        pdf.set_font("Helvetica", "", 10)
        details = []
        if d.get("lender_name"):
            details.append(f"Lender: {d['lender_name']}")
        if d.get("lender_phone"):
            details.append(f"Phone: {d['lender_phone']}")
        if d.get("monthly_payment"):
            details.append(f"Monthly: ${d['monthly_payment']:,.2f}")
        if details:
            _safe_pdf_write(pdf, "  " + _safe_line(details))
        passdown_block(d)
        pdf.ln(1)

    def account_row(a: dict):
        pdf.set_font("Helvetica", "B", 11)
        bal = a.get("approximate_balance") or 0
        _safe_pdf_write(pdf, f"{a.get('name', '?')}  -  ${bal:,.2f}", 6)
        pdf.set_font("Helvetica", "", 10)
        details = []
        if a.get("institution_name"):
            details.append(f"Bank: {a['institution_name']}")
        if a.get("account_number_masked"):
            details.append(f"Acct ending: {a['account_number_masked']}")
        if a.get("ownership_type"):
            details.append(f"Ownership: {a['ownership_type']}")
        if details:
            _safe_pdf_write(pdf, "  " + _safe_line(details))
        passdown_block(a)
        pdf.ln(1)

    def asset_row(p: dict):
        pdf.set_font("Helvetica", "B", 11)
        val = p.get("estimated_value") or 0
        _safe_pdf_write(pdf, f"{p.get('name', '?')}  -  ${val:,.2f}", 6)
        pdf.set_font("Helvetica", "", 10)
        details = []
        if p.get("location_address"):
            details.append(f"Location: {p['location_address']}")
        if p.get("ownership_type"):
            details.append(f"Ownership: {p['ownership_type']}")
        if p.get("serial_or_vin"):
            details.append(f"Serial/VIN: {p['serial_or_vin']}")
        if details:
            _safe_pdf_write(pdf, "  " + _safe_line(details))
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
            "Login credentials are NOT printed in this packet - they live "
            "in the Digital Access Vault, which requires the owner's master key. "
            "Entities & Structures (E&S) are intentionally excluded from this "
            "document; see the separate E&S Print Page for the org-chart hand-off."
        ),
    )

    buf = io.BytesIO()
    pdf.output(buf)
    pdf_bytes = buf.getvalue()
    filename = f"carryon-handoff-{estate_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Highly sensitive financial dossier — never cache (audit fa1ad83 #6).
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )
