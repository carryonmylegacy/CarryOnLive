"""CarryOn™ Backend — Section Security (Triple Lock)"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status, Response, Form
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from config import db, logger
from utils import get_current_user, encrypt_data, decrypt_data, hash_password, verify_password, create_token, generate_otp, generate_backup_code, send_otp_email, send_otp_sms, log_activity, send_push_notification, send_push_to_all_admins
from voice_biometrics import (
    extract_voiceprint,
    verify_voiceprint,
    compute_enrollment_model,
    is_outlier_sample,
    match_passphrase,
    extract_voiceprint_legacy,
    compare_voiceprints_legacy,
)
import uuid
import os
import asyncio
import base64
import json as json_module
import random
import numpy as np

router = APIRouter()

# ===================== SECTION SECURITY (Triple Lock) =====================

LOCKABLE_SECTIONS = {
    "sdv": "Secure Document Vault",
    "mm": "Milestone Messages",
    "bm": "Beneficiary Management",
    "iac": "Immediate Action Checklist",
    "dts": "Designated Trustee Services",
    "ega": "Estate Guardian AI",
}

PRESET_SECURITY_QUESTIONS = [
    "What was the name of your first pet?",
    "What street did you grow up on?",
    "What was your mother's maiden name?",
    "What was the first concert you attended?",
    "What is the name of your favorite teacher?",
    "What was the make of your first car?",
    "What city were you born in?",
    "What was the name of your childhood best friend?",
    "What was your first phone number?",
    "What is the middle name of your oldest sibling?",
]

class SectionSecurityUpdate(BaseModel):
    password_enabled: Optional[bool] = None
    password: Optional[str] = None
    voice_enabled: Optional[bool] = None
    security_question_enabled: Optional[bool] = None
    security_question: Optional[str] = None
    security_answer: Optional[str] = None
    lock_mode: Optional[str] = None  # on_page_leave, on_logout, manual

class SectionVerifyRequest(BaseModel):
    password: Optional[str] = None
    security_answer: Optional[str] = None
    # voice is sent as a file separately

# NOTE: extract_voiceprint, verify_voiceprint, etc. are now in voice_biometrics.py

@router.get("/security/settings")
async def get_security_settings(current_user: dict = Depends(get_current_user)):
    """Get security settings for all sections"""
    settings = await db.section_security.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).to_list(20)
    settings_map = {s["section_id"]: s for s in settings}
    result = {}
    for sid, name in LOCKABLE_SECTIONS.items():
        s = settings_map.get(sid, {})
        result[sid] = {
            "section_id": sid,
            "name": name,
            "password_enabled": s.get("password_enabled", False),
            "has_password": bool(s.get("password_hash")),
            "voice_enabled": s.get("voice_enabled", False),
            "has_voiceprint": bool(s.get("voiceprint")),
            "voice_passphrase": s.get("voice_passphrase", ""),
            "security_question_enabled": s.get("security_question_enabled", False),
            "has_security_question": bool(s.get("security_question")),
            "security_question": s.get("security_question", ""),
            "lock_mode": s.get("lock_mode", "manual"),
            "is_active": s.get("password_enabled", False) or s.get("voice_enabled", False) or s.get("security_question_enabled", False),
        }
    return result

@router.get("/security/questions")
async def get_security_questions():
    """Get preset security questions"""
    return {"questions": PRESET_SECURITY_QUESTIONS}

@router.put("/security/settings/{section_id}")
async def update_security_settings(
    section_id: str,
    data: SectionSecurityUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update security settings for a section"""
    if section_id not in LOCKABLE_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section: {section_id}")

    update_fields = {"user_id": current_user["id"], "section_id": section_id, "updated_at": datetime.now(timezone.utc).isoformat()}

    if data.password_enabled is not None:
        update_fields["password_enabled"] = data.password_enabled
    if data.password:
        update_fields["password_hash"] = hash_password(data.password)
    if data.voice_enabled is not None:
        update_fields["voice_enabled"] = data.voice_enabled
    if data.security_question_enabled is not None:
        update_fields["security_question_enabled"] = data.security_question_enabled
    if data.security_question is not None:
        update_fields["security_question"] = data.security_question
    if data.security_answer is not None:
        update_fields["security_answer_hash"] = hash_password(data.security_answer.lower().strip())
    if data.lock_mode is not None:
        if data.lock_mode not in ("on_page_leave", "on_logout", "manual"):
            raise HTTPException(status_code=400, detail="Invalid lock mode")
        update_fields["lock_mode"] = data.lock_mode

    await db.section_security.update_one(
        {"user_id": current_user["id"], "section_id": section_id},
        {"$set": update_fields},
        upsert=True
    )

    return {"success": True, "section_id": section_id, "message": f"{LOCKABLE_SECTIONS[section_id]} security updated"}

