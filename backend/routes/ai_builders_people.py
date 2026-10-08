"""AI Builder drafts for the people pillars — Beneficiaries, Family & Friends Notification (FFN)
and the Digital Wallet Vault. Draft only; the client creates rows through the pillar's own
POST endpoints. Digital Wallet SECRETS (passwords, PINs, recovery codes) are never part of
the prompt output and are stripped server-side if the model echoes one — the review step
gives the subscriber a masked field that goes straight to the encrypted store."""

import json
import re
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import db
from guards import require_estate_owner
from services.ai_builder import clean_str, pick, run_ai_draft
from services.ai_safety import hardened_system_prompt
from utils import get_current_user

router = APIRouter()

RELATIONSHIPS = (
    "Spouse",
    "Partner",
    "Son",
    "Daughter",
    "Son-in-law",
    "Daughter-in-law",
    "Mother",
    "Father",
    "Mother-in-law",
    "Father-in-law",
    "Brother",
    "Sister",
    "Aunt",
    "Uncle",
    "Grandson",
    "Granddaughter",
    "Grandmother",
    "Grandfather",
    "Nephew",
    "Niece",
    "Friend",
    "Trustee",
    "Professional Service Provider",
    "Charity",
    "Other",
)
WALLET_CATEGORIES = ("crypto", "banking", "email", "social_media", "cloud", "subscription", "other")
WALLET_VISIBILITY = ("private", "posthumous_only", "show_now")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
US_STATE_RE = re.compile(r"^[A-Za-z]{2}$")
SECRET_WORDS = re.compile(
    r"\b(password|passcode|pin|pass ?phrase|recovery (?:code|phrase)|seed phrase|security (?:answer|code)|one.time code)\b",
    re.I,
)


class DraftRequest(BaseModel):
    description: str = Field(min_length=8, max_length=8000)


def _speaker(user: dict) -> str:
    return user.get("name") or f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "the estate owner"


def _surname(user: dict) -> str:
    return (user.get("last_name") or (user.get("name") or "").split(" ")[-1] or "").strip()


def _iso_date(v) -> Optional[str]:
    s = clean_str(v, 20)
    if not s:
        return None
    try:
        d = date.fromisoformat(s[:10])
    except ValueError:
        return None
    return d.isoformat() if 1900 < d.year <= date.today().year else None


def _email(v) -> Optional[str]:
    s = (clean_str(v, 200) or "").lower()
    return s if EMAIL_RE.match(s) else None


def _existing_match(name: str, rows: list[dict]) -> Optional[dict]:
    n = (name or "").strip().lower()
    return next((r for r in rows if n and r["name"].lower() == n), None)


# ─────────────────────────────────────────────────────────── Beneficiaries ──
BEN_PROMPT = """You are the CarryOn Beneficiaries assistant. The estate owner describes, in everyday
language (often dictated — expect run-on sentences and small transcription slips), the people they want to
provide for. Produce a DRAFT that fills the platform's EXISTING "Add Beneficiary" form.

HARD RULES
1. One entry per PERSON (or charity). Never invent people. Pets are not beneficiaries — mention them in
   "questions" instead.
2. relation MUST be one of RELATIONS exactly (e.g. "Son", "Daughter", "Spouse", "Friend", "Charity",
   "Other"). Use the speaker's point of view ("my wife" → "Spouse"; "my daughter's husband" → "Son-in-law").
3. Names: split into first_name / middle_name / last_name / suffix. If a spouse's or child's surname is not
   stated, use SPEAKER_SURNAME and add one question like "I assumed Sarah and Mark share your last name —
   right?". If a surname is genuinely unknown (a friend), leave last_name null and ask.
4. email, phone, date_of_birth (YYYY-MM-DD; "born March 3rd 1998" → "1998-03-03"; "she's 28" → null and
   ask for the birthday), address_street/city/state(2-letter)/zip ONLY when stated. Never guess them.
5. Health / readiness details the speaker volunteers (conditions, allergies, prescriptions, blood type,
   doctor, school or employer) go in those fields; anything else useful goes in "notes".
6. People already in EXISTING (same name) → set existing_id and do not duplicate.
7. "summary": ONE plain sentence restating who you heard. "questions": max 5 short, specific sentences —
   always include one if any email is missing, because the form needs an email for every beneficiary.

OUTPUT — exactly one fenced JSON block, nothing outside it:
```json
{"summary": "string",
 "beneficiaries": [{"existing_id": null, "first_name": "string", "middle_name": null, "last_name": "string|null", "suffix": null,
   "relation": "<one of RELATIONS>", "email": null, "phone": null, "date_of_birth": null,
   "address_street": null, "address_city": null, "address_state": null, "address_zip": null,
   "medical_conditions": null, "allergies": null, "prescriptions": null, "blood_type": null, "primary_doctor": null,
   "school_or_employer": null, "notes": null}],
 "questions": ["string"]}
```"""


