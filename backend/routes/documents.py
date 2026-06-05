"""CarryOn™ Backend — Document & Voice Routes

Architecture:
- Documents encrypted with AES-256-GCM (per-estate derived keys)
- Encrypted blobs stored in cloud storage (S3 in prod, local in dev)
- MongoDB stores only metadata + storage_key (no blob data)
- Legacy Fernet data auto-migrated on access
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from config import db, logger
from guards import require_benefactor_role
from models import Document, DocumentUnlockRequest
from services.audit import audit_log
from services.access_control import (
    can_access_document,
    filter_accessible_documents,
    require_beneficiary_section_access,
    require_estate_actor,
)
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
    actor = await require_estate_actor(estate_id, current_user)
    # Section gate — beneficiary "vault" section can be disabled by the
    # benefactor. Essential pre-transition docs use a separate endpoint that
    # keeps the emergency carve-out, so they are intentionally NOT gated here.
    await require_beneficiary_section_access(actor, "vault")
    documents = await db.documents.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0, "file_data": 0, "lock_password_hash": 0, "backup_code": 0},
    ).to_list(100)
    documents = filter_accessible_documents(documents, actor)

    # Resolve linked CFP entities (reverse lookup): for each doc, list
    # the entities whose document_ids include this doc.id. Lets the
    # SDV doc detail render a "Linked to [Entity]" pill that
    # deep-links back into the Entities & Structures org chart.
    if documents:
        ent_rows = await db.cfp_entities.find(
            {"estate_id": estate_id, "deleted_at": None},
            {"_id": 0, "id": 1, "name": 1, "category": 1, "type": 1, "document_ids": 1},
        ).to_list(500)
        doc_to_entities = {}
        for ent in ent_rows:
            for doc_id in ent.get("document_ids") or []:
                doc_to_entities.setdefault(doc_id, []).append({"id": ent["id"], "name": ent.get("name")})
        for doc in documents:
            doc["linked_entities"] = doc_to_entities.get(doc["id"], [])
        # Re-resolve with category so the SDV card can render an
        # entity-type icon overlay on the document thumbnail.
        ent_meta = {e["id"]: e for e in ent_rows}
        for doc in documents:
            for ent_ref in doc.get("linked_entities", []):
                full = ent_meta.get(ent_ref["id"], {})
                ent_ref["category"] = full.get("category")
                ent_ref["type"] = full.get("type")

    # Add encryption info to each document
    for doc in documents:
        doc["encryption_version"] = doc.get("encryption_version", "aes-256-gcm")
        doc["storage_type"] = "cloud" if doc.get("storage_key") else "legacy"

    # Per-user offline pin state (audit P2.1 — pins are now isolated per user,
    # not a global flag on the shared document). One batched query, no N+1.
    pin_rows = await db.document_pins.find(
        {"user_id": current_user["id"], "estate_id": estate_id}, {"_id": 0, "document_id": 1, "id": 1}
    ).to_list(5000)
    my_pins = {r["document_id"] for r in pin_rows}
    for doc in documents:
        doc["pinned_offline"] = doc["id"] in my_pins

    return documents


@router.get("/documents/{estate_id}/pre-transition")
async def get_pre_transition_documents(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get documents visible to the current beneficiary pre-transition.

    Returns:
      - Emergency docs (living_will, poa) that are designated to this beneficiary
      - Any other documents where visibility_timing[ben_record_id].pre == True
    """
    actor = await require_estate_actor(estate_id, current_user)

    documents = await db.documents.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0, "file_data": 0, "lock_password_hash": 0, "backup_code": 0},
    ).to_list(200)
    result = filter_accessible_documents(documents, actor, phase="pre")

    for doc in result:
        doc["encryption_version"] = doc.get("encryption_version", "aes-256-gcm")
        doc["storage_type"] = "cloud" if doc.get("storage_key") else "legacy"

    return result


