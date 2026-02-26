"""CarryOn™ Backend — Milestone Message Routes"""

from fastapi import APIRouter, HTTPException, Depends, Response
from datetime import datetime, timezone
from config import db, logger
from utils import get_current_user, log_activity, update_estate_readiness
import base64

from models import Message, MessageCreate, MessageUpdate

router = APIRouter()

# ===================== MESSAGE ROUTES =====================


@router.get("/messages/{estate_id}")
async def get_messages(estate_id: str, current_user: dict = Depends(get_current_user)):
    """List all milestone messages for an estate."""
    if current_user["role"] == "beneficiary":
        # Only show delivered messages to beneficiaries
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
    return messages


@router.get("/messages/video/{video_id}")
async def get_message_video(
    video_id: str, current_user: dict = Depends(get_current_user)
):
    """Get video data for a message"""
    video = await db.video_storage.find_one({"id": video_id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Verify user has access to this video
    message = await db.messages.find_one({"video_url": video_id}, {"_id": 0})
    if message:
        if current_user["role"] == "beneficiary":
            if current_user["id"] not in message.get(
                "recipients", []
            ) or not message.get("is_delivered"):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_user["role"] == "benefactor":
            # Check if user owns the estate
            estate = await db.estates.find_one({"id": message["estate_id"]}, {"_id": 0})
            if not estate or estate["owner_id"] != current_user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")

    # Decode video data and return
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


@router.post("/messages")
async def create_message(
    data: MessageCreate, current_user: dict = Depends(get_current_user)
):
    """Create a new milestone message."""
    if current_user["role"] != "benefactor":
        raise HTTPException(
            status_code=403, detail="Only benefactors can create messages"
        )

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

    # Handle video data - store encrypted
    if data.video_data:
        message.video_url = f"video_{message.id}"
        # Store video data (could encrypt here too for additional security)
        await db.video_storage.insert_one(
            {
                "id": message.video_url,
                "data": data.video_data,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    await db.messages.insert_one(msg_dict)

    # Update estate readiness
    await update_estate_readiness(data.estate_id)

    # Log activity
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
    ]:
        val = getattr(data, field, None)
        if val is not None:
            update_fields[field] = val

    # Handle video update
    if data.video_data:
        video_id = f"video_{message_id}"
        await db.video_storage.update_one(
            {"id": video_id},
            {
                "$set": {
                    "data": data.video_data,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )
        update_fields["video_url"] = video_id

    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.messages.update_one({"id": message_id}, {"$set": update_fields})

    updated = await db.messages.find_one({"id": message_id}, {"_id": 0})

    # Update estate readiness
    await update_estate_readiness(existing["estate_id"])

    return updated


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete a milestone message."""
    if current_user["role"] != "benefactor":
        raise HTTPException(
            status_code=403, detail="Only benefactors can delete messages"
        )

    result = await db.messages.delete_one({"id": message_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")

    return {"message": "Message deleted"}
