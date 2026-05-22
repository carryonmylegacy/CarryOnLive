"""CarryOn™ Backend — Latest-PDF cache per user per type

Persistent "most-recently-generated" PDF store. Each time the user
generates a PDF from one of the platform sections (EGA To-Do, EGA
IAC, E&S Chart, IAC Checklist, FFN, CCP, etc.), the rendered bytes
are uploaded here. Bytes live in S3 via the existing storage backend
(key: `latest-pdfs/{user_id}/{pdf_type}.pdf`); metadata lives in the
`latest_pdfs` Mongo collection.

The frontend's section pages query `/api/pdfs/latest/{type}` on mount
so a "view latest" icon appears next to the generate button whenever
the user has a cached PDF — even after PWA cold start or device
switch. Tapping the icon streams the bytes back through this router.

Each (user_id, pdf_type) pair only ever holds ONE document — a fresh
upload replaces the prior one (S3 key is overwritten, Mongo doc is
upserted). The user can also DELETE explicitly to clear the slot
(e.g. when they dismiss the inline icon with intent to retire it).

Endpoints
─────────
POST   /api/pdfs/cache                 — multipart upload + metadata
GET    /api/pdfs/latest                — list metadata for all of MY types
GET    /api/pdfs/latest/{pdf_type}     — stream the bytes for ONE type
DELETE /api/pdfs/latest/{pdf_type}     — purge this slot
"""

import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from config import db, logger
from services.storage import storage
from utils import get_current_user

router = APIRouter()

# ─── Allowed PDF types ────────────────────────────────────────────
# Whitelist. Adding a new section's PDF? Register it here AND on the
# frontend `CachedPdfIcon` call-site. The label is what we show in
# the icon's tooltip + tab list.
PDF_TYPE_REGISTRY = {
    "quickstart_guide": {"label": "QuickStart Estate Plan Guide"},
    "ega_todo": {"label": "EGA To-Do List"},
    "ega_iac": {"label": "EGA Immediate Action Report"},
    "ega_checklist": {"label": "IAC Checklist (EGA)"},
    "ega_transcript": {"label": "EGA Conversation Transcript"},
    "ega_plan": {"label": "EGA Plan of Action"},
    "iac_standalone": {"label": "Immediate Action Checklist"},
    "cfp_handoff": {"label": "CFP Hand-off Package"},
    "entities_structures": {"label": "Entities & Structures"},
    "ccp_plan": {"label": "CarryOn Contingency Protocols"},
    "ccp_card": {"label": "Emergency Card"},
    "ccp_report": {"label": "Family Readiness Report"},
    "beneficiary_packet": {"label": "Beneficiary IAC Packet"},
    "estate_binder": {"label": "Estate Binder"},
}
ALLOWED_PDF_TYPES = set(PDF_TYPE_REGISTRY.keys())

MAX_PDF_BYTES = 15 * 1024 * 1024  # 15 MB hard cap


def _key_for(user_id: str, pdf_type: str) -> str:
    return f"latest-pdfs/{user_id}/{pdf_type}.pdf"


def _strip_oid(doc: dict | None) -> dict | None:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


