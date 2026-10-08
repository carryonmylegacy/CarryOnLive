"""Private dictation — speech-to-text on CarryOn's own xAI account.

POST /api/ai/transcribe  (multipart: file=<wav|mp3|m4a|ogg…>, keyterms=<comma list>)

Privacy contract (mirrors /security → "AI processing"):
  • Audio is held in memory for the single xAI request and never written to
    disk, object storage or MongoDB. No transcript is stored either — the
    text goes straight back to the caller; only the user decides what to keep.
  • Same zero-data-retention xAI account as every other AI feature. Apple /
    Google are not in the loop (that is the "device dictation" alternative the
    user may pick instead, disclosed in-app).
  • Only token-free accounting is kept: duration + estimated cost in the LLM
    cost ledger, and one burn-guard tick.
"""

import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from config import XAI_API_KEY, XAI_BASE_URL, db, logger
from services.ai_burn_guard import require_ai_burn_budget
from utils import get_current_user

router = APIRouter()

STT_MODEL = "grok-voice-transcribe-2.0"
STT_USD_PER_HOUR = 0.10  # xAI batch STT list price (Oct 2026)
MAX_AUDIO_BYTES = 25 * 1024 * 1024  # ~13 min of 16 kHz WAV
ALLOWED_PREFIXES = ("audio/", "video/mp4", "video/webm", "application/octet-stream")


@router.post("/ai/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    keyterms: str = Form(""),
    current_user: dict = Depends(get_current_user),
):
    if not XAI_API_KEY:
        raise HTTPException(status_code=503, detail="Private dictation is not configured. Please contact support.")
    content_type = (file.content_type or "application/octet-stream").split(";")[0].strip()
    if not content_type.startswith(ALLOWED_PREFIXES):
        raise HTTPException(status_code=400, detail="Unsupported audio format.")
    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="No audio received.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="That recording is too long — please dictate in shorter passages.")

    await require_ai_burn_budget(current_user, "voice_transcribe")

    data: dict = {"model": STT_MODEL, "format": "true", "language": "en"}
    terms = [t.strip()[:50] for t in keyterms.split(",") if t.strip()][:40]
    if terms:
        data["keyterm"] = terms

    started = time.time()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
            resp = await client.post(
                f"{XAI_BASE_URL}/stt",
                headers={"Authorization": f"Bearer {XAI_API_KEY}"},
                data=data,
                files={"file": (file.filename or "dictation.wav", audio, content_type)},
            )
    except httpx.HTTPError as exc:
        logger.warning(f"xAI STT transport error: {exc}")
        raise HTTPException(status_code=503, detail="Dictation service unavailable — please try again.") from exc
    finally:
        del audio  # never retained past this request

    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="Dictation is busy right now — please try again in a moment.")
    if resp.status_code >= 400:
        logger.warning(f"xAI STT {resp.status_code}: {resp.text[:200]}")
        raise HTTPException(status_code=502, detail="Dictation could not be transcribed. Please try again.")

    body = resp.json()
    duration = float(body.get("duration") or 0)
    text = (body.get("text") or "").strip()
    try:
        now = datetime.now(timezone.utc)
        await db.llm_cost_ledger.insert_one(
            {
                "user_id": current_user["id"],
                "estate_id": None,
                "endpoint": "voice_transcribe",
                "model": STT_MODEL,
                "served_model": STT_MODEL,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "reasoning_tokens": 0,
                "total_tokens": 0,
                "audio_seconds": round(duration, 2),
                "estimated_cost_usd": round(duration / 3600 * STT_USD_PER_HOUR, 6),
                "duration_ms": int((time.time() - started) * 1000),
                "success": True,
                "error_class": None,
                "created_at": now,
                "created_at_ttl": now,
            }
        )
    except Exception as exc:  # noqa: BLE001 — accounting must never block the user
        logger.warning(f"STT ledger write failed: {exc}")

    return {"text": text, "duration": duration, "language": body.get("language") or "en", "engine": "xai"}
