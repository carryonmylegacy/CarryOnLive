"""CarryOn™ Backend — Estate Binder

Single-button "print my entire estate in one PDF" generator.

Aggregates every cached PDF the user currently has in
`db.latest_pdfs` (populated by individual section generate buttons)
into ONE continuous multi-page document with:
  - Adaptive Title Page (name, estate, address, phone, email,
    generation timestamp — fields that are empty in Settings are
    simply omitted; nothing is faked).
  - Adaptive Table of Contents (lists ONLY sections the user has
    actually cached at click-time, with start page numbers).
  - Continuous footer overlaid on every page
    ("Page N of M · Estate Binder · {Estate Name}").

If the user has zero cached PDFs OR is missing some sections, the
endpoint returns JSON describing which sections still need to be
generated so the frontend can guide them ("Tap the print button on
the Checklist page first, then come back").

Endpoint:
  POST /api/estate-binder/generate
    - 200 application/pdf      → the assembled binder, stream
    - 200 application/json     → {empty: true, missing: [...], available: [...]}
                                 (when nothing is cached yet)
    - 404                      → estate not found
"""

from __future__ import annotations

import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from fpdf import FPDF
from pypdf import PdfReader, PdfWriter

from config import db, logger
from services.storage import storage
from utils import get_current_user

router = APIRouter()


# ── Section order in the binder. Keep this list intentionally short
# and curated — we don't want to surprise a benefactor with a section
# they didn't expect. Each tuple is:
#     (pdf_type, display_title, source_page_route, source_page_label)
# `source_page_route` + `source_page_label` are surfaced in the
# missing-sections JSON so the frontend can offer a tap-to-cache CTA.
SECTION_ORDER: list[tuple[str, str, str, str]] = [
    ("iac_standalone", "Immediate Action Checklist", "/checklist", "Checklist page"),
    ("ega_todo", "Estate Guardian — To-Do List", "/guardian", "Estate Guardian"),
    ("ega_iac", "Estate Guardian — Immediate Action Report", "/guardian", "Estate Guardian"),
    ("ega_checklist", "Estate Guardian — IAC Checklist", "/guardian", "Estate Guardian"),
    ("ega_plan", "Estate Guardian — Plan of Action", "/guardian", "Estate Guardian"),
    ("ega_transcript", "Estate Guardian — Conversation Transcript", "/guardian", "Estate Guardian"),
    ("cfp_handoff", "CarryOn Financial Picture — Hand-off Package", "/financial", "Financial Picture"),
    ("entities_structures", "Entities & Structures", "/financial", "Financial Picture"),
    ("ccp_plan", "Contingency Care Plan", "/connected-protocol", "Connected Protocol"),
    ("ccp_card", "Emergency Card", "/connected-protocol", "Connected Protocol"),
    ("ccp_report", "Family Readiness Report", "/connected-protocol", "Connected Protocol"),
    ("beneficiary_packet", "Beneficiary IAC Packet", "/beneficiaries", "Beneficiaries"),
]

# 1-line sanitizer for PDF strings (fpdf2 uses latin-1 by default,
# so we hand-translate the unicode glyphs we actually emit to ASCII
# equivalents before falling back to "?" for anything still outside
# latin-1).
_LATIN1_FALLBACK = "?"
_GLYPH_SUBSTITUTIONS = {
    "\u2014": " - ",  # em dash
    "\u2013": "-",  # en dash
    "\u2212": "-",  # minus sign
    "\u2018": "'",  # left single quote
    "\u2019": "'",  # right single quote / apostrophe
    "\u201c": '"',  # left double quote
    "\u201d": '"',  # right double quote
    "\u2026": "...",  # ellipsis
    "\u2022": "*",  # bullet
    "\u00b7": "-",  # middle dot
    "\u00a0": " ",  # non-breaking space
}


def _safe(text: str | None) -> str:
    if not text:
        return ""
    for src, repl in _GLYPH_SUBSTITUTIONS.items():
        if src in text:
            text = text.replace(src, repl)
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _format_date(dt: str | datetime | None) -> str:
    """Return a human-friendly date for a stored ISO string or datetime."""
    if not dt:
        return ""
    try:
        if isinstance(dt, str):
            dt_obj = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        else:
            dt_obj = dt
        return dt_obj.strftime("%B %d, %Y")
    except Exception:
        return ""


