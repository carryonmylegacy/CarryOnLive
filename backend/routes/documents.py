"""CarryOn™ Backend — Document & Voice Routes

Architecture:
- Documents encrypted with AES-256-GCM (per-estate derived keys)
- Encrypted blobs stored in cloud storage (S3 in prod, local in dev)
- MongoDB stores only metadata + storage_key (no blob data)
- Legacy Fernet data auto-migrated on access
"""

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from config import db, logger
from models import Document, DocumentUnlockRequest
from services.audit import audit_log
from services.encryption import (
    decrypt_aes256,
    encrypt_aes256,
    get_estate_salt,
    is_v2_encrypted,
    reencrypt_to_v2,
)
from services.storage import storage
from utils import (
    generate_backup_code,
    get_current_user,
    hash_password,
    log_activity,
    update_estate_readiness,
    verify_password,
)

router = APIRouter()


# ===================== INTERNAL HELPERS =====================


async def _get_decrypted_blob(document: dict) -> bytes:
    """Get decrypted document content, handling both legacy and new storage."""
    estate_salt = await get_estate_salt(document["estate_id"])

    # New architecture: blob in cloud storage
    if document.get("storage_key"):
        encrypted_blob = await storage.download(document["storage_key"])
        return decrypt_aes256(
            # storage stores raw encrypted bytes, not base64
            # but we base64-encode before storing for consistency
            encrypted_blob.decode("ascii")
            if isinstance(encrypted_blob, bytes) and encrypted_blob[:1] != b"\x02"
            else _bytes_to_b64(encrypted_blob),
            estate_salt,
        )

    # Legacy: blob in MongoDB as base64 field
    if document.get("file_data"):
        return decrypt_aes256(document["file_data"], estate_salt)

    raise ValueError("No document data found")


def _bytes_to_b64(data: bytes) -> str:
    import base64

    return base64.b64encode(data).decode("ascii")


async def _migrate_doc_to_cloud(doc_id: str, document: dict):
    """Migrate a legacy MongoDB-stored document to cloud storage + AES-256."""
    if document.get("storage_key") or not document.get("file_data"):
        return  # Already migrated or no data

    estate_salt = await get_estate_salt(document["estate_id"])

    # Re-encrypt with AES-256-GCM if still Fernet
    encrypted_b64 = document["file_data"]
    if not is_v2_encrypted(encrypted_b64):
        encrypted_b64 = reencrypt_to_v2(encrypted_b64, estate_salt)

    # Upload to cloud storage (store the base64 string as bytes)
    storage_key = await storage.upload(
        encrypted_b64.encode("ascii"),
        document["estate_id"],
        doc_id,
        document.get("file_type", "application/octet-stream"),
    )

    # Update MongoDB: set storage_key, remove blob
    await db.documents.update_one(
        {"id": doc_id},
        {
            "$set": {
                "storage_key": storage_key,
                "is_encrypted": True,
                "encryption_version": "aes-256-gcm",
            },
            "$unset": {"file_data": ""},
        },
    )
    logger.info(f"Migrated document {doc_id} to cloud storage: {storage_key}")


# ===================== DOCUMENT ROUTES =====================


@router.get("/documents/{estate_id}")
async def get_documents(estate_id: str, current_user: dict = Depends(get_current_user)):
    """List all documents for an estate."""
    # Verify estate access
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    is_owner = estate.get("owner_id") == current_user["id"]
    is_beneficiary = current_user["id"] in estate.get("beneficiaries", [])
    is_admin = current_user["role"] == "admin"
    if not (is_owner or is_beneficiary or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    documents = await db.documents.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0, "file_data": 0, "lock_password_hash": 0, "backup_code": 0},
    ).to_list(100)

    # Add encryption info to each document
    for doc in documents:
        doc["encryption_version"] = doc.get("encryption_version", "aes-256-gcm")
        doc["storage_type"] = "cloud" if doc.get("storage_key") else "legacy"

    return documents


