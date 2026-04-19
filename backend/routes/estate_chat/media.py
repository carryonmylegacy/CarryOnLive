"""Estate Chat — file upload and media serving."""

from ._core import router, ALLOWED_FILE_TYPES, MAX_FILE_SIZE, MAX_VIDEO_SIZE, MAX_BATCH_FILES
from fastapi import Depends, File, HTTPException, UploadFile
from utils import get_current_user, send_push_notification
from config import db
from uuid import uuid4
from datetime import datetime, timezone


@router.post("/estate-chat/channels/{channel_id}/upload")
async def upload_attachment(
    channel_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a file/image and send it as a message attachment."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    if file.content_type not in ALLOWED_FILE_TYPES:
        # Also allow by checking the base MIME type (e.g. "audio/mp4" from "audio/mp4;codecs=...")
        base_type = (file.content_type or "").split(";")[0].strip()
        if base_type not in ALLOWED_FILE_TYPES:
            raise HTTPException(status_code=400, detail=f"File type not allowed: {file.content_type}")
    data = await file.read()
    is_video = file.content_type and file.content_type.startswith("video/")
    size_limit = MAX_VIDEO_SIZE if is_video else MAX_FILE_SIZE
    if len(data) > size_limit:
        limit_mb = size_limit // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"File too large (max {limit_mb} MB)")
    file_id = str(uuid4())
    storage_key = f"chat/{channel.get('estate_id', 'unknown')}/{file_id}"
    try:
        from services.storage import storage

        await storage.upload_raw(data, storage_key, file.content_type or "application/octet-stream")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to store file")
    now = datetime.now(timezone.utc).isoformat()
    is_image = file.content_type and file.content_type.startswith("image/")
    is_audio = file.content_type and (file.content_type.startswith("audio/") or file.content_type == "video/webm")
    msg_type = "image" if is_image else ("voice" if is_audio else "file")
    message = {
        "id": str(uuid4()),
        "channel_id": channel_id,
        "estate_id": channel.get("estate_id", ""),
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", "Unknown"),
        "content": file.filename or "Attachment",
        "message_type": msg_type,
        "attachment": {
            "file_id": file_id,
            "file_name": file.filename or "file",
            "file_type": file.content_type or "",
            "file_size": len(data),
            "storage_key": storage_key,
        },
        "reactions": [],
        "created_at": now,
    }
    await db.estate_messages.insert_one({k: v for k, v in message.items()})
    await db.estate_channel_reads.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    await db.estate_typing.delete_one(
        {"channel_id": channel_id, "user_id": current_user["id"]}
    )  # cleanup ephemeral typing indicator
    # Un-dismiss channel for all members so they see new activity
    await db.estate_channel_dismissals.delete_many({"channel_id": channel_id})  # cleanup: un-dismiss on new message

    # Push notifications to all channel members except sender
    other_members = [m for m in channel.get("members", []) if m != current_user["id"] and not m.startswith("ffn_")]
    if other_members:
        import asyncio

        sender_name = current_user.get("name", "Unknown")
        channel_name = channel.get("name", "Chat")
        body = f"Sent a {msg_type}" if msg_type in ("image", "video") else "Sent a file"
        for member_id in other_members:
            asyncio.create_task(
                send_push_notification(
                    user_id=member_id,
                    title=f"{sender_name} in {channel_name}",
                    body=body,
                    url="/estate-chat",
                    tag=f"ect-{channel_id}",
                    notification_type="ect_message",
                )
            )

    return message


@router.post("/estate-chat/channels/{channel_id}/upload-multi")
async def upload_multi_attachment(
    channel_id: str,
    files: list[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload multiple files and send as a single grouped message."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_BATCH_FILES} files at once")

    from services.storage import storage

    attachments = []
    for f in files:
        base_type = (f.content_type or "").split(";")[0].strip()
        if f.content_type not in ALLOWED_FILE_TYPES and base_type not in ALLOWED_FILE_TYPES:
            raise HTTPException(status_code=400, detail=f"File type not allowed: {f.content_type}")
        data = await f.read()
        is_video = f.content_type and f.content_type.startswith("video/")
        size_limit = MAX_VIDEO_SIZE if is_video else MAX_FILE_SIZE
        if len(data) > size_limit:
            limit_mb = size_limit // (1024 * 1024)
            raise HTTPException(
                status_code=400,
                detail=f"{f.filename} too large (max {limit_mb} MB for {'video' if is_video else 'files'})",
            )
        fid = str(uuid4())
        storage_key = f"chat/{channel.get('estate_id', 'unknown')}/{fid}"
        try:
            await storage.upload_raw(data, storage_key, f.content_type or "application/octet-stream")
        except Exception:
            raise HTTPException(status_code=500, detail=f"Failed to store {f.filename}")
        attachments.append(
            {
                "file_id": fid,
                "file_name": f.filename or "file",
                "file_type": f.content_type or "",
                "file_size": len(data),
                "storage_key": storage_key,
            }
        )

    now = datetime.now(timezone.utc).isoformat()
    # Determine message type from the first attachment
    first_type = attachments[0]["file_type"] if attachments else ""
    is_image = first_type.startswith("image/")
    is_video = first_type.startswith("video/")
    msg_type = "image" if is_image else ("video" if is_video else "file")
    if len(attachments) > 1:
        msg_type = "media_group"

    file_names = [a["file_name"] for a in attachments]
    message = {
        "id": str(uuid4()),
        "channel_id": channel_id,
        "estate_id": channel.get("estate_id", ""),
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", "Unknown"),
        "content": ", ".join(file_names),
        "message_type": msg_type,
        "attachment": attachments[0],  # backward compat
        "attachments": attachments,
        "reactions": [],
        "created_at": now,
    }
    await db.estate_messages.insert_one({k: v for k, v in message.items()})
    await db.estate_channel_reads.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    await db.estate_typing.delete_one({"channel_id": channel_id, "user_id": current_user["id"]})
    await db.estate_channel_dismissals.delete_many({"channel_id": channel_id})

    # Push notifications to all channel members except sender
    other_members = [m for m in channel.get("members", []) if m != current_user["id"] and not m.startswith("ffn_")]
    if other_members:
        import asyncio

        sender_name = current_user.get("name", "Unknown")
        channel_name = channel.get("name", "Chat")
        file_count = len(attachments)
        body = f"Sent {file_count} file{'s' if file_count > 1 else ''}"
        for member_id in other_members:
            asyncio.create_task(
                send_push_notification(
                    user_id=member_id,
                    title=f"{sender_name} in {channel_name}",
                    body=body,
                    url="/estate-chat",
                    tag=f"ect-{channel_id}",
                    notification_type="ect_message",
                )
            )

    return message


@router.get("/estate-chat/files/{file_id}")
async def serve_chat_file(
    file_id: str,
    variant: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """Serve a chat attachment file.

    Query params:
        variant: "thumb" → returns a 480-px longest-side JPEG (~50-80 KB),
                 suitable for chat-bubble previews. Anything else or omitted
                 returns the original raw file (used for full-screen preview
                 and download).

    Supports both Bearer header auth and ?token= query param (for img src / window.open).
    """
    from fastapi.responses import Response
    from services.storage import storage

    # Search both single 'attachment' and multi 'attachments' array
    msg = await db.estate_messages.find_one(
        {
            "$or": [
                {"attachment.file_id": file_id},
                {"attachments.file_id": file_id},
            ]
        },
        {"_id": 0, "id": 1, "channel_id": 1, "attachment": 1, "attachments": 1},
    )
    if not msg:
        raise HTTPException(status_code=404, detail="File not found")
    channel = await db.estate_channels.find_one({"id": msg["channel_id"]}, {"_id": 0, "id": 1, "members": 1})
    if not channel or current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Access denied")
    # Find the matching attachment
    att = None
    if msg.get("attachment", {}).get("file_id") == file_id:
        att = msg["attachment"]
    else:
        for a in msg.get("attachments", []):
            if a.get("file_id") == file_id:
                att = a
                break
    if not att:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data = await storage.download_raw(att["storage_key"])
    except Exception:
        raise HTTPException(status_code=404, detail="File not found in storage")

    file_type = att.get("file_type", "application/octet-stream")
    is_image = file_type.startswith("image/")

    # Thumbnail variant: server-side resize to 480px longest side.
    # A typical 5-10 MB iPhone photo becomes a 50-80 KB JPEG — a 60-100×
    # reduction that transforms chat bubble load time from ~3-5s to ~200ms
    # on mobile networks. HEIC is decoded by pillow-heif when available;
    # if that's missing we fall back to the original file.
    if variant == "thumb" and is_image:
        try:
            from io import BytesIO
            from PIL import Image

            try:
                # Ensure HEIC/HEIF support if the installed pillow_heif is present.
                import pillow_heif  # type: ignore

                pillow_heif.register_heif_opener()
            except Exception:
                pass

            img = Image.open(BytesIO(data))
            # Respect EXIF orientation so portrait photos don't arrive sideways.
            try:
                from PIL import ImageOps

                img = ImageOps.exif_transpose(img)
            except Exception:
                pass
            img.thumbnail((480, 480), Image.LANCZOS)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=82, optimize=True, progressive=True)
            thumb_bytes = buf.getvalue()
            return Response(
                content=thumb_bytes,
                media_type="image/jpeg",
                headers={
                    "Content-Disposition": f'inline; filename="thumb-{att.get("file_name", "file")}.jpg"',
                    # Chat file IDs are UUIDs → content is immutable → safe to
                    # cache for a year. Browser + Cache API hit rates spike.
                    "Cache-Control": "private, max-age=31536000, immutable",
                },
            )
        except Exception:
            # If thumbnail generation fails for any reason, fall through and
            # serve the original file rather than erroring.
            pass

    return Response(
        content=data,
        media_type=file_type,
        headers={
            "Content-Disposition": f'inline; filename="{att.get("file_name", "file")}"',
            # Content-addressable UUIDs → safe to cache for a year.
            "Cache-Control": "private, max-age=31536000, immutable",
        },
    )
