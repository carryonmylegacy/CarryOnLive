"""CarryOn™ Backend — QuickStart Wizard

The QuickStart Wizard (QW) is the **first thing** a new benefactor sees
after login. It collects only the minimum information required for the
xAI Grok model to produce a *state-aware, family-tailored* checklist
they can take, verbatim, to their estate attorney, CPA, wealth
manager, and life-insurance agent.

Hard scope (founder direction May 22 2026):
  • Beneficiaries entered here are **name + relationship only**; each
    one creates a `beneficiaries` row stamped `quickstart_seed: True`
    so the existing Getting Started flow can detect them and route the
    user into the populated tile (NOT a new "create" tile).
  • The wizard is NOT an extension of Getting Started — it produces a
    PDF that the user prints, period.
  • Server-side progress persists across logout / device-switch so the
    user resumes at the last step.
  • PDF is rendered server-side using the **same fpdf2 patterns as
    every other platform PDF** (matching the Estate Binder visual
    cadence) and cached via the standard `/api/pdfs/cache` slot under
    `pdf_type=quickstart_guide` — that slot is the FIRST section in
    `SECTION_ORDER` so the QuickStart Guide always opens the binder
    right after the Title + TOC pages.
  • LLM key: this route uses `config.xai_client` which is bound to the
    founder's personal `XAI_API_KEY`. Emergent LLM Key is NEVER used
    here per founder direction (May 22 2026).
"""

from __future__ import annotations

import asyncio
import io
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from config import XAI_MODEL, XAI_MODEL_LIGHT, db, logger, xai_client
from models import Document
from services.audit import audit_log
from services.encryption import encrypt_aes256, get_estate_salt
from services.quickstart_ai import build_quickstart_prompt, parse_quickstart_response
from services.quickstart_pdf import build_quickstart_pdf
from services.storage import storage
from utils import get_current_user, update_estate_readiness

router = APIRouter()


# Category used for the QuickStart Guide row inside the SDV. Using
# `estate_planning` keeps it alongside wills, trusts, POAs, etc. The
# `is_quickstart_guide` flag below is what we key on for upsert.
_QS_SDV_CATEGORY = "estate_planning"
_QS_SDV_NAME = "QuickStart Estate Plan Guide"


