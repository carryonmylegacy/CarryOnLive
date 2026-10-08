"""AI Builder drafts for Phase 4 — Milestone Message scaffolding (who / when / why) and the
QuickStart "tell me your story" pre-fill. Draft only. Messages are created by the client through
POST /messages (text scaffold, no media — the subscriber records into it later); the QuickStart draft
is handed to the EXISTING wizard as per-step pre-fill and only persists when the subscriber taps Next
on each screen (PUT /quickstart/step/{step})."""

import json
import re
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import db
from guards import require_estate_owner
from routes.ai_builders_people import RELATIONSHIPS, _speaker
from services.ai_builder import clean_int, clean_str, merge_existing, pick, run_ai_draft
from services.ai_safety import hardened_system_prompt
from services.encryption import decrypt_field, get_estate_salt
from utils import get_current_user

router = APIRouter()


class DraftRequest(BaseModel):
    description: str = Field(min_length=8, max_length=8000)


# ──────────────────────────────────────────────────────── Milestone Messages ──
MM_TYPES = ("text", "voice", "video")
MM_TRIGGERS = ("immediate", "age_milestone", "event", "specific_date")
MM_EVENTS = ("birthday", "graduation", "marriage", "custom")
EVENT_HINTS = (
    ("wedding", "marriage"),
    ("marri", "marriage"),
    ("bride", "marriage"),
    ("groom", "marriage"),
    ("graduat", "graduation"),
    ("birthday", "birthday"),
)
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

MM_PROMPT = """You are the CarryOn Milestone Messages (MM) assistant. The estate owner describes, in everyday
language (often dictated), the messages they want their loved ones to receive at future moments — WHO each
message is for, WHEN it should arrive, and WHY / what they want to say. Produce a DRAFT that scaffolds the
EXISTING "Create Message" form — one draft per message. The owner records the video or voice later.

HARD RULES
1. One entry per distinct message. "A letter to each of my kids on their wedding day" → one entry per named
   child (only names in RECIPIENTS or the description). When a message is addressed to a GROUP ("both kids",
   "all my children", "the grandkids", "everyone") recipient_names MUST list every member of that group who is
   named anywhere in the description or RECIPIENTS — e.g. kids Emma and Jack named earlier → ["Emma", "Jack"].
   Never invent people, dates or ages.
2. recipient_names: names as spoken, matched to RECIPIENTS when clearly the same person (first name is
   enough). Unmatched names stay in recipient_names so the owner can pick them.
3. message_type: video | voice | text — what they said they want to record ("I want to look her in the eye"
   → video; "a letter" / "write" → text; "hear my voice" → voice). Default video.
4. trigger_type:
   immediate      = delivered when the estate transitions (the default when no moment is named)
   age_milestone  = "when he turns 30" → trigger_age 30
   event          = birthday | graduation | marriage | custom. A wedding / "gets married" / "walks down the
                    aisle" is ALWAYS trigger_value "marriage" (never custom). custom only for moments outside
                    those three → custom_event_label like "First child", "Retirement", "First home", "Turned 18"
   specific_date  = an actual calendar date → trigger_date YYYY-MM-DD (only if the year is stated)
5. title: short, warm, in the owner's voice ("For Emma on her wedding day"). why: 1-3 sentences capturing
   what they want to say and why — in THEIR words, never embellished. This becomes the written note they
   record from.
6. "summary": ONE sentence. "questions": max 3 short sentences, ONLY when the answer would change what gets
   created (an unnamed recipient, an unclear moment). Do not ask about relationships or confirm the obvious.
7. Messages already in EXISTING (the same message — same person and the same moment, or the speaker clearly refers
   to it: "change Emma's wedding message to a video", "add Jack to the Christmas note", "make Mike's message
   say thank you for 1998 too") → set "existing_id" and fill in ONLY what changes: a new message_type, a new
   moment (trigger fields), the ADDED recipients in recipient_names, and in "why" ONLY the new thing to say.
   Everything else null. Never duplicate an existing message.

OUTPUT — exactly one fenced JSON block, nothing outside it:
```json
{"summary": "string",
 "messages": [{"existing_id": null, "title": "string", "recipient_names": ["string"], "message_type": "video|voice|text",
   "trigger_type": "immediate|age_milestone|event|specific_date", "trigger_age": null, "trigger_value": null,
   "custom_event_label": null, "trigger_date": null, "why": "string"}],
 "questions": ["string"]}
```
EXAMPLE — "A video for Emma on her wedding day. A note to both kids at Christmas 2027." →
messages[0] recipient_names ["Emma"], trigger_type "event", trigger_value "marriage";
messages[1] recipient_names ["Emma", <the other kid if named>], trigger_type "specific_date", trigger_date "2027-12-25"."""


