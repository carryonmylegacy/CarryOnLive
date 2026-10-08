"""Financial Picture (CFP) — AI draft of bills / debts / accounts / property from a spoken or
typed description. Writes nothing: the client reviews the draft and then creates each row
through POST /financial/bills|debts|accounts|property exactly as the forms do."""

import json
from typing import Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from config import db
from services.ai_builder import clean_int, clean_num, clean_str, pick, run_ai_draft
from services.ai_safety import hardened_system_prompt
from utils import get_current_user

from ._core import router, _verify_estate_access

BILL_FREQ = ("monthly", "quarterly", "semi_annual", "annual", "custom", "one_time")
BILL_PAY = ("auto_pay", "manual_online", "check", "phone", "in_person")
BILL_PRIORITY = ("critical", "important", "optional")
TIER_PRIORITY = ("critical", "important", "low")
ACCT_OWNERSHIP = ("individual", "joint_jtwros", "joint_tic", "trust", "pod_tod", "community_property")
ASSET_OWNERSHIP = ("individual", "joint", "trust", "community_property", "llc_owned", "corporate")
ASSET_CATEGORIES = ("real_estate", "vehicle", "jewelry", "artwork", "collectible", "business_entity", "other")


class CfpCatalog(BaseModel):
    bill_categories: dict[str, str]  # id -> label (includes the estate's custom categories)
    debt_categories: dict[str, str]
    account_categories: dict[str, str]


class CfpDraftRequest(BaseModel):
    description: str = Field(min_length=8, max_length=8000)
    catalog: CfpCatalog


ROLE_PROMPT = """You are the CarryOn Financial Picture assistant. A family member describes, in everyday
language (often dictated by voice — expect run-on sentences, "um", and small transcription slips), the
money side of their life: bills they pay, debts they owe, accounts they hold, and property they own.
Convert it into a DRAFT that fills the platform's EXISTING forms.

HARD RULES
1. Four buckets only:
   • bills — recurring or one-time payments (mortgage payment, power, insurance premium, HOA, phone,
     subscriptions, tuition, taxes). A loan PAYMENT is a bill; the loan itself is a debt. When the speaker
     describes a mortgage/car loan with both a balance and a payment, create BOTH a debt and a bill.
   • debts — money owed (mortgage, car loan, student loan, credit card balance, HELOC, personal loan).
   • accounts — where money sits (checking, savings, CDs, brokerage, 401k/IRA, pension, HSA, annuity,
     life-insurance cash value, crypto).
   • property — things owned (homes, land, vehicles, jewelry, art, collectibles). Rental houses are
     property; the rent they produce is NOT a bill.
2. Use ONLY the category ids in CATALOG for bills/debts/accounts and ONLY the listed ids for property
   categories, frequencies, payment methods, ownership types and priorities. Unsure → "other" / null and
   ask in "questions".
3. Never invent amounts, balances, rates, due days, account numbers or institutions the speaker did not
   state or clearly imply. Unknown → null. "About twenty four hundred" → 2400. "The first" → due_day 1.
   "Fifteenth" → 15. Percentages as plain numbers (6.25).
4. Items already in EXISTING (same or clearly the same name) → set "existing_id" and do not duplicate.
5. Auto-pay / "comes out automatically" → is_auto_pay true and payment_method "auto_pay".
6. Priority: mortgage, utilities, insurance, taxes, loan payments → "critical"; everything else
   "important" unless the speaker calls it optional / nice-to-have.
7. Accounts: "joint with my wife" → ownership_type "joint_jtwros" and joint_owner = her name; "in the
   trust" → "trust". Property: "the LLC owns it" → ownership_type "llc_owned".
8. Keep "summary" to ONE plain-English sentence restating what you heard. Put every ambiguity in
   "questions" (max 5 short sentences). Do not ask for things the forms don't need right now (account
   numbers, routing numbers, exact dates) — the subscriber can add those on the tile later.
9. Put any extra detail the speaker gave that has no field (e.g. "payment goes up in March", "Karen handles
   this one") into that item's "notes".

OUTPUT — exactly one fenced JSON block, no prose outside it:
```json
{
  "summary": "string",
  "bills": [{"existing_id": null, "name": "string", "category": "<bill category id>", "amount": 2400 | null,
             "frequency": "monthly|quarterly|semi_annual|annual|custom|one_time", "due_day": 1 | null,
             "is_auto_pay": false, "payment_method": "auto_pay|manual_online|check|phone|in_person" | null,
             "priority": "critical|important|optional", "biller_phone": "string" | null, "notes": "string" | null}],
  "debts": [{"existing_id": null, "name": "string", "category": "<debt category id>", "lender_name": "string" | null,
             "outstanding_balance": 180000 | null, "monthly_payment": 2400 | null, "interest_rate": 6.25 | null,
             "co_signer": "string" | null, "priority": "critical|important|low", "notes": "string" | null}],
  "accounts": [{"existing_id": null, "name": "string", "category": "<account category id>", "institution_name": "string" | null,
                "approximate_balance": 12000 | null, "ownership_type": "individual|joint_jtwros|joint_tic|trust|pod_tod|community_property",
                "joint_owner": "string" | null, "priority": "critical|important|low", "notes": "string" | null}],
  "property": [{"existing_id": null, "name": "string", "category": "real_estate|vehicle|jewelry|artwork|collectible|business_entity|other",
                "estimated_value": 450000 | null, "location_address": "string" | null,
                "ownership_type": "individual|joint|trust|community_property|llc_owned|corporate", "joint_owner": "string" | null,
                "serial_or_vin": "string" | null, "description": "string" | null, "notes": "string" | null}],
  "questions": ["string"]
}
```"""


