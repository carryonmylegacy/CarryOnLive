"""CarryOn™ — PDF subclass that stamps the Prime Directive trust
attribution on every page.

Why this exists
---------------
Every PDF the platform produces (Estate Plan Guide, Guardian Checklist,
IAC Report, Connected Protocol, QuickStart export, Beneficiary
Concierge plan-of-action, etc.) is something a CarryOn user will hand
to a lawyer, CPA, estate planner, or wealth manager. The platform's
reputation with those professionals depends on them being able to see
— at a glance, on every page — the locked contract the document was
built under.

The trust line points at the public ``Our Promise`` page (sourced from
the same locked backend constant in ``services/prime_directive.py``)
so a professional can verify the platform's commitments in one click.

How to use
----------
Replace ``pdf = FPDF()`` with ``pdf = CarryOnPDF()`` in every PDF
generator. Nothing else changes — the footer fires automatically on
every page break via FPDF's standard ``footer()`` hook.

For PDFs whose body content is grounded in user-entered structured
data (the QuickStart Wizard PDF is the canonical example), call
:meth:`CarryOnPDF.add_verified_inputs_manifest` right before
``pdf.output()`` to append a dedicated final page that lists, line by
line, every user input the document was built on — with the source
step + the value the user provided. This gives the professional
reviewing the PDF a forensic trail: every assertion in the body has
a verifiable source on the manifest page.

Architectural note
------------------
This module is intentionally tiny and dependency-light (only `fpdf`
and the locked Prime Directive constant). It is imported by both
``routes/`` and ``services/`` PDF generators so the trust attribution
travels with EVERY output the platform produces, with no per-generator
bookkeeping required.
"""

from __future__ import annotations

from dataclasses import dataclass

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from services.prime_directive import PRIME_DIRECTIVE_LOCKED_AT

# The exact line every page footer carries. Kept short so it fits on
# one line across A4, US Letter, and Legal at any reasonable margin.
TRUST_FOOTER_LINE: str = (
    f"Built under CarryOn's Prime Directive (locked {PRIME_DIRECTIVE_LOCKED_AT}). Verify at carryon.us/our-promise"
)

# Distinctive title used by the Verified Inputs Manifest appendix.
# The regression test in ``tests/test_pdf_trust_footer.py`` asserts
# this string appears in the rendered PDF when entries are supplied —
# do not reword without updating the test.
VERIFIED_INPUTS_TITLE: str = "Verified Inputs Manifest"

# Unicode → core-Helvetica Latin-1 substitutions. CarryOn formatters
# elsewhere (e.g. ``services.quickstart_pdf._safe``) carry the same
# table; we duplicate it here on purpose so this module stays
# dependency-light and self-contained — every CarryOn PDF MUST be
# able to render the manifest regardless of which generator built it.
_LATIN1_SUBSTITUTIONS: dict[str, str] = {
    "\u2014": " - ",  # em-dash
    "\u2013": "-",  # en-dash
    "\u2212": "-",  # minus sign
    "\u2018": "'",  # left single quote
    "\u2019": "'",  # right single quote / apostrophe
    "\u201c": '"',  # left double quote
    "\u201d": '"',  # right double quote
    "\u2026": "...",  # ellipsis
    "\u2022": "*",  # bullet
    "\u00b7": "-",  # middle dot
    "\u00a0": " ",  # NBSP
}


def _latin1_safe(text: str) -> str:
    """Return ``text`` with every glyph the core Helvetica font cannot
    render replaced by an ASCII equivalent. The manifest renders user-
    provided strings (addresses, names, free-text) which often include
    em-dashes and curly quotes from copy/paste; without this scrub the
    appendix would crash on otherwise-valid user input."""
    if not text:
        return ""
    for src, repl in _LATIN1_SUBSTITUTIONS.items():
        if src in text:
            text = text.replace(src, repl)
    return text.encode("latin-1", errors="replace").decode("latin-1")


@dataclass(frozen=True)
class ManifestEntry:
    """One row on the Verified Inputs Manifest appendix.

    The four fields render directly on the page — keep them in the
    user's own words where possible (label "Residence" not
    "data.residence.state"). The ``source_step`` is the step in the
    user's workflow that produced the value (e.g. "Residence step of
    the QuickStart Wizard"); the professional reviewing the PDF can
    open that step in the user's CarryOn account to verify.
    """

    section: str
    field: str
    value: str
    source_step: str


