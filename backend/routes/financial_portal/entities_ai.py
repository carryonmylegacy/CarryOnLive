"""Entities & Structures — AI draft from a plain-language (spoken or typed) description.

POST /financial/entities/{estate_id}/ai-draft turns "I own Harris Holdings LLC in Virginia,
my wife Karen and I each hold 50%…" into a strict JSON draft that fills the EXISTING
entity / outside-person / connection forms. Nothing is written here: the frontend shows
the draft for review and then creates each row through the same endpoints the wizard uses,
so every tile stays editable exactly as a hand-built one.
"""

import asyncio
import json
import re
import time
from typing import Any, Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from config import XAI_MODEL, XAI_MODEL_LIGHT, db, logger, xai_client
from services.ai_burn_guard import require_ai_burn_budget
from services.ai_safety import hardened_system_prompt
from services.llm_cost_ledger import record_xai_response
from utils import get_current_user

from ._core import router, _verify_estate_access

CATEGORIES = ("business", "trust", "charity", "property", "specialized")
EQUITY_ROLES = {"owner", "member", "shareholder", "gp", "lp", "joint_tenant", "tenant_in_common", "community_property"}
_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.S)


class CatalogType(BaseModel):
    id: str
    label: str


class CatalogRole(BaseModel):
    id: str
    label: str
    categories: list[str] = []


class EntityCatalog(BaseModel):
    types: dict[str, list[CatalogType]]
    roles: list[CatalogRole]


class AIDraftRequest(BaseModel):
    description: str = Field(min_length=8, max_length=8000)
    catalog: EntityCatalog


def _person_label(p: dict) -> str:
    return f"{p.get('first_name') or ''} {p.get('last_name') or ''}".strip() or (p.get("name") or "")


async def _estate_context(estate_id: str, user: dict) -> dict:
    entities = await db.cfp_entities.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    people = await db.cfp_external_people.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    rels = await db.cfp_entity_relationships.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(
        2000
    )
    bens = await db.beneficiaries.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(200)
    first = user.get("first_name") or (user.get("name") or "").split(" ")[0]
    return {
        "user": {"id": user["id"], "name": user.get("name") or f"{first} {user.get('last_name') or ''}".strip()},
        "entities": [
            {"id": e["id"], "name": e["name"], "category": e["category"], "type": e["type"]} for e in entities
        ],
        "beneficiaries": [
            {"id": b["id"], "name": b.get("name") or _person_label(b), "relationship": b.get("relationship")}
            for b in bens
        ],
        "external_people": [{"id": p["id"], "name": _person_label(p)} for p in people],
        "relationships": [
            {
                "source_type": r["source_type"],
                "source_id": r["source_id"],
                "target_id": r["target_id"],
                "role": r["role"],
                "ownership_pct": r.get("ownership_pct"),
            }
            for r in rels
        ],
    }


ROLE_PROMPT = """You are the CarryOn Entities & Structures assistant. A family member describes, in everyday
language (often dictated by voice, so expect run-on sentences and small transcription slips), the legal
entities they hold — LLCs, partnerships, corporations, trusts, charities, properties — the people involved,
and how everything connects. Convert it into a DRAFT that fills the platform's existing forms.

HARD RULES
1. Use ONLY the category ids, type ids and role ids in CATALOG. If a type is unclear, pick the closest
   catalog type and add a question. Trusts whose kind is not stated → type "unspecified" + a question.
2. Never invent an entity, person, percentage, state or role that the speaker did not state or clearly imply.
   Unknown → null, and ask in "questions".
3. People: when a described person matches an EXISTING beneficiary / outside person (same first name, and
   last name when given), reference that record via "match" instead of creating a new one. Spouse/children
   named for the first time → new outside people ("match": null); set "relation_hint" (e.g. "wife", "son")
   when stated.
3b. THE SPEAKER. "I", "me", "my", "myself", "I'm" always mean the SPEAKER. Whenever the speaker holds ANY
   role (owner, member, trustee, grantor, …) you MUST include one people entry for them with
   "match": {"kind": "user", "id": "<SPEAKER id>"} (use the speaker's first name) and connect it. "My wife and
   I each own 50%" = TWO connections: the speaker 50% and the wife 50%. Never drop the speaker.
4. Entities already in EXISTING entities (same or clearly the same name) → reference with "existing_id";
   do not duplicate them.
5. Every connection points AT an entity (target_ref must be an entity ref). Sources may be people or
   entities (an LLC owned by a trust: source = the trust, role "owner"/"member").
6. ownership_pct only for equity roles (owner, member, shareholder, gp, lp, joint_tenant, tenant_in_common,
   community_property); otherwise null. If a speaker says "equal", split evenly. Do not force totals to 100.
7. Refs are short local ids you assign: "e1", "e2" for entities, "p1", "p2" for people.
8. Keep "summary" to one plain-English sentence restating what you heard. Put every ambiguity in
   "questions" (max 5, each one short sentence). Do not ask for things the forms don't need (full legal
   names, EINs, dates) — the subscriber can add those on the tile later.
9. Houses, land, bank accounts, vehicles, policies and other plain ASSETS are NOT entities. Never create an
   entity row for them — mention them in the owning entity's "notes" (e.g. "Owns the rental house on Oak
   Street"). The "property" category is ONLY for property-HOLDING structures (Series LLC, Land Trust,
   Delaware Statutory Trust, Massachusetts Business Trust).
10. Trust roles: whoever created/funded the trust is "grantor"; the person administering it is "trustee";
   "successor trustee" steps in later; people who benefit are "beneficiary". One person may hold several
   roles at the same trust → one connection per role.

OUTPUT — exactly one fenced JSON block, no prose outside it:
```json
{
  "summary": "string",
  "entities": [{"ref": "e1", "existing_id": null, "name": "string", "category": "business|trust|charity|property|specialized",
                "type": "<catalog type id>", "formation_state": "VA" | null, "notes": "string" | null}],
  "people": [{"ref": "p1", "first_name": "string", "last_name": "string" | null, "relation_hint": "string" | null,
              "match": {"kind": "user|beneficiary|external_person", "id": "string"} | null}],
  "connections": [{"source_ref": "p1|e2", "target_ref": "e1", "role": "<catalog role id>", "ownership_pct": 50 | null, "notes": "string" | null}],
  "questions": ["string"]
}
```"""