def _match_recipient(name: str, bens: list[dict]) -> Optional[dict]:
    n = name.strip().lower()
    if not n:
        return None
    for b in bens:
        full = (b.get("name") or "").strip().lower()
        if full and (full == n or full.split(" ")[0] == n.split(" ")[0]):
            return b
        if (b.get("first_name") or "").strip().lower() == n.split(" ")[0]:
            return b
    return None


@router.post("/messages/{estate_id}/ai-draft")
async def ai_draft_messages(estate_id: str, payload: DraftRequest, current_user: dict = Depends(get_current_user)):
    await require_estate_owner(estate_id, current_user)
    bens = await db.beneficiaries.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0, "id": 1, "user_id": 1, "name": 1, "first_name": 1, "relation": 1, "relationship": 1},
    ).to_list(300)
    roster = [
        {"name": b.get("name"), "relationship": b.get("relation") or b.get("relationship")}
        for b in bens
        if b.get("name")
    ]
    name_by_rid = {(b.get("user_id") or b["id"]): b.get("name") for b in bens}
    name_by_rid.update({b["id"]: b.get("name") for b in bens})
    msgs = await db.messages.find(
        {"estate_id": estate_id, "deleted_at": None},
        {
            "_id": 0,
            "id": 1,
            "title": 1,
            "encrypted_title": 1,
            "recipients": 1,
            "message_type": 1,
            "trigger_type": 1,
            "trigger_value": 1,
            "trigger_age": 1,
            "trigger_date": 1,
            "custom_event_label": 1,
        },
    ).to_list(200)
    if msgs:
        salt = await get_estate_salt(estate_id)
        for mg in msgs:
            if mg.get("encrypted_title"):
                try:
                    mg["title"] = decrypt_field(mg["encrypted_title"], salt)
                except Exception:  # noqa: BLE001 — an undecryptable title just stays as stored
                    pass
    existing = [
        {
            "id": mg["id"],
            "title": mg.get("title") or "",
            "recipients": [name_by_rid.get(r, "?") for r in (mg.get("recipients") or [])],
            "message_type": mg.get("message_type"),
            "trigger_type": mg.get("trigger_type"),
            "trigger_value": mg.get("trigger_value"),
            "trigger_age": mg.get("trigger_age"),
            "trigger_date": mg.get("trigger_date"),
            "custom_event_label": mg.get("custom_event_label"),
        }
        for mg in msgs
    ]
    user_msg = (
        f"SPEAKER: {_speaker(current_user)}\n\nTODAY: {date.today().isoformat()}\n\nRECIPIENTS: {json.dumps(roster, separators=(',', ':'))}\n\n"
        f"EXISTING (messages already set up): {json.dumps(existing, separators=(',', ':'))}\n\n"
        f'DESCRIPTION (verbatim):\n"""\n{payload.description.strip()}\n"""'
    )
    raw, model = await run_ai_draft(
        current_user=current_user,
        estate_id=estate_id,
        feature="messages_ai_draft",
        max_tokens=3500,
        messages=[
            {"role": "system", "content": hardened_system_prompt(MM_PROMPT)},
            {"role": "user", "content": user_msg},
        ],
    )
    desc_lower = payload.description.lower()
    out = []
    for m in raw.get("messages") or []:
        if not isinstance(m, dict):
            continue
        ex = next((mg for mg in msgs if mg["id"] == m.get("existing_id")), None)
        title = clean_str(m.get("title"), 120)
        if not title and not ex:
            continue
        names, ids = [], []
        for nm in m.get("recipient_names") or []:
            nm = clean_str(nm, 80)
            if not nm or not re.search(rf"\b{re.escape(nm.split(' ')[0].lower())}\b", desc_lower):
                continue  # the model substituted a name the speaker never said
            b = _match_recipient(nm, bens)
            if b:
                rid = b.get("user_id") or b["id"]
                if rid not in ids:
                    ids.append(rid)
                    names.append(b.get("name") or nm)
            else:
                names.append(nm)
        trig_raw = pick(m.get("trigger_type"), MM_TRIGGERS, None)
        trig = trig_raw or "immediate"
        if (
            not names
            and not ex
            and re.search(
                r"\b(kids?|children|sons?|daughters?|grandkids|grandchildren)\b",
                f"{title} {m.get('why') or ''}".lower(),
            )
        ):
            for b in bens:  # a group message with no names → the children already on the roster
                if (b.get("relation") or b.get("relationship") or "").lower() in (
                    "son",
                    "daughter",
                    "grandson",
                    "granddaughter",
                ):
                    ids.append(b.get("user_id") or b["id"])
                    names.append(b.get("name"))
        age = clean_int(m.get("trigger_age"), 1, 100) if trig == "age_milestone" else None
        if trig == "age_milestone" and not age:
            trig = "immediate"
        event = pick(m.get("trigger_value"), MM_EVENTS, "custom") if trig == "event" else None
        label = clean_str(m.get("custom_event_label"), 80) if event == "custom" else None
        if event == "custom" and not label:
            blob = f"{title} {m.get('why') or ''}".lower()
            event = next((e for kw, e in EVENT_HINTS if kw in blob), "custom")
        d = clean_str(m.get("trigger_date"), 10) if trig == "specific_date" else None
        if trig == "specific_date" and not (d and DATE_RE.match(d)):
            trig, d = "immediate", None
        if ex:
            base = {
                "title": ex.get("title") or "",
                "recipient_ids": list(ex.get("recipients") or []),
                "message_type": ex.get("message_type"),
                "trigger_type": ex.get("trigger_type"),
                "trigger_age": ex.get("trigger_age"),
                "trigger_value": ex.get("trigger_value"),
                "custom_event_label": ex.get("custom_event_label"),
                "trigger_date": ex.get("trigger_date"),
                "why": "",
            }
            spoken = {
                "message_type": pick(m.get("message_type"), MM_TYPES, None),
                "recipient_ids": sorted(set(base["recipient_ids"]) | set(ids)) if ids else None,
                "why": clean_str(m.get("why"), 1500),
            }
            if trig_raw:  # a moment was actually spoken — move the whole trigger together
                spoken.update(
                    {
                        "trigger_type": trig,
                        "trigger_age": age,
                        "trigger_value": event,
                        "custom_event_label": label,
                        "trigger_date": d,
                    }
                )
            merged, changes = merge_existing(base, spoken, append=())
            if "trigger_type" in changes or any(
                k in changes for k in ("trigger_age", "trigger_value", "custom_event_label", "trigger_date")
            ):
                for k in ("trigger_type", "trigger_age", "trigger_value", "custom_event_label", "trigger_date"):
                    merged[k] = spoken.get(k)
            if "recipient_ids" in changes:
                changes = [c for c in changes if c != "recipient_ids"] + ["recipients"]
            merged["recipient_names"] = [name_by_rid.get(r, "?") for r in merged["recipient_ids"]] + [
                n for n in names if n not in name_by_rid.values()
            ]
            out.append({"existing_id": ex["id"], "changes": changes, **merged})
            continue
        out.append(
            {
                "existing_id": None,
                "changes": [],
                "title": title,
                "recipient_ids": ids,
                "recipient_names": names,
                "message_type": pick(m.get("message_type"), MM_TYPES, "video"),
                "trigger_type": trig,
                "trigger_age": age,
                "trigger_value": event,
                "custom_event_label": label,
                "trigger_date": d,
                "why": clean_str(m.get("why"), 1500) or "",
            }
        )
    if not out:
        raise HTTPException(
            status_code=422,
            detail="I could not find any messages in that description. Try saying who each one is for, when it should arrive, and what you want them to know.",
        )
    questions = [q for q in (clean_str(x, 300) for x in (raw.get("questions") or [])) if q][:3]
    return {
        "draft": {"summary": clean_str(raw.get("summary"), 400) or "", "messages": out, "questions": questions},
        "model": model,
    }