@router.post("/beneficiaries/{estate_id}/ai-draft")
async def ai_draft_beneficiaries(estate_id: str, payload: DraftRequest, current_user: dict = Depends(get_current_user)):
    await require_estate_owner(estate_id, current_user)
    rows = await db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0, "id": 1, "name": 1, "relation": 1}).to_list(
        300
    )
    existing = [{"id": r["id"], "name": r.get("name") or "", "relation": r.get("relation")} for r in rows]
    user_msg = (
        f"SPEAKER: {_speaker(current_user)}  SPEAKER_SURNAME: {_surname(current_user) or 'unknown'}\n\n"
        f"RELATIONS: {json.dumps(list(RELATIONSHIPS))}\n\nEXISTING: {json.dumps(existing, separators=(',', ':'))}\n\n"
        f'DESCRIPTION (verbatim):\n"""\n{payload.description.strip()}\n"""'
    )
    raw, model = await run_ai_draft(
        current_user=current_user,
        estate_id=estate_id,
        feature="beneficiaries_ai_draft",
        messages=[
            {"role": "system", "content": hardened_system_prompt(BEN_PROMPT)},
            {"role": "user", "content": user_msg},
        ],
    )
    out = []
    for b in raw.get("beneficiaries") or []:
        if not isinstance(b, dict):
            continue
        ex = next((r for r in existing if r["id"] == b.get("existing_id")), None) or _existing_match(
            f"{b.get('first_name', '')} {b.get('last_name', '')}", existing
        )
        first = clean_str(b.get("first_name"), 80)
        if not first and not ex:
            continue
        state = clean_str(b.get("address_state"), 2)
        out.append(
            {
                "existing_id": ex["id"] if ex else None,
                "existing_name": ex["name"] if ex else None,
                "first_name": first or (ex["name"].split(" ")[0] if ex else ""),
                "middle_name": clean_str(b.get("middle_name"), 80),
                "last_name": clean_str(b.get("last_name"), 80) or "",
                "suffix": clean_str(b.get("suffix"), 10),
                "relation": pick(b.get("relation"), RELATIONSHIPS, "Other"),
                "email": _email(b.get("email")) or "",
                "phone": clean_str(b.get("phone"), 40),
                "date_of_birth": _iso_date(b.get("date_of_birth")),
                "address_street": clean_str(b.get("address_street"), 200),
                "address_city": clean_str(b.get("address_city"), 100),
                "address_state": state.upper() if state and US_STATE_RE.match(state) else None,
                "address_zip": clean_str(b.get("address_zip"), 12),
                "medical_conditions": clean_str(b.get("medical_conditions"), 500),
                "allergies": clean_str(b.get("allergies"), 300),
                "prescriptions": clean_str(b.get("prescriptions"), 500),
                "blood_type": clean_str(b.get("blood_type"), 5),
                "primary_doctor": clean_str(b.get("primary_doctor"), 120),
                "school_or_employer": clean_str(b.get("school_or_employer"), 120),
                "notes": clean_str(b.get("notes"), 500),
            }
        )
    if not out:
        raise HTTPException(
            status_code=422,
            detail="I could not find anyone to add in that description. Try naming each person and how they're related to you.",
        )
    questions = [q for q in (clean_str(x, 300) for x in (raw.get("questions") or [])) if q][:5]
    return {
        "draft": {"summary": clean_str(raw.get("summary"), 400) or "", "beneficiaries": out, "questions": questions},
        "model": model,
    }


# ──────────────────────────────────────────────────────────────────── FFN ──
FFN_PROMPT = """You are the CarryOn Family & Friends Notification (FFN) assistant. The estate owner names the
people who should be TOLD when something happens — relatives, close friends, neighbors, clergy, colleagues,
a business partner, the family doctor or attorney — but who are not necessarily beneficiaries. Produce a
DRAFT that fills the EXISTING "Add Contact" form: name, phone, email, address, relationship, notes.

HARD RULES
1. One entry per person named. Never invent people or contact details; unknown → "" (empty string).
2. "relationship" is free text in the speaker's words, short and capitalised ("Neighbor", "Pastor",
   "College roommate", "Business partner", "Sister-in-law").
3. Anything about HOW or WHEN to reach them ("call, don't text", "she's in Portugal until June", "has a key
   to the house") goes in "notes".
4. People already in EXISTING (same name) → set existing_id and do not duplicate.
5. "summary": ONE sentence. "questions": max 5 short sentences — ask for phone or email when both are missing
   for someone, since a notification needs at least one way to reach them.

OUTPUT — exactly one fenced JSON block, nothing outside it:
```json
{"summary": "string",
 "contacts": [{"existing_id": null, "name": "string", "phone": "", "email": "", "address": "", "relationship": "", "notes": ""}],
 "questions": ["string"]}
```"""


