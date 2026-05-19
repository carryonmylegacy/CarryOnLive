"""Financial Portal — Entities & Structures: PDF for the Estate Binder.

The Entities & Structures CFP module already renders a beautiful in-browser
SVG org chart + uses `window.print()` for the "Print" affordance, but
because that pipeline lives entirely in the browser there is no PDF blob
to push into the per-user `latest_pdfs` cache. As a result, E&S has been
missing from the assembled Estate Binder.

This module fixes that by producing a canonical server-side PDF using
fpdf2 — a tabular, print-ready summary of the same data the SVG chart
visualizes:

  • Header: estate name + generation date
  • Entities grouped by category (Business / Trust / Charity / Property /
    Specialized) with the metadata the user typed in (formation state,
    EIN last-four, tax election, etc.) + assets/debts
  • External people (third parties named in relationships but not on the
    beneficiaries list)
  • Beneficiary blocks (named groups + members)
  • Relationships table: every "X is the <role> of Y" line

The route ALSO upserts the freshly-rendered bytes into the existing
`latest_pdfs` S3+Mongo cache under `pdf_type="entities_structures"`, so
the Binder generator picks it up automatically on its next run without
the frontend having to do anything extra. The Print page fires this
endpoint once on mount as fire-and-forget, leaving the existing
browser-print pipeline untouched.
"""

from datetime import datetime, timezone
import os

from fastapi import Depends, HTTPException, Request, Response

from config import db, logger
from services.storage import storage
from services.pdf_renderer import render_entities_pdf as _chromium_render_entities_pdf
from utils import get_current_user

from ._core import router, _verify_estate_access

# ─── Bucket presentation order + display labels ────────────────────────
# Mirrors the entity catalog grouping shown in the live UI.
_BUCKET_ORDER = ("business", "trust", "charity", "property", "specialized")
_BUCKET_LABELS = {
    "business": "Business Entities",
    "trust": "Trusts",
    "charity": "Charitable Vehicles",
    "property": "Property-Holding Entities",
    "specialized": "Specialized Structures",
}
_ROLE_LABELS = {
    "owner": "Owner",
    "gp": "General Partner",
    "lp": "Limited Partner",
    "manager": "Manager",
    "member": "Member",
    "trustee": "Trustee",
    "successor_trustee": "Successor Trustee",
    "grantor": "Grantor",
    "settlor": "Settlor",
    "beneficiary": "Beneficiary",
    "trust_protector": "Trust Protector",
    "director": "Director",
    "officer": "Officer",
    "shareholder": "Shareholder",
    "registered_agent": "Registered Agent",
    "investment_advisor": "Investment Advisor",
    "distribution_advisor": "Distribution Advisor",
    "accountant": "Accountant",
    "attorney": "Attorney",
    "advisor": "Advisor",
    "partner": "Partner",
}


def _safe(text):
    """Latin-1 sanitization for fpdf2 with common Unicode → ASCII fallbacks."""
    if not text:
        return ""
    s = str(text)
    for src, repl in (
        ("\u2014", " - "),
        ("\u2013", "-"),
        ("\u2212", "-"),
        ("\u2018", "'"),
        ("\u2019", "'"),
        ("\u201c", '"'),
        ("\u201d", '"'),
        ("\u2026", "..."),
        ("\u2022", "*"),
        ("\u00b7", "-"),
        ("\u00a0", " "),
    ):
        if src in s:
            s = s.replace(src, repl)
    return s.encode("latin-1", errors="replace").decode("latin-1")


def _fmt_money(n):
    if n is None:
        return ""
    try:
        return f"${float(n):,.0f}"
    except (TypeError, ValueError):
        return ""


def _resolve_person_name(
    source_type: str,
    source_id: str,
    *,
    user_doc: dict | None,
    beneficiaries: list[dict],
    externals: list[dict],
    entities: list[dict],
    blocks: list[dict],
) -> str:
    """Pretty name for a relationship's source endpoint."""
    if source_type == "user":
        if user_doc and (user_doc.get("first_name") or user_doc.get("last_name")):
            return f"{user_doc.get('first_name', '')} {user_doc.get('last_name', '')}".strip() or "You"
        return "You"
    if source_type == "beneficiary":
        for b in beneficiaries:
            if b.get("id") == source_id:
                return f"{b.get('first_name', '')} {b.get('last_name', '')}".strip() or "Beneficiary"
        return "Beneficiary"
    if source_type == "external_person":
        for p in externals:
            if p.get("id") == source_id:
                return f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or "External person"
        return "External person"
    if source_type == "entity":
        for e in entities:
            if e.get("id") == source_id:
                return e.get("name", "") or "Entity"
        return "Entity"
    if source_type == "beneficiary_block":
        for blk in blocks:
            if blk.get("id") == source_id:
                return blk.get("name", "") or "Beneficiary block"
        return "Beneficiary block"
    return source_id or "—"


