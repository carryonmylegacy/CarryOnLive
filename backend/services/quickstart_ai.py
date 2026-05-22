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
    purely declarative — let Grok decide how to apply state law.

    Handles BOTH the new (post May-22-2026) and legacy data shapes so
    in-flight users don't lose their answers when the schema evolves.
    New shape uses `residence.state`, `properties.list`, `business.types`,
    `life_insurance.policy_count`, `existing_documents.counts/flags`."""
    parts: list[str] = []

    # State of residence — prefer new `residence`, fall back to legacy `state`.
    residence = data.get("residence") or {}
    state = residence.get("state") or (data.get("state") or {}).get("state_of_residence")
    if state:
        parts.append(f"State of residence: {state}.")
    if residence.get("address"):
        parts.append(f"Personal residence: {residence.get('address')}.")

    # Household — unchanged.
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

    # Beneficiaries — unchanged.
    bens = (data.get("beneficiaries") or {}).get("beneficiaries") or []
    if bens:
        rels = ", ".join(f"{b.get('name')} ({b.get('relationship')})" for b in bens if b.get("name"))
        parts.append(f"Intended beneficiaries: {rels}.")

    # Properties — NEW shape: a multi-add list with address + state per item.
    # Fall back to the legacy `real_estate` block for old in-flight users.
    props = (data.get("properties") or {}).get("list") or []
    if props:
        prop_bits: list[str] = []
        for p in props:
            if not isinstance(p, dict):
                continue
            kind = (p.get("kind") or "property").replace("_", " ")
            loc = p.get("address") or p.get("state") or "(no address)"
            st = p.get("state") or ""
            prop_bits.append(f"{kind} in {st or '?'} ({loc})")
        parts.append("Other properties owned: " + "; ".join(prop_bits) + ".")
    else:
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

    # Life insurance — NEW: policy count + unsure flag.
    li = data.get("life_insurance") or {}
    if "policy_count" in li and li.get("policy_count") is not None:
        count = li.get("policy_count")
        if count == 0:
            parts.append("Life insurance: no active policies.")
        else:
            parts.append(f"Life insurance: {count} active polic{'y' if count == 1 else 'ies'}.")
        if li.get("unsure"):
            parts.append("(User is unsure of exact policy count.)")
    elif li.get("status"):
        parts.append(f"Life insurance: {li.get('status')}.")

    # Business — NEW: multi-select entity types + explicit "none" toggle.
    biz = data.get("business") or {}
    if biz.get("none"):
        parts.append("Business ownership: none.")
    elif isinstance(biz.get("types"), list) and biz.get("types"):
        types = ", ".join(t.replace("_", " ").upper() for t in biz["types"])
        parts.append(f"Business entities owned: {types}.")
    elif biz.get("structure") and biz["structure"] != "none":
        parts.append(f"Business ownership: {biz['structure']}.")

    # Existing documents — NEW: per-type counts + flag list.
    edocs = data.get("existing_documents") or {}
    counts = edocs.get("counts") or {}
    flags = edocs.get("flags") or edocs.get("documents") or []
    has_any = any((counts.get(k) or 0) > 0 for k in counts) or bool(flags)
    if has_any:
        bits = []
        for k, label in (
            ("wills", "will"),
            ("trusts", "trust"),
            ("policies_business", "buy-sell / succession agreement"),
        ):
            n = counts.get(k) or 0
            if n:
                bits.append(f"{n} {label}{'s' if n != 1 else ''}")
        for f in flags:
            bits.append(str(f).replace("_", " "))
        parts.append("Already has: " + ", ".join(bits) + ".")
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
