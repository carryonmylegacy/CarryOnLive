"""CarryOn™ Backend — Section Security (Triple Lock)"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException
from pydantic import BaseModel

from config import db
from utils import get_current_user, hash_password, verify_password

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
    pin_enabled: Optional[bool] = None
    pin: Optional[str] = None
    password_enabled: Optional[bool] = None
    password: Optional[str] = None
    security_question_enabled: Optional[bool] = None
    security_question: Optional[str] = None
    security_answer: Optional[str] = None
    lock_mode: Optional[str] = None  # on_page_leave, on_logout, manual


class SectionVerifyRequest(BaseModel):
    pin: Optional[str] = None
    password: Optional[str] = None
    security_answer: Optional[str] = None


@router.get("/security/settings")
async def get_security_settings(current_user: dict = Depends(get_current_user)):
    """Get security settings for all sections"""
    settings = await db.section_security.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(20)
    settings_map = {s["section_id"]: s for s in settings}
    result = {}
    for sid, name in LOCKABLE_SECTIONS.items():
        s = settings_map.get(sid, {})
        result[sid] = {
            "section_id": sid,
            "name": name,
            "pin_enabled": s.get("pin_enabled", False),
            "has_pin": bool(s.get("pin_hash")),
            "password_enabled": s.get("password_enabled", False),
            "has_password": bool(s.get("password_hash")),
            "security_question_enabled": s.get("security_question_enabled", False),
            "has_security_question": bool(s.get("security_question")),
            "security_question": s.get("security_question", ""),
            "lock_mode": s.get("lock_mode", "manual"),
            "is_active": s.get("pin_enabled", False)
            or s.get("password_enabled", False)
            or s.get("security_question_enabled", False),
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
    current_user: dict = Depends(get_current_user),
):
    """Update security settings for a section"""
    if section_id not in LOCKABLE_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section: {section_id}")

    update_fields = {
        "user_id": current_user["id"],
        "section_id": section_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if data.pin_enabled is not None:
        update_fields["pin_enabled"] = data.pin_enabled
    if data.pin:
        if len(data.pin) < 4 or len(data.pin) > 8 or not data.pin.isdigit():
            raise HTTPException(status_code=400, detail="PIN must be 4-8 digits")
        update_fields["pin_hash"] = hash_password(data.pin)
    if data.password_enabled is not None:
        update_fields["password_enabled"] = data.password_enabled
    if data.password:
        update_fields["password_hash"] = hash_password(data.password)
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

    # Clear voice biometric fields if they exist (migrating away from voice)
    await db.section_security.update_one(
        {"user_id": current_user["id"], "section_id": section_id},
        {
            "$set": update_fields,
            "$unset": {
                "voice_enabled": "",
                "voiceprint": "",
                "voiceprint_samples": "",
                "voiceprint_version": "",
                "voiceprint_dimension": "",
                "enrollment_consistency": "",
                "voice_passphrase": "",
                "voice_enrolled_at": "",
            },
        },
        upsert=True,
    )

    return {
        "success": True,
        "section_id": section_id,
        "message": f"{LOCKABLE_SECTIONS[section_id]} security updated",
    }


@router.post("/security/verify/{section_id}")
async def verify_section_security(
    section_id: str,
    pin: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    security_answer: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Verify security credentials for a section — checks all enabled layers"""
    if section_id not in LOCKABLE_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section: {section_id}")

    settings = await db.section_security.find_one({"user_id": current_user["id"], "section_id": section_id}, {"_id": 0})
    if not settings:
        return {"verified": True, "message": "No security configured"}

    results = {}

    # Layer 1: PIN
    if settings.get("pin_enabled") and settings.get("pin_hash"):
        if not pin:
            raise HTTPException(status_code=400, detail="PIN required")
        if not verify_password(pin, settings["pin_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect PIN")
        results["pin"] = True

    # Layer 2: Password
    if settings.get("password_enabled") and settings.get("password_hash"):
        if not password:
            raise HTTPException(status_code=400, detail="Password required")
        if not verify_password(password, settings["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect section password")
        results["password"] = True

    # Layer 3: Security Question
    if settings.get("security_question_enabled") and settings.get("security_answer_hash"):
        if not security_answer:
            raise HTTPException(status_code=400, detail="Security answer required")
        if not verify_password(security_answer.lower().strip(), settings["security_answer_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect security answer")
        results["security_question"] = True

    # Store a session unlock record (TTL 8 hours to match JWT)
    await db.section_unlock_sessions.update_one(
        {"user_id": current_user["id"], "section_id": section_id},
        {
            "$set": {
                "user_id": current_user["id"],
                "section_id": section_id,
                "unlocked_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": datetime.now(timezone.utc) + timedelta(hours=8),
            }
        },
        upsert=True,
    )

    return {"verified": True, "results": results}


@router.get("/security/unlock-status/{section_id}")
async def check_unlock_status(section_id: str, current_user: dict = Depends(get_current_user)):
    """Check if a section has been unlocked in the current session."""
    session = await db.section_unlock_sessions.find_one(
        {"user_id": current_user["id"], "section_id": section_id},
        {"_id": 0, "id": 1, "expires_at": 1},
    )
    if session:
        return {"unlocked": True}
    return {"unlocked": False}


@router.delete("/security/settings/{section_id}")
async def remove_section_security(section_id: str, current_user: dict = Depends(get_current_user)):
    """Remove all security settings for a section"""
    if section_id not in LOCKABLE_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid section: {section_id}")
    await db.section_security.delete_one({"user_id": current_user["id"], "section_id": section_id})
    return {
        "success": True,
        "message": f"Security removed from {LOCKABLE_SECTIONS[section_id]}",
    }


# ===================== VAULT MASTER KEY =====================


class MasterKeyRequest(BaseModel):
    master_key: str


@router.get("/security/master-key-status")
async def get_master_key_status(current_user: dict = Depends(get_current_user)):
    """Check if the user has a vault master key set."""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "vault_master_key_hash": 1})
    return {"has_master_key": bool(user and user.get("vault_master_key_hash"))}


@router.post("/security/master-key")
async def set_master_key(data: MasterKeyRequest, current_user: dict = Depends(get_current_user)):
    """Set or update the vault master key."""
    if current_user.get("role") not in ("benefactor", "beneficiary", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Only benefactors and beneficiaries can set a master key",
        )
    if len(data.master_key.strip()) < 4:
        raise HTTPException(status_code=400, detail="Master key must be at least 4 characters")

    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {
                "vault_master_key_hash": hash_password(data.master_key.strip()),
                "vault_master_key_set_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {"success": True, "message": "Vault master key saved."}


@router.get("/admin/user/{user_id}/master-key-hint")
async def get_user_master_key_for_admin(user_id: str, current_user: dict = Depends(get_current_user)):
    """Admin: get the master key hash for phone verification. Admin sees the hash, not plaintext."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "vault_master_key_hash": 1, "name": 1})
    if not user or not user.get("vault_master_key_hash"):
        raise HTTPException(status_code=404, detail="No master key set for this user")
    return {"has_master_key": True, "user_name": user.get("name", "")}


@router.post("/admin/user/{user_id}/verify-master-key")
async def admin_verify_master_key(
    user_id: str,
    data: MasterKeyRequest,
    current_user: dict = Depends(get_current_user),
):
    """Admin: verify a spoken master key against the stored hash."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "vault_master_key_hash": 1})
    if not user or not user.get("vault_master_key_hash"):
        raise HTTPException(status_code=404, detail="No master key set")
    if not verify_password(data.master_key.strip(), user["vault_master_key_hash"]):
        raise HTTPException(status_code=401, detail="Master key does not match")
    return {"verified": True}


@router.post("/admin/user/{user_id}/unlock-all-documents")
async def admin_unlock_all_documents(
    user_id: str,
    data: MasterKeyRequest,
    current_user: dict = Depends(get_current_user),
):
    """Admin: verify master key and unlock ALL locked documents in user's estates."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "vault_master_key_hash": 1})
    if not user or not user.get("vault_master_key_hash"):
        raise HTTPException(status_code=404, detail="No master key set")
    if not verify_password(data.master_key.strip(), user["vault_master_key_hash"]):
        raise HTTPException(status_code=401, detail="Master key does not match")

    # Find estates owned by or accessible to this user
    owned = await db.estates.find({"owner_id": user_id}, {"_id": 0, "id": 1}).to_list(100)
    ben_records = await db.beneficiaries.find({"user_id": user_id}, {"_id": 0, "id": 1, "estate_id": 1}).to_list(100)
    estate_ids = list({e["id"] for e in owned} | {b["estate_id"] for b in ben_records})

    # Unlock all locked documents across all accessible estates
    result = await db.documents.update_many(
        {"estate_id": {"$in": estate_ids}, "is_locked": True},
        {
            "$set": {
                "is_locked": False,
                "unlocked_at": datetime.now(timezone.utc).isoformat(),
                "unlocked_by": f"admin:{current_user['id']}",
                "admin_force_unlock": True,
            },
            "$unset": {
                "lock_type": "",
                "lock_password_hash": "",
                "backup_code": "",
            },
        },
    )

    return {
        "unlocked_count": result.modified_count,
        "message": f"Unlocked {result.modified_count} document(s). User will need to re-lock individually.",
    }