def _build_messages(description: str, catalog: EntityCatalog, ctx: dict) -> list[dict[str, str]]:
    catalog_txt = {
        "categories": {c: [{"id": t.id, "label": t.label} for t in catalog.types.get(c, [])] for c in CATEGORIES},
        "roles": [{"id": r.id, "label": r.label, "for_categories": r.categories} for r in catalog.roles],
    }
    user_msg = (
        f"SPEAKER: {ctx['user']['name']} — the estate owner. Their people entry MUST be "
        f'{{"match": {{"kind": "user", "id": "{ctx["user"]["id"]}"}}}} with first_name "{ctx["user"]["name"].split(" ")[0]}".\n\n'
        f"CATALOG:\n{json.dumps(catalog_txt, separators=(',', ':'))}\n\n"
        f"EXISTING entities:\n{json.dumps(ctx['entities'], separators=(',', ':'))}\n"
        f"EXISTING beneficiaries (family already on the platform):\n{json.dumps(ctx['beneficiaries'], separators=(',', ':'))}\n"
        f"EXISTING outside people:\n{json.dumps(ctx['external_people'], separators=(',', ':'))}\n"
        f"EXISTING connections:\n{json.dumps(ctx['relationships'], separators=(',', ':'))}\n\n"
        f'DESCRIPTION (verbatim from the speaker):\n"""\n{description.strip()}\n"""'
    )
    return [
        {"role": "system", "content": hardened_system_prompt(ROLE_PROMPT)},
        {"role": "user", "content": user_msg},
    ]


def _extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    m = _FENCE_RE.search(text)
    blob = m.group(1) if m else None
    if blob is None:
        start, end = text.find("{"), text.rfind("}")
        blob = text[start : end + 1] if start >= 0 and end > start else None
    if not blob:
        return None
    try:
        parsed = json.loads(blob)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _pct(v: Any) -> Optional[float]:
    try:
        f = float(str(v).replace("%", "").strip())
    except (TypeError, ValueError):
        return None
    return round(f, 2) if 0 <= f <= 100 else None