def _render_pdf(
    *,
    estate_name: str,
    entities: list[dict],
    externals: list[dict],
    relationships: list[dict],
    blocks: list[dict],
    beneficiaries: list[dict],
    user_doc: dict | None,
) -> bytes:
    """Produce the canonical E&S PDF as bytes."""
    from fpdf import FPDF

    pdf = FPDF(orientation="P", unit="mm", format="Letter")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(left=15, top=15, right=15)
    pdf.add_page()

    # ─── Header ───
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(15, 22, 41)
    pdf.cell(0, 8, _safe("Entities & Structures"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(82, 92, 114)
    if estate_name:
        pdf.cell(0, 5, _safe(estate_name), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(
        0,
        5,
        _safe(f"Generated {datetime.now(timezone.utc).strftime('%B %d, %Y')} · CarryOn"),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(2)
    # Gold rule
    pdf.set_draw_color(212, 175, 55)
    pdf.set_line_width(0.6)
    pdf.line(15, pdf.get_y(), 201, pdf.get_y())
    pdf.ln(4)

    if not entities and not relationships and not blocks and not externals:
        pdf.set_font("Helvetica", "I", 11)
        pdf.set_text_color(120, 128, 145)
        pdf.multi_cell(
            0,
            6,
            _safe(
                "No entities, beneficiary blocks, or relationships have been added "
                "to this estate yet. Add them in the Entities & Structures section "
                "of the CarryOn Financial Picture."
            ),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        return bytes(pdf.output())

    # ─── Entities by bucket ───
    entities_by_bucket: dict[str, list[dict]] = {b: [] for b in _BUCKET_ORDER}
    for e in entities:
        bucket = e.get("category", "specialized")
        entities_by_bucket.setdefault(bucket, []).append(e)

    for bucket in _BUCKET_ORDER:
        group = entities_by_bucket.get(bucket, [])
        if not group:
            continue
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(15, 22, 41)
        pdf.cell(
            0,
            7,
            _safe(f"{_BUCKET_LABELS[bucket]}  ({len(group)})"),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(1)

        for ent in group:
            # Entity name row
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(15, 22, 41)
            pdf.cell(0, 5.5, _safe(ent.get("name", "")), new_x="LMARGIN", new_y="NEXT")

            # Metadata row(s)
            meta_parts = []
            if ent.get("type"):
                meta_parts.append(_safe(str(ent["type"]).replace("_", " ").title()))
            if ent.get("formation_state"):
                meta_parts.append(_safe(f"Formed in {ent['formation_state']}"))
            if ent.get("ein_last_four"):
                meta_parts.append(_safe(f"EIN ****{ent['ein_last_four']}"))
            if ent.get("formation_date"):
                meta_parts.append(_safe(f"{ent['formation_date']}"))
            if ent.get("tax_election"):
                meta_parts.append(_safe(f"Tax: {ent['tax_election']}"))
            if meta_parts:
                pdf.set_font("Helvetica", "", 9.5)
                pdf.set_text_color(82, 92, 114)
                pdf.multi_cell(0, 4.5, _safe("  -  ".join(meta_parts)), new_x="LMARGIN", new_y="NEXT")

            # Financial row
            money_parts = []
            if ent.get("gross_assets") is not None:
                money_parts.append(_safe(f"Assets: {_fmt_money(ent['gross_assets'])}"))
            if ent.get("gross_debts") is not None:
                money_parts.append(_safe(f"Debts: {_fmt_money(ent['gross_debts'])}"))
            if ent.get("registered_agent"):
                money_parts.append(_safe(f"Reg. Agent: {ent['registered_agent']}"))
            if money_parts:
                pdf.set_font("Helvetica", "", 9.5)
                pdf.set_text_color(82, 92, 114)
                pdf.multi_cell(0, 4.5, _safe("  -  ".join(money_parts)), new_x="LMARGIN", new_y="NEXT")

            if ent.get("notes"):
                pdf.set_font("Helvetica", "I", 9)
                pdf.set_text_color(120, 128, 145)
                pdf.multi_cell(0, 4.2, _safe(f"Notes: {ent['notes']}"), new_x="LMARGIN", new_y="NEXT")

            pdf.ln(2)
        pdf.ln(2)

    # ─── External People ───
    if externals:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(15, 22, 41)
        pdf.cell(
            0,
            7,
            _safe(f"External People  ({len(externals)})"),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(1)
        for p in externals:
            name = f"{p.get('first_name', '')} {p.get('last_name', '') or ''}".strip()
            pdf.set_font("Helvetica", "B", 10.5)
            pdf.set_text_color(15, 22, 41)
            pdf.cell(0, 5, _safe(name or "External person"), new_x="LMARGIN", new_y="NEXT")
            if p.get("notes"):
                pdf.set_font("Helvetica", "I", 9)
                pdf.set_text_color(120, 128, 145)
                pdf.multi_cell(0, 4.2, _safe(p["notes"]), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
        pdf.ln(2)

    # ─── Beneficiary Blocks ───
    if blocks:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(15, 22, 41)
        pdf.cell(
            0,
            7,
            _safe(f"Beneficiary Blocks  ({len(blocks)})"),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(1)
        for blk in blocks:
            pdf.set_font("Helvetica", "B", 10.5)
            pdf.set_text_color(15, 22, 41)
            pdf.cell(0, 5, _safe(blk.get("name", "")), new_x="LMARGIN", new_y="NEXT")

            members = blk.get("members") or []
            if members:
                member_names = []
                for m in members:
                    member_names.append(
                        _resolve_person_name(
                            m.get("kind", ""),
                            m.get("id", ""),
                            user_doc=user_doc,
                            beneficiaries=beneficiaries,
                            externals=externals,
                            entities=entities,
                            blocks=blocks,
                        )
                    )
                pdf.set_font("Helvetica", "", 9.5)
                pdf.set_text_color(82, 92, 114)
                pdf.multi_cell(0, 4.5, _safe(", ".join(member_names)), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
        pdf.ln(2)

    # ─── Relationships ───
    if relationships:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(15, 22, 41)
        pdf.cell(
            0,
            7,
            _safe(f"Relationships  ({len(relationships)})"),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(1)

        # Header row (widths sum to 185 mm to fit Letter portrait with 15mm margins)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(241, 243, 248)
        pdf.set_text_color(82, 92, 114)
        pdf.cell(60, 6, _safe("PERSON / GROUP"), border=0, fill=True)
        pdf.cell(48, 6, _safe("ROLE"), border=0, fill=True)
        pdf.cell(60, 6, _safe("AT ENTITY"), border=0, fill=True)
        pdf.cell(17, 6, _safe("OWN%"), border=0, fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(0.5)

        pdf.set_font("Helvetica", "", 9.5)
        pdf.set_text_color(15, 22, 41)
        for r in relationships:
            src_name = _resolve_person_name(
                r.get("source_type", ""),
                r.get("source_id", ""),
                user_doc=user_doc,
                beneficiaries=beneficiaries,
                externals=externals,
                entities=entities,
                blocks=blocks,
            )
            target_name = ""
            for e in entities:
                if e.get("id") == r.get("target_id"):
                    target_name = e.get("name", "") or ""
                    break
            role_lbl = _ROLE_LABELS.get(r.get("role", ""), str(r.get("role", "")).replace("_", " ").title())
            own_pct = r.get("ownership_pct")
            own_str = f"{own_pct:.0f}%" if isinstance(own_pct, (int, float)) else ""

            pdf.cell(60, 5.5, _safe(src_name[:38]))
            pdf.cell(48, 5.5, _safe(role_lbl[:30]))
            pdf.cell(60, 5.5, _safe(target_name[:38]))
            pdf.cell(17, 5.5, _safe(own_str), new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())


async def ensure_entities_structures_cached(
    estate_id: str,
    user_id: str,
    *,
    max_age_hours: float = 24.0,  # noqa: ARG001 — kept for backwards-compat caller signatures
) -> dict:
    """Read-only helper for the Estate Binder pipeline.

    Historically this function ALSO regenerated a tabular `fpdf2`
    fallback whenever no client capture existed. The user's May 22,
    2026 emergency report ("the binder still has the motherfucking
    shitty E&S and the blank pages before and after it!") proved that
    fallback was actively harmful: it produced a 1.5 KB tabular text
    PDF that looked nothing like the chart, had wrong page sizes
    that rendered as "blank space" inside the binder reader, and
    silently overwrote nothing — meaning the user could never get a
    clean binder until they manually visited `/print/entities` to
    mint a client capture.

    NEW CONTRACT: this function NEVER writes. It exists only to
    surface whether a client capture is present so the Binder
    generator can either include E&S (if one exists) or list it as
    missing (with a deep-link Refresh pill the user already
    understands). The fallback path is permanently removed.
    """
    cached = await db.latest_pdfs.find_one(
        {"user_id": user_id, "pdf_type": "entities_structures"},
        {"_id": 0, "size_bytes": 1, "source": 1},
    )
    if cached and (cached.get("size_bytes") or 0) >= 5000 and cached.get("source") != "server_fallback":
        return {"refreshed": False, "reason": "client_capture_preserved"}
    # Purge any lingering server-fallback row so the Binder lists
    # E&S as missing (the correct outcome — the user will see a
    # "Refresh" pill on the manifest and one tap mints a real
    # client capture via the new in-place iframe flow).
    if cached and cached.get("source") == "server_fallback":
        try:
            await db.latest_pdfs.delete_one(
                {"user_id": user_id, "pdf_type": "entities_structures", "source": "server_fallback"}
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug(f"Failed to evict server_fallback row for user={user_id}: {exc}")
    return {"refreshed": False, "reason": "no_client_capture"}


@router.get("/financial/entities/{estate_id}/pdf")
async def generate_entities_structures_pdf(
    estate_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Generate the canonical Entities & Structures PDF for `estate_id`
    AND write it to the `latest_pdfs` cache (pdf_type=`entities_structures`)
    so the Estate Binder picks it up on its next assembly.

    Returns the PDF bytes as `application/pdf`. The cache upload is best-
    effort: if storage fails, the PDF still streams to the caller.
    """
    estate, can_manage = await _verify_estate_access(estate_id, current_user)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the benefactor can export Entities & Structures.")

    # Pull every component we need in one fan-out.
    entities = await db.cfp_entities.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0},
    ).to_list(2000)
    externals = await db.cfp_external_people.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0},
    ).to_list(2000)
    relationships = await db.cfp_entity_relationships.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0},
    ).to_list(5000)
    blocks = await db.cfp_beneficiary_blocks.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0},
    ).to_list(2000)
    beneficiaries = await db.beneficiaries.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1},
    ).to_list(500)
    user_doc = await db.users.find_one(
        {"id": current_user["id"]},
        {"_id": 0, "first_name": 1, "last_name": 1},
    )

    pdf_bytes = _render_pdf(
        estate_name=estate.get("name", "") if estate else "",
        entities=entities,
        externals=externals,
        relationships=relationships,
        blocks=blocks,
        beneficiaries=beneficiaries,
        user_doc=user_doc,
    )

    # ─── Best-effort cache write so the Binder picks it up ───
    # Mirrors the pattern in routes/pdfs.py::cache_latest_pdf but invokes
    # the underlying storage helper directly (we already have the bytes
    # and the authenticated user — no need for a self-call).
    try:
        s3_key = f"latest-pdfs/{current_user['id']}/entities_structures.pdf"
        await storage.upload_raw(pdf_bytes, s3_key, content_type="application/pdf")
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.latest_pdfs.update_one(
            {"user_id": current_user["id"], "pdf_type": "entities_structures"},
            {
                "$set": {
                    "user_id": current_user["id"],
                    "pdf_type": "entities_structures",
                    "s3_key": s3_key,
                    "title": "Entities & Structures",
                    "subtitle": (estate or {}).get("name", "")[:200],
                    "filename": "EntitiesAndStructures.pdf",
                    "size_bytes": len(pdf_bytes),
                    "updated_at": now_iso,
                },
                "$setOnInsert": {"created_at": now_iso},
            },
            upsert=True,
        )
    except Exception as exc:  # noqa: BLE001
        # Cache failure is non-fatal — the user still gets their PDF.
        logger.warning(f"Entities & Structures: cache write failed for user={current_user['id']}: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'inline; filename="EntitiesAndStructures.pdf"',
        },
    )


@router.post("/financial/entities/{estate_id}/render-pdf")
async def render_entities_structures_pdf_via_chromium(
    estate_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Render E&S to a TRUE VECTOR PDF via headless Chromium.

    This is the rock-solid replacement for the legacy client-side
    html2canvas pipeline. Same architectural pattern as every other
    section in the platform: server makes the bytes → server caches
    the bytes → binder reads from cache. No browser-side capture
    quirks ever again.

    Auth flow:
        1. Caller's JWT is extracted from the incoming request's
           Authorization header (the same one `get_current_user`
           validated above — guaranteed valid).
        2. We pass that JWT to the renderer, which injects it into a
           headless browser's localStorage before any page script
           runs. The React app boots fully authenticated and renders
           an identical view to what the user sees on `/print/entities`.

    The endpoint is intentionally fire-and-forget friendly:
        • Returns within ~3–5 s on a warm browser.
        • Cache row writes BEFORE the response so subsequent binder
          builds see the fresh bytes immediately.
        • On failure, the cache is NOT touched — keeps the previous
          good capture intact rather than blanking it on a transient
          render hiccup.
    """
    estate, can_manage = await _verify_estate_access(estate_id, current_user)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the benefactor can render Entities & Structures.")

    # Extract the raw token from the Authorization header. `get_current_user`
    # already validated it, so we know it's well-formed and unexpired.
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token for render auth")
    token = auth_header.split(" ", 1)[1].strip()

    # Build the in-pod URL the headless browser should navigate to.
    # Prefer the explicit RENDER_BASE_URL env var (so we can use the
    # external host in staging/prod where the React app is served from
    # a CDN), falling back to the public REACT base.
    base_url = (
        os.environ.get("RENDER_BASE_URL") or os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:3000"
    ).rstrip("/")
    # If we resolved to the API URL (which serves /api but not the SPA),
    # strip the trailing path so we land on the SPA host root.
    if base_url.endswith("/api"):
        base_url = base_url[:-4]

    try:
        pdf_bytes = await _chromium_render_entities_pdf(
            base_url=base_url,
            estate_id=estate_id,
            auth_token=token,
        )
    except ImportError as exc:
        # Playwright python package isn't installed on this pod.
        # Surface a 503 so the frontend can show a friendly "feature
        # temporarily unavailable" message instead of a crash alert.
        logger.error(f"Playwright not installed; /render-pdf unavailable: {exc}")
        raise HTTPException(
            status_code=503,
            detail="PDF render service is not configured on this pod (Playwright missing).",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        # Chromium binary missing, browser launch failed, or render
        # itself threw. Common Railway case: pip-installed playwright
        # but never ran `playwright install chromium` post-deploy.
        msg = str(exc)
        if "Executable doesn't exist" in msg or "BrowserType.launch" in msg:
            logger.error(f"Chromium binary missing on pod; /render-pdf unavailable: {exc}")
            raise HTTPException(
                status_code=503,
                detail="PDF render service is not fully configured on this pod (Chromium binary missing).",
            ) from exc
        logger.exception(f"Chromium render failed for estate={estate_id}: {exc}")
        raise HTTPException(status_code=500, detail=f"Render failed: {exc}") from exc

    # Cache write — only on success, so a failed render can never blank
    # out a previously-good capture.
    s3_key = f"latest-pdfs/{current_user['id']}/entities_structures.pdf"
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        await storage.upload_raw(pdf_bytes, s3_key, content_type="application/pdf")
        await db.latest_pdfs.update_one(
            {"user_id": current_user["id"], "pdf_type": "entities_structures"},
            {
                "$set": {
                    "user_id": current_user["id"],
                    "pdf_type": "entities_structures",
                    "s3_key": s3_key,
                    "title": "Entities & Structures",
                    "subtitle": (estate or {}).get("name", "")[:200],
                    "filename": "EntitiesAndStructures.pdf",
                    "size_bytes": len(pdf_bytes),
                    "updated_at": now_iso,
                    # `server_render` distinguishes this from the legacy
                    # `client_capture` and the now-removed `server_fallback`.
                    # The binder's `ensure_*` helper preserves any non-
                    # `server_fallback` row, so we're safe.
                    "source": "server_render",
                },
                "$setOnInsert": {"created_at": now_iso},
            },
            upsert=True,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Entities & Structures: cache write failed for user={current_user['id']}: {exc}")
        # Bubble the failure so the caller knows the bytes weren't cached.
        raise HTTPException(status_code=500, detail="Render succeeded but cache write failed") from exc

    return {
        "ok": True,
        "size_bytes": len(pdf_bytes),
        "updated_at": now_iso,
        "source": "server_render",
        "pdf_type": "entities_structures",
    }
