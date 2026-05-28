"""CarryOn — Combined "CarryOn Contingency Protocols" PDF builder.

The Estate Binder pulls in `ccp_plan` as a single section, but a user
can have MANY emergency plans (one per disaster type, custom plans,
etc). The cached `latest_pdfs` row for `ccp_plan` is whichever single
plan the user most recently downloaded — so the binder was only
including ONE protocol instead of ALL of them.

This module assembles a fresh multi-plan PDF on the fly during
binder generation. Same visual layout as the single-plan download
(`routes/downloads.py::_handle_ccp_plan`) but loops over every
non-deleted plan for the estate. If the user has zero plans, returns
None and the binder gracefully skips the section.
"""

from datetime import datetime as _dt

from fpdf import FPDF  # noqa: F401 — kept for type-compat; actual instances use CarryOnPDF

from config import db, logger
from services.pdf_trust_footer import CarryOnPDF

_PLAN_TYPE_LABELS = {
    "natural_disaster": "Natural Disaster",
    "national_emergency": "National Emergency",
    "medical_emergency": "Medical Emergency",
    "infrastructure_failure": "Infrastructure Failure",
    "custom": "Custom Plan",
}


def _safe(text: str | None) -> str:
    """FPDF only handles latin-1 — replace anything outside that range."""
    if not text:
        return ""
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _render_one_plan(pdf: FPDF, plan: dict, estate: dict, *, is_first: bool) -> None:
    """Draw a single emergency plan onto the FPDF instance.

    Mirrors the layout of `_handle_ccp_plan` in `routes/downloads.py`
    so the combined binder section looks identical to the standalone
    download.
    """
    if not is_first:
        pdf.add_page()

    # Header (cover-ish row at the top of every plan page)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(212, 175, 55)
    pdf.cell(0, 14, "CarryOn Contingency Protocols", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 7, f"Estate: {_safe(estate.get('name', 'My Estate'))}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, f"Generated: {_dt.now().strftime('%B %d, %Y')}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Divider + plan title
    pdf.set_draw_color(212, 175, 55)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 12, _safe(plan.get("name", "Emergency Plan")), new_x="LMARGIN", new_y="NEXT")

    plan_type_label = _PLAN_TYPE_LABELS.get(
        plan.get("plan_type", "custom"),
        plan.get("plan_type", "Custom"),
    )
    pdf.set_font("Helvetica", "I", 11)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 7, f"Type: {plan_type_label}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Rendezvous Points
    rps = plan.get("rendezvous_points", []) or []
    if rps:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(59, 123, 247)
        pdf.cell(0, 10, "RENDEZVOUS POINTS", new_x="LMARGIN", new_y="NEXT")
        for i, rp in enumerate(rps, 1):
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(0, 7, f"  {i}. {_safe(rp.get('name', 'Point'))}", new_x="LMARGIN", new_y="NEXT")
            if rp.get("address"):
                pdf.set_font("Helvetica", "", 10)
                pdf.set_text_color(80, 80, 80)
                pdf.cell(0, 6, f"     Address: {_safe(rp['address'])}", new_x="LMARGIN", new_y="NEXT")
            if rp.get("notes"):
                pdf.set_font("Helvetica", "I", 10)
                pdf.set_text_color(120, 120, 120)
                pdf.cell(0, 6, f"     Note: {_safe(rp['notes'])}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    # Communication Plan
    comm = (plan.get("communication_plan") or "").strip()
    if comm:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(34, 201, 147)
        pdf.cell(0, 10, "COMMUNICATION PLAN", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(40, 40, 40)
        pdf.multi_cell(0, 6, _safe(comm))
        pdf.ln(4)

    # Resource Locations
    rls = plan.get("resource_locations", []) or []
    if rls:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(245, 166, 35)
        pdf.cell(0, 10, "RESOURCE LOCATIONS", new_x="LMARGIN", new_y="NEXT")
        for i, rl in enumerate(rls, 1):
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(0, 7, f"  {i}. {_safe(rl.get('name', 'Resource'))}", new_x="LMARGIN", new_y="NEXT")
            if rl.get("location"):
                pdf.set_font("Helvetica", "", 10)
                pdf.set_text_color(80, 80, 80)
                pdf.cell(0, 6, f"     Location: {_safe(rl['location'])}", new_x="LMARGIN", new_y="NEXT")
            if rl.get("notes"):
                pdf.set_font("Helvetica", "I", 10)
                pdf.set_text_color(120, 120, 120)
                pdf.cell(0, 6, f"     Note: {_safe(rl['notes'])}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    # Instructions
    instr = (plan.get("instructions") or "").strip()
    if instr:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(183, 148, 246)
        pdf.cell(0, 10, "INSTRUCTIONS", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(40, 40, 40)
        pdf.multi_cell(0, 6, _safe(instr))
        pdf.ln(4)

    # Drill Schedule
    ds = plan.get("drill_schedule")
    if ds and ds.get("enabled"):
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(59, 123, 247)
        pdf.cell(0, 10, "DRILL SCHEDULE", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(40, 40, 40)
        freq = (ds.get("frequency") or "").replace("_", " ").title()
        label = ds.get("label", "")
        pdf.cell(0, 7, f"  Frequency: {freq} - {_safe(label)}", new_x="LMARGIN", new_y="NEXT")
        if ds.get("next_drill_date"):
            try:
                nd = _dt.fromisoformat(ds["next_drill_date"].replace("Z", "+00:00"))
                pdf.cell(0, 7, f"  Next drill: {nd.strftime('%B %Y')}", new_x="LMARGIN", new_y="NEXT")
            except (ValueError, AttributeError):
                pass
        pdf.ln(4)

    # Footer disclaimer
    pdf.ln(8)
    pdf.set_draw_color(200, 200, 200)
    pdf.set_line_width(0.3)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(150, 150, 150)
    pdf.multi_cell(
        0,
        5,
        "This document was generated by CarryOn. Keep printed copies in "
        "accessible locations known to all family members. Review and update "
        "this plan regularly.",
    )


async def build_combined_ccp_pdf(estate_id: str) -> bytes | None:
    """Build a single PDF containing EVERY active emergency plan for the
    given estate.

    Returns:
        PDF bytes if the estate has one or more plans, else None.
        Returning None lets the binder gracefully skip the section.
    """
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        return None

    plans = (
        await db.emergency_plans.find(
            {"estate_id": estate_id, "deleted_at": None},
            {"_id": 0},
        )
        .sort("created_at", 1)
        .to_list(100)
    )
    if not plans:
        return None

    pdf = CarryOnPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    for i, plan in enumerate(plans):
        _render_one_plan(pdf, plan, estate, is_first=(i == 0))

    try:
        return bytes(pdf.output())
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"build_combined_ccp_pdf failed for estate={estate_id}: {exc}")
        return None
