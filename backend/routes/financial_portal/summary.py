"""Financial Portal — Summary, health score, and AI smart categorization."""

from ._core import (
    router,
    _verify_estate_access,
    _filter_for_beneficiary,
)
from fastapi import Depends, HTTPException
from utils import get_current_user
from config import db
from datetime import datetime, timezone
from pydantic import BaseModel


@router.get("/financial/summary/{estate_id}")
async def get_financial_summary(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get aggregated financial summary for the dashboard tile."""
    estate, is_owner = await _verify_estate_access(estate_id, current_user)

    # Match the CFP page's own list filter: a bill/debt/account/property
    # is "active for counting purposes" unless it was explicitly cancelled
    # or deleted. Older rows may have a missing/null `status` field
    # (legacy data, offline-queued inserts that didn't carry `status`),
    # so a strict `status == "active"` filter under-counts them and the
    # dashboard showed 0 bills while the CFP itself showed 3. Use a
    # not-equal-to-cancelled filter instead so the dashboard tile and
    # the CFP page always agree.
    not_cancelled = {"$nin": ["cancelled", "paused"]}
    bills = await db.bills.find(
        {"estate_id": estate_id, "deleted_at": None, "status": not_cancelled}, {"_id": 0}
    ).to_list(500)
    debts = await db.debts.find(
        {"estate_id": estate_id, "deleted_at": None, "status": not_cancelled}, {"_id": 0}
    ).to_list(500)
    accounts = await db.financial_accounts.find(
        {"estate_id": estate_id, "deleted_at": None, "status": not_cancelled}, {"_id": 0}
    ).to_list(500)
    property_assets = await db.property_assets.find(
        {"estate_id": estate_id, "deleted_at": None, "status": not_cancelled}, {"_id": 0}
    ).to_list(500)

    # Filter for beneficiary visibility if not owner
    if not is_owner:
        is_transitioned = estate.get("status") == "transitioned"
        cfp_pre = estate.get("cfp_pre_transition_visible", False)
        bills = _filter_for_beneficiary(bills, current_user["id"], is_transitioned, cfp_pre_transition_visible=cfp_pre)
        debts = _filter_for_beneficiary(debts, current_user["id"], is_transitioned, cfp_pre_transition_visible=cfp_pre)
        accounts = _filter_for_beneficiary(
            accounts, current_user["id"], is_transitioned, cfp_pre_transition_visible=cfp_pre
        )
        property_assets = _filter_for_beneficiary(
            property_assets, current_user["id"], is_transitioned, cfp_pre_transition_visible=cfp_pre
        )

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

    # Same not-cancelled-not-paused inclusion rule as
    # get_financial_summary — keeps the score and the dashboard tile
    # counting from the same set of items.
    not_cancelled = {"$nin": ["cancelled", "paused"]}
    bills = await db.bills.find(
        {"estate_id": estate_id, "deleted_at": None, "status": not_cancelled}, {"_id": 0}
    ).to_list(500)
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