class CarryOnPDF(FPDF):
    """FPDF subclass that auto-stamps the Prime Directive attribution
    on every page and exposes a Verified Inputs Manifest appendix.
    Drop-in replacement for ``FPDF()`` — no other API differences."""

    def footer(self) -> None:  # noqa: D401 — FPDF convention
        # Save the caller's font/color so the trust stamp never bleeds
        # into the next body content.
        save_font_family = (self.font_family or "Helvetica").lower()
        save_font_style = self.font_style or ""
        save_font_size = float(self.font_size_pt or 10)

        # Footer is positioned 10mm from the bottom of the page so it
        # sits cleanly under the FPDF default 15mm bottom margin and
        # never collides with body content.
        self.set_y(-10)
        self.set_font("Helvetica", "I", 7)
        # Soft mid-grey so the line reads as a trust attribution, not
        # as primary content.
        self.set_text_color(120, 120, 120)
        self.cell(0, 4, TRUST_FOOTER_LINE, align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)

        # Restore caller state.
        self.set_text_color(0, 0, 0)
        try:
            self.set_font(save_font_family, save_font_style, save_font_size)
        except Exception:
            # If the caller had a custom non-standard font set, fall
            # back to Helvetica so subsequent body writes don't crash.
            self.set_font("Helvetica", "", 10)

    # ------------------------------------------------------------------
    # Verified Inputs Manifest appendix
    # ------------------------------------------------------------------

    def add_verified_inputs_manifest(
        self,
        entries: list[ManifestEntry],
        *,
        generated_at_label: str | None = None,
    ) -> None:
        """Append a final ``Verified Inputs Manifest`` page that lists
        every user-entered field the document was built on.

        This is the appendix a professional reviewing the document
        opens to find the forensic source trail. Each row names the
        section, the specific field, the value the user provided, and
        the source step in the user's workflow — so the professional
        can verify any assertion in the document against the user's
        own inputs in seconds.

        The page is appended via ``add_page()``; the caller does not
        need to manage page breaks. If ``entries`` is empty, nothing
        is rendered — appendix is skipped silently so PDFs without
        per-input provenance (LLM-narrative-only exports) are
        unaffected.
        """
        if not entries:
            return

        intro = (
            "Every assertion in this document is grounded in the inputs below - "
            "exactly as you provided them. A professional reviewing this guide "
            "can verify each item against your CarryOn account in seconds."
        )

        self.add_page()
        # Header
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(30, 40, 70)
        self.cell(0, 9, VERIFIED_INPUTS_TITLE, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Gold rule under header — matches CarryOn PDF aesthetic.
        self.set_draw_color(212, 175, 55)
        self.set_line_width(0.4)
        page_w = self.w - 2 * self.l_margin
        self.line(self.l_margin, self.get_y(), self.l_margin + page_w * 0.25, self.get_y())
        self.ln(5)

        # Intro paragraph
        self.set_font("Helvetica", "", 10)
        self.set_text_color(60, 70, 90)
        self.multi_cell(0, 5.5, _latin1_safe(intro), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)

        if generated_at_label:
            self.set_font("Helvetica", "I", 9)
            self.set_text_color(120, 130, 150)
            self.cell(0, 5, _latin1_safe(generated_at_label), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.ln(2)

        # Group entries by section so the manifest reads like an outline.
        last_section: str | None = None
        for entry in entries:
            if entry.section != last_section:
                self.ln(3)
                self.set_font("Helvetica", "B", 11)
                self.set_text_color(212, 175, 55)
                self.cell(0, 6, _latin1_safe(entry.section), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
                last_section = entry.section

            # Field label + value on one logical row (multi-line safe).
            self.set_font("Helvetica", "B", 10)
            self.set_text_color(60, 70, 90)
            self.cell(60, 5.5, _latin1_safe(entry.field), new_x=XPos.RIGHT, new_y=YPos.TOP)
            self.set_font("Helvetica", "", 10)
            self.set_text_color(30, 40, 70)
            self.multi_cell(
                0,
                5.5,
                _latin1_safe(entry.value) or "(not provided)",
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )
            # Source step in muted italic, indented under the value.
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(120, 130, 150)
            self.cell(60, 4, "", new_x=XPos.RIGHT, new_y=YPos.TOP)
            self.multi_cell(
                0,
                4,
                _latin1_safe(f"Source: {entry.source_step}"),
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )

        # Restore default black for any caller body that may follow.
        self.set_text_color(0, 0, 0)