async def _upsert_quickstart_in_sdv(
    *,
    user_id: str,
    estate_id: str,
    pdf_bytes: bytes,
) -> None:
    """Save (or update in place) the generated QuickStart Guide as an
    encrypted document in the user's Secure Document Vault so the
    family can see it alongside the rest of their estate documents.

    Idempotent — re-running QuickStart REPLACES the existing entry
    in place (keyed by `is_quickstart_guide=True`) rather than
    cluttering the SDV with duplicates.
    """
    if not estate_id:
        return
    existing = await db.documents.find_one(
        {"estate_id": estate_id, "is_quickstart_guide": True},
        {"_id": 0, "id": 1, "storage_key": 1},
    )

    estate_salt = await get_estate_salt(estate_id)
    encrypted_b64 = encrypt_aes256(pdf_bytes, estate_salt)

    if existing:
        # Overwrite the existing S3 blob and refresh metadata in place.
        await storage.upload(
            encrypted_b64.encode("ascii"),
            estate_id,
            existing["id"],
            "application/pdf",
        )
        await db.documents.update_one(
            {"id": existing["id"]},
            {
                "$set": {
                    "name": _QS_SDV_NAME,
                    "file_type": "application/pdf",
                    "file_size": len(pdf_bytes),
                    "is_encrypted": True,
                    "encryption_version": "aes-256-gcm",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        return

    # Brand-new SDV row.
    doc = Document(
        estate_id=estate_id,
        name=_QS_SDV_NAME,
        category=_QS_SDV_CATEGORY,
        file_type="application/pdf",
        file_size=len(pdf_bytes),
        file_data=None,
        is_locked=False,
        is_encrypted=True,
        uploaded_by=user_id,
    )
    storage_key = await storage.upload(
        encrypted_b64.encode("ascii"),
        estate_id,
        doc.id,
        "application/pdf",
    )
    doc_dict = doc.model_dump()
    doc_dict.update(
        {
            "storage_key": storage_key,
            "encryption_version": "aes-256-gcm",
            "is_quickstart_guide": True,
            # System-generated row: surfaces in SDV listings but the
            # platform owns it (regenerate to update, not edit by hand).
            "system_managed": True,
            "designated_beneficiaries": [],
        }
    )
    await db.documents.insert_one(doc_dict)
    await audit_log(
        action="document.upload",
        user_id=user_id,
        resource_type="document",
        resource_id=doc.id,
        estate_id=estate_id,
        details={
            "name": _QS_SDV_NAME,
            "category": _QS_SDV_CATEGORY,
            "size": len(pdf_bytes),
            "source": "quickstart_wizard",
        },
    )
    await update_estate_readiness(estate_id)


# ── Canonical step order. The wizard advances strictly in this order;
# every step has a Skip-for-Now path that returns the user to /dashboard
# without marking the wizard complete. The frontend mirrors this list. ─
STEP_ORDER: list[str] = [
    "gate",
    "welcome",
    "residence",
    "household",
    "beneficiaries",
    "properties",
    "life_insurance",
    "business",
    "existing_documents",
    "generate",
]


class StepData(BaseModel):
    """Each step PUTs an opaque dict — schema is enforced loosely so
    the frontend can evolve without breaking older sessions."""

    data: dict[str, Any] = Field(default_factory=dict)
    next_step: str | None = None  # the step the user is moving to


def _empty_progress(user_id: str, estate_id: str | None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "user_id": user_id,
        "estate_id": estate_id,
        "current_step": "gate",
        "completed_steps": [],
        "data": {},
        "complete": False,
        "pdf_generated_at": None,
        "created_at": now,
        "updated_at": now,
    }


async def _get_or_create_progress(user_id: str, estate_id: str | None) -> dict:
    doc = await db.quickstart_progress.find_one({"user_id": user_id}, {"_id": 0})
    if doc:
        return doc
    fresh = _empty_progress(user_id, estate_id)
    await db.quickstart_progress.insert_one(dict(fresh))
    # Drop the `_id` that insert_one mutates onto `fresh`.
    fresh.pop("_id", None)
    return fresh


async def _user_active_estate_id(user_id: str) -> str | None:
    e = await db.estates.find_one(
        {"owner_id": user_id, "deleted_at": None},
        {"_id": 0, "id": 1},
    )
    return e.get("id") if e else None


@router.get("/quickstart/progress")
async def get_progress(current_user: dict = Depends(get_current_user)):
    """Return the user's current QW state. The frontend uses this on
    login to decide whether to open the wizard modal (and at what
    step) or skip straight to the dashboard."""
    estate_id = await _user_active_estate_id(current_user["id"])
    prog = await _get_or_create_progress(current_user["id"], estate_id)
    return prog


@router.put("/quickstart/step/{step_key}")
async def save_step(
    step_key: str,
    payload: StepData,
    current_user: dict = Depends(get_current_user),
):
    """Persist data for one step + advance the cursor. Called every time
    the user taps Next inside the wizard. Beneficiaries get materialized
    as `beneficiaries` rows immediately (stamped `quickstart_seed=True`)
    so Getting Started can find them later."""
    if step_key not in STEP_ORDER:
        raise HTTPException(status_code=400, detail=f"Unknown step '{step_key}'")

    user_id = current_user["id"]
    estate_id = await _user_active_estate_id(user_id)
    prog = await _get_or_create_progress(user_id, estate_id)

    # Merge the step's data into the running blob.
    merged = {**prog.get("data", {}), step_key: payload.data}

    # Materialize beneficiary stubs the moment they are entered. Each
    # entry gets a stable `beneficiary_id` so subsequent saves don't
    # re-create rows on re-visit. Anything missing both `name` and
    # `relationship` is skipped.
    if step_key == "beneficiaries":
        bens = payload.data.get("beneficiaries") or []
        existing_seeds = {
            b.get("name"): b.get("beneficiary_id")
            for b in (prog.get("data", {}).get("beneficiaries") or {}).get("beneficiaries", [])
            if isinstance(b, dict)
        }
        materialized: list[dict] = []
        for entry in bens:
            if not isinstance(entry, dict):
                continue
            name = (entry.get("name") or "").strip()
            relationship = (entry.get("relationship") or "").strip()
            if not name or not relationship:
                continue
            ben_id = entry.get("beneficiary_id") or existing_seeds.get(name) or str(uuid.uuid4())
            if estate_id:
                now = datetime.now(timezone.utc).isoformat()
                await db.beneficiaries.update_one(
                    {"id": ben_id, "estate_id": estate_id},
                    {
                        "$set": {
                            "id": ben_id,
                            "estate_id": estate_id,
                            "name": name,
                            "relationship": relationship,
                            "quickstart_seed": True,
                            "updated_at": now,
                        },
                        "$setOnInsert": {"created_at": now, "created_by": user_id},
                    },
                    upsert=True,
                )
            materialized.append({"name": name, "relationship": relationship, "beneficiary_id": ben_id})
        merged["beneficiaries"] = {"beneficiaries": materialized}

    next_step = payload.next_step or step_key
    if next_step not in STEP_ORDER:
        next_step = step_key
    completed = list(prog.get("completed_steps") or [])
    if step_key not in completed:
        completed.append(step_key)

    now = datetime.now(timezone.utc).isoformat()
    await db.quickstart_progress.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "data": merged,
                "current_step": next_step,
                "completed_steps": completed,
                "estate_id": estate_id,
                "updated_at": now,
            }
        },
        upsert=True,
    )
    fresh = await db.quickstart_progress.find_one({"user_id": user_id}, {"_id": 0})
    return fresh


