"""CarryOn™ Backend — Milestone Message Routes

Architecture:
- Message title and content encrypted with AES-256-GCM at rest
- Video data encrypted and stored in cloud storage
- Per-estate derived encryption keys
"""

import base64
import subprocess
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query as QueryParam, Response, UploadFile

from config import db, logger
from guards import require_benefactor_role, require_estate_owner
from models import Message, MessageCreate, MessageUpdate
from services.access_control import can_access_message, require_estate_actor
from services.audit import audit_log
from services.encryption import (
    decrypt_aes256,
    decrypt_field,
    encrypt_aes256,
    encrypt_field,
    get_estate_salt,
)
from services.storage import storage
from utils import get_current_user, log_activity, update_estate_readiness

router = APIRouter()

# Temporary download tokens (in-memory, short-lived)
_download_tokens: dict[str, dict] = {}


@router.post("/messages/{message_id}/download-token")
async def create_download_token(message_id: str, current_user: dict = Depends(get_current_user)):
    """Create a short-lived token for direct browser downloads (iOS Safari)."""
    msg = await db.messages.find_one(
        {"id": message_id},
        {
            "_id": 0,
            "id": 1,
            "estate_id": 1,
            "video_url": 1,
            "voice_url": 1,
            "recipients": 1,
            "is_delivered": 1,
            "delivered_recipient_ids": 1,
            "recipient_delivery_status": 1,
            "deleted_at": 1,
        },
    )
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    actor = await require_estate_actor(msg["estate_id"], current_user, allow_staff=True)
    if not can_access_message(msg, actor):
        raise HTTPException(status_code=403, detail="Access denied")

    token = str(uuid.uuid4())
    _download_tokens[token] = {
        "message_id": message_id,
        "user_id": current_user["id"],
        "created_at": datetime.now(timezone.utc),
        "video_url": msg.get("video_url"),
        "voice_url": msg.get("voice_url"),
        "estate_id": msg["estate_id"],
    }
    # Clean up old tokens (older than 5 minutes)
    cutoff = datetime.now(timezone.utc).timestamp() - 300
    expired = [k for k, v in _download_tokens.items() if v["created_at"].timestamp() < cutoff]
    for k in expired:
        del _download_tokens[k]

    return {"token": token}


# ===================== HELPERS =====================


async def _decrypt_message(msg: dict, estate_salt: bytes) -> dict:
    """Decrypt encrypted message fields. Handles both legacy and new format."""
    result = {**msg}

    # Decrypt title if encrypted
    if msg.get("encrypted_title"):
        try:
            result["title"] = decrypt_field(msg["encrypted_title"], estate_salt)
        except Exception:
            result["title"] = msg.get("title", "[Decryption error]")
    # Decrypt content if encrypted
    if msg.get("encrypted_content"):
        try:
            result["content"] = decrypt_field(msg["encrypted_content"], estate_salt)
        except Exception:
            result["content"] = msg.get("content", "[Decryption error]")

    # Remove encrypted fields from response
    result.pop("encrypted_title", None)
    result.pop("encrypted_content", None)
    return result


# ===================== MESSAGE ROUTES =====================


@router.get("/messages/{estate_id}")
async def get_messages(estate_id: str, current_user: dict = Depends(get_current_user)):
    """List all milestone messages for an estate."""
    estate_salt = await get_estate_salt(estate_id)

    actor = await require_estate_actor(estate_id, current_user, allow_staff=True)
    messages = await db.messages.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(100)
    if not (actor["is_owner"] or actor["is_admin"] or actor["is_operator"]):
        messages = [msg for msg in messages if can_access_message(msg, actor)]

    # Decrypt message fields
    decrypted = []
    for msg in messages:
        decrypted.append(await _decrypt_message(msg, estate_salt))

    return decrypted


