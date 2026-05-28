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

Architectural note
------------------
This module is intentionally tiny and dependency-free (only `fpdf`).
It is imported by both ``routes/`` and ``services/`` PDF generators
so the trust attribution travels with EVERY output the platform
produces, with no per-generator bookkeeping required.
"""

from __future__ import annotations

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from services.prime_directive import PRIME_DIRECTIVE_LOCKED_AT

# The exact line every page footer carries. Kept short so it fits on
# one line across A4, US Letter, and Legal at any reasonable margin.
TRUST_FOOTER_LINE: str = (
    f"Built under CarryOn's Prime Directive (locked {PRIME_DIRECTIVE_LOCKED_AT}). Verify at carryon.us/our-promise"
)


class CarryOnPDF(FPDF):
    """FPDF subclass that auto-stamps the Prime Directive attribution
    on every page. Drop-in replacement for ``FPDF()`` — no other API
    differences."""

    def footer(self) -> None:  # noqa: D401 — FPDF convention
        # Save the caller's font/color so the trust stamp never bleeds
        # into the next body content.
        save_font_family = (self.font_family or "Helvetica").lower()
        # FPDF stores the style as a possibly-modified string; default
        # to "" if unset.
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
        # `new_x=XPos.RIGHT, new_y=YPos.TOP` is the fpdf2 ≥2.5.2 idiom
        # equivalent to the legacy `ln=0` (stay on the same line). The
        # legacy form raises a DeprecationWarning that pytest treats
        # as an error in our test config.
        self.cell(0, 4, TRUST_FOOTER_LINE, align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)

        # Restore caller state — text color first (no API to read the
        # caller's prior color cleanly from FPDF, so we hard-restore to
        # black, the default for every CarryOn PDF body).
        self.set_text_color(0, 0, 0)
        try:
            self.set_font(save_font_family, save_font_style, save_font_size)
        except Exception:
            # If the caller had a custom non-standard font set, fall
            # back to Helvetica so subsequent body writes don't crash.
            self.set_font("Helvetica", "", 10)