def _validate_draft(raw: dict, catalog: EntityCatalog, ctx: dict, description: str = "") -> dict:
    """Coerce the model output into something the forms will accept; drop anything off-catalog."""
    type_ids = {c: {t.id for t in catalog.types.get(c, [])} for c in CATEGORIES}
    roles = {r.id: r for r in catalog.roles}
    existing_entities = {e["id"]: e for e in ctx["entities"]}
    known_people = (
        {("user", ctx["user"]["id"])}
        | {("beneficiary", b["id"]) for b in ctx["beneficiaries"]}
        | {("external_person", p["id"]) for p in ctx["external_people"]}
    )
    questions: list[str] = [str(q).strip() for q in (raw.get("questions") or []) if str(q).strip()][:5]

    entities: list[dict] = []
    refs: dict[str, str] = {}  # ref -> "entity" | "person"
    for i, e in enumerate(raw.get("entities") or []):
        if not isinstance(e, dict):
            continue
        ref = str(e.get("ref") or f"e{i + 1}")
        existing_id = e.get("existing_id") if e.get("existing_id") in existing_entities else None
        if existing_id:
            ex = existing_entities[existing_id]
            entities.append(
                {
                    "ref": ref,
                    "existing_id": existing_id,
                    "name": ex["name"],
                    "category": ex["category"],
                    "type": ex["type"],
                    "formation_state": None,
                    "notes": None,
                }
            )
            refs[ref] = "entity"
            continue
        name = str(e.get("name") or "").strip()[:200]
        category = e.get("category") if e.get("category") in CATEGORIES else None
        if not name or not category:
            continue
        type_id = e.get("type") if e.get("type") in type_ids[category] else None
        if type_id is None:
            fallback = (
                "unspecified"
                if "unspecified" in type_ids[category]
                else (sorted(type_ids[category])[0] if type_ids[category] else None)
            )
            if fallback is None:
                continue
            type_id = fallback
            questions.append(f'What kind of {category} is "{name}"? I could not match the type you described.')
        state = str(e.get("formation_state") or "").strip().upper()[:2] or None
        notes = (str(e.get("notes")).strip()[:500] or None) if e.get("notes") else None
        entities.append(
            {
                "ref": ref,
                "existing_id": None,
                "name": name,
                "category": category,
                "type": type_id,
                "formation_state": state,
                "notes": notes,
            }
        )
        refs[ref] = "entity"

    people: list[dict] = []
    for i, p in enumerate(raw.get("people") or []):
        if not isinstance(p, dict):
            continue
        ref = str(p.get("ref") or f"p{i + 1}")
        match = p.get("match") if isinstance(p.get("match"), dict) else None
        if match and (str(match.get("kind")), str(match.get("id"))) not in known_people:
            match = None
        first = str(p.get("first_name") or "").strip()[:100]
        last = (str(p.get("last_name")).strip()[:100] or None) if p.get("last_name") else None
        if not first and not match:
            continue
        people.append(
            {
                "ref": ref,
                "first_name": first or "You",
                "last_name": last,
                "relation_hint": (str(p.get("relation_hint")).strip()[:60] or None) if p.get("relation_hint") else None,
                "match": {"kind": match["kind"], "id": match["id"]} if match else None,
            }
        )
        refs[ref] = "person"

    entity_cat = {e["ref"]: e["category"] for e in entities}
    connections: list[dict] = []
    for c in raw.get("connections") or []:
        if not isinstance(c, dict):
            continue
        src, tgt, role = str(c.get("source_ref") or ""), str(c.get("target_ref") or ""), str(c.get("role") or "")
        if src not in refs or refs.get(tgt) != "entity" or src == tgt:
            continue
        r = roles.get(role)
        if r is None:
            continue
        if r.categories and "*" not in r.categories and entity_cat.get(tgt) not in r.categories:
            questions.append(
                f'"{r.label}" is not a role the forms allow for a {entity_cat.get(tgt)} — please pick another role for that connection.'
            )
        pct = _pct(c.get("ownership_pct")) if role in EQUITY_ROLES else None
        notes = (str(c.get("notes")).strip()[:300] or None) if c.get("notes") else None
        connections.append({"source_ref": src, "target_ref": tgt, "role": role, "ownership_pct": pct, "notes": notes})

    summary = str(raw.get("summary") or "").strip()[:400]
    speaks_first_person = re.search(r"\b(I|I'm|I’m|me|my|myself|we|our)\b", description) is not None
    if speaks_first_person and not any(p["match"] and p["match"]["kind"] == "user" for p in people):
        questions.append(
            'You said "I" / "my" — which roles do you hold yourself? I could not place you in the chart; add yourself as a connection below.'
        )
    return {
        "summary": summary,
        "entities": entities,
        "people": people,
        "connections": connections,
        "questions": questions[:6],
    }


@router.post("/financial/entities/{estate_id}/ai-draft")
async def ai_draft_structure(estate_id: str, payload: AIDraftRequest, current_user: dict = Depends(get_current_user)):
    _estate, can_manage = await _verify_estate_access(estate_id, current_user, require_owner=True)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the estate owner can draft entities")
    if not xai_client:
        raise HTTPException(status_code=503, detail="AI service not configured. Please contact support.")
    await require_ai_burn_budget(current_user, "entities_ai_draft")

    ctx = await _estate_context(estate_id, current_user)
    messages = _build_messages(payload.description, payload.catalog, ctx)

    completion, used_model, last_err = None, None, None
    for model_name in (XAI_MODEL_LIGHT, XAI_MODEL):
        started = time.time()
        try:
            completion = await asyncio.wait_for(
                asyncio.to_thread(
                    xai_client.chat.completions.create,
                    model=model_name,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=3000,
                ),
                timeout=70.0,
            )
            used_model = model_name
            await record_xai_response(
                completion,
                endpoint="entities_ai_draft",
                model=model_name,
                user_id=current_user["id"],
                estate_id=estate_id,
                started_at=started,
            )
            break
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning(f"Entities AI draft failed on {model_name}: {exc}")
    if completion is None:
        raise HTTPException(
            status_code=503, detail=f"AI service unavailable — please try again in a minute. ({last_err})"
        )

    raw = _extract_json(completion.choices[0].message.content or "")
    if raw is None:
        raise HTTPException(status_code=502, detail="The AI reply could not be read. Please try describing it again.")
    draft = _validate_draft(raw, payload.catalog, ctx, payload.description)
    if not draft["entities"] and not draft["connections"]:
        raise HTTPException(
            status_code=422,
            detail="I could not find any entities in that description. Try naming each entity and who is involved.",
        )
    return {"draft": draft, "model": used_model}
