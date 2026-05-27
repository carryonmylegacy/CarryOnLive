"""QuickStart Wizard — PDF renderer.

Server-side fpdf2 rendering that matches the existing platform PDF
cadence (Helvetica family, CarryOn gold accent, blue-grey body type,
identical margin / rule treatment as `estate_binder._build_title_and_toc_pdf`).

Visual outline (1-3 pages):
  • Cover-ish header block:
      - "CarryOn" gold wordmark + "QUICKSTART GUIDE" label
      - User name + state of residence + generation date
      - 60mm centered gold rule
  • Inputs summary block — what the user told us, rendered as a tidy
    two-column key/value list. This is the "snapshot" the user shows
    the professional.
  • Warm intro paragraph (xAI-generated).
  • Professional sections — one per professional Grok included, each
    with a bold title, one-line "why them" subline, and a numbered
    checklist.
  • State-law notes + the "Do this RIGHT now" closing line.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from services.quickstart_ai import _qw_beneficiaries

from fpdf import FPDF

_GOLD = (212, 175, 55)
_INK = (30, 40, 70)
_BODY = (60, 70, 90)
_MUTED = (120, 130, 150)
_FAINT = (180, 188, 200)

_GLYPH_SUBSTITUTIONS = {
    "\u2014": " - ",
    "\u2013": "-",
    "\u2212": "-",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2026": "...",
    "\u2022": "*",
    "\u00b7": "-",
    "\u00a0": " ",
}


def _safe(text: str | None) -> str:
    if not text:
        return ""
    for src, repl in _GLYPH_SUBSTITUTIONS.items():
        if src in text:
            text = text.replace(src, repl)
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _rule(pdf: FPDF, width: float = 60.0, weight: float = 0.5) -> None:
    pdf.set_draw_color(*_GOLD)
    pdf.set_line_width(weight)
    pdf.line(
        (pdf.w - width) / 2,
        pdf.get_y(),
        (pdf.w - width) / 2 + width,
        pdf.get_y(),
    )


def _section_heading(pdf: FPDF, label: str) -> None:
    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*_INK)
    pdf.cell(0, 7, _safe(label), new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*_GOLD)
    pdf.set_line_width(0.4)
    page_w = pdf.w - 2 * pdf.l_margin
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + page_w * 0.25, pdf.get_y())
    pdf.ln(4)


def _kv_row(pdf: FPDF, key: str, value: str) -> None:
    if not value:
        return
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*_BODY)
    pdf.cell(55, 6, _safe(key), new_x="RIGHT", new_y="TOP")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*_INK)
    pdf.multi_cell(0, 6, _safe(value), new_x="LMARGIN", new_y="NEXT")


def _state_of(data: dict[str, Any]) -> str:
    """Resolve the user's state of residence from the new
    `residence.state` field, falling back to legacy `state.state_of_residence`."""
    res = data.get("residence") or {}
    return res.get("state") or (data.get("state") or {}).get("state_of_residence") or ""


def _format_household(data: dict[str, Any]) -> str:
    hh = data.get("household") or {}
    parts: list[str] = []
    m = hh.get("marital_status")
    if m:
        parts.append(m.capitalize())
    dep = hh.get("children_dependent")
    if dep:
        parts.append(f"{dep} dependent {'child' if dep == 1 else 'children'}")
    adult = hh.get("children_adult")
    if adult:
        parts.append(f"{adult} adult {'child' if adult == 1 else 'children'}")
    if hh.get("special_needs_dependent"):
        parts.append("special-needs dependent(s)")
    return ", ".join(parts)


def _format_real_estate(data: dict[str, Any]) -> str:
    # NEW shape — `properties.list` is a multi-add with address+state per row.
    props = (data.get("properties") or {}).get("list") or []
    if props:
        bits: list[str] = []
        for p in props:
            if not isinstance(p, dict):
                continue
            kind = (p.get("kind") or "property").replace("_", " ").title()
            st = p.get("state") or "?"
            # Prefer a full street address when the user provided it
            # (Feb 26 2026 founder direction — higher PDF fidelity).
            street = (p.get("street") or "").strip()
            city = (p.get("city") or "").strip()
            zipc = (p.get("zip") or "").strip()
            if street and city:
                addr = f"{street}, {city}, {st}{(' ' + zipc) if zipc else ''}"
            else:
                addr = p.get("address") or ""
            bits.append(f"{kind} ({st}){' — ' + addr if addr else ''}")
        return " | ".join(bits)
    # Legacy fallback.
    re_block = data.get("real_estate") or {}
    bits = []
    if re_block.get("primary_residence"):
        bits.append("primary residence")
    ac = re_block.get("additional_count") or 0
    if ac:
        bits.append(f"{ac} additional propert{'y' if ac == 1 else 'ies'}")
    if re_block.get("multi_state"):
        bits.append("at least one out-of-state property")
    return ", ".join(bits) or "None reported"


def _format_residence(data: dict[str, Any]) -> str:
    res = data.get("residence") or {}
    addr = res.get("address") or ""
    state = res.get("state") or ""
    # Append tenure suffix when known so the printed guide is accurate
    # for renters and other-arrangement users (Feb 26 2026 founder
    # direction). "Owned" suffix is implied by default — only call it
    # out for non-ownership.
    tenure = (res.get("tenure") or "").lower()
    suffix = ""
    if tenure == "rent":
        suffix = " — rented"
    elif tenure == "other":
        suffix = " — other arrangement"
    if addr and state:
        return f"{addr} ({state}){suffix}"
    return (addr or state or "") + suffix


def _format_business(data: dict[str, Any]) -> str:
    biz = data.get("business") or {}
    if biz.get("none"):
        return "None"
    types = biz.get("types") or []
    if isinstance(types, list) and types:
        counts = biz.get("counts") or {}
        bits: list[str] = []
        for t in types:
            label = t.replace("_", " ").upper()
            try:
                n = int(counts.get(t) or 1)
            except (TypeError, ValueError):
                n = 1
            n = max(1, n)
            bits.append(f"{n}× {label}" if n > 1 else label)
        return ", ".join(bits)
    # Legacy single-structure fallback.
    structure = biz.get("structure")
    if structure and structure != "none":
        return structure.replace("_", " ").upper()
    return ""


def _format_life_insurance(data: dict[str, Any]) -> str:
    li = data.get("life_insurance") or {}
    if "policy_count" in li and li.get("policy_count") is not None:
        n = li["policy_count"]
        base = "No active policies" if n == 0 else f"{n} polic{'y' if n == 1 else 'ies'}"
        if li.get("unsure"):
            return base + " (user unsure of exact count)"
        return base
    return (li.get("status") or "").title()


def _format_accounts(data: dict[str, Any]) -> str:
    fa = data.get("financial_accounts") or {}
    flagged = [k.replace("_", " ").title() for k, v in fa.items() if v]
    return ", ".join(flagged) or "None reported"


def _format_beneficiaries(data: dict[str, Any]) -> str:
    bens = _qw_beneficiaries(data)
    if not bens:
        return "None added yet"
    return ", ".join(f"{b.get('name')} ({b.get('relationship')})" for b in bens if b.get("name"))


def _format_documents(data: dict[str, Any]) -> str:
    edocs = data.get("existing_documents") or {}
    counts = edocs.get("counts") or {}
    flags = edocs.get("flags") or edocs.get("documents") or []
    bits: list[str] = []
    for k, label in (("wills", "will"), ("trusts", "trust"), ("policies_business", "buy-sell / succession")):
        n = counts.get(k) or 0
        if n:
            bits.append(f"{n} {label}{'s' if n != 1 else ''}")
    for f in flags:
        bits.append(str(f).replace("_", " ").title())
    return ", ".join(bits) or "None reported"


def build_quickstart_pdf(
    *,
    user_name: str,
    data: dict[str, Any],
    ai_payload: dict[str, Any],
    generated_at: datetime,
) -> bytes:
    """Render the QuickStart Guide PDF. Returns raw bytes."""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # ── Brand band ───────────────────────────────────────────────────
    pdf.ln(8)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(*_GOLD)
    pdf.cell(0, 12, _safe("CarryOn"), new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*_MUTED)
    pdf.cell(0, 5, _safe("QUICKSTART ESTATE PLAN GUIDE"), new_x="LMARGIN", new_y="NEXT", align="C")

    pdf.ln(8)
    _rule(pdf, width=60, weight=0.6)
    pdf.ln(8)

    # ── Prepared-for block ───────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*_INK)
    pdf.cell(0, 9, _safe(f"Prepared for {user_name}"), new_x="LMARGIN", new_y="NEXT", align="C")

    state = _state_of(data)
    sub_bits: list[str] = []
    if state:
        sub_bits.append(f"State of residence: {state}")
    sub_bits.append("Generated " + generated_at.astimezone().strftime("%B %d, %Y"))
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*_MUTED)
    pdf.cell(0, 6, _safe("  ·  ".join(sub_bits)), new_x="LMARGIN", new_y="NEXT", align="C")

    pdf.ln(8)

    # ── Intro paragraph (Grok) ───────────────────────────────────────
    intro = ai_payload.get("intro") or ""
    if intro:
        pdf.set_font("Helvetica", "I", 11)
        pdf.set_text_color(*_BODY)
        pdf.multi_cell(0, 6.5, _safe(intro), new_x="LMARGIN", new_y="NEXT", align="L")
        pdf.ln(2)

    # ── Snapshot block ───────────────────────────────────────────────
    _section_heading(pdf, "Your snapshot")
    residence = _format_residence(data)
    if residence:
        _kv_row(pdf, "Personal residence", residence)
    _kv_row(pdf, "Beneficiaries", _format_beneficiaries(data))
    _kv_row(pdf, "Household", _format_household(data))
    _kv_row(pdf, "Other properties", _format_real_estate(data))
    li = _format_life_insurance(data)
    if li:
        _kv_row(pdf, "Life insurance", li)
    biz = _format_business(data)
    if biz:
        _kv_row(pdf, "Business", biz)
    _kv_row(pdf, "Existing documents", _format_documents(data))

    pdf.ln(3)

    # ── Professional sections ────────────────────────────────────────
    sections = ai_payload.get("professional_sections") or []
    for sec in sections:
        prof = sec.get("professional") or "Professional"
        _section_heading(pdf, prof)
        why = sec.get("why_them") or ""
        if why:
            pdf.set_font("Helvetica", "I", 10)
            pdf.set_text_color(*_MUTED)
            pdf.multi_cell(0, 5.5, _safe(why), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
        items = sec.get("checklist") or []
        pdf.set_font("Helvetica", "", 10.5)
        pdf.set_text_color(*_INK)
        for idx, item in enumerate(items, start=1):
            # Bullet + body using a hanging-indent layout.
            pdf.set_x(pdf.l_margin)
            pdf.set_font("Helvetica", "B", 10.5)
            pdf.cell(7, 6, _safe(f"{idx}."), new_x="RIGHT", new_y="TOP")
            pdf.set_font("Helvetica", "", 10.5)
            pdf.multi_cell(0, 6, _safe(item), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(0.5)

    # ── State-law notes ──────────────────────────────────────────────
    state_notes = ai_payload.get("state_notes") or ""
    if state_notes:
        _section_heading(pdf, f"Notes for {state or 'your state'}")
        pdf.set_font("Helvetica", "", 10.5)
        pdf.set_text_color(*_INK)
        pdf.multi_cell(0, 6, _safe(state_notes), new_x="LMARGIN", new_y="NEXT")

    # ── Personalized observations ────────────────────────────────────
    obs = ai_payload.get("personalized_observations") or []
    if obs:
        _section_heading(pdf, "Personalized observations")
        pdf.set_font("Helvetica", "I", 9.5)
        pdf.set_text_color(*_MUTED)
        pdf.multi_cell(
            0,
            5,
            _safe(
                "Specific risks and opportunities pulled from your inputs - "
                "raise these with your professionals so the conversation skips "
                "the generic preamble."
            ),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(2)
        pdf.set_font("Helvetica", "", 10.5)
        pdf.set_text_color(*_INK)
        for o in obs:
            pdf.set_x(pdf.l_margin)
            pdf.set_font("Helvetica", "B", 10.5)
            pdf.set_text_color(*_GOLD)
            pdf.cell(7, 6, _safe(">"), new_x="RIGHT", new_y="TOP")
            pdf.set_font("Helvetica", "", 10.5)
            pdf.set_text_color(*_INK)
            pdf.multi_cell(0, 6, _safe(o), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)

    # ── Key terms glossary ───────────────────────────────────────────
    key_terms = ai_payload.get("key_terms") or []
    if key_terms:
        _section_heading(pdf, "Key terms you'll hear")
        pdf.set_font("Helvetica", "I", 9.5)
        pdf.set_text_color(*_MUTED)
        pdf.multi_cell(
            0,
            5,
            _safe(
                "Plain-English definitions for the terms most likely to come "
                "up in your meetings, picked based on your specific situation."
            ),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(2)
        for entry in key_terms:
            term = entry.get("term") or ""
            definition = entry.get("definition") or ""
            if not term or not definition:
                continue
            pdf.set_x(pdf.l_margin)
            pdf.set_font("Helvetica", "B", 10.5)
            pdf.set_text_color(*_INK)
            pdf.multi_cell(0, 6, _safe(term), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 10.5)
            pdf.set_text_color(*_BODY)
            pdf.multi_cell(0, 5.8, _safe(definition), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1.5)

    # ── Next step ────────────────────────────────────────────────────
    next_step = ai_payload.get("next_step") or ""
    if next_step:
        pdf.ln(4)
        pdf.set_draw_color(*_GOLD)
        pdf.set_line_width(0.4)
        page_w = pdf.w - 2 * pdf.l_margin
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + page_w, pdf.get_y())
        pdf.ln(3)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*_GOLD)
        pdf.cell(0, 6, _safe("Right now"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(*_INK)
        pdf.multi_cell(0, 6.5, _safe(next_step), new_x="LMARGIN", new_y="NEXT")

    # ── Disclaimer footer ────────────────────────────────────────────
    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*_FAINT)
    pdf.multi_cell(
        0,
        4,
        _safe(
            "This QuickStart Guide is a preparation tool, not legal, tax, or financial advice. "
            "It exists so you can have a more informed conversation with the licensed professionals "
            "of your choice. Always confirm specifics with your attorney, CPA, financial advisor, "
            "and insurance agent before acting."
        ),
        new_x="LMARGIN",
        new_y="NEXT",
        align="C",
    )

    out = pdf.output(dest="S")
    if isinstance(out, str):
        return out.encode("latin-1")
    return bytes(out)
