"""AI Builder drafts for the plan pillars — Immediate Action Checklist (IAC) and CarryOn Contingency
Protocols (CCP, family disaster plans). Draft only. IAC rows are created by the client through
POST /checklists; the CCP draft is handed to the EXISTING plan wizard (/ccp/wizard/generate) with the
household / disaster / location / follow-up answers pre-filled, and the depth panels (rendezvous,
out-of-area contact, go-bag) through their own PUT endpoints."""

import difflib
import json
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import db
from guards import require_estate_owner
from services.ai_builder import clean_str, pick, run_ai_draft
from services.ai_safety import hardened_system_prompt
from utils import get_current_user

router = APIRouter()

# ───────────────────────────────────────────────────────────────────── IAC ──
IAC_CATEGORIES = ("legal", "financial", "insurance", "property", "medical", "personal", "government", "general")
IAC_PRIORITIES = ("critical", "high", "medium", "low")
IAC_ACTIONS = ("call", "email", "visit", "file_paperwork", "notify", "custom")
IAC_TIMEFRAMES = ("immediate", "first_week", "two_weeks", "first_month", "no_rush")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class DraftRequest(BaseModel):
    description: str = Field(min_length=8, max_length=8000)


IAC_PROMPT = """You are the CarryOn Immediate Action Checklist (IAC) assistant. The estate owner describes, in
everyday language (often dictated), the things their family must DO in the first hours, days and weeks after
they pass — who to call, what to file, what to cancel, who to notify, where things are. Produce a DRAFT that
fills the EXISTING "Add Checklist Item" form.

HARD RULES
1. One item per distinct action. Split "call the pension office and cancel the gym" into two items. Never
   invent actions, phone numbers, emails or addresses the speaker didn't give.
2. title: short imperative ("Call the VA about survivor benefits"). description: one or two sentences of
   what/why/how in the speaker's words.
3. category ∈ CATEGORIES exactly: legal | financial | insurance | property | medical | personal | government |
   general. priority ∈ critical | high | medium | low. action_type ∈ call | email | visit | file_paperwork |
   notify | custom. due_timeframe ∈ immediate | first_week | two_weeks | first_month | no_rush.
   Guide: funeral home, employer, close family, pets/dependents → critical/immediate; Social Security, VA,
   life insurance, banks, mortgage servicer → high/first_week; subscriptions, utilities transfer, DMV,
   memberships → medium/two_weeks or low/first_month.
4. contact_name / contact_phone / contact_email / contact_address ONLY when stated (the person or office to
   reach for THIS item — e.g. "Tom handles the dog" → contact_name "Tom").
5. Items already in EXISTING (same meaning) → existing_id, no duplicate.
6. "summary": ONE sentence. "questions": max 5 short sentences.

OUTPUT — exactly one fenced JSON block, nothing outside it:
```json
{"summary": "string",
 "items": [{"existing_id": null, "title": "string", "description": "string", "category": "<CATEGORIES>", "priority": "<PRIORITIES>",
   "action_type": "<ACTIONS>", "due_timeframe": "<TIMEFRAMES>", "contact_name": null, "contact_phone": null, "contact_email": null,
   "contact_address": null, "notes": null}],
 "questions": ["string"]}
```"""


@router.post("/checklists/{estate_id}/ai-draft")
async def ai_draft_checklist(estate_id: str, payload: DraftRequest, current_user: dict = Depends(get_current_user)):
    await require_estate_owner(estate_id, current_user)
    rows = await db.checklists.find({"estate_id": estate_id}, {"_id": 0, "id": 1, "title": 1, "category": 1}).to_list(400)
    existing = [{"id": r["id"], "title": r.get("title") or "", "category": r.get("category")} for r in rows]
    user_msg = (
        f"SPEAKER: {current_user.get('name') or 'the estate owner'}\n\nEXISTING: {json.dumps(existing, separators=(',', ':'))}\n\n"
        f'DESCRIPTION (verbatim):\n"""\n{payload.description.strip()}\n"""'
    )
    raw, model = await run_ai_draft(
        current_user=current_user, estate_id=estate_id, feature="checklist_ai_draft", max_tokens=3500,
        messages=[{"role": "system", "content": hardened_system_prompt(IAC_PROMPT)}, {"role": "user", "content": user_msg}],
    )
    out = []
    for it in raw.get("items") or []:
        if not isinstance(it, dict):
            continue
        title = clean_str(it.get("title"), 200)
        if not title:
            continue
        ex = next((r for r in existing if r["id"] == it.get("existing_id")), None) or next((r for r in existing if r["title"].lower() == title.lower()), None)
        email = (clean_str(it.get("contact_email"), 200) or "").lower()
        out.append({
            "existing_id": ex["id"] if ex else None,
            "title": ex["title"] if ex else title,
            "description": clean_str(it.get("description"), 1000) or "",
            "category": pick(it.get("category"), IAC_CATEGORIES, "general"),
            "priority": pick(it.get("priority"), IAC_PRIORITIES, "medium"),
            "action_type": pick(it.get("action_type"), IAC_ACTIONS, "custom"),
            "due_timeframe": pick(it.get("due_timeframe"), IAC_TIMEFRAMES, "first_week"),
            "contact_name": clean_str(it.get("contact_name"), 120),
            "contact_phone": clean_str(it.get("contact_phone"), 40),
            "contact_email": email if EMAIL_RE.match(email) else None,
            "contact_address": clean_str(it.get("contact_address"), 300),
            "notes": clean_str(it.get("notes"), 500),
        })
    if not out:
        raise HTTPException(status_code=422, detail="I could not find any actions in that description. Try saying what needs to be done and who should do it.")
    questions = [q for q in (clean_str(x, 300) for x in (raw.get("questions") or [])) if q][:5]
    return {"draft": {"summary": clean_str(raw.get("summary"), 400) or "", "items": out, "questions": questions}, "model": model}