# ─────────────────────────────────────────────────────────────── QuickStart ──
QS_MARITAL = ("single", "married", "partnered", "widowed", "divorced", "separated")
QS_TENURE = ("own", "rent", "other")
QS_PROPERTY_KINDS = ("vacation", "rental", "land", "commercial", "other")
QS_BUSINESS = (
    "sole_prop",
    "llc",
    "s_corp",
    "c_corp",
    "partnership",
    "limited_partnership",
    "nonprofit",
    "holding_company",
)
QS_DOC_COUNTS = ("wills", "trusts", "policies_business")
QS_DOC_FLAGS = ("durable_poa", "healthcare_directive", "hipaa_release", "guardianship_designation")
US_STATES = {
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
    "DC",
}
QS_STEPS = ("residence", "household", "properties", "life_insurance", "business", "existing_documents")

QS_PROMPT = """You are the CarryOn QuickStart assistant. A NEW subscriber tells their family story in everyday
language (often dictated): where they live, whether they own or rent, marital status, children and others
they want to provide for (with ages), other real estate, life-insurance policies, businesses they own, and
estate documents they already have. Produce a DRAFT that pre-fills the EXISTING QuickStart wizard screens.
The subscriber reviews every screen before anything is saved.

HARD RULES
1. Only what they said. Never invent names, ages, counts, addresses or documents. Unknown → null / omit.
2. residence: street, city, state (2-letter USPS code, derive from a city only when unambiguous — "Houston" →
   "TX"; "Springfield" → null), zip, tenure ∈ own | rent | other.
3. household.marital_status ∈ MARITAL. household.beneficiaries: one row per PERSON they want to provide for
   or who depends on them — name as spoken, relationship ∈ RELATIONSHIPS (closest fit; a "stepson" → Son,
   "my partner's daughter" → Other), age as an integer when stated ("my 12-year-old" → 12; "grown" → null).
   special_needs_dependent true only if they say a dependent has special needs / a disability.
4. properties.list: real estate OTHER than the home they live in — kind ∈ PROPERTY_KINDS, plus
   street/city/state/zip when stated. None mentioned → [].
5. life_insurance.policy_count: integer when stated ("two policies", "one through work and one term" → 2);
   unsure true if they say they don't know; both null/false if not mentioned.
6. business: none true if they say they own no business; otherwise types ⊂ BUSINESS with counts
   ("two LLCs" → types ["llc"], counts {"llc": 2}). Not mentioned → omit the whole object.
7. existing_documents.counts: wills / trusts / policies_business (buy-sell or succession agreements) as
   integers when stated ("we have a will" → wills 1, "no trust" → trusts 0). flags ⊂ DOC_FLAGS for a durable
   power of attorney, healthcare directive / living will, HIPAA release, guardianship designation they HAVE.
8. "summary": ONE warm sentence. "questions": max 5 short, plain questions for what the wizard still needs
   (state of residence and marital status are required; at least one person to provide for).

OUTPUT — exactly one fenced JSON block, nothing outside it:
```json
{"summary": "string",
 "residence": {"street": null, "city": null, "state": null, "zip": null, "tenure": null},
 "household": {"marital_status": null, "beneficiaries": [{"name": "string", "relationship": "<RELATIONSHIPS>", "age": null}], "special_needs_dependent": false},
 "properties": {"list": [{"kind": "<PROPERTY_KINDS>", "street": null, "city": null, "state": null, "zip": null}]},
 "life_insurance": {"policy_count": null, "unsure": false},
 "business": {"none": false, "types": ["<BUSINESS>"], "counts": {"<BUSINESS>": 1}},
 "existing_documents": {"counts": {"wills": 0, "trusts": 0, "policies_business": 0}, "flags": ["<DOC_FLAGS>"]},
 "questions": ["string"]}
```"""


