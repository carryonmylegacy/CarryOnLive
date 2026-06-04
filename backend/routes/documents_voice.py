"""CarryOn™ Backend — Voice Passphrase + Whisper Transcription endpoints

Extracted from `routes/documents.py` on Feb 17, 2026 as part of the
monolith-reduction pass. Owns the 5 voice-related endpoints:

  POST /voice/transcribe                          (Whisper STT)
  POST /voice/verify-passphrase                   (Whisper + fuzzy match)
  POST /documents/{id}/voice/setup                (set passphrase hash)
  POST /documents/{id}/voice/verify               (compare hash)
  GET  /documents/{id}/voice/hint                 (read hint)

These endpoints share no state with the rest of documents.py (they
operate on document_id only, use OpenAI Whisper via emergentintegrations,
and read/write only the voice_passphrase_* fields). Pulling them into a
dedicated module makes the OpenAI integration boundary easy to audit
and the rest of documents.py easier to navigate.

Mounted in `server.py` alongside the rest of the documents routers.
"""

import os
import tempfile
from difflib import SequenceMatcher
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from config import db, logger
from guards import require_benefactor_role, require_estate_owner
from services.access_control import can_access_document, require_estate_actor
from services.ai_burn_guard import require_ai_burn_budget
from utils import get_current_user, hash_password, verify_password

router = APIRouter()


# ===================== MODELS =====================


class VoicePassphraseSetup(BaseModel):
    document_id: str
    passphrase: str


class VoiceVerifyRequest(BaseModel):
    document_id: str
    spoken_text: str


# ===================== ENDPOINTS =====================


@router.post("/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Transcribe audio using OpenAI Whisper for voice verification"""
    from emergentintegrations.llm.openai import OpenAISpeechToText

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Voice service not configured")
    await require_ai_burn_budget(current_user, "voice_transcribe")

    try:
        content = await file.read()
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Max 25MB.")

        suffix = "." + (file.filename or "audio.webm").split(".")[-1]
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        stt = OpenAISpeechToText(api_key=api_key)
        with open(tmp_path, "rb") as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="json",
                language="en",
            )

        Path(tmp_path).unlink()
        transcription = response.text.strip()
        return {"transcription": transcription}
    except Exception as e:
        logger.error(f"Voice transcription error: {e}")
        raise HTTPException(status_code=500, detail="Voice transcription failed")


@router.post("/voice/verify-passphrase")
async def verify_voice_passphrase(
    file: UploadFile = File(...),
    expected_passphrase: str = "",
    current_user: dict = Depends(get_current_user),
):
    """Transcribe audio and verify against expected passphrase"""
    from emergentintegrations.llm.openai import OpenAISpeechToText

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Voice service not configured")
    await require_ai_burn_budget(current_user, "voice_verify")

    try:
        content = await file.read()

        suffix = "." + (file.filename or "audio.webm").split(".")[-1]
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        stt = OpenAISpeechToText(api_key=api_key)
        with open(tmp_path, "rb") as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="json",
                language="en",
            )

        Path(tmp_path).unlink()
        transcription = response.text.strip().lower()
        expected = expected_passphrase.strip().lower()

        similarity = SequenceMatcher(None, transcription, expected).ratio()
        verified = similarity >= 0.7

        return {
            "verified": verified,
            "transcription": transcription,
            "similarity": round(similarity, 2),
            "message": "Voice verified successfully" if verified else "Voice verification failed. Please try again.",
        }
    except Exception as e:
        logger.error(f"Voice verification error: {e}")
        raise HTTPException(status_code=500, detail="Voice verification failed")


@router.post("/documents/{document_id}/voice/setup")
async def setup_voice_passphrase(document_id: str, passphrase: str, current_user: dict = Depends(get_current_user)):
    """Set up voice verification passphrase for a document"""
    await require_benefactor_role(current_user, "set up voice verification")

    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    # IDOR guard — only the estate owner (or admin) can set a voice passphrase.
    await require_estate_owner(document.get("estate_id"), current_user)
    if document.get("lock_type") != "voice":
        raise HTTPException(status_code=400, detail="Document is not set up for voice verification")

    normalized_passphrase = passphrase.lower().strip()
    await db.documents.update_one(
        {"id": document_id},
        {
            "$set": {
                "voice_passphrase_hash": hash_password(normalized_passphrase),
                "voice_passphrase_hint": passphrase[:3] + "..." if len(passphrase) > 3 else passphrase,
            }
        },
    )
    return {
        "message": "Voice passphrase set up successfully",
        "hint": passphrase[:3] + "...",
    }


@router.post("/documents/{document_id}/voice/verify")
async def verify_document_voice_passphrase(
    document_id: str,
    data: VoiceVerifyRequest,
    current_user: dict = Depends(get_current_user),
):
    """Verify spoken passphrase for voice-locked document"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    # IDOR + release guard — even attempting a voice phrase is sensitive
    # metadata, so the caller must be allowed to access this exact document.
    actor = await require_estate_actor(document.get("estate_id"), current_user)
    if not can_access_document(document, actor):
        raise HTTPException(status_code=403, detail="Access denied")
    if not document.get("voice_passphrase_hash"):
        raise HTTPException(status_code=400, detail="Voice passphrase not set up. Use backup code.")

    normalized_spoken = data.spoken_text.lower().strip()
    if verify_password(normalized_spoken, document["voice_passphrase_hash"]):
        return {"verified": True, "message": "Voice verification successful"}

    raise HTTPException(
        status_code=401,
        detail="Voice verification failed. Try again or use backup code.",
    )


@router.get("/documents/{document_id}/voice/hint")
async def get_voice_hint(document_id: str, current_user: dict = Depends(get_current_user)):
    """Get voice passphrase hint"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    # IDOR + release guard — the hint itself is sensitive metadata.
    actor = await require_estate_actor(document.get("estate_id"), current_user)
    if not can_access_document(document, actor):
        raise HTTPException(status_code=403, detail="Access denied")
    return {
        "has_passphrase": bool(document.get("voice_passphrase_hash")),
        "hint": document.get("voice_passphrase_hint", "Not set"),
    }