# The 4 "essential" slots are surfaced as gold-outlined placeholder
# cards in the benefactor's SDV. Each placeholder either holds a
# document (and its per-beneficiary designation) or is empty and
# ready for upload. Beneficiaries see only the slots they were
# explicitly designated for.
ESSENTIAL_SLOT_DEFINITIONS = [
    {
        "category": "living_will",
        "label": "Living Will",
        "description": "End-of-life medical wishes (DNR, life support, organ donation).",
    },
    {
        "category": "healthcare_directive",
        "label": "Healthcare Directive",
        "description": "Advance directive appointing a healthcare agent.",
    },
    {
        "category": "general_poa",
        "label": "General Power of Attorney",
        "description": "Broad authority to act on legal/business matters.",
    },
    {
        "category": "financial_poa",
        "label": "Financial Power of Attorney",
        "description": "Authority over financial accounts, taxes, and assets.",
    },
]
ESSENTIAL_OFFLINE_CATEGORIES = {s["category"] for s in ESSENTIAL_SLOT_DEFINITIONS}


@router.get("/documents/{estate_id}/essential-slots")
async def get_essential_slots(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Return the 4 essential offline slots for the BENEFACTOR's SDV.

    Each slot is either occupied (returns the doc + its designation
    metadata) or empty (returns null for `document`). Used by the
    benefactor's vault page to render the gold-outlined placeholder
    cards.

    Legacy `poa`-category docs surface in the `general_poa` slot so
    we don't lose them after the categorical split.
    """
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    # Bug fix (Feb 2026 audit): estate stores `owner_id`, NOT `user_id` —
    # the prior `estate.get("user_id")` lookup ALWAYS returned None,
    # silently denying owners access to their own essential slots and
    # surfacing them only to admins. Now correctly compares owner_id.
    is_owner = estate.get("owner_id") == current_user["id"]
    is_admin = current_user["role"] == "admin"
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    docs = (
        await db.documents.find(
            {
                "estate_id": estate_id,
                "deleted_at": None,
                "category": {"$in": list(ESSENTIAL_OFFLINE_CATEGORIES) + ["poa"]},
            },
            {"_id": 0, "file_data": 0, "lock_password_hash": 0, "backup_code": 0},
        )
        .sort("created_at", -1)
        .to_list(50)
    )

    by_cat = {}
    for d in docs:
        cat = d.get("category", "")
        # Legacy `poa` shows up in the general_poa slot.
        slot_cat = "general_poa" if cat == "poa" else cat
        # Only the most recent doc per slot is the "occupant".
        if slot_cat not in by_cat:
            by_cat[slot_cat] = d

    out = []
    for slot in ESSENTIAL_SLOT_DEFINITIONS:
        d = by_cat.get(slot["category"])
        if d:
            d["encryption_version"] = d.get("encryption_version", "aes-256-gcm")
            d["storage_type"] = "cloud" if d.get("storage_key") else "legacy"
        out.append(
            {
                "slot": slot["category"],
                "label": slot["label"],
                "description": slot["description"],
                "document": d,
                # Convenience surface so the UI can render "Available offline
                # to: <names>" without an extra round-trip.
                "designated_beneficiaries": (d or {}).get("designated_beneficiaries", []) or [],
            }
        )
    return out


@router.get("/beneficiary/essential-docs/{estate_id}")
async def get_beneficiary_essential_docs(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Return the 4 essential docs the CURRENT BENEFICIARY has access to.

    Drives the beneficiary's "Essential Documents" panel — each row
    shows the doc + a "Make available offline" toggle. The toggle is
    server-aware (writes `pinned_offline=True` per the existing
    pin-offline endpoint) and local-aware (the client also persists
    the binary to Dexie via pinnedDocsRepo).
    """
    actor = await require_estate_actor(estate_id, current_user)
    if not (actor.get("is_beneficiary") or actor.get("is_admin")):
        raise HTTPException(status_code=403, detail="Access denied")

    docs = (
        await db.documents.find(
            {
                "estate_id": estate_id,
                "deleted_at": None,
                "category": {"$in": list(ESSENTIAL_OFFLINE_CATEGORIES) + ["poa"]},
            },
            {"_id": 0, "file_data": 0, "lock_password_hash": 0, "backup_code": 0},
        )
        .sort("created_at", -1)
        .to_list(50)
    )

    by_cat = {}
    for d in docs:
        cat = d.get("category", "")
        slot_cat = "general_poa" if cat == "poa" else cat
        # Only include docs the current beneficiary is designated for.
        if not can_access_document(d, actor, phase="pre"):
            continue
        if slot_cat not in by_cat:
            d["encryption_version"] = d.get("encryption_version", "aes-256-gcm")
            d["storage_type"] = "cloud" if d.get("storage_key") else "legacy"
            by_cat[slot_cat] = d

    # Per-user pin state (audit P2.1) — never expose another user's pin flag.
    pin_rows = await db.document_pins.find(
        {"user_id": current_user["id"], "estate_id": estate_id}, {"_id": 0, "document_id": 1, "id": 1}
    ).to_list(5000)
    my_pins = {r["document_id"] for r in pin_rows}
    for d in by_cat.values():
        d["pinned_offline"] = d["id"] in my_pins

    out = []
    for slot in ESSENTIAL_SLOT_DEFINITIONS:
        d = by_cat.get(slot["category"])
        out.append(
            {
                "slot": slot["category"],
                "label": slot["label"],
                "description": slot["description"],
                "document": d,  # null if the benefactor hasn't designated this beneficiary for this slot
            }
        )
    return out


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
    await require_benefactor_role(current_user, "upload documents")

    # Verify user owns this estate (or is admin)
    if current_user.get("role") == "admin":
        estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    else:
        estate = await db.estates.find_one({"id": estate_id, "owner_id": current_user["id"]}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=403, detail="Access denied — you do not own this estate")

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
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 25MB.")

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
    password_hash = hash_password(lock_password) if lock_password and lock_type == "password" else None

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
    # Privacy default for the 4 gold-outlined "essential offline"
    # slots: NOBODY can see this doc until the benefactor explicitly
    # designates beneficiaries via the designation modal. Prevents a
    # 2-year-old child from auto-receiving a Power of Attorney.
    if category in ESSENTIAL_OFFLINE_CATEGORIES:
        doc_dict["designated_beneficiaries"] = []
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

    # NOTIFICATION: Notify ONLY beneficiaries who can actually access this
    # document (designation + timing via can_access_document). Previously every
    # linked beneficiary was told the name + category of every upload, leaking
    # metadata about documents not designated to them (audit P1.2).
    import asyncio
    from services.notifications import notify as _notify

    beneficiaries = await db.beneficiaries.find(
        {"estate_id": estate_id, "user_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "user_id": 1},
    ).to_list(100)
    # Single query for transition state (no per-beneficiary DB calls → no N+1).
    _cert = await db.death_certificates.find_one(
        {"estate_id": estate_id, "status": {"$in": ["approved", "authenticated"]}},
        {"_id": 0, "id": 1},
    )
    _is_transitioned = bool(_cert)
    _doc_for_check = {
        "designated_beneficiaries": doc_dict.get("designated_beneficiaries") or [],
        "category": category,
        "visibility_timing": doc_dict.get("visibility_timing", {}),
        "deleted_at": None,
    }
    category_label = category.replace("_", " ").title()
    for ben in beneficiaries:
        if not ben.get("user_id"):
            continue
        _actor = {
            "is_owner": False,
            "is_admin": False,
            "is_beneficiary": True,
            "release_ids": {ben["id"], ben.get("user_id")} - {None},
            "is_transitioned": _is_transitioned,
            "emergency_scopes": set(),
        }
        if not can_access_document(_doc_for_check, _actor):
            continue
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
        response["backup_message"] = "Save this backup code securely - it can be used to unlock this document"

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

    actor = await require_estate_actor(document["estate_id"], current_user)
    if not (actor["is_owner"] or actor["is_admin"]):
        raise HTTPException(status_code=403, detail="Only the estate owner can unlock documents")

    if not document.get("is_locked"):
        return {"message": "Document is not locked", "unlocked": True}

    lock_type = document.get("lock_type")

    if lock_type == "password":
        if not unlock_data.password:
            raise HTTPException(status_code=400, detail="Password required")
        if not document.get("lock_password_hash"):
            raise HTTPException(status_code=400, detail="Document has no password set")
        if not verify_password(unlock_data.password, document["lock_password_hash"]):
            if unlock_data.backup_code and document.get("backup_code") == unlock_data.backup_code:
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
    if not estate or (estate.get("owner_id") != current_user["id"] and current_user.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Only the estate owner can lock documents")

    # Require vault master key to be set before allowing individual locks
    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "vault_master_key_hash": 1})
    if not user_doc or not user_doc.get("vault_master_key_hash"):
        raise HTTPException(
            status_code=400,
            detail="Set a Vault Master Key in Security Settings before locking individual documents.",
        )

    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

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
    if not estate or (estate.get("owner_id") != current_user["id"] and current_user.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Only the estate owner can remove locks")

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

    actor = await require_estate_actor(document["estate_id"], current_user)
    estate = actor["estate"]
    if not can_access_document(document, actor):
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
    # Note: is_active is computed from pin_enabled OR password_enabled OR security_question_enabled
    section_lock = await db.section_security.find_one(
        {
            "user_id": current_user["id"],
            "section_id": "sdv",
            "$or": [
                {"pin_enabled": True},
                {"password_enabled": True},
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
                raise HTTPException(status_code=401, detail="Invalid credentials for locked document")
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

    # Ensure filename has proper extension for iOS compatibility
    doc_name = document.get("name", "document")
    file_type = document.get("file_type", "application/octet-stream")
    ext_map = {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/heic": ".heic",
        "image/heif": ".heif",
        "image/webp": ".webp",
        "image/tiff": ".tiff",
        "text/plain": ".txt",
    }
    import re as _re

    has_ext = bool(_re.search(r"\.\w{2,5}$", doc_name))
    if not has_ext and file_type in ext_map:
        doc_name = f"{doc_name}{ext_map[file_type]}"

    return Response(
        content=decrypted_data,
        media_type=file_type,
        headers={
            "Content-Disposition": f'attachment; filename="{doc_name}"',
            "Content-Length": str(len(decrypted_data)),
        },
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

    actor = await require_estate_actor(document["estate_id"], current_user)
    estate = actor["estate"]
    if not can_access_document(document, actor):
        raise HTTPException(status_code=403, detail="Access denied")

    # Check section-level lock (triple lock) — block preview when SDV is locked
    section_lock = await db.section_security.find_one(
        {
            "user_id": current_user["id"],
            "section_id": "sdv",
            "$or": [
                {"pin_enabled": True},
                {"password_enabled": True},
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
                raise HTTPException(status_code=401, detail="Invalid credentials for locked document")
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


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a document from the vault."""
    await require_benefactor_role(current_user, "delete documents")

    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify user owns the estate
    if current_user.get("role") == "admin":
        estate = await db.estates.find_one({"id": document["estate_id"]}, {"_id": 0})
    else:
        estate = await db.estates.find_one({"id": document["estate_id"], "owner_id": current_user["id"]}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=403, detail="Access denied — you do not own this estate")

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
    await require_benefactor_role(current_user, "update documents")

    doc = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Verify user owns the estate
    if current_user.get("role") == "admin":
        estate = await db.estates.find_one({"id": doc["estate_id"]}, {"_id": 0})
    else:
        estate = await db.estates.find_one({"id": doc["estate_id"], "owner_id": current_user["id"]}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=403, detail="Access denied — you do not own this estate")

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


# ===================== PIN FOR OFFLINE (Phase 9a) =====================
@router.put("/documents/{document_id}/pin-offline")
async def set_document_pinned_offline(
    document_id: str,
    pinned: bool,
    current_user: dict = Depends(get_current_user),
):
    """Mark a document as pinned for offline access. The actual blob
    caching happens on the device (frontend pinnedDocsRepo); this flag
    just persists the user's intent so the next device they sign in on
    will re-prime the blob during warmup.

    Beneficiaries can pin documents they can read; benefactors can pin
    any document they own. Locked documents cannot be pinned (they
    require a per-session unlock and the blob would be unusable
    offline)."""
    doc = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    actor = await require_estate_actor(doc["estate_id"], current_user)
    if not can_access_document(doc, actor):
        raise HTTPException(status_code=403, detail="Access denied")

    if pinned and doc.get("is_locked"):
        raise HTTPException(
            status_code=400,
            detail="Locked documents cannot be pinned for offline access",
        )

    # Per-user pin state (audit P2.1) — stored in db.document_pins keyed by
    # (user_id, document_id), NOT as a global flag on the shared document, so
    # one beneficiary's pin can never surface on another user's device.
    if pinned:
        await db.document_pins.update_one(
            {"user_id": current_user["id"], "document_id": document_id},
            {
                "$set": {
                    "user_id": current_user["id"],
                    "document_id": document_id,
                    "estate_id": doc["estate_id"],
                    "pinned_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )
    else:
        await db.document_pins.delete_one({"user_id": current_user["id"], "document_id": document_id})

    await audit_log(
        action="document.pin_offline" if pinned else "document.unpin_offline",
        user_id=current_user["id"],
        resource_type="document",
        resource_id=document_id,
        estate_id=doc["estate_id"],
    )

    return {"document_id": document_id, "pinned_offline": bool(pinned)}


@router.put("/documents/{document_id}/ai-eligible")
async def set_document_ai_eligible(
    document_id: str,
    eligible: bool,
    current_user: dict = Depends(get_current_user),
):
    """Mark a document as eligible for inclusion in EGA / IAC analyses.

    Only documents the user explicitly opts in get their full text
    extracted and sent to the AI prompt. This both narrows the AI's
    attention to the documents that materially drive the analysis
    (will, trust, POA, deeds, life insurance, etc.) AND keeps the
    prompt within a sane token budget for grok-4.

    Only the estate owner (benefactor) can flag AI eligibility.
    Beneficiaries cannot toggle it on documents shared with them.
    """
    doc = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    estate = await db.estates.find_one(
        {"id": doc["estate_id"]},
        {"_id": 0, "id": 1, "owner_id": 1},
    )
    if not estate or estate.get("owner_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the estate owner can flag AI eligibility")

    # Cap the number of AI-eligible documents per estate at 5. This
    # keeps the AI prompt focused on the truly load-bearing estate
    # documents (will, trust, POA, deeds, life insurance) and keeps
    # token usage predictable. Lifting an already-eligible doc OFF
    # never trips this guard.
    if eligible and not doc.get("ai_eligible"):
        current_count = await db.documents.count_documents(
            {
                "estate_id": doc["estate_id"],
                "ai_eligible": True,
                "deleted_at": None,
            }
        )
        if current_count >= 5:
            raise HTTPException(
                status_code=400,
                detail="You can select up to 5 documents for AI analysis. Deselect one first.",
            )

    await db.documents.update_one(
        {"id": document_id},
        {
            "$set": {
                "ai_eligible": bool(eligible),
                "ai_eligible_at": datetime.now(timezone.utc).isoformat() if eligible else None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    await audit_log(
        action="document.ai_eligible_on" if eligible else "document.ai_eligible_off",
        user_id=current_user["id"],
        resource_type="document",
        resource_id=document_id,
        estate_id=doc["estate_id"],
    )

    return {"document_id": document_id, "ai_eligible": bool(eligible)}