def _build_title_and_toc_pdf(
    *,
    user_name: str,
    estate_name: str,
    address_lines: list[str],
    phone: str,
    email: str,
    available_sections: list[dict],
) -> bytes:
    """Generate the cover + TOC PDF (1-3 pages). Returns raw PDF bytes."""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)

    # ── COVER PAGE ──────────────────────────────────────────────────
    pdf.add_page()

    # Vertical centering — push down ~30% of the page first.
    pdf.ln(40)

    # Top brand band
    pdf.set_font("Helvetica", "B", 28)
    pdf.set_text_color(212, 175, 55)  # CarryOn gold
    pdf.cell(0, 14, _safe("CarryOn"), new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(120, 130, 150)
    pdf.cell(0, 6, _safe("ESTATE BINDER"), new_x="LMARGIN", new_y="NEXT", align="C")

    pdf.ln(18)

    # Gold rule
    pdf.set_draw_color(212, 175, 55)
    pdf.set_line_width(0.6)
    page_w = pdf.w - 2 * pdf.l_margin
    rule_w = 60
    pdf.line(
        (pdf.w - rule_w) / 2,
        pdf.get_y(),
        (pdf.w - rule_w) / 2 + rule_w,
        pdf.get_y(),
    )
    pdf.ln(12)

    # Estate / user info block
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(30, 40, 70)
    pdf.cell(0, 12, _safe(estate_name or "My Estate"), new_x="LMARGIN", new_y="NEXT", align="C")

    if user_name:
        pdf.set_font("Helvetica", "", 14)
        pdf.set_text_color(70, 80, 100)
        pdf.cell(0, 8, _safe(f"Prepared by {user_name}"), new_x="LMARGIN", new_y="NEXT", align="C")

    pdf.ln(10)

    # Contact block — only emit lines the user has actually saved.
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(90, 100, 120)
    for line in address_lines:
        pdf.cell(0, 6, _safe(line), new_x="LMARGIN", new_y="NEXT", align="C")
    if phone:
        pdf.cell(0, 6, _safe(phone), new_x="LMARGIN", new_y="NEXT", align="C")
    if email:
        pdf.cell(0, 6, _safe(email), new_x="LMARGIN", new_y="NEXT", align="C")

    pdf.ln(20)
    # Generation timestamp
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(140, 150, 170)
    now = datetime.now(timezone.utc).astimezone().strftime("%B %d, %Y at %I:%M %p")
    pdf.cell(0, 5, _safe(f"Generated {now}"), new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.cell(
        0,
        5,
        _safe(f"{len(available_sections)} section{'' if len(available_sections) == 1 else 's'} included"),
        new_x="LMARGIN",
        new_y="NEXT",
        align="C",
    )

    # ── TOC PAGE ────────────────────────────────────────────────────
    toc_links: list[dict] = []
    # 1 mm = 2.8346456693 pt. Cache for clarity.
    MM_TO_PT = 2.8346456693
    page_height_pt = pdf.h * MM_TO_PT
    page_width_pt = pdf.w * MM_TO_PT

    if available_sections:
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 20)
        pdf.set_text_color(30, 40, 70)
        pdf.cell(0, 10, _safe("Table of Contents"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)
        pdf.set_draw_color(212, 175, 55)
        pdf.set_line_width(0.4)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + page_w, pdf.get_y())
        pdf.ln(6)

        # Layout columns (in mm, absolute x from page left edge). We
        # position each cell with explicit set_x() instead of relying
        # on cell-flow so long titles can't push the date column out
        # of alignment. Date column is LEFT-aligned at a fixed x so
        # it reads as a clean vertical column down the page.
        col_title_x = pdf.l_margin
        col_title_w = 105.0
        col_date_x = pdf.l_margin + 110.0
        col_date_w = 40.0
        col_page_w = 25.0
        col_page_x = pdf.w - pdf.r_margin - col_page_w

        row_height_mm = 9.0  # 7mm cell + 2mm trailing ln() = visual row
        pdf.set_font("Helvetica", "", 11)
        for idx, section in enumerate(available_sections, start=1):
            title_str = f"{idx}.  {section['display_title']}"
            date_str = section.get("updated_label") or ""
            page_str = f"Page {section['start_page']}"

            # Capture the row's top-y BEFORE rendering it so we can
            # compute the clickable rect in pypdf coordinates after
            # the binder is fully stitched.
            row_top_mm = pdf.get_y()

            # Title (left) — bold, dark navy.
            pdf.set_xy(col_title_x, row_top_mm)
            pdf.set_text_color(40, 50, 80)
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(col_title_w, 7, _safe(title_str))

            # Date (middle column) — LEFT-aligned at a fixed x so
            # every date starts at the same column position.
            pdf.set_xy(col_date_x, row_top_mm)
            pdf.set_text_color(130, 140, 160)
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(col_date_w, 7, _safe(date_str), align="L")

            # Page number (right) — right-aligned against the right margin.
            pdf.set_xy(col_page_x, row_top_mm)
            pdf.set_text_color(70, 80, 100)
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(col_page_w, 7, _safe(page_str), align="R")

            # Advance to next row.
            pdf.set_xy(pdf.l_margin, row_top_mm + 7)
            pdf.ln(2)

            # Compute the link rect in pypdf coordinates (points,
            # y-up). fpdf's y is measured from the top so we flip.
            x1 = pdf.l_margin * MM_TO_PT
            x2 = (pdf.w - pdf.r_margin) * MM_TO_PT
            top_pt = page_height_pt - (row_top_mm * MM_TO_PT)
            bottom_pt = page_height_pt - ((row_top_mm + row_height_mm) * MM_TO_PT)
            toc_links.append(
                {
                    "pdf_type": section["pdf_type"],
                    "rect_pt": (x1, bottom_pt, x2, top_pt),
                }
            )

    # Output as bytes (fpdf2 returns bytearray)
    out = pdf.output()
    return bytes(out), toc_links, page_width_pt, page_height_pt


def _build_footer_overlay_pdf(*, page_count: int, estate_name: str, page_size) -> bytes:
    """Generate a transparent overlay PDF with the binder brand + footer
    on every page.

    Layout per page:
      - Upper-left: small gold "CarryOn" brand text + "ESTATE BINDER"
        kicker. The Link annotation that turns this into a clickable
        "back to TOC" hot-link is added separately by the assembler
        (annotations don't survive `merge_page`).
      - Bottom-centre: "Page N of M · Estate Binder · {Estate Name}"
        footer string.

    The overlay matches `page_size` (taken from the first source page
    so Letter/A4 mismatches don't shift the marks off-page).
    """
    pdf = FPDF(unit="pt", format=(page_size[0], page_size[1]))
    pdf.set_auto_page_break(False)
    for i in range(page_count):
        pdf.add_page()

        # ── Upper-RIGHT brand mark. Position 110pt-wide block flush
        # against the right margin so the wordmark always lands at
        # the same visual location regardless of page size.
        brand_w = 110
        brand_right_pad = 20
        pdf.set_xy(page_size[0] - brand_w - brand_right_pad, 18)
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(212, 175, 55)  # CarryOn gold
        pdf.cell(brand_w, 14, _safe("CarryOn"), align="R")

        # ── Bottom-centre footer.
        pdf.set_xy(0, page_size[1] - 22)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(120, 130, 150)
        footer = f"Page {i + 1} of {page_count}  ·  Estate Binder  ·  {estate_name or 'CarryOn'}"
        pdf.cell(page_size[0], 12, _safe(footer), align="C")
    return bytes(pdf.output())


async def _load_user_settings(user_id: str) -> dict:
    user = (
        await db.users.find_one(
            {"id": user_id},
            {
                "_id": 0,
                "name": 1,
                "first_name": 1,
                "last_name": 1,
                "email": 1,
                "phone": 1,
                "address_street": 1,
                "address_city": 1,
                "address_state": 1,
                "address_zip": 1,
            },
        )
        or {}
    )
    return user


@router.post("/estate-binder/generate")
async def generate_estate_binder(current_user: dict = Depends(get_current_user)):
    """Assemble the user's cached PDFs into ONE continuous binder.

    Response shapes:
      * application/pdf — assembled binder bytes (success).
      * application/json `{empty, available, missing}` — when the user
        has zero cached PDFs (nothing to assemble).

    Even on success, the response carries:
      * `X-CarryOn-Binder-Missing` — comma-separated pdf_types the user
        still hasn't generated (frontend uses this for a banner CTA).
      * `X-CarryOn-Binder-Included` — comma-separated pdf_types in the
        binder, in order.
    """
    user_id = current_user["id"]
    user = await _load_user_settings(user_id)

    # Estate name
    estate = await db.estates.find_one(
        {"owner_id": user_id, "deleted_at": None},
        {"_id": 0, "id": 1, "name": 1},
    )
    estate_name = (
        (estate or {}).get("name") or f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "My Estate"
    )

    # Address block — only emit lines that exist.
    addr_lines: list[str] = []
    street = (user.get("address_street") or "").strip()
    if street:
        addr_lines.append(street)
    city = (user.get("address_city") or "").strip()
    state = (user.get("address_state") or "").strip()
    zipc = (user.get("address_zip") or "").strip()
    city_line = ", ".join([p for p in [city, state] if p]).strip()
    if zipc:
        city_line = f"{city_line} {zipc}".strip() if city_line else zipc
    if city_line:
        addr_lines.append(city_line)
    phone = (user.get("phone") or "").strip()
    email = (user.get("email") or "").strip()
    user_name = (user.get("name") or f"{user.get('first_name', '')} {user.get('last_name', '')}").strip()

    # ─── Server-side safety net: ensure E&S has a cached PDF before
    # we read latest_pdfs. The client-side html2pdf capture on the
    # /print/entities/<id> page produces a richer chart-shaped PDF
    # whenever the user visits that page, but B2B prospects may
    # generate a binder cold without ever opening the print page —
    # this fallback guarantees E&S still appears in the binder.
    # See `services.financial_portal.entities_pdf.ensure_entities_structures_cached`
    # for cache freshness/source logic.
    try:
        from routes.financial_portal.entities_pdf import ensure_entities_structures_cached

        _est_id = (estate or {}).get("id")
        if _est_id:
            await ensure_entities_structures_cached(_est_id, user_id, max_age_hours=24.0)
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Binder: E&S server fallback failed for user={user_id}: {exc}")

    # Pull all cached PDFs for this user in one query.
    cached_docs = await db.latest_pdfs.find(
        {"user_id": user_id},
        {"_id": 0, "id": 1, "pdf_type": 1, "s3_key": 1, "title": 1, "subtitle": 1, "updated_at": 1},
    ).to_list(50)
    cached_map = {d["pdf_type"]: d for d in cached_docs}

    # Walk SECTION_ORDER to preserve the curated binder flow.
    available: list[dict] = []
    missing: list[dict] = []
    for pdf_type, display_title, route, route_label in SECTION_ORDER:
        meta = cached_map.get(pdf_type)
        if meta:
            available.append(
                {
                    "pdf_type": pdf_type,
                    "display_title": display_title,
                    "updated_label": _format_date(meta.get("updated_at")),
                    "s3_key": meta["s3_key"],
                    "route": route,
                    "route_label": route_label,
                }
            )
        else:
            missing.append(
                {
                    "pdf_type": pdf_type,
                    "display_title": display_title,
                    "route": route,
                    "route_label": route_label,
                }
            )

    if not available:
        # Nothing to bind yet — return JSON describing what's missing.
        return JSONResponse(
            {
                "empty": True,
                "estate_name": estate_name,
                "available": [],
                "missing": missing,
                "message": "Generate a PDF from any section first, then come back to assemble your binder.",
            }
        )

    # ── PASS 1: read each cached PDF, count pages, compute start pages.
    # We need this BEFORE rendering the TOC because the TOC has to
    # cite the page numbers correctly.
    section_pdf_bytes: dict[str, bytes] = {}
    section_page_counts: dict[str, int] = {}
    first_page_size: tuple[float, float] | None = None  # (width, height) in points

    for section in available:
        try:
            blob = await storage.download(section["s3_key"])
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                f"Estate binder: cached PDF download failed for user={user_id} type={section['pdf_type']}: {exc}"
            )
            continue
        try:
            reader = PdfReader(io.BytesIO(blob))
            n = len(reader.pages)
            if n <= 0:
                continue
            if first_page_size is None:
                pg = reader.pages[0]
                # mediabox returns RectangleObject (floats already in points)
                first_page_size = (float(pg.mediabox.width), float(pg.mediabox.height))
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"Estate binder: PDF parse failed for user={user_id} type={section['pdf_type']}: {exc}")
            continue
        section_pdf_bytes[section["pdf_type"]] = blob
        section_page_counts[section["pdf_type"]] = n

    # Filter `available` to only those that actually parsed cleanly.
    available = [s for s in available if s["pdf_type"] in section_page_counts]
    if not available:
        return JSONResponse(
            {
                "empty": True,
                "estate_name": estate_name,
                "available": [],
                "missing": missing,
                "message": "Your cached PDFs couldn't be read. Please regenerate any section's PDF.",
            }
        )

    # Default to US Letter if for some reason we never read a source page size.
    if first_page_size is None:
        first_page_size = (612.0, 792.0)

    # ── PASS 2: build cover + TOC. Pre-compute start pages — we know the
    # cover is 1 page, the TOC is 1 page, so first section starts at 3.
    # If we ever spill TOC onto a second page (>~30 sections) this would
    # need adjustment, but with 11 registered types we're safe.
    running_page = 3  # cover (1) + TOC (1) → first section starts at page 3
    for section in available:
        section["start_page"] = running_page
        running_page += section_page_counts[section["pdf_type"]]
    # running_page now points one past the last source page; we don't
    # use it further because the footer pass derives the real total
    # from the assembled writer.

    cover_toc_bytes, toc_links, _toc_page_w, _toc_page_h = _build_title_and_toc_pdf(
        user_name=user_name,
        estate_name=estate_name,
        address_lines=addr_lines,
        phone=phone,
        email=email,
        available_sections=available,
    )

    # ── PASS 3: stitch it all together.
    writer = PdfWriter()
    try:
        for page in PdfReader(io.BytesIO(cover_toc_bytes)).pages:
            writer.add_page(page)
        for section in available:
            for page in PdfReader(io.BytesIO(section_pdf_bytes[section["pdf_type"]])).pages:
                writer.add_page(page)
    except Exception as exc:  # noqa: BLE001
        logger.exception(f"Estate binder stitch failed for user={user_id}")
        raise HTTPException(status_code=500, detail="Failed to assemble binder PDF") from exc

    # ── PASS 3b: clickable TOC + sidebar bookmarks.
    # We MUST construct each Link annotation by hand. pypdf's helper
    # `Link(target_page_index=N)` produces a `/Dest: [N, /Fit]` array
    # where N is a raw integer — that's invalid per PDF spec (destination
    # arrays require an indirect page reference, not an int) and is
    # silently ignored by Preview, Acrobat, AND our in-browser PDF.js
    # rendering. So we emit the canonical form ourselves:
    #     /A → /GoTo → /D → [<page indirect ref>, /Fit]
    # which every viewer honours.
    try:
        from pypdf.generic import (
            ArrayObject,
            DictionaryObject,
            NameObject,
            NumberObject,
            RectangleObject,
        )
        from pypdf.generic import Fit as _Fit

        toc_page_index = 1  # cover (0) + TOC (1)
        toc_page = writer.pages[toc_page_index]
        if toc_page.get("/Annots") is None:
            toc_page[NameObject("/Annots")] = ArrayObject()
        annots_array = toc_page[NameObject("/Annots")]

        rect_by_type = {row["pdf_type"]: row["rect_pt"] for row in toc_links}
        for section in available:
            target_index = section["start_page"] - 1
            if target_index < 0 or target_index >= len(writer.pages):
                continue

            # Sidebar outline (bookmarks panel).
            writer.add_outline_item(
                title=section["display_title"],
                page_number=target_index,
                fit=_Fit.fit(),
            )

            # In-page TOC hot-link (only if we captured a rect).
            rect = rect_by_type.get(section["pdf_type"])
            if not rect:
                continue
            target_page = writer.pages[target_index]
            link_dict = DictionaryObject(
                {
                    NameObject("/Type"): NameObject("/Annot"),
                    NameObject("/Subtype"): NameObject("/Link"),
                    NameObject("/Rect"): RectangleObject(rect),
                    NameObject("/Border"): ArrayObject([NumberObject(0)] * 3),
                    NameObject("/A"): DictionaryObject(
                        {
                            NameObject("/Type"): NameObject("/Action"),
                            NameObject("/S"): NameObject("/GoTo"),
                            NameObject("/D"): ArrayObject(
                                [
                                    target_page.indirect_reference,
                                    NameObject("/Fit"),
                                ]
                            ),
                        }
                    ),
                    NameObject("/P"): toc_page.indirect_reference,
                }
            )
            annots_array.append(writer._add_object(link_dict))

        # ── Back-to-TOC hot-link on the upper-left brand mark of
        # EVERY non-TOC, non-cover page. Coordinates match the
        # "CarryOn" text drawn by `_build_footer_overlay_pdf` above.
        # We need to attach the annotation directly on the writer's
        # page (not the overlay) because `merge_page` does not carry
        # annotations across.
        toc_page = writer.pages[toc_page_index]
        for page_idx, page in enumerate(writer.pages):
            if page_idx in (0, toc_page_index):
                continue  # don't link the cover or the TOC to itself
            try:
                mb = page.mediabox
                pg_top = float(mb.top)
                pg_right = float(mb.right)
            except Exception:
                pg_top = first_page_size[1]
                pg_right = first_page_size[0]

            # Brand mark sits in the upper-RIGHT. Match the overlay's
            # 110pt-wide block, flush against a 20pt right margin.
            brand_w = 110.0
            brand_right_pad = 20.0
            link_right = pg_right - brand_right_pad + 6
            link_left = link_right - brand_w
            link_top_pt = pg_top - 14  # y-up: top edge
            link_bottom_pt = pg_top - 38  # y-up: bottom edge

            back_link = DictionaryObject(
                {
                    NameObject("/Type"): NameObject("/Annot"),
                    NameObject("/Subtype"): NameObject("/Link"),
                    NameObject("/Rect"): RectangleObject(
                        (link_left, link_bottom_pt, link_right, link_top_pt),
                    ),
                    NameObject("/Border"): ArrayObject([NumberObject(0)] * 3),
                    NameObject("/A"): DictionaryObject(
                        {
                            NameObject("/Type"): NameObject("/Action"),
                            NameObject("/S"): NameObject("/GoTo"),
                            NameObject("/D"): ArrayObject(
                                [
                                    toc_page.indirect_reference,
                                    NameObject("/Fit"),
                                ]
                            ),
                        }
                    ),
                    NameObject("/P"): page.indirect_reference,
                }
            )
            if page.get("/Annots") is None:
                page[NameObject("/Annots")] = ArrayObject()
            page[NameObject("/Annots")].append(writer._add_object(back_link))
    except Exception as exc:  # noqa: BLE001
        # TOC links are an enhancement — never abort the assembly.
        logger.warning(f"Estate binder TOC link wiring failed (non-fatal): {exc}")

    # ── PASS 4: footer overlay. Apply across EVERY page in the binder.
    final_page_count = len(writer.pages)
    try:
        overlay_bytes = _build_footer_overlay_pdf(
            page_count=final_page_count,
            estate_name=estate_name,
            page_size=first_page_size,
        )
        overlay_reader = PdfReader(io.BytesIO(overlay_bytes))
        for i, page in enumerate(writer.pages):
            if i < len(overlay_reader.pages):
                page.merge_page(overlay_reader.pages[i])
    except Exception as exc:  # noqa: BLE001
        # Footer is cosmetic — never abort the assembly because of it.
        logger.warning(f"Estate binder footer overlay failed for user={user_id}: {exc}")

    # Serialize
    buffer = io.BytesIO()
    writer.write(buffer)
    pdf_bytes = buffer.getvalue()

    # Fire-and-forget: cache as `estate_binder` so the user can re-fetch
    # without rebuilding. This re-uses the same `latest_pdfs` slot
    # registry the rest of the platform uses.
    try:
        s3_key = f"latest-pdfs/{user_id}/estate_binder.pdf"
        await storage.upload_raw(pdf_bytes, s3_key, content_type="application/pdf")
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.latest_pdfs.update_one(
            {"user_id": user_id, "pdf_type": "estate_binder"},
            {
                "$set": {
                    "user_id": user_id,
                    "pdf_type": "estate_binder",
                    "s3_key": s3_key,
                    "title": f"{estate_name} — Estate Binder",
                    "subtitle": f"{len(available)} section{'' if len(available) == 1 else 's'}",
                    "filename": "estate_binder.pdf",
                    "size_bytes": len(pdf_bytes),
                    "updated_at": now_iso,
                },
                "$setOnInsert": {"created_at": now_iso},
            },
            upsert=True,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Estate binder cache-save failed (non-fatal): {exc}")

    headers = {
        "Content-Disposition": 'inline; filename="estate_binder.pdf"',
        "X-CarryOn-Binder-Included": ",".join(s["pdf_type"] for s in available),
        "X-CarryOn-Binder-Missing": ",".join(m["pdf_type"] for m in missing),
        "X-CarryOn-Binder-Page-Count": str(final_page_count),
        "Cache-Control": "private, max-age=60",
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.get("/estate-binder/manifest")
async def estate_binder_manifest(current_user: dict = Depends(get_current_user)):
    """Fast-path manifest used by the dashboard button to decide
    whether to show "ready" or "guide me first" before any PDF work.
    Returns the same available/missing shape the POST endpoint uses
    in the empty case, so the frontend has a single source of truth.
    """
    user_id = current_user["id"]
    cached_docs = await db.latest_pdfs.find(
        {"user_id": user_id, "pdf_type": {"$in": [s[0] for s in SECTION_ORDER]}},
        {"_id": 0, "id": 1, "pdf_type": 1, "updated_at": 1},
    ).to_list(50)
    cached_map = {d["pdf_type"]: d for d in cached_docs}
    # Look up the user's primary estate ONCE so we can stamp a
    # per-type capture route (e.g. /financial/entities/<id>/print) on
    # each manifest item. The Binder preview's "Refresh" pill uses
    # this to open a hidden iframe with `?autoCache=1` and re-mint
    # the cached PDF without dragging the user out of the modal.
    primary_estate = await db.estates.find_one(
        {"owner_id": user_id, "is_primary": True},
        {"_id": 0, "id": 1},
    ) or await db.estates.find_one(
        {"owner_id": user_id},
        {"_id": 0, "id": 1},
    )
    primary_estate_id = (primary_estate or {}).get("id")
    capture_route_map = {
        # Only `entities_structures` has the client-side autoCache hook
        # wired today; other section pages can be extended to the same
        # pattern without backend changes (we just add their path here
        # once the frontend supports `?autoCache=1`).
        "entities_structures": (
            f"/financial/entities/{primary_estate_id}/print?autoCache=1" if primary_estate_id else None
        ),
    }
    available = []
    missing = []
    for pdf_type, display_title, route, route_label in SECTION_ORDER:
        item = {
            "pdf_type": pdf_type,
            "display_title": display_title,
            "route": route,
            "route_label": route_label,
            "capture_route": capture_route_map.get(pdf_type),
        }
        cached = cached_map.get(pdf_type)
        if cached:
            # Freshness cue surfaced to the Binder preview manifest UI
            # so the user can see at a glance which sections in the
            # assembled binder are stale vs fresh, and one-tap deep-link
            # to refresh them.
            item["updated_at"] = cached.get("updated_at")
            available.append(item)
        else:
            missing.append(item)
    return {"available": available, "missing": missing, "can_generate": len(available) > 0}
