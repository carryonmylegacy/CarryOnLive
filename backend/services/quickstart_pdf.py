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

from services.quickstart_ai import (
    _qw_beneficiaries,
    _qw_legal_beneficiaries,
    _qw_platform_recipients,
)

from fpdf import FPDF  # noqa: F401 — kept for type-compat; actual instances use CarryOnPDF

from services.pdf_trust_footer import CarryOnPDF, ManifestEntry

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


def _disclaimer_banner(pdf: FPDF) -> None:
    """Render the platform's "NOT LEGAL ADVICE" disclaimer as a
    soft amber rounded block. Sits at the top of page 1 of every
    QuickStart Guide so a reviewer sees it before any AI-authored
    content. Used by ``build_quickstart_pdf``.

    Locked text — do not edit without founder sign-off. Mirrored in
    the regression test `test_quickstart_pdf_disclaimer.py`.
    """
    title = "NOT LEGAL ADVICE"
    body = (
        "This document is for informational and personal-organization purposes only. "
        "It is not legal advice and is not a substitute for consultation with a licensed "
        "estate-planning attorney in your state. Review every recommendation with a "
        "qualified professional before acting on it."
    )
    # Layout geometry: full-width band inside the page margins.
    x0 = pdf.l_margin
    x1 = pdf.w - pdf.r_margin
    width = x1 - x0
    pad_x = 4.0
    pad_y = 3.0
    # Save + restore font so the caller's state is untouched.
    saved_font_family = pdf.font_family or "helvetica"
    saved_font_style = pdf.font_style or ""
    saved_font_size = pdf.font_size_pt or 10.0
    # Body text wraps to ~4 lines at width ~180mm w/ 9.5pt. Pre-allocate
    # 5 lines of headroom; multi_cell will simply use what it needs.
    line_h = 5.0
    title_h = 5.5
    body_h = 5 * line_h
    band_h = pad_y + title_h + 1.5 + body_h + pad_y
    y_start = pdf.get_y()
    # Soft amber background + 0.4mm gold border.
    pdf.set_fill_color(254, 248, 230)  # very pale amber
    pdf.set_draw_color(*_GOLD)
    pdf.set_line_width(0.4)
    pdf.rect(x0, y_start, width, band_h, "DF")
    # Title row.
    pdf.set_xy(x0 + pad_x, y_start + pad_y)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(150, 100, 20)  # warm-gold ink
    pdf.cell(width - 2 * pad_x, title_h, _safe(title), new_x="LMARGIN", new_y="NEXT")
    # Body block.
    pdf.set_xy(x0 + pad_x, y_start + pad_y + title_h + 1.0)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(80, 65, 30)
    pdf.multi_cell(width - 2 * pad_x, line_h, _safe(body), new_x="LMARGIN", new_y="NEXT")
    # Reset cursor to just below the band and restore caller's font.
    pdf.set_xy(pdf.l_margin, y_start + band_h)
    pdf.set_font(saved_font_family, saved_font_style, saved_font_size)
    pdf.set_text_color(*_INK)


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


class _AuthorityRegister:
    """Endnote registry for legal authorities cited throughout the guide.

    Citations are deduplicated and numbered in first-seen (reading) order so
    in-body markers like "[Authority 1]" map 1:1 to a consolidated
    "Sources & Authorities" endnotes section rendered at the end. Mandate
    (May 28 2026): every substantive recommendation must be traceable to its
    governing legal authority to satisfy the NOT-LEGAL-ADVICE disclaimer.
    """

    def __init__(self) -> None:
        self._order: list[str] = []
        self._index: dict[str, int] = {}

    def marker(self, citations: list[str] | None) -> str:
        """Register the given citations and return the in-text marker string,
        e.g. " [Authority 1]" or " [Authorities 1, 3]". Empty when none."""
        if not citations:
            return ""
        nums: list[int] = []
        for c in citations:
            c = (c or "").strip()
            if not c:
                continue
            if c not in self._index:
                self._order.append(c)
                self._index[c] = len(self._order)
            nums.append(self._index[c])
        nums = sorted(set(nums))
        if not nums:
            return ""
        if len(nums) == 1:
            return f" [Authority {nums[0]}]"
        return " [Authorities " + ", ".join(str(n) for n in nums) + "]"

    def entries(self) -> list[tuple[int, str]]:
        return list(enumerate(self._order, start=1))