async def _estate_context(estate_id: str) -> dict:
    async def names(coll: str) -> list[dict]:
        rows = (
            await db[coll]
            .find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0, "id": 1, "name": 1, "category": 1})
            .to_list(400)
        )
        return [{"id": r["id"], "name": r.get("name"), "category": r.get("category")} for r in rows]

    return {
        "bills": await names("bills"),
        "debts": await names("debts"),
        "accounts": await names("financial_accounts"),
        "property": await names("property_assets"),
    }


def _build_messages(description: str, catalog: CfpCatalog, ctx: dict, user: dict) -> list[dict[str, str]]:
    first = user.get("first_name") or (user.get("name") or "").split(" ")[0]
    user_msg = (
        f"SPEAKER: {user.get('name') or first} — the estate owner.\n\n"
        f"CATALOG:\n{json.dumps({'bill_categories': catalog.bill_categories, 'debt_categories': catalog.debt_categories, 'account_categories': catalog.account_categories, 'property_categories': list(ASSET_CATEGORIES)}, separators=(',', ':'))}\n\n"
        f"EXISTING (already on file — reference by existing_id, never duplicate):\n{json.dumps(ctx, separators=(',', ':'))}\n\n"
        f'DESCRIPTION (verbatim from the speaker):\n"""\n{description.strip()}\n"""'
    )
    return [{"role": "system", "content": hardened_system_prompt(ROLE_PROMPT)}, {"role": "user", "content": user_msg}]


def _existing(raw_item: dict, rows: list[dict]) -> Optional[dict]:
    eid = raw_item.get("existing_id")
    return next((r for r in rows if r["id"] == eid), None) if eid else None