def _state(v) -> Optional[str]:
    s = (clean_str(v, 2) or "").upper()
    return s if s in US_STATES else None


def _address(d: dict) -> dict:
    street, city, state, zipc = (
        clean_str(d.get("street"), 200),
        clean_str(d.get("city"), 100),
        _state(d.get("state")),
        clean_str(d.get("zip"), 10),
    )
    return {
        "street": street or "",
        "line2": "",
        "city": city or "",
        "state": state or "",
        "zip": zipc or "",
        "address": ", ".join(filter(None, [street, city])),
    }


@router.post("/quickstart/ai-draft")
async def ai_draft_quickstart(payload: DraftRequest, current_user: dict = Depends(get_current_user)):
    if not (
        current_user.get("role") == "benefactor"
        or current_user.get("is_also_benefactor")
        or current_user.get("role") == "admin"
    ):
        raise HTTPException(status_code=403, detail="QuickStart is for benefactors.")
    estate = await db.estates.find_one({"owner_id": current_user["id"], "deleted_at": None}, {"_id": 0, "id": 1})
    estate_id = estate["id"] if estate else None
    bens = []
    if estate_id:
        bens = await db.beneficiaries.find(
            {"estate_id": estate_id, "deleted_at": None},
            {"_id": 0, "id": 1, "name": 1, "first_name": 1, "relation": 1, "relationship": 1},
        ).to_list(300)
    user_msg = (
        f"SPEAKER: {_speaker(current_user)}\n\nMARITAL: {json.dumps(list(QS_MARITAL))}\nRELATIONSHIPS: {json.dumps(list(RELATIONSHIPS))}\n"
        f"PROPERTY_KINDS: {json.dumps(list(QS_PROPERTY_KINDS))}\nBUSINESS: {json.dumps(list(QS_BUSINESS))}\nDOC_FLAGS: {json.dumps(list(QS_DOC_FLAGS))}\n\n"
        f'DESCRIPTION (verbatim):\n"""\n{payload.description.strip()}\n"""'
    )
    raw, model = await run_ai_draft(
        current_user=current_user,
        estate_id=estate_id or "",
        feature="quickstart_ai_draft",
        max_tokens=3000,
        messages=[
            {"role": "system", "content": hardened_system_prompt(QS_PROMPT)},
            {"role": "user", "content": user_msg},
        ],
    )
    desc_lower = payload.description.lower()
    steps: dict = {}

    res = raw.get("residence") if isinstance(raw.get("residence"), dict) else {}
    residence = _address(res)
    tenure = pick(res.get("tenure"), QS_TENURE, None)
    if tenure:
        residence["tenure"] = tenure
    if any(residence.get(k) for k in ("street", "city", "state", "zip")) or tenure:
        steps["residence"] = residence

    hh = raw.get("household") if isinstance(raw.get("household"), dict) else {}
    rows = []
    for b in hh.get("beneficiaries") or []:
        if not isinstance(b, dict):
            continue
        name = clean_str(b.get("name"), 120)
        if not name or not re.search(rf"\b{re.escape(name.split(' ')[0].lower())}\b", desc_lower):
            continue
        rel = pick(b.get("relationship"), RELATIONSHIPS, "Other")
        existing = _match_recipient(name, bens)
        row = {
            "name": existing.get("name") if existing else name,
            "relationship": (existing.get("relation") or existing.get("relationship"))
            if existing and (existing.get("relation") or existing.get("relationship"))
            else rel,
            "age": clean_int(b.get("age"), 0, 120),
        }
        if row["age"] is None:
            row["age"] = ""
        if existing:
            row["beneficiary_id"] = existing["id"]
        rows.append(row)
    household = {}
    marital = pick(hh.get("marital_status"), QS_MARITAL, None)
    if marital:
        household["marital_status"] = marital
    if rows:
        household["beneficiaries"] = rows
    if hh.get("special_needs_dependent") is True:
        household["special_needs_dependent"] = True
    if household:
        steps["household"] = household

    props = raw.get("properties") if isinstance(raw.get("properties"), dict) else {}
    plist = [
        {**_address(p), "kind": pick(p.get("kind"), QS_PROPERTY_KINDS, "other")}
        for p in (props.get("list") or [])
        if isinstance(p, dict)
    ]
    plist = [p for p in plist if p["address"] or p["state"] or p["kind"] != "other"]
    if plist:
        steps["properties"] = {"list": plist}

    li = raw.get("life_insurance") if isinstance(raw.get("life_insurance"), dict) else {}
    count = clean_int(li.get("policy_count"), 0, 20)
    if (count or li.get("unsure") is True) or (count == 0 and re.search(r"insur|polic", desc_lower)):
        steps["life_insurance"] = {
            "policy_count": count if count is not None else 0,
            "unsure": li.get("unsure") is True,
        }

    biz = raw.get("business") if isinstance(raw.get("business"), dict) else None
    if biz:
        if biz.get("none") is True and re.search(r"business|compan|llc|corp|partnership|self.employed|own", desc_lower):
            steps["business"] = {"none": True, "types": [], "counts": {}}
        elif biz.get("none") is not True:
            types = [t for t in (biz.get("types") or []) if t in QS_BUSINESS]
            if types:
                counts_raw = biz.get("counts") if isinstance(biz.get("counts"), dict) else {}
                steps["business"] = {
                    "none": False,
                    "types": types,
                    "counts": {t: clean_int(counts_raw.get(t), 1, 50) or 1 for t in types},
                }

    docs = raw.get("existing_documents") if isinstance(raw.get("existing_documents"), dict) else {}
    counts_raw = docs.get("counts") if isinstance(docs.get("counts"), dict) else {}
    counts = {
        k: clean_int(counts_raw.get(k), 0, 20) for k in QS_DOC_COUNTS if clean_int(counts_raw.get(k), 0, 20) is not None
    }
    flags = [f for f in (docs.get("flags") or []) if f in QS_DOC_FLAGS]
    if any(counts.values()) or flags or (counts and re.search(r"\bwill\b|trust|succession|buy.sell", desc_lower)):
        steps["existing_documents"] = {"counts": counts, "flags": flags}

    if not steps:
        raise HTTPException(
            status_code=422,
            detail="I could not pick out any answers from that. Try telling me where you live, who is in your family, and what you own.",
        )
    questions = [q for q in (clean_str(x, 300) for x in (raw.get("questions") or [])) if q][:5]
    return {
        "draft": {
            "summary": clean_str(raw.get("summary"), 400) or "",
            "steps": steps,
            "filled": [s for s in QS_STEPS if s in steps],
            "questions": questions,
        },
        "model": model,
    }