@router.post("/documents/upload")
async def upload_document(
    estate_id: str,
    name: str,
    category: str,
    lock_type: Optional[str] = None,
    lock_password: Optional[str] = None,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a new document to the estate vault.

    - Encrypted with AES-256-GCM using per-estate derived key
    - Stored in cloud storage (S3 in prod, local in dev)
    """
    # Enforce subscription requirement for new uploads
    from guards import get_subscription_access

    access = await get_subscription_access(current_user)
    if not access["has_access"]:
        raise HTTPException(
            status_code=403,
            detail="Your free trial has ended. Subscribe to continue uploading documents. Your existing documents are still accessible.",
        )
    if current_user["role"] != "benefactor" and not current_user.get(
        "is_also_benefactor"
    ):
        raise HTTPException(
            status_code=403, detail="Only benefactors can upload documents"
        )

    # Verify user owns this estate
    estate = await db.estates.find_one(
        {"id": estate_id, "owner_id": current_user["id"]}, {"_id": 0}
    )
    if not estate:
        raise HTTPException(
            status_code=403, detail="Access denied — you do not own this estate"
        )

    # File upload security: validate content type, extension, and size
    ALLOWED_CONTENT_TYPES = {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    BLOCKED_EXTENSIONS = {
        ".exe",
        ".bat",
        ".cmd",
        ".sh",
        ".ps1",
        ".js",
        ".vbs",
        ".msi",
        ".dll",
        ".com",
        ".scr",
        ".pif",
        ".jar",
        ".py",
        ".rb",
        ".php",
        ".html",
        ".htm",
        ".svg",
    }
    MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB per file

    # Check filename extension
    filename = (file.filename or "").lower()
    file_ext = "." + filename.rsplit(".", 1)[-1] if "." in filename else ""
    if file_ext in BLOCKED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file_ext}' is not allowed for security reasons.",
        )

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, detail="File too large. Maximum size is 25MB."
        )

    file_ct = (file.content_type or "application/octet-stream").split(";")[0].strip()
    if file_ct not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file_ct}' is not allowed. Please upload PDF, image, or document files.",
        )

    estate_salt = await get_estate_salt(estate_id)

    # Encrypt with AES-256-GCM
    encrypted_b64 = encrypt_aes256(content, estate_salt)

    # Generate backup code for locked documents
    backup_code = generate_backup_code() if lock_type else None
    password_hash = (
        hash_password(lock_password)
        if lock_password and lock_type == "password"
        else None
    )

    document = Document(
        estate_id=estate_id,
        name=name,
        category=category,
        file_type=file.content_type or "application/octet-stream",
        file_size=len(content),
        file_data=None,  # No blob in MongoDB
        is_locked=lock_type is not None,
        lock_type=lock_type,
        lock_password_hash=password_hash,
        backup_code=backup_code,
        is_encrypted=True,
        uploaded_by=current_user["id"],
    )

    # Upload encrypted blob to cloud storage
    storage_key = await storage.upload(
        encrypted_b64.encode("ascii"),
        estate_id,
        document.id,
        file.content_type or "application/octet-stream",
    )

    doc_dict = document.model_dump()
    doc_dict["storage_key"] = storage_key
    doc_dict["encryption_version"] = "aes-256-gcm"
    await db.documents.insert_one(doc_dict)

    # Update estate readiness
    await update_estate_readiness(estate_id)

    # Audit log
    await audit_log(
        action="document.upload",
        user_id=current_user["id"],
        resource_type="document",
        resource_id=document.id,
        estate_id=estate_id,
        details={
            "name": name,
            "category": category,
            "size": len(content),
            "encrypted": True,
            "encryption": "AES-256-GCM",
            "storage": "cloud",
        },
    )

    # Activity log
    await log_activity(
        estate_id=estate_id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="document_uploaded",
        description=f"Uploaded document: {name} ({category})",
        metadata={
            "document_name": name,
            "category": category,
            "is_locked": lock_type is not None,
        },
    )

    # NOTIFICATION: Notify beneficiaries that a new document was uploaded
    import asyncio
    from services.notifications import notify as _notify

    beneficiaries = await db.beneficiaries.find(
        {"estate_id": estate_id, "user_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "user_id": 1},
    ).to_list(100)
    category_label = category.replace("_", " ").title()
    for ben in beneficiaries:
        if ben.get("user_id"):
            asyncio.create_task(
                _notify.beneficiary(
                    ben["user_id"],
                    f"New {category_label} Document",
                    f"A new {category_label.lower()} document '{name}' has been uploaded to the vault.",
                    url="/beneficiary/vault",
                )
            )

    response = {
        "id": document.id,
        "name": document.name,
        "message": "Document uploaded and encrypted with AES-256-GCM",
    }
    if backup_code:
        response["backup_code"] = backup_code
        response["backup_message"] = (
            "Save this backup code securely - it can be used to unlock this document"
        )

    return response


@router.post("/documents/{document_id}/unlock")
async def unlock_document(
    document_id: str,
    unlock_data: DocumentUnlockRequest,
    current_user: dict = Depends(get_current_user),
):
    """Unlock a protected document"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if not document.get("is_locked"):
        return {"message": "Document is not locked", "unlocked": True}

    lock_type = document.get("lock_type")

    if lock_type == "password":
        if not unlock_data.password:
            raise HTTPException(status_code=400, detail="Password required")
        if not document.get("lock_password_hash"):
            raise HTTPException(status_code=400, detail="Document has no password set")
        if not verify_password(unlock_data.password, document["lock_password_hash"]):
            if (
                unlock_data.backup_code
                and document.get("backup_code") == unlock_data.backup_code
            ):
                pass
            else:
                raise HTTPException(status_code=401, detail="Invalid password")
    elif lock_type == "backup":
        if not unlock_data.backup_code:
            raise HTTPException(status_code=400, detail="Backup code required")
        if document.get("backup_code") != unlock_data.backup_code:
            raise HTTPException(status_code=401, detail="Invalid backup code")
    elif lock_type == "voice":
        if not unlock_data.backup_code:
            raise HTTPException(
                status_code=400,
                detail="Voice verification not available. Use backup code.",
            )
        if document.get("backup_code") != unlock_data.backup_code:
            raise HTTPException(status_code=401, detail="Invalid backup code")

    await audit_log(
        action="document.unlock",
        user_id=current_user["id"],
        resource_type="document",
        resource_id=document_id,
        estate_id=document.get("estate_id"),
    )

    # Persist the unlock — set is_locked to false
    await db.documents.update_one(
        {"id": document_id},
        {
            "$set": {
                "is_locked": False,
                "unlocked_at": datetime.now(timezone.utc).isoformat(),
                "unlocked_by": current_user["id"],
            }
        },
    )

    return {
        "message": "Document unlocked successfully",
        "unlocked": True,
        "document_id": document_id,
    }


class DocumentLockRequest(BaseModel):
    password: str


@router.post("/documents/{document_id}/lock")
async def lock_document(
    document_id: str,
    data: DocumentLockRequest,
    current_user: dict = Depends(get_current_user),
):
    """Set a password lock on an existing document."""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    estate = await db.estates.find_one({"id": document["estate_id"]}, {"_id": 0})
    if not estate or estate.get("owner_id") != current_user["id"]:
        raise HTTPException(
            status_code=403, detail="Only the estate owner can lock documents"
        )

    # Require vault master key to be set before allowing individual locks
    user_doc = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "vault_master_key_hash": 1}
    )
    if not user_doc or not user_doc.get("vault_master_key_hash"):
        raise HTTPException(
            status_code=400,
            detail="Set a Vault Master Key in Security Settings before locking individual documents.",
        )

    if len(data.password) < 4:
        raise HTTPException(
            status_code=400, detail="Password must be at least 4 characters"
        )

    backup_code = generate_backup_code()

    await db.documents.update_one(
        {"id": document_id},
        {
            "$set": {
                "is_locked": True,
                "lock_type": "password",
                "lock_password_hash": hash_password(data.password),
                "backup_code": backup_code,
                "locked_at": datetime.now(timezone.utc).isoformat(),
                "locked_by": current_user["id"],
            }
        },
    )

    await audit_log(
        action="document.lock",
        user_id=current_user["id"],
        resource_type="document",
        resource_id=document_id,
        estate_id=document.get("estate_id"),
    )

    return {
        "locked": True,
        "backup_code": backup_code,
        "message": "Document locked. Save your backup code securely.",
    }