@router.post("/quickstart/reset")
async def reset_progress(current_user: dict = Depends(get_current_user)):
    """Wipe the user's QW progress so they start over. Used by
    Settings → Re-run QuickStart. Beneficiary stubs created during
    QW are NOT deleted — the user can still find them in the
    Beneficiaries page."""
    await db.quickstart_progress.delete_one({"user_id": current_user["id"]})
    estate_id = await _user_active_estate_id(current_user["id"])
    return await _get_or_create_progress(current_user["id"], estate_id)


@router.post("/quickstart/reopen")
async def reopen_progress(current_user: dict = Depends(get_current_user)):
    """Mark the wizard as **not yet complete** so the modal will
    re-open with all prior step data intact. Used by the dashboard's
    *Edit & regenerate* button after the user has already generated
    a guide once. Different from `/reset`:
      • `/reset` deletes everything → wizard starts from scratch.
      • `/reopen` only flips `complete=false` and snaps the cursor
        back to the first step. Every answer the user previously
        gave stays put, ready to be edited."""
    user_id = current_user["id"]
    estate_id = await _user_active_estate_id(user_id)
    existing = await db.quickstart_progress.find_one({"user_id": user_id}, {"_id": 0})
    if not existing:
        return await _get_or_create_progress(user_id, estate_id)
    now = datetime.now(timezone.utc).isoformat()
    await db.quickstart_progress.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "complete": False,
                "current_step": STEP_ORDER[0],
                "estate_id": estate_id,
                "updated_at": now,
            }
        },
    )
    return await db.quickstart_progress.find_one({"user_id": user_id}, {"_id": 0})


