"""
CarryOn Backend — Chunked Resumable Upload (Tier B Phase 9)
============================================================================
Generic resumable chunked upload endpoint. The client initiates an upload,
streams chunks (any size, typically 5 MB), and finalizes by calling complete
with a target kind. On complete, chunks are reassembled and the finalized
blob is routed to the appropriate feature-specific handler (DAV document,
milestone media, chat attachment) using the existing per-feature upload
helpers.

Why this exists:
- A user on a plane records a 5-minute video message (~50 MB) and must be
  able to queue it locally and have it upload reliably when signal returns.
- Cellular networks drop mid-upload. A single POST of 50 MB dies. Chunks
  with `Content-Range` semantics can resume from where they left off.

Flow:
  1. POST /api/uploads/chunked/init   → returns { upload_id }
  2. PUT  /api/uploads/chunked/{upload_id}/chunk  (Content-Range header)
  3. POST /api/uploads/chunked/{upload_id}/complete { kind, metadata }
     → routes reassembled file to the right feature and returns the
       canonical resource record.

Chunks live under /tmp/carryon-uploads/{upload_id}/part-N. The upload_id
is a UUID and the owner is recorded in a Mongo `chunked_uploads` doc so a
malicious user cannot finalize someone else's partial upload.
"""

from __future__ import annotations

import os
import uuid
import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from utils import get_current_user
from config import db, logger


router = APIRouter(prefix="/uploads/chunked", tags=["uploads"])

# Max overall upload size per pending upload (safety net to cap disk usage).
MAX_UPLOAD_BYTES = 350 * 1024 * 1024  # 350 MB — caps 5-minute 720p video + headroom
# Max single chunk size. 5 MB is comfortable for cellular.
MAX_CHUNK_BYTES = 10 * 1024 * 1024  # 10 MB
# Where chunks live on-disk while the upload is in progress.
CHUNK_ROOT = Path(os.environ.get("CARRYON_CHUNK_UPLOAD_DIR", "/tmp/carryon-uploads"))
CHUNK_ROOT.mkdir(parents=True, exist_ok=True)


class InitRequest(BaseModel):
    filename: str
    total_bytes: int
    mime_type: str | None = None
    kind: str = Field(
        ..., description="Destination kind: 'document' | 'milestone_video' | 'milestone_audio' | 'chat_media'"
    )


class InitResponse(BaseModel):
    upload_id: str
    chunk_size: int = MAX_CHUNK_BYTES


class CompleteRequest(BaseModel):
    kind: str
    metadata: dict | None = None


