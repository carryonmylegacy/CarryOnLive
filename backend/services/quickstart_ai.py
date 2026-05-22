"""QuickStart Wizard — Grok prompt builder + response parser.

The prompt asks Grok to produce a short warm intro followed by a
state-aware, family-tailored checklist of actions the user can take
to their estate-planning professionals. The tone direction is
explicit so the model doesn't drift into generic boilerplate.

The model is asked to emit a strict JSON block enclosed in
``json ... `` fences (mirroring the convention used in the Estate
Guardian routes). We then extract & parse that JSON; the warm-intro
prose is read from a separate `intro` field on the JSON object.

Response shape:
{
  "intro": "<2-3 sentences, warm + reassuring>",
  "professional_sections": [
    {
      "professional": "Estate Attorney",
      "why_them":   "<one sentence>",
      "checklist":  ["item 1", "item 2", ...]
    },
    ...
  ],
  "state_notes": "<1-3 sentences specific to the user's state of residence>",
  "next_step":   "<one sentence: what to do RIGHT now>"
}
"""

from __future__ import annotations

import json
import re
from typing import Any

_SYSTEM_PROMPT = """You are the Estate Planning QuickStart Assistant for the CarryOn platform.

You write for an adult (often age 40+) who has NEVER thought seriously about
estate planning. Your job is to take a small set of facts about their
household, state of residence, and assets, and produce a one-page printable
checklist they can take, verbatim, to the right estate-planning
professionals.

You are NOT a lawyer. You do NOT give legal advice. You produce
PROFESSIONAL-PREP CHECKLISTS the user reviews with their attorney / CPA /
financial advisor / insurance agent. Never claim to be a substitute for
those professionals.

Tone rules:
  • Open with 2-3 short sentences that are WARM and REASSURING. Use the
    user's first name once.
  • The rest of the output is a CLEAR, NO-NONSENSE checklist of items the
    user can ask their professionals about.
  • Be specific to the user's state of residence and the assets / family
    structure they provided. Mention community-property states, probate
    nuances, homestead exemptions, transfer-on-death deeds where relevant.
  • Group items by PROFESSIONAL ("Estate Attorney", "CPA / Tax Advisor",
    "Financial Advisor", "Life Insurance Agent / Broker", "Business
    Attorney / CPA" — only include the professionals the user's inputs
    actually imply). Order from most-urgent to least-urgent.
  • Each checklist item is one sentence, plain English, action-oriented.
  • If a professional is not relevant given the inputs (e.g. no business
    ownership), DO NOT include them.

OUTPUT FORMAT — STRICT. Emit ONLY a JSON object inside a ```json fence.
Do not add any prose before or after the fence. The JSON object MUST
match this exact shape:

```json
{
  "intro": "string (2-3 sentences, warm)",
  "professional_sections": [
    {
      "professional": "string (e.g. 'Estate Attorney')",
      "why_them": "string (one short sentence)",
      "checklist": ["string", "string", ...]
    }
  ],
  "state_notes": "string (1-3 sentences specific to state of residence)",
  "next_step": "string (one sentence — what to do RIGHT now)"
}
```
"""


def _human_state_summary(data: dict[str, Any]) -> str:
    """Compact natural-language summary of what the user told us. Kept
    purely declarative — let Grok decide how to apply state law."""
    parts: list[str] = []
    state = (data.get("state") or {}).get("state_of_residence")
    if state:
        parts.append(f"State of residence: {state}.")
    hh = data.get("household") or {}
    if hh:
        marital = hh.get("marital_status") or "unspecified"
        parts.append(f"Marital status: {marital}.")
        dep = hh.get("children_dependent")
        if dep is not None:
            parts.append(f"Dependent children: {dep}.")
        adult = hh.get("children_adult")
        if adult is not None:
            parts.append(f"Adult children: {adult}.")
        if hh.get("special_needs_dependent"):
            parts.append("Has dependents with special needs.")
    bens = (data.get("beneficiaries") or {}).get("beneficiaries") or []
    if bens:
        rels = ", ".join(f"{b.get('name')} ({b.get('relationship')})" for b in bens if b.get("name"))
        parts.append(f"Intended beneficiaries: {rels}.")
    re_block = data.get("real_estate") or {}
    if re_block:
        bits = []
        if re_block.get("primary_residence"):
            bits.append("owns primary residence")
        ac = re_block.get("additional_count") or 0
        if ac:
            bits.append(f"{ac} additional propert{'y' if ac == 1 else 'ies'}")
        if re_block.get("multi_state"):
            bits.append("with at least one property in a different state")
        if bits:
            parts.append("Real estate: " + ", ".join(bits) + ".")
    fa = data.get("financial_accounts") or {}
    if fa:
        flagged = [k.replace("_", " ") for k, v in fa.items() if v]
        if flagged:
            parts.append("Financial account types held: " + ", ".join(flagged) + ".")
    li = (data.get("life_insurance") or {}).get("status")
    if li:
        parts.append(f"Life insurance: {li}.")
    biz = (data.get("business") or {}).get("structure")
    if biz and biz != "none":
        parts.append(f"Business ownership: {biz}.")
    docs = (data.get("existing_documents") or {}).get("documents") or []
    if docs:
        parts.append("Already has: " + ", ".join(docs) + ".")
    else:
        parts.append("No existing estate documents reported.")
    return " ".join(parts) or "No inputs provided."


def build_quickstart_prompt(*, user_name: str, data: dict[str, Any]) -> list[dict[str, str]]:
    summary = _human_state_summary(data)
    first = (user_name or "").split(" ")[0] or "there"
    user_message = (
        f"User's first name: {first}.\nUser-provided facts:\n{summary}\n\nProduce the JSON-fence response now."
    )
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]


_FENCE_RE = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL)


def parse_quickstart_response(text: str) -> dict[str, Any]:
    """Extract the JSON fence. If the model dropped the fence, try the
    first top-level `{ ... }` block. Returns a defensive default
    structure on any parse failure so the PDF still renders."""
    default: dict[str, Any] = {
        "intro": "Here's a starting point for the conversations to come with your professionals.",
        "professional_sections": [],
        "state_notes": "",
        "next_step": "Schedule a consult with an estate attorney in your state.",
    }
    if not text:
        return default
    blob: str | None = None
    m = _FENCE_RE.search(text)
    if m:
        blob = m.group(1)
    else:
        # Best-effort fallback: first { ... } chunk.
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            blob = text[start : end + 1]
    if not blob:
        return default
    try:
        parsed = json.loads(blob)
    except json.JSONDecodeError:
        return default
    if not isinstance(parsed, dict):
        return default
    # Coerce shape.
    parsed.setdefault("intro", default["intro"])
    sections = parsed.get("professional_sections") or []
    if not isinstance(sections, list):
        sections = []
    cleaned: list[dict[str, Any]] = []
    for s in sections:
        if not isinstance(s, dict):
            continue
        items = s.get("checklist") or []
        if not isinstance(items, list):
            items = []
        cleaned.append(
            {
                "professional": str(s.get("professional", "Professional"))[:80],
                "why_them": str(s.get("why_them", ""))[:240],
                "checklist": [str(i)[:400] for i in items if str(i).strip()],
            }
        )
    parsed["professional_sections"] = cleaned
    parsed.setdefault("state_notes", "")
    parsed.setdefault("next_step", default["next_step"])
    return parsed
