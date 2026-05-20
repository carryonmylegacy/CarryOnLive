"""CarryOn — Combined "Emergency Cards" PDF builder.

The Estate Binder pulls in `ccp_card` as a single section, but a user
can have MANY emergency plans (one wallet card per plan). The cached
`latest_pdfs` row for `ccp_card` is whichever single plan's card the
user most recently downloaded — so the binder was only including ONE
card.

This module assembles a fresh multi-card PDF on the fly during binder
generation. Each plan's wallet card lives on its own letter-sized
page (front + back side-by-side, cut + fold). Uses the existing
single-card renderer (`routes.downloads._handle_emergency_card`) so
the visual output is byte-identical to a standalone download — no
risk of regression vs. the live single-card endpoint.
"""

from io import BytesIO

from pypdf import PdfReader, PdfWriter

from config import db, logger


async def build_combined_ccp_cards_pdf(estate_id: str, user_id: str) -> bytes | None:
    """Build a single multi-page PDF containing one wallet card per
    active emergency plan for the given estate.

    Args:
        estate_id: Estate identifier.
        user_id:   Owner's user id (used to satisfy the per-plan
                   render's ownership check).

    Returns:
        Merged PDF bytes if the estate has one or more plans, else None.
        Returning None lets the binder gracefully skip the section.
    """
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        return None

    plans = (
        await db.emergency_plans.find(
            {"estate_id": estate_id, "deleted_at": None},
            {"_id": 0, "id": 1, "name": 1, "created_at": 1},
        )
        .sort("created_at", 1)
        .to_list(50)
    )
    if not plans:
        return None

    # Lazy import to avoid a circular import at module load time
    # (downloads.py imports estate_binder indirectly via the router
    # registration order in server.py).
    from routes.downloads import _handle_emergency_card

    # Synthesise a minimal user dict that satisfies the ownership
    # check inside `_handle_emergency_card`. The binder caller has
    # already validated that `user_id` owns the estate before reaching
    # this point.
    user_stub = {"id": user_id, "role": "user"}

    writer = PdfWriter()
    rendered = 0
    for plan in plans:
        try:
            resp = await _handle_emergency_card(
                user_stub,
                {"plan_id": plan["id"]},
                f"card_{plan['id']}.pdf",
            )
            pdf_bytes = resp.body if hasattr(resp, "body") else None
            if not pdf_bytes:
                continue
            reader = PdfReader(BytesIO(pdf_bytes))
            for page in reader.pages:
                writer.add_page(page)
            rendered += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"build_combined_ccp_cards_pdf: plan={plan.get('id')} failed: {exc}")
            continue

    if rendered == 0:
        return None

    out = BytesIO()
    writer.write(out)
    return out.getvalue()