@router.post("/ffn/{estate_id}/ai-draft")
async def ai_draft_ffn(estate_id: str, payload: DraftRequest, current_user: dict = Depends(get_current_user)):
    await require_estate_owner(estate_id, current_user)
    rows = await db.ffn_contacts.find(
        {"estate_id": estate_id}, {"_id": 0, "id": 1, "name": 1, "relationship": 1}
    ).to_list(500)
    existing = [{"id": r["id"], "name": r.get("name") or "", "relationship": r.get("relationship")} for r in rows]
    user_msg = f'SPEAKER: {_speaker(current_user)}\n\nEXISTING: {json.dumps(existing, separators=(",", ":"))}\n\nDESCRIPTION (verbatim):\n"""\n{payload.description.strip()}\n"""'
    raw, model = await run_ai_draft(
        current_user=current_user,
        estate_id=estate_id,
        feature="ffn_ai_draft",
        messages=[
            {"role": "system", "content": hardened_system_prompt(FFN_PROMPT)},
            {"role": "user", "content": user_msg},
        ],
    )
    out = []
    for c in raw.get("contacts") or []:
        if not isinstance(c, dict):
            continue
        name = clean_str(c.get("name"), 120)
        if not name:
            continue
        ex = next((r for r in existing if r["id"] == c.get("existing_id")), None) or _existing_match(name, existing)
        out.append(
            {
                "existing_id": ex["id"] if ex else None,
                "name": ex["name"] if ex else name,
                "phone": clean_str(c.get("phone"), 40) or "",
                "email": _email(c.get("email")) or "",
                "address": clean_str(c.get("address"), 300) or "",
                "relationship": clean_str(c.get("relationship"), 60) or "",
                "notes": clean_str(c.get("notes"), 500) or "",
            }
        )
    if not out:
        raise HTTPException(
            status_code=422,
            detail="I could not find anyone to add in that description. Try naming each person and how you know them.",
        )
    questions = [q for q in (clean_str(x, 300) for x in (raw.get("questions") or [])) if q][:5]
    return {
        "draft": {"summary": clean_str(raw.get("summary"), 400) or "", "contacts": out, "questions": questions},
        "model": model,
    }


# ──────────────────────────────────────────────────────────── Digital Wallet ──
DAV_PROMPT = """You are the CarryOn Digital Wallet assistant. The estate owner lists the online accounts,
subscriptions and digital assets someone will need to handle one day (email, iCloud/Google, banking apps,
crypto exchanges or wallets, social media, streaming/subscriptions, utilities portals, domain names, photo
libraries…). Produce a DRAFT that fills the EXISTING "Add Entry" form.

ABSOLUTE SECURITY RULE — THIS OVERRIDES EVERYTHING
Never output a password, passcode, PIN, recovery phrase, seed phrase, security answer, one-time code or any
other secret, even if the speaker says one out loud. Do not paraphrase it, hint at it, or put it in notes.
If a secret was spoken, set "secret_mentioned": true on that entry (the app then asks the subscriber to type
it into a protected field) and add ONE question: "I heard a password or PIN — for your security I left it
out; type it into the locked field." USERNAMES and EMAIL ADDRESSES used to sign in are fine to include.

OTHER RULES
1. One entry per account. account_name = the service or asset ("Netflix", "Chase mobile", "Coinbase",
   "Gmail — personal", "Ring doorbell"). login_username = the sign-in email/handle if stated, else "".
2. category MUST be one of CATEGORIES: crypto | banking | email | social_media | cloud | subscription | other.
3. assigned_beneficiary_name: if the speaker says who should handle it ("Sarah gets the photos"), copy the
   name EXACTLY as spoken — never substitute a different name from BENEFICIARIES. If nobody is named → null.
4. beneficiary_visibility: "show_now" if they say the person can see it now; "posthumous_only" if "after
   I'm gone"; otherwise "private".
5. What to DO with it ("cancel", "transfer to Mark", "memorialize", "keep paying — it's the family plan")
   and any non-secret access detail ("2FA goes to my phone") go in "notes".
6. Entries already in EXISTING (same account_name) → existing_id, no duplicate.
7. "summary": ONE sentence. "questions": max 5 short sentences.

OUTPUT — exactly one fenced JSON block, nothing outside it:
```json
{"summary": "string",
 "entries": [{"existing_id": null, "account_name": "string", "login_username": "", "category": "<one of CATEGORIES>",
   "assigned_beneficiary_name": null, "beneficiary_visibility": "private", "notes": null, "secret_mentioned": false}],
 "questions": ["string"]}
```"""


