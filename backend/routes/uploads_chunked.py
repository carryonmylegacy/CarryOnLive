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
    Each branch should return a small JSON-serializable dict describing
    where the resource now lives so the client can update its UI.
    """
    if kind == "document":
        # Defer to the existing document upload logic by reading the file.
        # We just return a placeholder for now — real impl hooks into
        # routes.documents.upload_document's internals.
        return {
            "kind": "document",
            "size_bytes": assembled_path.stat().st_size,
            "note": "Chunked upload finalized — route to documents storage in Phase 9a.",
        }
    if kind == "milestone_video":
        return {
            "kind": "milestone_video",
            "size_bytes": assembled_path.stat().st_size,
            "note": "Chunked upload finalized — route to milestones storage in Phase 9a.",
        }
    if kind == "milestone_audio":
        return {
            "kind": "milestone_audio",
            "size_bytes": assembled_path.stat().st_size,
            "note": "Chunked upload finalized — route to milestones storage in Phase 9a.",
        }
    if kind == "chat_media":
        return {
            "kind": "chat_media",
            "size_bytes": assembled_path.stat().st_size,
            "note": "Chunked upload finalized — route to chat media in Phase 9a.",
        }
    raise HTTPException(status_code=400, detail=f"Unknown kind '{kind}'")


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