@router.post("/quickstart/generate")
async def generate_guide(current_user: dict = Depends(get_current_user)):
    """Call xAI Grok with the collected data, render the PDF
    server-side, cache it under `pdf_type=quickstart_guide`, and
    return the PDF bytes inline. Once this succeeds the wizard is
    marked complete and the user lands on the standard PDF preview
    modal (same as every other platform PDF)."""
    if not xai_client:
        raise HTTPException(
            status_code=503,
            detail="AI service not configured. Please contact support.",
        )

    user_id = current_user["id"]
    estate_id = await _user_active_estate_id(user_id)
    prog = await _get_or_create_progress(user_id, estate_id)
    data = prog.get("data", {})

    # Build a friendly user-name string for the PDF header.
    first = current_user.get("first_name") or ""
    last = current_user.get("last_name") or ""
    user_name = f"{first} {last}".strip() or current_user.get("name") or current_user.get("email", "Your Plan")

    prompt_messages = build_quickstart_prompt(user_name=user_name, data=data)

    # xAI call with a tight retry — same pattern as Estate Guardian.
    completion = None
    last_err: Exception | None = None
    for model_name in (XAI_MODEL_LIGHT, XAI_MODEL):
        try:
            completion = await asyncio.wait_for(
                asyncio.to_thread(
                    xai_client.chat.completions.create,
                    model=model_name,
                    messages=prompt_messages,
                    temperature=0.55,
                    max_tokens=4096,
                ),
                timeout=80.0,
            )
            break
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning(f"QuickStart Grok call failed on {model_name}: {exc}")
            continue
    if completion is None:
        logger.exception("QuickStart Grok failover exhausted")
        raise HTTPException(
            status_code=503,
            detail=f"AI service unavailable — please try again in a minute. ({last_err})",
        )

    ai_text = completion.choices[0].message.content or ""
    parsed = parse_quickstart_response(ai_text)

    # Render the PDF (server-side, fpdf2, matches Binder cadence).
    pdf_bytes = build_quickstart_pdf(
        user_name=user_name,
        data=data,
        ai_payload=parsed,
        generated_at=datetime.now(timezone.utc),
    )

    # Cache to S3 + Mongo `latest_pdfs` so the Estate Binder picks it
    # up automatically (it's the first SECTION_ORDER entry).
    s3_key = f"latest-pdfs/{user_id}/quickstart_guide.pdf"
    try:
        await storage.upload_raw(pdf_bytes, s3_key, content_type="application/pdf")
    except Exception as exc:  # noqa: BLE001
        logger.exception("QuickStart PDF cache upload failed")
        raise HTTPException(status_code=502, detail="Storage backend unavailable.") from exc

    # Also save the same PDF (AES-encrypted) into the user's Secure
    # Document Vault so the family sees it sitting alongside their
    # wills/trusts/POAs. Re-runs replace the row in place — never
    # duplicate.
    try:
        await _upsert_quickstart_in_sdv(user_id=user_id, estate_id=estate_id, pdf_bytes=pdf_bytes)
    except Exception:  # noqa: BLE001
        logger.exception("QuickStart SDV upsert failed (PDF cached + returned anyway)")

    now = datetime.now(timezone.utc).isoformat()
    await db.latest_pdfs.update_one(
        {"user_id": user_id, "pdf_type": "quickstart_guide"},
        {
            "$set": {
                "user_id": user_id,
                "pdf_type": "quickstart_guide",
                "s3_key": s3_key,
                "title": "QuickStart Estate Plan Guide",
                "subtitle": (data.get("residence") or {}).get("state")
                or (data.get("state") or {}).get("state_of_residence", ""),
                "filename": "CarryOn_QuickStart_Guide.pdf",
                "size_bytes": len(pdf_bytes),
                "updated_at": now,
                "source": "server_rendered",
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    # Mark the wizard complete + record the generation timestamp.
    await db.quickstart_progress.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "complete": True,
                "current_step": "generate",
                "pdf_generated_at": now,
                "ai_summary": parsed.get("intro", "")[:600],
                "updated_at": now,
            }
        },
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'inline; filename="CarryOn_QuickStart_Guide.pdf"',
            "Cache-Control": "private, no-store",
            "X-CarryOn-Pdf-Title": "QuickStart Estate Plan Guide",
            "X-CarryOn-Pdf-Subtitle": (data.get("residence") or {}).get("state")
            or data.get("state", {}).get("state_of_residence", ""),
        },
    )