def _scrub_secret(text: Optional[str]) -> Optional[str]:
    """Belt-and-braces: drop any sentence that names a secret, in case the model ignored the rule."""
    if not text:
        return text
    kept = [
        s
        for s in re.split(r"(?<=[.!?;])\s+", text)
        if not SECRET_WORDS.search(s) and "locked field" not in s.lower() and "left it out" not in s.lower()
    ]
    return " ".join(kept).strip() or None


@router.post("/digital-wallet/{estate_id}/ai-draft")
async def ai_draft_digital_wallet(
    estate_id: str, payload: DraftRequest, current_user: dict = Depends(get_current_user)
):
    await require_estate_owner(estate_id, current_user)
    rows = await db.digital_wallet.find(
        {"estate_id": estate_id}, {"_id": 0, "id": 1, "account_name": 1, "category": 1}
    ).to_list(500)
    existing = [
        {"id": r["id"], "account_name": r.get("account_name") or "", "category": r.get("category")} for r in rows
    ]
    bens = await db.beneficiaries.find(
        {"estate_id": estate_id}, {"_id": 0, "id": 1, "name": 1, "first_name": 1}
    ).to_list(300)
    user_msg = (
        f"SPEAKER: {_speaker(current_user)}\n\nCATEGORIES: {json.dumps(list(WALLET_CATEGORIES))}\n\n"
        f"BENEFICIARIES (for assigned_beneficiary_name matching): {json.dumps([b.get('name') for b in bens])}\n\n"
        f'EXISTING: {json.dumps(existing, separators=(",", ":"))}\n\nDESCRIPTION (verbatim):\n"""\n{payload.description.strip()}\n"""'
    )
    raw, model = await run_ai_draft(
        current_user=current_user,
        estate_id=estate_id,
        feature="digital_wallet_ai_draft",
        messages=[
            {"role": "system", "content": hardened_system_prompt(DAV_PROMPT)},
            {"role": "user", "content": user_msg},
        ],
    )
    spoken_secret = bool(SECRET_WORDS.search(payload.description))
    out = []
    for e in raw.get("entries") or []:
        if not isinstance(e, dict):
            continue
        name = clean_str(e.get("account_name"), 120)
        if not name:
            continue
        ex = next((r for r in existing if r["id"] == e.get("existing_id")), None) or next(
            (r for r in existing if r["account_name"].lower() == name.lower()), None
        )
        ben_name = clean_str(e.get("assigned_beneficiary_name"), 120)
        if ben_name and ben_name.split(" ")[0].lower() not in payload.description.lower():
            ben_name = None  # model substituted a name the speaker never said
        ben = (
            next(
                (
                    b
                    for b in bens
                    if ben_name
                    and (
                        b.get("name", "").lower() == ben_name.lower()
                        or (b.get("first_name") or "").lower() == ben_name.split(" ")[0].lower()
                    )
                ),
                None,
            )
            if ben_name
            else None
        )
        out.append(
            {
                "existing_id": ex["id"] if ex else None,
                "account_name": ex["account_name"] if ex else name,
                "login_username": _scrub_secret(clean_str(e.get("login_username"), 200)) or "",
                "category": pick(e.get("category"), WALLET_CATEGORIES, "other"),
                "assigned_beneficiary_id": ben["id"] if ben else None,
                "assigned_beneficiary_name": ben.get("name") if ben else ben_name,
                "beneficiary_visibility": pick(e.get("beneficiary_visibility"), WALLET_VISIBILITY, "private"),
                "notes": _scrub_secret(clean_str(e.get("notes"), 500)),
                "secret_mentioned": bool(e.get("secret_mentioned")),
            }
        )
    if spoken_secret and not any(x["secret_mentioned"] for x in out):
        for x in out:
            x["secret_mentioned"] = True
    if not out:
        raise HTTPException(
            status_code=422,
            detail="I could not find any accounts in that description. Try naming each service and what should happen to it.",
        )
    questions = [
        q
        for q in (clean_str(x, 300) for x in (raw.get("questions") or []))
        if q and not SECRET_WORDS.search(q) or "left it out" in (q or "")
    ][:5]
    if spoken_secret and not any("left it out" in q for q in questions):
        questions.insert(
            0,
            "I heard a password or PIN — for your security I left it out; type it into the locked field on that entry.",
        )
    return {
        "draft": {
            "summary": _scrub_secret(clean_str(raw.get("summary"), 400)) or "",
            "entries": out,
            "questions": questions[:5],
        },
        "model": model,
    }