@router.post("/init", response_model=InitResponse)
async def init_chunked_upload(body: InitRequest, user: dict = Depends(get_current_user)):
    if body.total_bytes <= 0 or body.total_bytes > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large or invalid size")
    if body.kind not in ("document", "milestone_video", "milestone_audio", "chat_media"):
        raise HTTPException(status_code=400, detail=f"Unknown upload kind '{body.kind}'")
    upload_id = str(uuid.uuid4())
    folder = CHUNK_ROOT / upload_id
    folder.mkdir(parents=True, exist_ok=True)
    await db.chunked_uploads.insert_one(
        {
            "id": upload_id,
            "user_id": user["id"],
            "filename": body.filename,
            "mime_type": body.mime_type,
            "total_bytes": body.total_bytes,
            "kind": body.kind,
            "chunks_received": [],
            "bytes_received": 0,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    logger.info(f"[upload] init id={upload_id} user={user['id']} kind={body.kind} size={body.total_bytes}")
    return InitResponse(upload_id=upload_id)


@router.put("/{upload_id}/chunk")
async def upload_chunk(upload_id: str, request: Request, user: dict = Depends(get_current_user)):
    record = await db.chunked_uploads.find_one({"id": upload_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Upload not found")
    if record["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your upload")
    if record["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Upload is {record['status']}")

    content_range = request.headers.get("content-range", "")
    # Format: "bytes <start>-<end>/<total>"
    if not content_range.startswith("bytes "):
        raise HTTPException(status_code=400, detail="Missing Content-Range header")
    try:
        spec = content_range[6:].strip()
        range_part, total_part = spec.split("/")
        start_s, end_s = range_part.split("-")
        start = int(start_s)
        end = int(end_s)
        total = int(total_part)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Content-Range: {exc}")

    if total != record["total_bytes"]:
        raise HTTPException(status_code=400, detail="Content-Range total mismatch")
    chunk_bytes = end - start + 1
    if chunk_bytes <= 0 or chunk_bytes > MAX_CHUNK_BYTES:
        raise HTTPException(status_code=400, detail="Chunk out of bounds")

    body = await request.body()
    if len(body) != chunk_bytes:
        raise HTTPException(status_code=400, detail=f"Body length {len(body)} != range {chunk_bytes}")

    chunk_index = start // MAX_CHUNK_BYTES
    folder = CHUNK_ROOT / upload_id
    part_path = folder / f"part-{chunk_index:06d}"
    part_path.write_bytes(body)

    await db.chunked_uploads.update_one(
        {"id": upload_id}, {"$addToSet": {"chunks_received": chunk_index}, "$inc": {"bytes_received": chunk_bytes}}
    )
    return {"ok": True, "chunk_index": chunk_index, "bytes_received": record["bytes_received"] + chunk_bytes}


@router.post("/{upload_id}/complete")
async def complete_chunked_upload(upload_id: str, body: CompleteRequest, user: dict = Depends(get_current_user)):
    record = await db.chunked_uploads.find_one({"id": upload_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Upload not found")
    if record["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your upload")
    if record["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Upload is {record['status']}")

    folder = CHUNK_ROOT / upload_id
    if not folder.exists():
        raise HTTPException(status_code=500, detail="Chunk folder missing")

    # Reassemble in order.
    expected_count = (record["total_bytes"] + MAX_CHUNK_BYTES - 1) // MAX_CHUNK_BYTES
    received = sorted(record.get("chunks_received", []))
    missing = [i for i in range(expected_count) if i not in received]
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing chunks: {missing[:5]}{'...' if len(missing) > 5 else ''}")

    assembled = folder / "_assembled.bin"
    with assembled.open("wb") as out:
        for i in range(expected_count):
            part = folder / f"part-{i:06d}"
            out.write(part.read_bytes())

    # Feature-specific routing. We keep routing light: this endpoint returns
    # a URL/path the client can reference; the per-feature finalizer handlers
    # are intentionally isolated below so each feature team can evolve their
    # own storage strategy.
    try:
        result = await _finalize_by_kind(body.kind, body.metadata or {}, assembled, record, user)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"[upload] finalize kind={body.kind} id={upload_id} failed")
        raise HTTPException(status_code=500, detail=f"Finalize failed: {exc}")
    finally:
        # Always clean up local chunks even if finalize failed — they'd
        # otherwise fill the pod's /tmp.
        try:
            shutil.rmtree(folder)
        except Exception:
            pass

    await db.chunked_uploads.update_one(
        {"id": upload_id}, {"$set": {"status": "complete", "completed_at": datetime.now(timezone.utc).isoformat()}}
    )
    return JSONResponse(content={"ok": True, "upload_id": upload_id, "result": result})


async def _finalize_by_kind(kind: str, metadata: dict, assembled_path: Path, record: dict, user: dict):
    """
    Route reassembled bytes to the correct feature finalizer.
    Each branch returns a small JSON-serializable dict describing where
    the resource now lives so the client can update its UI.

    Feature-specific metadata contract:
      document         → {estate_id, name, category, lock_type?, lock_password?, file_type?}
      milestone_video  → EITHER {message_id}  (append to existing message)
                          OR    {message_create: MessageCreate-dict, video_thumbnail?}
                                (offline path: create message + attach video atomically)
      milestone_audio  → EITHER {message_id}  (append voice to existing message)
                          OR    {message_create: MessageCreate-dict}
      chat_media       → {estate_id, channel_id}  (reserved — not wired yet)
    """
    if kind == "document":
        return await _finalize_document(metadata, assembled_path, record, user)
    if kind == "milestone_video":
        return await _finalize_milestone_media(metadata, assembled_path, record, user, media="video")
    if kind == "milestone_audio":
        return await _finalize_milestone_media(metadata, assembled_path, record, user, media="audio")
    if kind == "chat_media":
        # Reserved. Left as a placeholder — no client currently posts with
        # this kind. When estate-chat offline attachments land we'll wire
        # the chat-media path here (see Phase 9a).
        return {
            "kind": "chat_media",
            "size_bytes": assembled_path.stat().st_size,
            "note": "chat_media finalizer reserved — not yet wired.",
        }
    raise HTTPException(status_code=400, detail=f"Unknown kind '{kind}'")


# ── Per-feature finalizers ─────────────────────────────────────────────────


async def _finalize_document(metadata: dict, assembled_path: Path, record: dict, user: dict):
    """Create a Document row + encrypted blob from reassembled chunks.

    Mirrors the essential pipeline from `routes.documents.upload_document`
    (AES-256-GCM, cloud storage, audit log, activity log, readiness bump)
    so that an offline-queued upload produces the same artefacts as a
    live multipart POST would have.
    """
    # Lazy imports keep the module import graph small and avoid circular
    # imports when `documents.py` is loaded later.
    from guards import require_benefactor_role, get_subscription_access
    from models import Document
    from services.audit import audit_log
    from services.encryption import encrypt_aes256, get_estate_salt
    from services.storage import storage
    from utils import generate_backup_code, hash_password, log_activity, update_estate_readiness

    estate_id = (metadata or {}).get("estate_id")
    name = (metadata or {}).get("name")
    category = (metadata or {}).get("category")
    lock_type = (metadata or {}).get("lock_type") or None
    lock_password = (metadata or {}).get("lock_password") or None
    file_type = (metadata or {}).get("file_type") or record.get("mime_type") or "application/octet-stream"

    if not estate_id or not name or not category:
        raise HTTPException(status_code=400, detail="document finalizer requires estate_id, name, category")

    access = await get_subscription_access(user)
    if not access["has_access"]:
        raise HTTPException(status_code=403, detail="Subscription required to upload documents.")
    require_benefactor_role(user, "upload documents")

    # Ownership check (match documents.upload_document)
    if user.get("role") == "admin":
        estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    else:
        estate = await db.estates.find_one({"id": estate_id, "owner_id": user["id"]}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=403, detail="Access denied — you do not own this estate")

    size = assembled_path.stat().st_size
    MAX_DOC_SIZE = 25 * 1024 * 1024
    if size > MAX_DOC_SIZE:
        raise HTTPException(status_code=413, detail="Document too large. Max 25 MB.")

    content = assembled_path.read_bytes()
    estate_salt = await get_estate_salt(estate_id)
    encrypted_b64 = encrypt_aes256(content, estate_salt)

    backup_code = generate_backup_code() if lock_type else None
    password_hash = hash_password(lock_password) if lock_password and lock_type == "password" else None

    document = Document(
        estate_id=estate_id,
        name=name,
        category=category,
        file_type=file_type,
        file_size=size,
        file_data=None,
        is_locked=lock_type is not None,
        lock_type=lock_type,
        lock_password_hash=password_hash,
        backup_code=backup_code,
        is_encrypted=True,
        uploaded_by=user["id"],
    )

    storage_key = await storage.upload(encrypted_b64.encode("ascii"), estate_id, document.id, file_type)

    doc_dict = document.model_dump()
    doc_dict["storage_key"] = storage_key
    doc_dict["encryption_version"] = "aes-256-gcm"
    await db.documents.insert_one(doc_dict)
    doc_dict.pop("_id", None)

    await update_estate_readiness(estate_id)
    await audit_log(
        action="document.upload",
        user_id=user["id"],
        resource_type="document",
        resource_id=document.id,
        estate_id=estate_id,
        details={
            "name": name,
            "category": category,
            "size": size,
            "encrypted": True,
            "encryption": "AES-256-GCM",
            "storage": "cloud",
            "source": "chunked",
        },
    )
    await log_activity(
        estate_id=estate_id,
        user_id=user["id"],
        user_name=user.get("name", ""),
        action="document_uploaded",
        description=f"Uploaded document: {name} ({category})",
        metadata={"document_name": name, "category": category, "is_locked": lock_type is not None},
    )

    result = {
        "kind": "document",
        "id": document.id,
        "name": document.name,
        "size_bytes": size,
        "estate_id": estate_id,
    }
    if backup_code:
        result["backup_code"] = backup_code
    return result


async def _finalize_milestone_media(metadata: dict, assembled_path: Path, record: dict, user: dict, *, media: str):
    """Attach reassembled bytes to a milestone message as video or voice.

    Supports two modes:
      1) Append to existing message: metadata = {message_id}. The caller
         already POST'd /messages online and is now streaming a video
         too large for a single multipart upload.
      2) Offline create-and-attach: metadata = {message_create: {...}}.
         The caller composed the whole message while offline; we create
         the Message row here in a single shot and then attach the blob.
    """
    from guards import require_benefactor_role, get_subscription_access
    from models import Message
    from services.audit import audit_log
    from services.encryption import encrypt_aes256, get_estate_salt, encrypt_field
    from services.storage import storage
    from utils import log_activity, update_estate_readiness

    media = "video" if media == "video" else "audio"
    existing_id = (metadata or {}).get("message_id")
    create_payload = (metadata or {}).get("message_create")

    if not existing_id and not create_payload:
        raise HTTPException(status_code=400, detail="milestone finalizer needs message_id or message_create")

    require_benefactor_role(user, "create messages")
    access = await get_subscription_access(user)
    if not access["has_access"]:
        raise HTTPException(status_code=403, detail="Subscription required to create milestone messages.")

    # Resolve the target message (either existing or freshly created).
    if existing_id:
        message = await db.messages.find_one({"id": existing_id}, {"_id": 0})
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
        estate = await db.estates.find_one({"id": message["estate_id"]}, {"_id": 0})
        if not estate or (estate.get("owner_id") != user["id"] and user.get("role") != "admin"):
            raise HTTPException(status_code=403, detail="Access denied")
        estate_id = message["estate_id"]
        message_id = existing_id
        created_new = False
    else:
        estate_id = create_payload.get("estate_id")
        if not estate_id:
            raise HTTPException(status_code=400, detail="message_create.estate_id required")
        estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
        if not estate or (estate.get("owner_id") != user["id"] and user.get("role") != "admin"):
            raise HTTPException(status_code=403, detail="Access denied")

        estate_salt = await get_estate_salt(estate_id)
        new_msg = Message(
            estate_id=estate_id,
            title=create_payload.get("title") or "Milestone Message",
            content=create_payload.get("content") or "",
            message_type=create_payload.get("message_type") or media,
            recipients=create_payload.get("recipients") or [],
            trigger_type=create_payload.get("trigger_type") or "immediate",
            trigger_value=create_payload.get("trigger_value"),
            trigger_age=create_payload.get("trigger_age"),
            created_by=user["id"],
        )
        msg_dict = new_msg.model_dump()
        if create_payload.get("trigger_date"):
            msg_dict["trigger_date"] = create_payload["trigger_date"]
        if create_payload.get("custom_event_label"):
            msg_dict["custom_event_label"] = create_payload["custom_event_label"]
        # Zero-knowledge: encrypt title + content, strip plaintext.
        msg_dict["encrypted_title"] = encrypt_field(new_msg.title, estate_salt)
        msg_dict["encrypted_content"] = encrypt_field(new_msg.content, estate_salt)
        msg_dict["title"] = (new_msg.title or "")[:50]
        msg_dict.pop("content", None)
        if create_payload.get("video_thumbnail") and media == "video":
            msg_dict["video_thumbnail"] = create_payload["video_thumbnail"]
        await db.messages.insert_one(msg_dict)
        message_id = new_msg.id
        created_new = True

    # Encrypt + upload the reassembled blob.
    blob = assembled_path.read_bytes()
    estate_salt = await get_estate_salt(estate_id)
    encrypted = encrypt_aes256(blob, estate_salt)
    if media == "video":
        media_id = f"video_{message_id}"
        content_type = record.get("mime_type") or "video/mp4"
        await storage.upload(encrypted.encode("ascii"), estate_id, media_id, content_type)
        await db.messages.update_one({"id": message_id}, {"$set": {"video_url": media_id}})
    else:
        media_id = f"voice_{message_id}"
        content_type = record.get("mime_type") or "audio/webm"
        await storage.upload(encrypted.encode("ascii"), estate_id, media_id, content_type)
        await db.messages.update_one({"id": message_id}, {"$set": {"voice_url": media_id}})

    await update_estate_readiness(estate_id)
    await audit_log(
        action=f"message.{media}_upload",
        user_id=user["id"],
        resource_type="message",
        resource_id=message_id,
        estate_id=estate_id,
        details={"size": assembled_path.stat().st_size, "encrypted": True, "source": "chunked"},
    )
    if created_new:
        await log_activity(
            estate_id=estate_id,
            user_id=user["id"],
            user_name=user.get("name", ""),
            action="message_created",
            description=f"Created milestone ({media}) via offline queue",
            metadata={"source": "chunked"},
        )

    return {
        "kind": f"milestone_{media}",
        "message_id": message_id,
        "media_id": media_id,
        "created_new_message": created_new,
        "size_bytes": assembled_path.stat().st_size,
        "estate_id": estate_id,
    }


@router.get("/{upload_id}/status")
async def upload_status(upload_id: str, user: dict = Depends(get_current_user)):
    record = await db.chunked_uploads.find_one({"id": upload_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Upload not found")
    if record["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your upload")
    expected_count = (record["total_bytes"] + MAX_CHUNK_BYTES - 1) // MAX_CHUNK_BYTES
    return {
        "status": record["status"],
        "bytes_received": record["bytes_received"],
        "total_bytes": record["total_bytes"],
        "chunks_received": sorted(record.get("chunks_received", [])),
        "expected_chunks": expected_count,
    }