def _validate(raw: dict, catalog: CfpCatalog, ctx: dict) -> dict:
    questions = [q for q in (clean_str(x, 300) for x in (raw.get("questions") or [])) if q][:5]
    out = {
        "summary": clean_str(raw.get("summary"), 400) or "",
        "bills": [],
        "debts": [],
        "accounts": [],
        "property": [],
        "questions": questions,
    }

    for b in raw.get("bills") or []:
        if not isinstance(b, dict):
            continue
        ex = _existing(b, ctx["bills"])
        name = ex["name"] if ex else clean_str(b.get("name"), 200)
        if not name:
            continue
        out["bills"].append(
            {
                "existing_id": ex["id"] if ex else None,
                "name": name,
                "category": pick(b.get("category"), catalog.bill_categories, "other"),
                "amount": clean_num(b.get("amount")),
                "frequency": pick(b.get("frequency"), BILL_FREQ, "monthly"),
                "due_day": clean_int(b.get("due_day"), 1, 31),
                "is_auto_pay": bool(b.get("is_auto_pay")),
                "payment_method": pick(
                    b.get("payment_method"), BILL_PAY, "auto_pay" if b.get("is_auto_pay") else "manual_online"
                ),
                "priority": pick(b.get("priority"), BILL_PRIORITY, "important"),
                "biller_phone": clean_str(b.get("biller_phone"), 40),
                "notes": clean_str(b.get("notes"), 500),
            }
        )

    for d in raw.get("debts") or []:
        if not isinstance(d, dict):
            continue
        ex = _existing(d, ctx["debts"])
        name = ex["name"] if ex else clean_str(d.get("name"), 200)
        if not name:
            continue
        out["debts"].append(
            {
                "existing_id": ex["id"] if ex else None,
                "name": name,
                "category": pick(d.get("category"), catalog.debt_categories, "other"),
                "lender_name": clean_str(d.get("lender_name"), 120),
                "outstanding_balance": clean_num(d.get("outstanding_balance")),
                "monthly_payment": clean_num(d.get("monthly_payment")),
                "interest_rate": clean_num(d.get("interest_rate"), 0, 100),
                "co_signer": clean_str(d.get("co_signer"), 120),
                "priority": pick(d.get("priority"), TIER_PRIORITY, "important"),
                "notes": clean_str(d.get("notes"), 500),
            }
        )

    for a in raw.get("accounts") or []:
        if not isinstance(a, dict):
            continue
        ex = _existing(a, ctx["accounts"])
        name = ex["name"] if ex else clean_str(a.get("name"), 200)
        if not name:
            continue
        out["accounts"].append(
            {
                "existing_id": ex["id"] if ex else None,
                "name": name,
                "category": pick(a.get("category"), catalog.account_categories, "other"),
                "institution_name": clean_str(a.get("institution_name"), 120),
                "approximate_balance": clean_num(a.get("approximate_balance")),
                "ownership_type": pick(a.get("ownership_type"), ACCT_OWNERSHIP, "individual"),
                "joint_owner": clean_str(a.get("joint_owner"), 120),
                "priority": pick(a.get("priority"), TIER_PRIORITY, "important"),
                "notes": clean_str(a.get("notes"), 500),
            }
        )

    for p in raw.get("property") or []:
        if not isinstance(p, dict):
            continue
        ex = _existing(p, ctx["property"])
        name = ex["name"] if ex else clean_str(p.get("name"), 200)
        if not name:
            continue
        out["property"].append(
            {
                "existing_id": ex["id"] if ex else None,
                "name": name,
                "category": pick(p.get("category"), ASSET_CATEGORIES, "other"),
                "estimated_value": clean_num(p.get("estimated_value")),
                "location_address": clean_str(p.get("location_address"), 300),
                "ownership_type": pick(p.get("ownership_type"), ASSET_OWNERSHIP, "individual"),
                "joint_owner": clean_str(p.get("joint_owner"), 120),
                "serial_or_vin": clean_str(p.get("serial_or_vin"), 60),
                "description": clean_str(p.get("description"), 500),
                "notes": clean_str(p.get("notes"), 500),
            }
        )
    return out


@router.post("/financial/cfp/{estate_id}/ai-draft")
async def ai_draft_financial_picture(
    estate_id: str, payload: CfpDraftRequest, current_user: dict = Depends(get_current_user)
):
    _estate, can_manage = await _verify_estate_access(estate_id, current_user, require_owner=True)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the estate owner can draft the financial picture")
    ctx = await _estate_context(estate_id)
    raw, used_model = await run_ai_draft(
        current_user=current_user,
        estate_id=estate_id,
        feature="cfp_ai_draft",
        messages=_build_messages(payload.description, payload.catalog, ctx, current_user),
        max_tokens=3500,
    )
    draft = _validate(raw, payload.catalog, ctx)
    if not any(draft[k] for k in ("bills", "debts", "accounts", "property")):
        raise HTTPException(
            status_code=422,
            detail="I could not find any bills, debts, accounts or property in that description. Try naming each one and roughly what it is.",
        )
    return {"draft": draft, "model": used_model}