@router.post("/pdfs/cache")
async def cache_latest_pdf(
    file: UploadFile = File(...),
    pdf_type: str = Form(...),
    title: str = Form(""),
    subtitle: str = Form(""),
    filename: str = Form(""),
    current_user: dict = Depends(get_current_user),
):
    """Upsert the user's latest PDF for this type. Body is multipart
    so the bytes can stream directly to S3 without a base64 round-trip.

    Fire-and-forget pattern from the frontend: the calling page kicks
    this off AFTER the preview modal has already opened, so any
    latency here is invisible to the user."""
    pdf_type = (pdf_type or "").strip().lower()
    if pdf_type not in ALLOWED_PDF_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown pdf_type '{pdf_type}'. Allowed: {sorted(ALLOWED_PDF_TYPES)}",
        )
    content_type = (file.content_type or "").lower()
    if content_type and content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File must be application/pdf.")

    blob = await file.read()
    size = len(blob)
    if size < 50:
        raise HTTPException(status_code=400, detail="Empty or truncated PDF.")
    if size > MAX_PDF_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"PDF too large ({size // 1024} KB). Max is {MAX_PDF_BYTES // (1024 * 1024)} MB.",
        )

    user_id = current_user["id"]
    s3_key = _key_for(user_id, pdf_type)
    try:
        await storage.upload_raw(blob, s3_key, content_type="application/pdf")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Latest-PDF cache upload failed for %s/%s", user_id, pdf_type)
        raise HTTPException(status_code=502, detail="Storage backend unavailable.") from exc

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": user_id,
        "pdf_type": pdf_type,
        "s3_key": s3_key,
        "title": (title or PDF_TYPE_REGISTRY[pdf_type]["label"])[:200],
        "subtitle": (subtitle or "")[:200],
        "filename": (filename or f"{pdf_type}.pdf")[:200],
        "size_bytes": size,
        "updated_at": now,
        # Explicitly label this as a client-side rendered upload so the
        # Estate Binder generator's server-fallback gate
        # (`ensure_entities_structures_cached`) NEVER replaces it with
        # the tabular fpdf2 fallback once it lands. Without this mark
        # we were silently regressing rich tree captures back to plain
        # text >24 h after the user last visited /print/entities (the
        # exact May 22, 2026 pitch-day regression).
        "source": "client_capture",
    }
    await db.latest_pdfs.update_one(
        {"user_id": user_id, "pdf_type": pdf_type},
        {
            "$set": doc,
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return {"cached": True, "pdf_type": pdf_type, "size_bytes": size}


@router.get("/pdfs/latest")
async def list_latest_pdfs(current_user: dict = Depends(get_current_user)):
    """Return metadata for every PDF type the user currently has
    cached. Frontend section pages don't strictly need this — they
    typically just query their own `/pdfs/latest/{type}` — but the
    listing endpoint is useful for a future "Recent PDFs" admin
    panel or for cross-section affordances."""
    user_id = current_user["id"]
    cursor = db.latest_pdfs.find({"user_id": user_id}, {"_id": 0, "s3_key": 0}).sort("updated_at", -1)
    items = await cursor.to_list(50)
    # Stamp each with its registered label (in case the stored
    # title was custom but we want the canonical type label too).
    for item in items:
        reg = PDF_TYPE_REGISTRY.get(item.get("pdf_type"), {})
        item["type_label"] = reg.get("label", item.get("pdf_type", ""))
    return {"pdfs": items, "registry": PDF_TYPE_REGISTRY}


@router.get("/pdfs/latest/{pdf_type}")
async def get_latest_pdf(pdf_type: str, current_user: dict = Depends(get_current_user)):
    """Stream the cached PDF bytes back to the caller. Used by the
    inline section icon when the user taps it to re-view their most
    recently generated PDF for that section."""
    pdf_type = (pdf_type or "").strip().lower()
    if pdf_type not in ALLOWED_PDF_TYPES:
        raise HTTPException(status_code=404, detail="Unknown PDF type.")
    user_id = current_user["id"]
    doc = await db.latest_pdfs.find_one({"user_id": user_id, "pdf_type": pdf_type}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="No cached PDF for this section yet.")
    try:
        blob = await storage.download(doc["s3_key"])
    except Exception as exc:  # noqa: BLE001
        logger.exception("Latest-PDF cache download failed for %s/%s", user_id, pdf_type)
        # Self-heal: clear the orphan metadata so the icon disappears
        # on the next mount rather than continuing to break.
        await db.latest_pdfs.delete_one({"user_id": user_id, "pdf_type": pdf_type})
        raise HTTPException(status_code=404, detail="Cached PDF no longer available.") from exc
    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{doc.get("filename", pdf_type + ".pdf")}"',
            "Cache-Control": "private, max-age=300",
            "X-CarryOn-Pdf-Title": (doc.get("title") or "")[:200],
            "X-CarryOn-Pdf-Subtitle": (doc.get("subtitle") or "")[:200],
            "X-CarryOn-Pdf-Updated-At": doc.get("updated_at") or "",
        },
    )


@router.delete("/pdfs/latest/{pdf_type}")
async def delete_latest_pdf(pdf_type: str, current_user: dict = Depends(get_current_user)):
    """Purge a single cached slot. S3 cleanup is best-effort — even
    if S3 fails to delete (network blip), the Mongo doc is removed
    so the inline icon disappears from the section page."""
    pdf_type = (pdf_type or "").strip().lower()
    if pdf_type not in ALLOWED_PDF_TYPES:
        raise HTTPException(status_code=404, detail="Unknown PDF type.")
    user_id = current_user["id"]
    doc = await db.latest_pdfs.find_one({"user_id": user_id, "pdf_type": pdf_type}, {"_id": 0, "id": 1, "s3_key": 1})
    if not doc:
        return {"deleted": False, "reason": "not_cached"}
    try:
        await storage.delete(doc["s3_key"])
    except Exception:  # noqa: BLE001
        logger.exception("Latest-PDF cache S3 delete failed for %s/%s", user_id, pdf_type)
    await db.latest_pdfs.delete_one({"user_id": user_id, "pdf_type": pdf_type})
    return {"deleted": True}