# ───────────────────────────────────────────────────────────────────── CCP ──
CCP_HOUSEHOLD = ("children", "infants", "teens", "elderly", "multigen", "pregnant", "medical_equipment", "disabled", "non_english", "pets", "service_animal", "livestock")
GO_BAG_CATEGORIES = ("water", "food", "medication", "first_aid", "tools", "documents", "cash", "clothing", "communication", "pet_supplies", "comfort", "other")


class TemplateQuestion(BaseModel):
    key: str
    label: str
    required: bool = False
    options: Optional[list[str]] = None


class CcpDraftRequest(BaseModel):
    description: str = Field(min_length=8, max_length=8000)
    templates: dict[str, list[TemplateQuestion]]  # concern id -> follow-up questions (from disasterTemplates.js)


CCP_PROMPT = """You are the CarryOn Contingency Protocols (CCP) assistant — family DISASTER planning. The estate
owner talks through their situation: where they live, who is in the household, which disaster worries them,
where they would go, when they would leave, who takes which pet, where the documents are, what is in the
go-bag, and who the out-of-area check-in contact is. Produce a DRAFT that pre-fills the EXISTING plan wizard
and the depth panels. The plan itself is generated afterwards by the wizard — you only fill its inputs.

HARD RULES
1. concern: exactly ONE id from CONCERNS (the disaster they are planning for). If they mention several, pick
   the one they spend the most words on and list the others THEY MENTIONED in "questions" ("Want a separate
   plan for <other disaster> too?"). Never suggest a disaster they did not bring up.
2. location: the home address or city/state as stated ("Houston, TX" is fine). Never invent one.
3. household: ids from HOUSEHOLD that apply (children, infants, teens, elderly, multigen, pregnant,
   medical_equipment, disabled, non_english, pets, service_animal, livestock). Adults-only → [].
4. follow_up_answers: for the chosen concern, answer ONLY the question keys listed in TEMPLATES for that
   concern, in the speaker's words, as short plain text. If a question has "options", the answer MUST be one
   of those options verbatim or null. Unanswered → omit the key. Never fabricate.
5. rendezvous: primary/secondary meeting or evacuation destinations as label + address/description + notes;
   evacuation_routes = any route talk ("I-45 north, avoid 59"). Omit fields not stated.
6. out_of_area: the relative/friend OUTSIDE the region everyone calls to check in (name, relationship,
   phone, email, city, state, notes). Omit if none.
7. go_bag: items they say they have or need, category ∈ GO_BAG_CATEGORIES, qty as spoken ("3 days", "2 gal").
8. "summary": ONE sentence. "questions": max 5 short sentences — always ask for any REQUIRED template
   question you could not answer.

OUTPUT — exactly one fenced JSON block, nothing outside it:
```json
{"summary": "string",
 "plan": {"concern": "<CONCERNS id>", "location": "string|null", "household": ["<HOUSEHOLD id>"], "follow_up_answers": {"<key>": "string"}},
 "rendezvous": {"primary_label": null, "primary_address": null, "primary_notes": null, "secondary_label": null, "secondary_address": null, "secondary_notes": null, "evacuation_routes": null},
 "out_of_area": {"name": null, "relationship": null, "phone": null, "email": null, "city": null, "state": null, "notes": null},
 "go_bag": [{"category": "<GO_BAG_CATEGORIES>", "name": "string", "qty": null, "notes": null}],
 "questions": ["string"]}
```"""