@router.post("/security/voice/enroll/{section_id}")
async def enroll_voiceprint_endpoint(
    section_id: str,
    passphrase: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Enroll voice biometric for a section — enhanced multi-feature voiceprint"""
    if section_id not in LOCKABLE_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section: {section_id}")

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    # Save to temp file for processing
    import tempfile as tf
    suffix = '.' + (file.filename or 'audio.webm').split('.')[-1]
    with tf.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    wav_path = tmp_path + '.wav'
    try:
        # Convert to WAV if needed using ffmpeg
        import subprocess
        result = subprocess.run(
            ['ffmpeg', '-y', '-i', tmp_path, '-ar', '16000', '-ac', '1', '-f', 'wav', wav_path],
            capture_output=True, timeout=30
        )
        if result.returncode != 0:
            raise HTTPException(status_code=400, detail="Could not process audio file")

        with open(wav_path, 'rb') as f:
            wav_bytes = f.read()

        # Enhanced extraction
        extraction = extract_voiceprint(wav_bytes)
        if extraction is None:
            raise HTTPException(
                status_code=400,
                detail="Could not extract voice features. Please record a longer, clearer sample (at least 2 seconds in a quiet environment)."
            )

        new_voiceprint = extraction["voiceprint"]
        quality = extraction["quality"]

        # Get existing enrollment
        existing = await db.section_security.find_one(
            {"user_id": current_user["id"], "section_id": section_id},
            {"_id": 0, "voiceprint_samples": 1, "voiceprint_version": 1}
        )

        samples = []
        if existing and existing.get("voiceprint_version") == "v2":
            samples = existing.get("voiceprint_samples", [])

        # Outlier rejection: reject samples that don't sound like the enrolled user
        if samples and is_outlier_sample(new_voiceprint, samples):
            raise HTTPException(
                status_code=400,
                detail="This voice sample sounds too different from your existing enrollment. "
                       "Please try again in a quiet environment, speaking naturally."
            )

        samples.append(new_voiceprint)
        if len(samples) > 5:
            samples = samples[-5:]

        # Build enrollment model (smart averaging + consistency scoring)
        model = compute_enrollment_model(samples)

        await db.section_security.update_one(
            {"user_id": current_user["id"], "section_id": section_id},
            {"$set": {
                "user_id": current_user["id"],
                "section_id": section_id,
                "voiceprint": model["voiceprint"],
                "voiceprint_samples": samples,
                "voiceprint_version": "v2",
                "voiceprint_dimension": extraction["dimension"],
                "enrollment_consistency": model["consistency"],
                "voice_passphrase": passphrase.strip(),
                "voice_enabled": True,
                "voice_enrolled_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True
        )

        # Feedback message based on enrollment quality
        sample_count = len(samples)
        if sample_count == 1:
            tip = "Record 1-2 more samples for better accuracy."
        elif sample_count < 3:
            tip = f"Good — {sample_count} samples recorded. One more recommended."
        else:
            tip = f"Excellent — {sample_count} samples, consistency {model['consistency']:.0%}."

        return {
            "success": True,
            "samples_recorded": sample_count,
            "enrollment_consistency": model["consistency"],
            "audio_quality": quality,
            "message": f"Voice enrolled. {tip}"
        }
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        if os.path.exists(wav_path):
            os.unlink(wav_path)

@router.post("/security/verify/{section_id}")
async def verify_section_security(
    section_id: str,
    password: Optional[str] = Form(None),
    security_answer: Optional[str] = Form(None),
    voice_file: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user)
):
    """Verify security credentials for a section — checks all enabled layers"""
    if section_id not in LOCKABLE_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section: {section_id}")

    settings = await db.section_security.find_one(
        {"user_id": current_user["id"], "section_id": section_id},
        {"_id": 0}
    )
    if not settings:
        return {"verified": True, "message": "No security configured"}

    results = {}

    # Layer 1: Password
    if settings.get("password_enabled") and settings.get("password_hash"):
        if not password:
            raise HTTPException(status_code=400, detail="Password required")
        if not verify_password(password, settings["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect section password")
        results["password"] = True

    # Layer 2: Voice biometric (enhanced multi-metric)
    if settings.get("voice_enabled") and settings.get("voiceprint"):
        if not voice_file:
            raise HTTPException(status_code=400, detail="Voice verification required")

        content = await voice_file.read()
        import tempfile as tf
        suffix = '.' + (voice_file.filename or 'audio.webm').split('.')[-1]
        with tf.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        wav_path = tmp_path + '.wav'
        try:
            import subprocess
            subprocess.run(
                ['ffmpeg', '-y', '-i', tmp_path, '-ar', '16000', '-ac', '1', '-f', 'wav', wav_path],
                capture_output=True, timeout=30
            )
            with open(wav_path, 'rb') as f:
                wav_bytes = f.read()

            # Detect voiceprint version and extract accordingly
            is_v2 = settings.get("voiceprint_version") == "v2"

            if is_v2:
                # Enhanced extraction
                extraction = extract_voiceprint(wav_bytes)
                if extraction is None:
                    raise HTTPException(status_code=400, detail="Could not process voice sample. Please try again in a quieter environment.")

                test_vp = extraction["voiceprint"]

                # Build enrolled model dict for verification
                enrolled_model = {
                    "voiceprint": settings["voiceprint"],
                    "sample_count": len(settings.get("voiceprint_samples", [1])),
                    "consistency": settings.get("enrollment_consistency", 0.8),
                }
                vresult = verify_voiceprint(enrolled_model, test_vp)
                is_match = vresult["is_match"]
                similarity = vresult["confidence"]
                confidence_level = vresult["confidence_level"]
            else:
                # Legacy 60-dim voiceprint — use backward-compatible verification
                test_vp = extract_voiceprint_legacy(wav_bytes)
                if test_vp is None:
                    raise HTTPException(status_code=400, detail="Could not process voice sample")
                similarity, is_match = compare_voiceprints_legacy(settings["voiceprint"], test_vp)
                confidence_level = "high" if similarity >= 0.88 else "medium" if is_match else "low"

            # Also verify the passphrase text via Whisper if available
            text_match_result = {"match": True, "score": 1.0}
            if settings.get("voice_passphrase"):
                try:
                    from emergentintegrations.llm.openai import OpenAISpeechToText
                    api_key = os.environ.get('EMERGENT_LLM_KEY')
                    if api_key:
                        stt = OpenAISpeechToText(api_key=api_key)
                        with open(wav_path, 'rb') as af:
                            stt_response = await stt.transcribe(file=af, model="whisper-1", response_format="json", language="en")
                        spoken = stt_response.text.strip()
                        expected = settings["voice_passphrase"].strip()
                        text_match_result = match_passphrase(spoken, expected)
                except Exception as e:
                    logger.warning(f"Whisper text verification failed, relying on voiceprint only: {e}")

            if not is_match:
                pct = int(similarity * 100)
                raise HTTPException(
                    status_code=401,
                    detail=f"Voice mismatch ({pct}% confidence, {confidence_level}). Please try again."
                )
            if not text_match_result["match"]:
                raise HTTPException(
                    status_code=401,
                    detail=f"Passphrase did not match (score: {text_match_result['score']:.0%}). Please speak your passphrase clearly."
                )

            results["voice"] = {
                "verified": True,
                "confidence": round(similarity, 3),
                "confidence_level": confidence_level,
                "passphrase_score": text_match_result.get("score", 1.0),
            }
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            if os.path.exists(wav_path):
                os.unlink(wav_path)

    # Layer 3: Security Question
    if settings.get("security_question_enabled") and settings.get("security_answer_hash"):
        if not security_answer:
            raise HTTPException(status_code=400, detail="Security answer required")
        if not verify_password(security_answer.lower().strip(), settings["security_answer_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect security answer")
        results["security_question"] = True

    return {"verified": True, "results": results}

@router.delete("/security/settings/{section_id}")
async def remove_section_security(
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove all security settings for a section"""
    if section_id not in LOCKABLE_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section: {section_id}")
    await db.section_security.delete_one({"user_id": current_user["id"], "section_id": section_id})
    return {"success": True, "message": f"Security removed from {LOCKABLE_SECTIONS[section_id]}"}