@router.post("/documents/{document_id}/remove-lock")
async def remove_document_lock(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove the password lock from a document (owner only, no password needed)."""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    estate = await db.estates.find_one({"id": document["estate_id"]}, {"_id": 0})
    if not estate or estate.get("owner_id") != current_user["id"]:
        raise HTTPException(
            status_code=403, detail="Only the estate owner can remove locks"
        )

    await db.documents.update_one(
        {"id": document_id},
        {
            "$set": {"is_locked": False},
            "$unset": {
                "lock_type": "",
                "lock_password_hash": "",
                "backup_code": "",
                "locked_at": "",
                "locked_by": "",
            },
        },
    )

    return {"unlocked": True, "message": "Lock removed."}


@router.get("/vault/security-info/{estate_id}")
async def get_vault_security_info(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
    """Get encryption and security metadata for the vault."""
    documents = await db.documents.find(
        {"estate_id": estate_id, "deleted_at": None},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "storage_key": 1,
            "encryption_version": 1,
            "is_encrypted": 1,
            "file_size": 1,
        },
    ).to_list(200)

    total_docs = len(documents)
    cloud_stored = sum(1 for d in documents if d.get("storage_key"))
    aes256_encrypted = sum(
        1 for d in documents if d.get("encryption_version") == "aes-256-gcm"
    )
    legacy_encrypted = total_docs - aes256_encrypted
    total_size = sum(d.get("file_size", 0) for d in documents)

    # Count audit entries for this estate
    audit_count = await db.security_audit_log.count_documents({"estate_id": estate_id})

    return {
        "encryption": {
            "algorithm": "AES-256-GCM",
            "key_derivation": "PBKDF2-SHA256 (600,000 iterations)",
            "key_scope": "Per-estate derived keys",
            "nonce": "96-bit random per operation",
            "compliance": ["FIPS 197", "2FA"],
        },
        "storage": {
            "type": "Cloud Object Storage (S3-compatible)",
            "encryption_at_rest": "Application-layer AES-256-GCM + SSE-S3",
            "encryption_in_transit": "TLS 1.3",
        },
        "vault_stats": {
            "total_documents": total_docs,
            "cloud_stored": cloud_stored,
            "aes256_encrypted": aes256_encrypted,
            "legacy_pending_migration": legacy_encrypted,
            "total_size_bytes": total_size,
            "audit_entries": audit_count,
        },
        "zero_knowledge": {
            "description": "Per-estate derived encryption keys ensure data isolation between users",
            "server_access": "Server decrypts only during authorized user sessions",
            "data_at_rest": "All document content encrypted — plaintext never stored",
        },
    }


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: str,
    password: Optional[str] = None,
    backup_code: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Download a document (decrypted)"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify estate access
    estate = await db.estates.find_one({"id": document["estate_id"]}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    is_owner = estate.get("owner_id") == current_user["id"]
    is_beneficiary = current_user["id"] in estate.get("beneficiaries", [])
    is_admin = current_user["role"] == "admin"
    if not (is_owner or is_beneficiary or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    # SOC 2: Log sensitive data access
    from routes.compliance import log_sensitive_access

    await log_sensitive_access(
        user_id=estate.get("owner_id", ""),
        action="document_download",
        resource=f"document:{document_id}",
        details=f"Document '{document.get('name', '')}' accessed",
        accessed_by=current_user["id"],
    )

    # Check section-level lock (triple lock) — block downloads when SDV is locked
    # Note: is_active is computed from password_enabled OR voice_enabled OR security_question_enabled
    section_lock = await db.section_security.find_one(
        {
            "user_id": current_user["id"],
            "section_id": "sdv",
            "$or": [
                {"password_enabled": True},
                {"voice_enabled": True},
                {"security_question_enabled": True},
            ],
        },
        {"_id": 0},
    )
    if section_lock:
        # Check if user has a valid session unlock
        unlock_session = await db.section_unlock_sessions.find_one(
            {
                "user_id": current_user["id"],
                "section_id": "sdv",
                "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()},
            },
            {"_id": 0},
        )
        if not unlock_session:
            raise HTTPException(
                status_code=403,
                detail="Section is locked. Unlock the Secure Document Vault first.",
            )

    # Check individual document lock
    if document.get("is_locked"):
        lock_type = document.get("lock_type")
        if lock_type == "password" and document.get("lock_password_hash"):
            if password and verify_password(password, document["lock_password_hash"]):
                pass
            elif backup_code and document.get("backup_code") == backup_code:
                pass
            else:
                raise HTTPException(
                    status_code=401, detail="Invalid credentials for locked document"
                )
        elif lock_type in ["backup", "voice"]:
            if not backup_code or document.get("backup_code") != backup_code:
                raise HTTPException(status_code=401, detail="Invalid backup code")

    # Decrypt
    try:
        # Lazy migration: move legacy docs to cloud storage on first access
        if document.get("file_data") and not document.get("storage_key"):
            await _migrate_doc_to_cloud(document_id, document)
            document = await db.documents.find_one({"id": document_id}, {"_id": 0})

        estate_salt = await get_estate_salt(document["estate_id"])

        if document.get("storage_key"):
            encrypted_blob = await storage.download(document["storage_key"])
            decrypted_data = decrypt_aes256(encrypted_blob.decode("ascii"), estate_salt)
        elif document.get("file_data"):
            decrypted_data = decrypt_aes256(document["file_data"], estate_salt)
        else:
            raise HTTPException(status_code=404, detail="Document data not found")
    except Exception as e:
        logger.error(f"Decryption error: {e}")
        raise HTTPException(status_code=500, detail="Failed to decrypt document")

    await audit_log(
        action="document.download",
        user_id=current_user["id"],
        resource_type="document",
        resource_id=document_id,
        estate_id=document.get("estate_id"),
        details={
            "file_type": document.get("file_type"),
            "size": document.get("file_size"),
        },
    )

    return Response(
        content=decrypted_data,
        media_type=document.get("file_type", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{document["name"]}"'},
    )


@router.get("/documents/{document_id}/preview")
async def preview_document(
    document_id: str,
    password: Optional[str] = None,
    backup_code: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Preview a document (for PDFs and images)"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify estate access
    estate = await db.estates.find_one({"id": document["estate_id"]}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    is_owner = estate.get("owner_id") == current_user["id"]
    is_beneficiary = current_user["id"] in estate.get("beneficiaries", [])
    is_admin = current_user["role"] == "admin"
    if not (is_owner or is_beneficiary or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    # Check section-level lock (triple lock) — block preview when SDV is locked
    section_lock = await db.section_security.find_one(
        {
            "user_id": current_user["id"],
            "section_id": "sdv",
            "$or": [
                {"password_enabled": True},
                {"voice_enabled": True},
                {"security_question_enabled": True},
            ],
        },
        {"_id": 0},
    )
    if section_lock:
        unlock_session = await db.section_unlock_sessions.find_one(
            {
                "user_id": current_user["id"],
                "section_id": "sdv",
                "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()},
            },
            {"_id": 0},
        )
        if not unlock_session:
            raise HTTPException(
                status_code=403,
                detail="Section is locked. Unlock the Secure Document Vault first.",
            )

    if document.get("is_locked"):
        lock_type = document.get("lock_type")
        if lock_type == "password" and document.get("lock_password_hash"):
            if password and verify_password(password, document["lock_password_hash"]):
                pass
            elif backup_code and document.get("backup_code") == backup_code:
                pass
            else:
                raise HTTPException(
                    status_code=401, detail="Invalid credentials for locked document"
                )
        elif lock_type in ["backup", "voice"]:
            if not backup_code or document.get("backup_code") != backup_code:
                raise HTTPException(status_code=401, detail="Invalid backup code")

    try:
        if document.get("file_data") and not document.get("storage_key"):
            await _migrate_doc_to_cloud(document_id, document)
            document = await db.documents.find_one({"id": document_id}, {"_id": 0})

        estate_salt = await get_estate_salt(document["estate_id"])

        if document.get("storage_key"):
            encrypted_blob = await storage.download(document["storage_key"])
            decrypted_data = decrypt_aes256(encrypted_blob.decode("ascii"), estate_salt)
        elif document.get("file_data"):
            decrypted_data = decrypt_aes256(document["file_data"], estate_salt)
        else:
            raise HTTPException(status_code=404, detail="Document data not found")
    except Exception as e:
        logger.error(f"Decryption error: {e}")
        raise HTTPException(status_code=500, detail="Failed to decrypt document")

    await audit_log(
        action="document.preview",
        user_id=current_user["id"],
        resource_type="document",
        resource_id=document_id,
        estate_id=document.get("estate_id"),
    )

    # SOC 2: Log sensitive data access for document preview
    from routes.compliance import log_sensitive_access

    await log_sensitive_access(
        user_id=estate.get("owner_id", ""),
        action="document_preview",
        resource=f"document:{document_id}",
        details=f"Document '{document.get('name', '')}' previewed",
        accessed_by=current_user["id"],
    )

    return Response(
        content=decrypted_data,
        media_type=document.get("file_type", "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{document["name"]}"'},
    )


# ===================== VOICE VERIFICATION ROUTES =====================


class VoicePassphraseSetup(BaseModel):
    document_id: str
    passphrase: str


class VoiceVerifyRequest(BaseModel):
    document_id: str
    spoken_text: str


@router.post("/voice/transcribe")
async def transcribe_voice(
    file: UploadFile = File(...), current_user: dict = Depends(get_current_user)
):
    """Transcribe audio using OpenAI Whisper for voice verification"""
    from emergentintegrations.llm.openai import OpenAISpeechToText

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Voice service not configured")

    try:
        content = await file.read()
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Max 25MB.")

        import tempfile

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

    try:
        content = await file.read()
        import tempfile

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

        from difflib import SequenceMatcher

        similarity = SequenceMatcher(None, transcription, expected).ratio()
        verified = similarity >= 0.7

        return {
            "verified": verified,
            "transcription": transcription,
            "similarity": round(similarity, 2),
            "message": "Voice verified successfully"
            if verified
            else "Voice verification failed. Please try again.",
        }
    except Exception as e:
        logger.error(f"Voice verification error: {e}")
        raise HTTPException(status_code=500, detail="Voice verification failed")


@router.post("/documents/{document_id}/voice/setup")
async def setup_voice_passphrase(
    document_id: str, passphrase: str, current_user: dict = Depends(get_current_user)
):
    """Set up voice verification passphrase for a document"""
    if current_user["role"] != "benefactor" and not current_user.get(
        "is_also_benefactor"
    ):
        raise HTTPException(
            status_code=403, detail="Only benefactors can set up voice verification"
        )

    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if document.get("lock_type") != "voice":
        raise HTTPException(
            status_code=400, detail="Document is not set up for voice verification"
        )

    normalized_passphrase = passphrase.lower().strip()
    await db.documents.update_one(
        {"id": document_id},
        {
            "$set": {
                "voice_passphrase_hash": hash_password(normalized_passphrase),
                "voice_passphrase_hint": passphrase[:3] + "..."
                if len(passphrase) > 3
                else passphrase,
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
    if not document.get("voice_passphrase_hash"):
        raise HTTPException(
            status_code=400, detail="Voice passphrase not set up. Use backup code."
        )

    normalized_spoken = data.spoken_text.lower().strip()
    if verify_password(normalized_spoken, document["voice_passphrase_hash"]):
        return {"verified": True, "message": "Voice verification successful"}

    raise HTTPException(
        status_code=401,
        detail="Voice verification failed. Try again or use backup code.",
    )


@router.get("/documents/{document_id}/voice/hint")
async def get_voice_hint(
    document_id: str, current_user: dict = Depends(get_current_user)
):
    """Get voice passphrase hint"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "has_passphrase": bool(document.get("voice_passphrase_hash")),
        "hint": document.get("voice_passphrase_hint", "Not set"),
    }


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete a document from the vault."""
    if current_user["role"] != "benefactor" and not current_user.get(
        "is_also_benefactor"
    ):
        raise HTTPException(
            status_code=403, detail="Only benefactors can delete documents"
        )

    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify user owns the estate
    estate = await db.estates.find_one(
        {"id": document["estate_id"], "owner_id": current_user["id"]}, {"_id": 0}
    )
    if not estate:
        raise HTTPException(
            status_code=403, detail="Access denied — you do not own this estate"
        )

    # Delete from cloud storage
    if document.get("storage_key"):
        await storage.delete(document["storage_key"])

    result = await db.documents.update_one(
        {"id": document_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )  # soft_delete
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")

    await audit_log(
        action="document.delete",
        user_id=current_user["id"],
        resource_type="document",
        resource_id=document_id,
        estate_id=document.get("estate_id"),
    )

    return {"message": "Document deleted"}


@router.put("/documents/{document_id}")
async def update_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    name: str = Form(None),
    category: str = Form(None),
    notes: str = Form(None),
):
    """Update document metadata (name, category, notes)"""
    if current_user["role"] != "benefactor" and not current_user.get(
        "is_also_benefactor"
    ):
        raise HTTPException(
            status_code=403, detail="Only benefactors can update documents"
        )

    doc = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify user owns the estate
    estate = await db.estates.find_one(
        {"id": doc["estate_id"], "owner_id": current_user["id"]}, {"_id": 0}
    )
    if not estate:
        raise HTTPException(
            status_code=403, detail="Access denied — you do not own this estate"
        )

    update_data = {}
    if name is not None:
        update_data["name"] = name
    if category is not None:
        update_data["category"] = category
    if notes is not None:
        update_data["notes"] = notes

    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.documents.update_one({"id": document_id}, {"$set": update_data})

        # Log edit to edit_history for timeline tracking
        import uuid as _uuid

        changed_fields = [k for k in update_data if k != "updated_at"]
        await db.edit_history.insert_one(
            {
                "id": str(_uuid.uuid4()),
                "item_type": "document",
                "item_id": document_id,
                "estate_id": doc["estate_id"],
                "user_id": current_user["id"],
                "user_name": current_user.get("name", ""),
                "action": "edited",
                "changed_fields": changed_fields,
                "title": name or doc.get("name", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    updated = await db.documents.find_one(
        {"id": document_id},
        {"_id": 0, "file_data": 0, "lock_password_hash": 0, "backup_code": 0},
    )
    return updated