@router.get("/messages/video/{video_id}")
async def get_message_video(video_id: str, current_user: dict = Depends(get_current_user)):
    """Get video data for a message"""
    # Check if video is in cloud storage
    message = await db.messages.find_one({"video_url": video_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Video not found")
    actor = await require_estate_actor(message["estate_id"], current_user, allow_staff=True)
    if not can_access_message(message, actor):
        raise HTTPException(status_code=403, detail="Access denied")

    # Try cloud storage first
    video_storage_key = f"estates/{message['estate_id']}/{video_id}"
    try:
        encrypted_blob = await storage.download(video_storage_key)
        estate_salt = await get_estate_salt(message["estate_id"])
        decrypted = decrypt_aes256(encrypted_blob.decode("ascii"), estate_salt)

        await audit_log(
            action="message.video_access",
            user_id=current_user["id"],
            resource_type="video",
            resource_id=video_id,
            estate_id=message.get("estate_id") if message else None,
        )

        # Detect actual video format from magic bytes
        video_mime = (
            "video/mp4"
            if decrypted[:4]
            in (
                b"\x00\x00\x00\x18",
                b"\x00\x00\x00\x1c",
                b"\x00\x00\x00 ",
                b"\x00\x00\x00\x14",
            )
            or b"ftyp" in decrypted[:12]
            else "video/webm"
        )
        video_ext = "mp4" if video_mime == "video/mp4" else "webm"
        return Response(
            content=decrypted,
            media_type=video_mime,
            headers={"Content-Disposition": f'inline; filename="{video_id}.{video_ext}"'},
        )
    except FileNotFoundError:
        pass

    # Fallback to legacy MongoDB storage
    video = await db.video_storage.find_one({"id": video_id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        video_bytes = base64.b64decode(video["data"])
        video_mime = "video/mp4" if b"ftyp" in video_bytes[:12] else "video/webm"
        video_ext = "mp4" if video_mime == "video/mp4" else "webm"
        return Response(
            content=video_bytes,
            media_type=video_mime,
            headers={"Content-Disposition": f'inline; filename="{video_id}.{video_ext}"'},
        )
    except Exception as e:
        logger.error(f"Video decode error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve video")


@router.get("/messages/video-dl/{video_id}")
async def download_video_direct(video_id: str, dt: str = QueryParam(...)):
    """Direct video download using a short-lived download token.
    Used by iOS Safari to enable native 'Save Video' to Photos."""
    token_data = _download_tokens.pop(dt, None)
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid or expired download token")
    if token_data.get("video_url") != video_id:
        raise HTTPException(status_code=403, detail="Token does not match video")

    estate_id = token_data["estate_id"]
    video_storage_key = f"estates/{estate_id}/{video_id}"
    try:
        encrypted_blob = await storage.download(video_storage_key)
        estate_salt = await get_estate_salt(estate_id)
        decrypted = decrypt_aes256(encrypted_blob.decode("ascii"), estate_salt)
    except FileNotFoundError:
        # Try legacy MongoDB storage
        video = await db.video_storage.find_one({"id": video_id}, {"_id": 0})
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        try:
            decrypted = base64.b64decode(video["data"])
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to retrieve video")

    video_mime = (
        "video/mp4"
        if decrypted[:4] in (b"\x00\x00\x00\x18", b"\x00\x00\x00\x1c", b"\x00\x00\x00 ", b"\x00\x00\x00\x14")
        or b"ftyp" in decrypted[:12]
        else "video/webm"
    )

    # Convert WebM → MP4 for iOS compatibility (iOS Photos cannot save WebM)
    if video_mime == "video/webm":
        try:
            import os
            import tempfile

            try:
                import imageio_ffmpeg

                ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            except ImportError:
                ffmpeg_exe = "ffmpeg"

            inp_path = tempfile.mktemp(suffix=".webm")
            out_path = tempfile.mktemp(suffix=".mp4")
            try:
                with open(inp_path, "wb") as f:
                    f.write(decrypted)
                proc = subprocess.run(
                    [
                        ffmpeg_exe,
                        "-y",
                        "-i",
                        inp_path,
                        "-c:v",
                        "libx264",
                        "-preset",
                        "fast",
                        "-crf",
                        "23",
                        "-c:a",
                        "aac",
                        "-b:a",
                        "128k",
                        "-movflags",
                        "+faststart",
                        out_path,
                    ],
                    capture_output=True,
                    timeout=120,
                )
                if proc.returncode == 0:
                    with open(out_path, "rb") as f:
                        decrypted = f.read()
                    video_mime = "video/mp4"
                else:
                    logger.warning(f"WebM→MP4 conversion failed: {proc.stderr.decode()[:300]}")
            finally:
                for p in (inp_path, out_path):
                    try:
                        os.unlink(p)
                    except OSError:
                        pass
        except Exception as conv_err:
            logger.warning(f"Video conversion error: {conv_err}")

    video_ext = "mp4" if video_mime == "video/mp4" else "webm"
    return Response(
        content=decrypted,
        media_type=video_mime,
        headers={
            "Content-Disposition": f'attachment; filename="milestone-video.{video_ext}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/messages/voice/{voice_id}")
async def get_message_voice(voice_id: str, current_user: dict = Depends(get_current_user)):
    """Get voice recording data for a message"""
    message = await db.messages.find_one({"voice_url": voice_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Voice recording not found")
    actor = await require_estate_actor(message["estate_id"], current_user, allow_staff=True)
    if not can_access_message(message, actor):
        raise HTTPException(status_code=403, detail="Access denied")

    voice_storage_key = f"voices/{voice_id}"
    try:
        encrypted_blob = await storage.download(voice_storage_key)
        estate_salt = await get_estate_salt(message["estate_id"])
        decrypted = decrypt_aes256(encrypted_blob.decode("ascii"), estate_salt)

        await audit_log(
            action="message.voice_access",
            user_id=current_user["id"],
            resource_type="voice",
            resource_id=voice_id,
            estate_id=message.get("estate_id") if message else None,
        )

        return Response(
            content=decrypted,
            media_type="audio/webm",
            headers={"Content-Disposition": f'inline; filename="{voice_id}.webm"'},
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Voice recording not found")


@router.post("/messages")
async def create_message(data: MessageCreate, current_user: dict = Depends(get_current_user)):
    """Create a new milestone message with encrypted content."""
    require_benefactor_role(current_user, "create messages")

    # Enforce subscription requirement
    from guards import get_subscription_access

    access = await get_subscription_access(current_user)
    if not access["has_access"]:
        raise HTTPException(
            status_code=403,
            detail="Your free trial has ended. Subscribe to continue creating messages.",
        )

    estate_salt = await get_estate_salt(data.estate_id)

    message = Message(
        estate_id=data.estate_id,
        title=data.title,
        content=data.content,
        message_type=data.message_type,
        recipients=data.recipients,
        trigger_type=data.trigger_type,
        trigger_value=data.trigger_value,
        trigger_age=data.trigger_age,
        created_by=current_user["id"],
    )
    msg_dict = message.model_dump()
    if data.trigger_date:
        msg_dict["trigger_date"] = data.trigger_date
    if data.custom_event_label:
        msg_dict["custom_event_label"] = data.custom_event_label

    # Encrypt title and content
    msg_dict["encrypted_title"] = encrypt_field(data.title, estate_salt)
    msg_dict["encrypted_content"] = encrypt_field(data.content, estate_salt)
    # Zero-knowledge: do NOT store plaintext content in database
    # Only keep a truncated, non-sensitive display title for session listing
    msg_dict["title"] = data.title[:50] if data.title else ""  # Short display label only
    msg_dict.pop("content", None)  # Remove plaintext content — zero-knowledge compliant

    # Handle video data - encrypt and store in cloud
    if data.video_data:
        video_id = f"video_{message.id}"
        message.video_url = video_id
        msg_dict["video_url"] = video_id

        if data.video_thumbnail:
            msg_dict["video_thumbnail"] = data.video_thumbnail

        video_bytes = base64.b64decode(data.video_data)
        encrypted_video = encrypt_aes256(video_bytes, estate_salt)
        await storage.upload(
            encrypted_video.encode("ascii"),
            data.estate_id,
            video_id,
            "video/webm",
        )

    # Handle voice data - encrypt and store in cloud
    if data.voice_data:
        voice_id = f"voice_{message.id}"
        message.voice_url = voice_id
        msg_dict["voice_url"] = voice_id

        voice_bytes = base64.b64decode(data.voice_data)
        encrypted_voice = encrypt_aes256(voice_bytes, estate_salt)
        await storage.upload(
            encrypted_voice.encode("ascii"),
            data.estate_id,
            voice_id,
            "audio/webm",
        )

    await db.messages.insert_one(msg_dict)
    await update_estate_readiness(data.estate_id)

    await audit_log(
        action="message.create",
        user_id=current_user["id"],
        resource_type="message",
        resource_id=message.id,
        estate_id=data.estate_id,
        details={
            "type": data.message_type,
            "encrypted": True,
            "encryption": "AES-256-GCM",
        },
    )

    await log_activity(
        estate_id=data.estate_id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="message_created",
        description=f"Created {data.message_type} message: {data.title}",
        metadata={
            "message_title": data.title,
            "message_type": data.message_type,
            "trigger_type": data.trigger_type,
        },
    )

    return {"id": message.id, **message.model_dump()}


@router.post("/messages/{message_id}/upload-video")
async def upload_message_video(
    message_id: str,
    video: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload video for a message separately (supports large files)."""
    message = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    estate = await db.estates.find_one({"id": message["estate_id"]}, {"_id": 0})
    if not estate or (estate.get("owner_id") != current_user["id"] and current_user.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Access denied")

    estate_salt = await get_estate_salt(message["estate_id"])
    video_id = f"video_{message_id}"

    # Read video bytes
    video_bytes = await video.read()
    logger.info(f"Video upload for message {message_id}: {len(video_bytes)} bytes, type={video.content_type}")

    # Encrypt and store
    encrypted_video = encrypt_aes256(video_bytes, estate_salt)
    await storage.upload(
        encrypted_video.encode("ascii"),
        message["estate_id"],
        video_id,
        video.content_type or "video/mp4",
    )

    # Update message with video reference
    await db.messages.update_one({"id": message_id}, {"$set": {"video_url": video_id}})

    return {"success": True, "video_id": video_id}


@router.post("/messages/{message_id}/upload-attachment")
async def upload_message_attachment(
    message_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a document/image attachment for a milestone message."""
    message = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    estate = await db.estates.find_one({"id": message["estate_id"]}, {"_id": 0})
    if not estate or (estate.get("owner_id") != current_user["id"] and current_user.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Access denied")

    estate_salt = await get_estate_salt(message["estate_id"])
    attachment_id = f"attachment_{message_id}"

    file_bytes = await file.read()
    file_name = file.filename or "attachment"
    content_type = file.content_type or "application/octet-stream"
    logger.info(
        f"Attachment upload for message {message_id}: {len(file_bytes)} bytes, name={file_name}, type={content_type}"
    )

    # Encrypt and store
    encrypted = encrypt_aes256(file_bytes, estate_salt)
    await storage.upload(encrypted.encode("ascii"), message["estate_id"], attachment_id, content_type)

    await db.messages.update_one(
        {"id": message_id},
        {"$set": {"attachment_url": attachment_id, "attachment_name": file_name, "attachment_type": content_type}},
    )

    return {"success": True, "attachment_id": attachment_id, "file_name": file_name}


@router.get("/messages/{message_id}/attachment")
async def get_message_attachment(message_id: str, current_user: dict = Depends(get_current_user)):
    """Download a message attachment (decrypted)."""
    message = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    actor = await require_estate_actor(message.get("estate_id"), current_user, allow_staff=True)
    if not can_access_message(message, actor):
        raise HTTPException(status_code=403, detail="Access denied")

    attachment_url = message.get("attachment_url")
    if not attachment_url:
        raise HTTPException(status_code=404, detail="No attachment on this message")

    estate_salt = await get_estate_salt(message["estate_id"])

    # Construct the storage key (same format as upload)
    storage_key = f"estates/{message['estate_id']}/{attachment_url}"
    encrypted = await storage.download(storage_key)
    decrypted = decrypt_aes256(encrypted.decode("ascii"), estate_salt)

    file_name = message.get("attachment_name", "attachment")
    content_type = message.get("attachment_type", "application/octet-stream")

    return Response(
        content=decrypted,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


@router.put("/messages/{message_id}")
async def update_message(message_id: str, data: MessageUpdate, current_user: dict = Depends(get_current_user)):
    """Edit an existing message (benefactor only, before transition)"""
    require_benefactor_role(current_user, "edit messages")

    existing = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Message not found")
    # IDOR guard — only the estate owner (or admin) can edit a message.
    await require_estate_owner(existing.get("estate_id"), current_user)
    if (
        existing.get("is_delivered")
        or existing.get("delivered_recipient_ids")
        or existing.get("recipient_delivery_status")
    ):
        raise HTTPException(status_code=400, detail="Cannot edit a delivered message")

    estate_salt = await get_estate_salt(existing["estate_id"])
    update_fields = {}

    for field in [
        "title",
        "content",
        "message_type",
        "recipients",
        "trigger_type",
        "trigger_value",
        "trigger_age",
        "trigger_date",
        "custom_event_label",
    ]:
        val = getattr(data, field, None)
        if val is not None:
            update_fields[field] = val

    # Re-encrypt title and content if changed
    if data.title is not None:
        update_fields["encrypted_title"] = encrypt_field(data.title, estate_salt)
    if data.content is not None:
        update_fields["encrypted_content"] = encrypt_field(data.content, estate_salt)

    # Handle video update
    if data.video_data:
        video_id = f"video_{message_id}"
        video_bytes = base64.b64decode(data.video_data)
        encrypted_video = encrypt_aes256(video_bytes, estate_salt)
        await storage.upload(
            encrypted_video.encode("ascii"),
            existing["estate_id"],
            video_id,
            "video/webm",
        )
        update_fields["video_url"] = video_id
        if data.video_thumbnail:
            update_fields["video_thumbnail"] = data.video_thumbnail
    elif data.remove_video and existing.get("video_url"):
        video_key = f"videos/{existing['video_url']}"
        try:
            await storage.delete(video_key)
        except Exception:
            pass
        update_fields["video_url"] = None
        update_fields["video_thumbnail"] = None

    # Handle voice update
    if data.voice_data:
        voice_id = f"voice_{message_id}"
        voice_bytes = base64.b64decode(data.voice_data)
        encrypted_voice = encrypt_aes256(voice_bytes, estate_salt)
        await storage.upload(
            encrypted_voice.encode("ascii"),
            existing["estate_id"],
            voice_id,
            "audio/webm",
        )
        update_fields["voice_url"] = voice_id
    elif data.remove_voice and existing.get("voice_url"):
        voice_key = f"voices/{existing['voice_url']}"
        try:
            await storage.delete(voice_key)
        except Exception:
            pass
        update_fields["voice_url"] = None

    # Handle attachment removal
    if data.remove_attachment and existing.get("attachment_url"):
        try:
            await storage.delete(f"attachments/{existing['attachment_url']}")
        except Exception:
            pass
        update_fields["attachment_url"] = None
        update_fields["attachment_name"] = None
        update_fields["attachment_type"] = None

    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.messages.update_one({"id": message_id}, {"$set": update_fields})

        # Log edit to edit_history for timeline tracking
        changed_fields = [k for k in update_fields if k not in ("updated_at", "encrypted_title", "encrypted_content")]
        await db.edit_history.insert_one(
            {
                "id": str(uuid.uuid4()),
                "item_type": "message",
                "item_id": message_id,
                "estate_id": existing["estate_id"],
                "user_id": current_user["id"],
                "user_name": current_user.get("name", ""),
                "action": "edited",
                "changed_fields": changed_fields,
                "title": data.title or existing.get("title", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    updated = await db.messages.find_one({"id": message_id}, {"_id": 0})
    return await _decrypt_message(updated, estate_salt)


@router.delete("/messages/{message_id}")
async def delete_message(message_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a milestone message."""
    require_benefactor_role(current_user, "delete messages")

    message = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # IDOR guard — only the estate owner (or admin) can delete a message.
    await require_estate_owner(message.get("estate_id"), current_user)

    # Delete video from storage if exists
    if message.get("video_url"):
        video_key = f"videos/{message['video_url']}"
        await storage.delete(video_key)

    result = await db.messages.update_one(
        {"id": message_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )  # soft_delete
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")

    await audit_log(
        action="message.delete",
        user_id=current_user["id"],
        resource_type="message",
        resource_id=message_id,
        estate_id=message.get("estate_id"),
    )

    return {"message": "Message deleted"}


@router.get("/messages/{message_id}/download")
async def download_message(message_id: str, current_user: dict = Depends(get_current_user)):
    """Download a milestone message as a file.

    - text → PDF
    - voice → webm audio redirect
    - video → mp4/webm redirect
    """
    message = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    actor = await require_estate_actor(message["estate_id"], current_user, allow_staff=True)
    estate = actor["estate"]
    if not can_access_message(message, actor):
        raise HTTPException(status_code=403, detail="Access denied")

    estate_salt = await get_estate_salt(message["estate_id"])
    decrypted = await _decrypt_message(message, estate_salt)

    msg_type = decrypted.get("message_type", "text")

    if msg_type == "video" and decrypted.get("video_url"):
        # Redirect to the existing video endpoint for streaming download
        from fastapi.responses import RedirectResponse

        return RedirectResponse(url=f"/api/messages/video/{decrypted['video_url']}")

    if msg_type == "voice" and decrypted.get("voice_url"):
        from fastapi.responses import RedirectResponse

        return RedirectResponse(url=f"/api/messages/voice/{decrypted['voice_url']}")

    # Text messages → generate a simple PDF
    title = decrypted.get("title", "Milestone Message")
    content = decrypted.get("content", "")
    created = decrypted.get("created_at", "")

    pdf_bytes = _build_text_pdf(title, content, created, estate.get("name", ""))

    await audit_log(
        action="message.download",
        user_id=current_user["id"],
        resource_type="message",
        resource_id=message_id,
        estate_id=message.get("estate_id"),
    )

    safe_title = "".join(c for c in title if c.isalnum() or c in " _-")[:40].strip() or "message"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.pdf"'},
    )


def _pdf_safe(text: str) -> str:
    """Replace common Unicode characters with Latin-1 safe equivalents for PDF."""
    replacements = {
        "\u2018": "'",
        "\u2019": "'",  # smart single quotes
        "\u201c": '"',
        "\u201d": '"',  # smart double quotes
        "\u2014": "--",
        "\u2013": "-",  # em/en dash
        "\u2026": "...",  # ellipsis
        "\u2022": "*",  # bullet
        "\u2122": "(TM)",  # trademark
        "\u00a9": "(c)",  # copyright
        "\u00ae": "(R)",  # registered
        "\u2764": "<3",  # heart
        "\u2665": "<3",  # heart suit
        "\u2003": " ",
        "\u2002": " ",
        "\u00a0": " ",  # special spaces
        "\u200b": "",
        "\u200c": "",
        "\u200d": "",
        "\ufeff": "",  # zero-width
    }
    for char, repl in replacements.items():
        text = text.replace(char, repl)
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _build_text_pdf(title: str, content: str, created: str, estate_name: str) -> bytes:
    """Build a valid PDF from message text using fpdf2."""
    from fpdf import FPDF

    title = _pdf_safe(title)
    content = _pdf_safe(content)
    estate_name = _pdf_safe(estate_name)

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=40)
    pdf.add_page()

    # Title
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 12, title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # Estate name
    if estate_name:
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 7, f"Estate: {estate_name}", new_x="LMARGIN", new_y="NEXT")

    # Date
    if created:
        display_date = created[:10] if len(created) >= 10 else created
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 7, f"Date: {display_date}", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(6)

    # Content body
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(0, 7, content)

    # Footer
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, "Generated by CarryOn Estate Planning", align="C")

    return bytes(pdf.output())