def _render_cited_item(
    pdf: FPDF,
    *,
    bullet: str,
    bullet_color: tuple[int, int, int],
    text: str,
    input_basis: str,
    authority_marker: str,
) -> None:
    """Render one checklist item / observation with a hanging-indent bullet,
    the recommendation text + in-text authority marker, and (below it) the
    'Based on your input:' provenance line."""
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 10.5)
    pdf.set_text_color(*bullet_color)
    pdf.cell(7, 6, _safe(bullet), new_x="RIGHT", new_y="TOP")
    pdf.set_font("Helvetica", "", 10.5)
    pdf.set_text_color(*_INK)
    pdf.multi_cell(0, 6, _safe(f"{text}{authority_marker}"), new_x="LMARGIN", new_y="NEXT")
    if input_basis:
        pdf.set_x(pdf.l_margin + 7)
        pdf.set_font("Helvetica", "I", 8.5)
        pdf.set_text_color(*_MUTED)
        pdf.multi_cell(0, 4.6, _safe(f"Based on your input: {input_basis}"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*_INK)
    pdf.ln(0.8)


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
    """Legal estate beneficiaries (Primary tier) ONLY. Founder rule
    (May 28 2026): the "Beneficiaries" snapshot line in the PDF body
    must reflect only the people who would be named in estate
    documents. Platform-only recipients render on their own line so
    a professional reading the doc never confuses the two."""
    bens = _qw_legal_beneficiaries(data)
    # Backward compat: when no row carries either flag, fall back to
    # the full list so older in-flight PDFs render the same as before.
    if not bens and _qw_beneficiaries(data):
        bens = _qw_beneficiaries(data)
    if not bens:
        return "None added yet"
    return ", ".join(f"{b.get('name')} ({b.get('relationship')})" for b in bens if b.get("name"))


def _format_platform_recipients(data: dict[str, Any]) -> str:
    """Secondary-tier CarryOn-platform recipients (MM / IAC / FFN
    only). Returns an empty string when the user has none so the row
    is skipped entirely instead of rendering "None"."""
    recips = _qw_platform_recipients(data)
    if not recips:
        return ""
    return ", ".join(f"{b.get('name')} ({b.get('relationship')})" for b in recips if b.get("name"))


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


def _build_verified_inputs_manifest(data: dict[str, Any]) -> list[ManifestEntry]:
    """Produce one ``ManifestEntry`` per QuickStart Wizard input that
    backed the body of the PDF.

    This is the appendix a professional reviewing the QuickStart Guide
    flips to in order to verify every assertion in the body against
    the user's own inputs. Sections mirror the QuickStart Wizard step
    structure so the professional can open the matching step in the
    user's CarryOn account.

    Entries are emitted only when the user actually provided data —
    empty / unanswered steps are skipped so the manifest reflects the
    user's actual inputs, not a templated form.
    """
    entries: list[ManifestEntry] = []

    # Residence
    res_val = _format_residence(data)
    if res_val:
        entries.append(
            ManifestEntry(
                section="Residence",
                field="Address & state of residence",
                value=res_val,
                source_step="Residence step of the QuickStart Wizard",
            )
        )

    # Household
    hh_val = _format_household(data)
    if hh_val:
        entries.append(
            ManifestEntry(
                section="Household",
                field="Marital status & dependents",
                value=hh_val,
                source_step="Household step of the QuickStart Wizard",
            )
        )

    # Real estate
    re_val = _format_real_estate(data)
    if re_val and re_val != "None reported":
        entries.append(
            ManifestEntry(
                section="Real estate",
                field="Properties on file",
                value=re_val,
                source_step="Properties step of the QuickStart Wizard",
            )
        )

    # Business / entities
    biz_val = _format_business(data)
    if biz_val and biz_val.lower() != "none":
        entries.append(
            ManifestEntry(
                section="Business interests",
                field="Entity structures",
                value=biz_val,
                source_step="Business step of the QuickStart Wizard",
            )
        )

    # Life insurance
    li_val = _format_life_insurance(data)
    if li_val:
        entries.append(
            ManifestEntry(
                section="Life insurance",
                field="Policies on file",
                value=li_val,
                source_step="Life insurance step of the QuickStart Wizard",
            )
        )

    # Financial accounts
    fa_val = _format_accounts(data)
    if fa_val and fa_val != "None reported":
        entries.append(
            ManifestEntry(
                section="Financial accounts",
                field="Account types flagged",
                value=fa_val,
                source_step="Financial accounts step of the QuickStart Wizard",
            )
        )

    # Beneficiaries (legal estate beneficiaries — Primary tier)
    ben_val = _format_beneficiaries(data)
    if ben_val and ben_val != "None added yet":
        entries.append(
            ManifestEntry(
                section="Beneficiaries",
                field="Legal estate beneficiaries (Primary tier)",
                value=ben_val,
                source_step="Beneficiaries step of the QuickStart Wizard",
            )
        )

    # Platform-only recipients (Secondary tier — MM / IAC / FFN)
    plat_val = _format_platform_recipients(data)
    if plat_val:
        entries.append(
            ManifestEntry(
                section="Beneficiaries",
                field="Platform recipients (not named in estate documents)",
                value=plat_val,
                source_step="Beneficiaries step of the QuickStart Wizard",
            )
        )

    # Existing estate documents
    doc_val = _format_documents(data)
    if doc_val and doc_val != "None reported":
        entries.append(
            ManifestEntry(
                section="Existing estate documents",
                field="Documents reported",
                value=doc_val,
                source_step="Existing documents step of the QuickStart Wizard",
            )
        )

    return entries


def build_quickstart_pdf(
    *,
    user_name: str,
    data: dict[str, Any],
    ai_payload: dict[str, Any],
    generated_at: datetime,
    verify_token: str | None = None,
    public_base_url: str | None = None,
) -> bytes:
    """Render the QuickStart Guide PDF. Returns raw bytes.

    When ``verify_token`` and ``public_base_url`` are both provided
    (typically by the calling route after persisting a verification
    snapshot via ``services.pdf_verification.create_snapshot``), every
    page of the PDF carries a small QR code in the bottom-right
    corner that deep-links to the public verification page. A
    professional reviewing the PDF can scan any page to confirm
    authenticity in <5 seconds.
    """
    pdf = CarryOnPDF()
    if verify_token and public_base_url:
        # MUST be called before the first add_page() so the very first
        # footer() invocation already has the QR data prepared.
        pdf.set_verification(verify_token, public_base_url)
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

    # ── "NOT LEGAL ADVICE" disclaimer banner ─────────────────────────
    # Founder rule (May 28 2026): every CarryOn-generated QuickStart
    # Guide must visibly tell the reader it is informational and not
    # a substitute for a licensed attorney. The banner sits ABOVE the
    # intro paragraph so a professional opening to page 1 sees it
    # before any AI-authored content.
    _disclaimer_banner(pdf)
    pdf.ln(4)

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
    plat_recip = _format_platform_recipients(data)
    if plat_recip:
        _kv_row(pdf, "Platform recipients (non-estate)", plat_recip)
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
    # Shared endnote registry — accumulates legal authorities cited by the
    # checklist items, state-law notes, and observations below, then renders
    # the consolidated "Sources & Authorities" section near the end.
    authorities = _AuthorityRegister()
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
        for idx, item in enumerate(items, start=1):
            # Items are normalized to {text, input_basis, legal_authorities}
            # by parse_quickstart_response; tolerate a bare string for safety.
            if isinstance(item, dict):
                text = item.get("text") or ""
                input_basis = item.get("input_basis") or ""
                marker = authorities.marker(item.get("legal_authorities"))
            else:
                text, input_basis, marker = str(item), "", ""
            if not text.strip():
                continue
            _render_cited_item(
                pdf,
                bullet=f"{idx}.",
                bullet_color=_INK,
                text=text,
                input_basis=input_basis,
                authority_marker=marker,
            )

    # ── State-law notes ──────────────────────────────────────────────
    state_notes = ai_payload.get("state_notes") or ""
    if state_notes:
        _section_heading(pdf, f"Notes for {state or 'your state'}")
        notes_marker = authorities.marker(ai_payload.get("state_notes_authorities"))
        pdf.set_font("Helvetica", "", 10.5)
        pdf.set_text_color(*_INK)
        pdf.multi_cell(0, 6, _safe(f"{state_notes}{notes_marker}"), new_x="LMARGIN", new_y="NEXT")

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
        for o in obs:
            if isinstance(o, dict):
                text = o.get("text") or ""
                input_basis = o.get("input_basis") or ""
                marker = authorities.marker(o.get("legal_authorities"))
            else:
                text, input_basis, marker = str(o), "", ""
            if not text.strip():
                continue
            _render_cited_item(
                pdf,
                bullet=">",
                bullet_color=_GOLD,
                text=text,
                input_basis=input_basis,
                authority_marker=marker,
            )

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

    # ── Sources & Authorities (endnotes for every [Authority N] marker) ──
    auth_entries = authorities.entries()
    if auth_entries:
        _section_heading(pdf, "Sources & Authorities")
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(*_MUTED)
        pdf.multi_cell(
            0,
            4.8,
            _safe(
                "Every recommendation above is tagged with the authority it draws "
                "from. These are general, chapter-level legal references for "
                "orientation only - confirm the exact provisions that apply to you "
                "with a licensed attorney in your state."
            ),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(1.5)
        for num, citation in auth_entries:
            pdf.set_x(pdf.l_margin)
            pdf.set_font("Helvetica", "B", 9.5)
            pdf.set_text_color(*_INK)
            pdf.cell(20, 5.5, _safe(f"Authority {num}"), new_x="RIGHT", new_y="TOP")
            pdf.set_font("Helvetica", "", 9.5)
            pdf.set_text_color(*_BODY)
            pdf.multi_cell(0, 5.5, _safe(citation), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(0.5)

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

    # ── Verified Inputs Manifest (forensic appendix for professionals) ──
    # Final dedicated page listing every QuickStart Wizard input that
    # backed the body of this PDF, with the source step + value. The
    # lawyer / CPA / estate planner the user hands this guide to can
    # verify every assertion in the body against the inputs below in
    # seconds. The trust footer (every page) plus this appendix gives
    # them two independent verification paths.
    manifest_entries = _build_verified_inputs_manifest(data)
    pdf.add_verified_inputs_manifest(
        manifest_entries,
        generated_at_label=("Inputs as of " + generated_at.astimezone().strftime("%B %d, %Y at %I:%M %p %Z").strip()),
    )

    return bytes(pdf.output())