@router.post("/ccp/{estate_id}/ai-draft")
async def ai_draft_ccp(estate_id: str, payload: CcpDraftRequest, current_user: dict = Depends(get_current_user)):
    await require_estate_owner(estate_id, current_user)
    if not payload.templates:
        raise HTTPException(status_code=400, detail="templates required")
    concerns = list(payload.templates.keys())
    tmpl_compact = {c: [{"key": q.key, "label": q.label, "required": q.required, **({"options": q.options} if q.options else {})} for q in qs] for c, qs in payload.templates.items()}
    user_msg = (
        f"SPEAKER: {current_user.get('name') or 'the estate owner'}\n\nCONCERNS: {json.dumps(concerns)}\n\nHOUSEHOLD: {json.dumps(list(CCP_HOUSEHOLD))}\n\n"
        f"GO_BAG_CATEGORIES: {json.dumps(list(GO_BAG_CATEGORIES))}\n\nTEMPLATES: {json.dumps(tmpl_compact, separators=(',', ':'))}\n\n"
        f'DESCRIPTION (verbatim):\n"""\n{payload.description.strip()}\n"""'
    )
    raw, model = await run_ai_draft(
        current_user=current_user, estate_id=estate_id, feature="ccp_ai_draft", max_tokens=3500,
        messages=[{"role": "system", "content": hardened_system_prompt(CCP_PROMPT)}, {"role": "user", "content": user_msg}],
    )
    plan_raw = raw.get("plan") if isinstance(raw.get("plan"), dict) else {}
    concern = pick(plan_raw.get("concern"), concerns, None)
    if not concern:
        raise HTTPException(status_code=422, detail="I could not tell which disaster you're planning for. Name it (hurricane, wildfire, earthquake, house fire…) and where you live.")
    allowed = {q.key: q for q in payload.templates[concern]}
    answers = {}
    for k, v in (plan_raw.get("follow_up_answers") or {}).items():
        if k not in allowed:
            continue
        txt = clean_str(v, 400)
        if not txt:
            continue
        if allowed[k].options and txt not in allowed[k].options:
            close = difflib.get_close_matches(txt.lower(), [o.lower() for o in allowed[k].options], n=1, cutoff=0.6)
            if not close:
                continue
            txt = next(o for o in allowed[k].options if o.lower() == close[0])
        answers[k] = txt
    household = [h for h in (plan_raw.get("household") or []) if h in CCP_HOUSEHOLD]

    rv_raw = raw.get("rendezvous") if isinstance(raw.get("rendezvous"), dict) else {}
    rendezvous = {k: clean_str(rv_raw.get(k), 300) for k in ("primary_label", "primary_address", "primary_notes", "secondary_label", "secondary_address", "secondary_notes", "evacuation_routes")}
    oa_raw = raw.get("out_of_area") if isinstance(raw.get("out_of_area"), dict) else {}
    out_of_area = {k: clean_str(oa_raw.get(k), 200) for k in ("name", "relationship", "phone", "email", "city", "state", "notes")}
    if out_of_area["email"] and not EMAIL_RE.match(out_of_area["email"]):
        out_of_area["email"] = None
    if out_of_area["state"]:
        out_of_area["state"] = out_of_area["state"][:2].upper() if len(out_of_area["state"]) <= 2 else out_of_area["state"]
    go_bag = []
    for g in raw.get("go_bag") or []:
        if not isinstance(g, dict):
            continue
        name = clean_str(g.get("name"), 120)
        if name:
            go_bag.append({"category": pick(g.get("category"), GO_BAG_CATEGORIES, "other"), "name": name, "qty": clean_str(g.get("qty"), 40), "notes": clean_str(g.get("notes"), 300)})

    questions = [q for q in (clean_str(x, 300) for x in (raw.get("questions") or [])) if q][:5]
    missing = [q.label.rstrip(" *") for q in payload.templates[concern] if q.required and q.key not in answers]
    for m in missing:
        if not any(m.lower()[:20] in q.lower() for q in questions):
            questions.append(f"The wizard still needs: {m}.")
    draft = {
        "summary": clean_str(raw.get("summary"), 400) or "",
        "plan": {"concern": concern, "location": clean_str(plan_raw.get("location"), 300), "household": household, "follow_up_answers": answers},
        "rendezvous": rendezvous,
        "out_of_area": out_of_area,
        "go_bag": go_bag,
        "questions": questions[:5],
    }
    return {"draft": draft, "model": model}

