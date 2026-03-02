"""CarryOn™ Backend — Milestone Message Routes

Architecture:
- Message title and content encrypted with AES-256-GCM at rest
- Video data encrypted and stored in cloud storage
- Per-estate derived encryption keys
"""

import base64
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response

from config import db, logger
from models import Message, MessageCreate, MessageUpdate
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

    if current_user["role"] == "beneficiary":
        messages = await db.messages.find(
            {
                "estate_id": estate_id,
                "recipients": current_user["id"],
                "is_delivered": True,
            },
            {"_id": 0},
        ).to_list(100)
    else:
        messages = await db.messages.find({"estate_id": estate_id}, {"_id": 0}).to_list(
            100
        )

    # Decrypt message fields
    decrypted = []
    for msg in messages:
        decrypted.append(await _decrypt_message(msg, estate_salt))

    return decrypted


@router.get("/messages/video/{video_id}")
async def get_message_video(
    video_id: str, current_user: dict = Depends(get_current_user)
):
    """Get video data for a message"""
    # Check if video is in cloud storage
    message = await db.messages.find_one({"video_url": video_id}, {"_id": 0})
    if message:
        if current_user["role"] == "beneficiary":
            if current_user["id"] not in message.get(
                "recipients", []
            ) or not message.get("is_delivered"):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_user["role"] == "benefactor":
            estate = await db.estates.find_one({"id": message["estate_id"]}, {"_id": 0})
            if not estate or estate["owner_id"] != current_user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")

    # Try cloud storage first
    video_storage_key = f"videos/{video_id}"
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

        return Response(
            content=decrypted,
            media_type="video/webm",
            headers={"Content-Disposition": f'inline; filename="{video_id}.webm"'},
        )
    except FileNotFoundError:
        pass

    # Fallback to legacy MongoDB storage
    video = await db.video_storage.find_one({"id": video_id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        video_bytes = base64.b64decode(video["data"])
        return Response(
            content=video_bytes,
            media_type="video/webm",
            headers={"Content-Disposition": f'inline; filename="{video_id}.webm"'},
        )
    except Exception as e:
        logger.error(f"Video decode error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve video")


@router.get("/messages/voice/{voice_id}")
async def get_message_voice(
    voice_id: str, current_user: dict = Depends(get_current_user)
):
    """Get voice recording data for a message"""
    message = await db.messages.find_one({"voice_url": voice_id}, {"_id": 0})
    if message:
        if current_user["role"] == "beneficiary":
            if current_user["id"] not in message.get(
                "recipients", []
            ) or not message.get("is_delivered"):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_user["role"] == "benefactor":
            estate = await db.estates.find_one({"id": message["estate_id"]}, {"_id": 0})
            if not estate or estate["owner_id"] != current_user["id"]:
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
async def create_message(
    data: MessageCreate, current_user: dict = Depends(get_current_user)
):
    """Create a new milestone message with encrypted content."""
    if current_user["role"] != "benefactor":
        raise HTTPException(
            status_code=403, detail="Only benefactors can create messages"
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
    msg_dict["title"] = (
        data.title[:50] if data.title else ""
    )  # Short display label only
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

    return message


@router.put("/messages/{message_id}")
async def update_message(
    message_id: str, data: MessageUpdate, current_user: dict = Depends(get_current_user)
):
    """Edit an existing message (benefactor only, before transition)"""
    if current_user["role"] != "benefactor":
        raise HTTPException(
            status_code=403, detail="Only benefactors can edit messages"
        )

    existing = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Message not found")
    if existing.get("is_delivered"):
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

    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.messages.update_one({"id": message_id}, {"$set": update_fields})

        # Log edit to edit_history for timeline tracking
        changed_fields = [
            k
            for k in update_fields
            if k not in ("updated_at", "encrypted_title", "encrypted_content")
        ]
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
async def delete_message(
    message_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete a milestone message."""
    if current_user["role"] != "benefactor":
        raise HTTPException(
            status_code=403, detail="Only benefactors can delete messages"
        )

    message = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Delete video from storage if exists
    if message.get("video_url"):
        video_key = f"videos/{message['video_url']}"
        await storage.delete(video_key)

    result = await db.messages.delete_one({"id": message_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")

    await audit_log(
        action="message.delete",
        user_id=current_user["id"],
        resource_type="message",
        resource_id=message_id,
        estate_id=message.get("estate_id"),
    )

    return {"message": "Message deleted"}
