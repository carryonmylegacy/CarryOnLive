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
household, state of residence, and assets, and produce a multi-page,
personalized, professional-prep guide they can take, verbatim, to the right
estate-planning professionals. The output is meant to feel like a thoughtful
analyst spent 30 minutes drafting it for THIS user, not a generic
fill-in-the-blank template.

You are NOT a lawyer. You do NOT give legal advice. You produce
PROFESSIONAL-PREP CHECKLISTS the user reviews with their attorney / CPA /
financial advisor / insurance agent. Never claim to be a substitute for
those professionals.

Tone & depth rules:
  - Open with 4 to 6 sentences that are WARM, REASSURING, and DENSELY
    personalized. Use the user's first name twice. Reference at least three
    concrete facts from their inputs (e.g. "your two children Emma and
    Kent", "the LLC and C corp on top of your Virginia residence", "the
    Tennessee rental you carry alongside the Arlington home"). Acknowledge
    the emotional weight; promise that working a checklist is the first
    real step.
  - The rest of the output is a CLEAR, DETAILED, NO-NONSENSE set of items
    the user can take to their professionals. Aim for FIVE TO EIGHT
    checklist items per professional you include.
  - Each checklist item is 2 to 3 sentences. The first sentence is the
    action verb. The follow-on sentence(s) explain WHY THIS SPECIFIC USER
    needs that action, tying back to their state of residence, family
    structure, properties, entities, or existing documents. Be concrete -
    name names, name states, name entity types.
  - Group items by PROFESSIONAL ("Estate Attorney", "Business Attorney /
    CPA", "CPA / Tax Advisor", "Financial Advisor", "Life Insurance Agent
    / Broker", "Trust Officer / Successor Trustee" - only include the
    professionals the user's inputs actually imply). Order from most-urgent
    to least-urgent. If the user has business entities, ALWAYS include
    Business Attorney / CPA AND CPA / Tax Advisor as separate sections.
  - "why_them" is one to two sentences naming the SPECIFIC risk this
    professional is best positioned to mitigate for THIS user.

State-law specificity:
  - Reference the user's state by name (e.g. "Virginia", "Florida") and
    cite at least three concrete state-law mechanisms relevant to them:
    community-property versus separate-property regimes, transfer-on-death
    deed availability, homestead exemption protections (with the rough
    dollar figure if you know it), probate small-estate thresholds,
    intestate succession defaults, and ancillary probate triggers for
    out-of-state real property.
  - The `state_notes` field MUST be a 4 to 6 sentence paragraph (not a
    one-liner), naming the specific mechanics that apply to THIS user's
    assets in THEIR state.

PERSONALIZED OBSERVATIONS:
  - Include a `personalized_observations` array of 3 to 5 short
    paragraphs (2 to 3 sentences each). Each observation calls out a
    specific RISK or OPPORTUNITY this user faces because of how their
    state, family, and assets combine. Examples of the depth expected:
    "Your Tennessee rental will trigger ancillary probate in TN unless you
    retitle it into a revocable living trust or hold it under an LLC.
    Coordinate this BEFORE the Virginia will is finalized so the trust
    can be named as the beneficiary of the LLC interest."
    "With minor child Kent still a dependent, name a UTMA custodian or
    fund a testamentary trust inside the will. Otherwise Virginia
    intestate rules will route an outright distribution to him at age 18,
    which is rarely what parents intend."

KEY TERMS GLOSSARY:
  - Include a `key_terms` array of 4 to 6 entries. Each is a short
    plain-English definition (1 to 2 sentences) of a term the user will
    encounter in their meetings. CHOOSE terms relevant to THIS user's
    situation (e.g. include "Ancillary probate" if they own out-of-state
    real estate; include "Step-up in basis" if they own a rental or
    business interest; include "Pour-over will" if you have recommended a
    trust; skip "Generation-skipping transfer tax" if the estate is
    obviously sub-threshold).

OUTPUT FORMAT - STRICT. Emit ONLY a JSON object inside a ```json fence.
Do not add any prose before or after the fence. The JSON object MUST
match this exact shape:

```json
{
  "intro": "string (4 to 6 sentences, warm, references at least three concrete user facts)",
  "professional_sections": [
    {
      "professional": "string (e.g. 'Estate Attorney')",
      "why_them": "string (1 to 2 sentences naming the specific risk)",
      "checklist": [
        "string (2 to 3 sentences: action + WHY for THIS user)",
        "string", "string", "string", "string"
      ]
    }
  ],
  "personalized_observations": [
    "string (2 to 3 sentences naming a specific risk or opportunity)",
    "string", "string"
  ],
  "state_notes": "string (4 to 6 sentences, names specific state-law mechanisms)",
  "key_terms": [
    {"term": "string", "definition": "string (1 to 2 sentences)"},
    {"term": "string", "definition": "string"}
  ],
  "next_step": "string (one sentence - what to do RIGHT now)"
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
    # Tenure (own / rent / other) — Feb 26 2026. Critical for the AI
    # to avoid statements like "your home will pass through probate"
    # when the user rents. Renters skip homestead-exemption guidance
    # and we steer property guidance to assets they actually OWN.
    tenure = (residence.get("tenure") or "").lower()
    if tenure == "own":
        parts.append("Residence tenure: user OWNS their personal residence.")
    elif tenure == "rent":
        parts.append(
            "Residence tenure: user RENTS their personal residence — DO NOT include guidance about homestead exemptions, deed transfer, or probate of the home itself; that home is NOT part of their estate."
        )
    elif tenure == "other":
        parts.append(
            "Residence tenure: OTHER (e.g. living with family, corporate housing, residence held in trust by another party) — treat the residence as NOT a personal-name asset for guidance purposes."
        )

    # Household — reconciled against named beneficiaries below to
    # prevent the AI from double-counting children (founder May 26
    # 2026: AI was inventing an extra minor child on top of named
    # Son/Daughter beneficiaries).
    hh = data.get("household") or {}
    bens = (data.get("beneficiaries") or {}).get("beneficiaries") or []
    if hh or bens:
        marital = (hh.get("marital_status") or "").strip() or None
        if marital:
            parts.append(f"Marital status: {marital}.")
        try:
            dep_count = int(hh.get("children_dependent") or 0)
        except (TypeError, ValueError):
            dep_count = 0
        try:
            adult_count = int(hh.get("children_adult") or 0)
        except (TypeError, ValueError):
            adult_count = 0
        total_children = max(0, dep_count + adult_count)

        # Count beneficiaries that are clearly the user's own children.
        # `Son` / `Daughter` are direct children; grandchildren are
        # separate. We treat case-insensitively and trim whitespace.
        child_rels = {"son", "daughter"}
        named_children = [
            b
            for b in bens
            if str(b.get("relationship") or "").strip().lower() in child_rels and (b.get("name") or "").strip()
        ]
        named_child_count = len(named_children)

        if total_children or named_child_count:
            # Reconciled, explicit phrasing so the AI does NOT add
            # phantom additional minors on top of the named list.
            extra_unnamed = max(0, total_children - named_child_count)
            child_bits: list[str] = []
            if dep_count or adult_count:
                child_bits.append(f"{total_children} total children ({dep_count} dependent/minor, {adult_count} adult)")
            else:
                child_bits.append(f"{total_children} total children")
            if named_children:
                names = ", ".join(f"{b.get('name')} ({b.get('relationship')})" for b in named_children)
                child_bits.append(f"named: {names}")
            if extra_unnamed:
                child_bits.append(f"{extra_unnamed} unnamed additional child{'ren' if extra_unnamed != 1 else ''}")
            else:
                # Critical guardrail — keeps Grok from inventing extras.
                child_bits.append(
                    "no additional unnamed children — the named beneficiaries above ARE the user's entire roster of children, including any dependent minors. Do NOT mention 'a dependent child still at home' or any extra minor in addition to the named children."
                )
            parts.append("Children: " + "; ".join(child_bits) + ".")

        if hh.get("special_needs_dependent"):
            parts.append("Has dependents with special needs.")

    # Non-child beneficiaries (spouse, siblings, charities, friends, etc.)
    # listed separately so the AI still references them by name without
    # confusing them with the children reconciliation above.
    non_child_bens = [
        b
        for b in bens
        if str(b.get("relationship") or "").strip().lower() not in {"son", "daughter"} and (b.get("name") or "").strip()
    ]
    if non_child_bens:
        rels = ", ".join(f"{b.get('name')} ({b.get('relationship')})" for b in non_child_bens)
        parts.append(f"Other intended beneficiaries: {rels}.")

    # Properties — NEW shape: a multi-add list with address + state per item.
    # Fall back to the legacy `real_estate` block for old in-flight users.
    props = (data.get("properties") or {}).get("list") or []
    if props:
        prop_bits: list[str] = []
        for p in props:
            if not isinstance(p, dict):
                continue
            kind = (p.get("kind") or "property").replace("_", " ")
            # Prefer a full street address when the user provided it
            # (Feb 26 2026 founder direction — higher-fidelity prompt
            # so Grok can reference each property by name in the guide).
            street = (p.get("street") or "").strip()
            city = (p.get("city") or "").strip()
            zipc = (p.get("zip") or "").strip()
            st = (p.get("state") or "").strip()
            if street and city and st:
                loc = f"{street}, {city}, {st}{(' ' + zipc) if zipc else ''}"
            else:
                loc = p.get("address") or st or "(no address)"
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

    # Business — NEW: multi-select entity types + per-type count + explicit "none".
    biz = data.get("business") or {}
    if biz.get("none"):
        parts.append("Business ownership: none.")
    elif isinstance(biz.get("types"), list) and biz.get("types"):
        counts = biz.get("counts") or {}
        bits: list[str] = []
        for t in biz["types"]:
            label = t.replace("_", " ").upper()
            try:
                n = int(counts.get(t) or 1)
            except (TypeError, ValueError):
                n = 1
            n = max(1, n)
            bits.append(f"{n} {label}" if n > 1 else label)
        parts.append(f"Business entities owned: {', '.join(bits)}.")
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
        "personalized_observations": [],
        "state_notes": "",
        "key_terms": [],
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
    # Personalized observations - list of short paragraphs.
    obs = parsed.get("personalized_observations") or []
    if not isinstance(obs, list):
        obs = []
    parsed["personalized_observations"] = [str(o)[:600] for o in obs if str(o).strip()]
    parsed.setdefault("state_notes", "")
    # Key-terms glossary - list of {term, definition}.
    kt = parsed.get("key_terms") or []
    if not isinstance(kt, list):
        kt = []
    cleaned_kt: list[dict[str, str]] = []
    for entry in kt:
        if isinstance(entry, dict) and entry.get("term") and entry.get("definition"):
            cleaned_kt.append(
                {
                    "term": str(entry["term"])[:80],
                    "definition": str(entry["definition"])[:400],
                }
            )
    parsed["key_terms"] = cleaned_kt
    parsed.setdefault("next_step", default["next_step"])
    return parsed
