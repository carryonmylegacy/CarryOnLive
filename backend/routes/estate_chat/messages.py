"""Estate Chat — message operations (send, edit, delete, react, pin)."""

from ._core import (
    router,
    _deliver_to_ffn,
    _require_estate_chat_access,
    _estate_chat_section_enabled,
    SendMessageRequest,
    EditMessageRequest,
    ReactRequest,
)
from fastapi import Depends, HTTPException, Query
from utils import get_current_user, send_push_notification
from config import db
from uuid import uuid4
from datetime import datetime, timezone
from typing import Optional


@router.get("/estate-chat/channels/{channel_id}/messages")
async def get_messages(
    channel_id: str,
    limit: int = Query(50, le=200),
    before: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Get messages from a channel."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    await _require_estate_chat_access(channel["estate_id"], current_user)
    query = {"channel_id": channel_id, "deleted_at": {"$exists": False}}
    if before:
        query["created_at"] = {"$lt": before}
    messages = await db.estate_messages.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    messages.reverse()  # Reverse to chronological order for frontend display
    # Enrich messages with reactions
    msg_ids = [m["id"] for m in messages]
    if msg_ids:
        reactions = await db.estate_reactions.find({"message_id": {"$in": msg_ids}}, {"_id": 0}).to_list(500)
        react_map = {}
        for r in reactions:
            react_map.setdefault(r["message_id"], []).append(
                {"emoji": r["emoji"], "user_id": r["user_id"], "user_name": r.get("user_name", "")}
            )
        for m in messages:
            m["reactions"] = react_map.get(m["id"], [])
        # Mark messages as delivered to this user
        other_user_msgs = [mid for mid, m in zip(msg_ids, messages) if m.get("sender_id") != current_user["id"]]
        if other_user_msgs:
            await db.estate_messages.update_many(
                {"id": {"$in": other_user_msgs}, "delivered_to": {"$ne": current_user["id"]}},
                {"$addToSet": {"delivered_to": current_user["id"]}},
            )
    else:
        for m in messages:
            m["reactions"] = []
    now = datetime.now(timezone.utc).isoformat()
    await db.estate_channel_reads.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    return messages


@router.get("/estate-chat/channels/{channel_id}/read-status")
async def get_read_status(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get read/delivered timestamps for all members of a channel (for receipts)."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    await _require_estate_chat_access(channel["estate_id"], current_user)
    reads = await db.estate_channel_reads.find({"channel_id": channel_id}, {"_id": 0}).to_list(100)
    read_map = {r["user_id"]: r.get("last_read_at", "") for r in reads}
    # Enrich with member names
    member_ids = [m for m in channel.get("members", []) if m != current_user["id"]]
    users = await db.users.find({"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    result = []
    for u in users:
        result.append(
            {
                "user_id": u["id"],
                "name": u.get("name", "Unknown"),
                "last_read_at": read_map.get(u["id"], ""),
            }
        )
    return result


@router.post("/estate-chat/channels/{channel_id}/typing")
async def send_typing(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Signal that the user is typing in a channel. Heartbeat — call every ~3s."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0, "id": 1, "members": 1, "estate_id": 1})
    if not channel or current_user["id"] not in channel.get("members", []):
        return {"ok": True}  # Silently ignore — no error for typing heartbeat
    if not await _estate_chat_section_enabled(channel.get("estate_id", ""), current_user):
        return {"ok": True}
    now = datetime.now(timezone.utc).isoformat()
    await db.estate_typing.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"user_name": current_user.get("name", ""), "updated_at": now}},
        upsert=True,
    )
    return {"ok": True}


@router.get("/estate-chat/channels/{channel_id}/typing")
async def get_typing(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get who is currently typing in a channel (active within last 5 seconds)."""
    from datetime import timedelta

    # Membership check — typing presence is channel-private (audit 05c1776 P2.3).
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0, "id": 1, "members": 1, "estate_id": 1})
    if not channel or current_user["id"] not in channel.get("members", []):
        return []
    if not await _estate_chat_section_enabled(channel.get("estate_id", ""), current_user):
        return []

    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
    typers = await db.estate_typing.find(
        {"channel_id": channel_id, "updated_at": {"$gt": cutoff}, "user_id": {"$ne": current_user["id"]}},
        {"_id": 0, "id": 1, "user_id": 1, "user_name": 1},
    ).to_list(20)
    return typers


@router.post("/estate-chat/channels/{channel_id}/messages")
async def send_message(
    channel_id: str,
    data: SendMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    """Send a message to a channel."""
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    await _require_estate_chat_access(channel["estate_id"], current_user)
    now = datetime.now(timezone.utc).isoformat()
    msg_id = str(uuid4())
    message = {
        "id": msg_id,
        "channel_id": channel_id,
        "estate_id": channel.get("estate_id", ""),
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", "Unknown"),
        "content": content,
        "created_at": now,
    }
    # Add reply reference if replying to a specific message
    if data.reply_to:
        replied = await db.estate_messages.find_one(
            {"id": data.reply_to, "channel_id": channel_id}, {"_id": 0, "id": 1, "content": 1, "sender_name": 1}
        )
        if replied:
            message["reply_to"] = {
                "id": replied["id"],
                "content": (replied.get("content") or "")[:200],
                "sender_name": replied.get("sender_name", "Unknown"),
            }
    await db.estate_messages.insert_one({k: v for k, v in message.items()})
    await db.estate_channel_reads.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    # Clear typing indicator on send
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
        preview = content[:100] + ("..." if len(content) > 100 else "")
        for member_id in other_members:
            asyncio.create_task(
                send_push_notification(
                    user_id=member_id,
                    title=f"{sender_name} in {channel_name}",
                    body=preview,
                    url="/estate-chat",
                    tag=f"ect-{channel_id}",
                    notification_type="ect_message",
                )
            )

    # Deliver to FFN contacts via email/SMS
    ffn_members = [m for m in channel.get("members", []) if m.startswith("ffn_")]
    if ffn_members:
        import asyncio

        estate = await db.estates.find_one({"id": channel.get("estate_id", "")}, {"_id": 0, "id": 1, "name": 1})
        asyncio.create_task(
            _deliver_to_ffn(
                channel,
                current_user.get("name", "Unknown"),
                content,
                estate.get("name", "") if estate else "",
            )
        )
    return message


@router.put("/estate-chat/messages/{message_id}")
async def edit_message(
    message_id: str,
    data: EditMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    """Edit a message's text content. Only the sender can edit."""
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")
    msg = await db.estate_messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.get("estate_id"):
        await _require_estate_chat_access(msg["estate_id"], current_user)
    if msg["sender_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")
    now = datetime.now(timezone.utc).isoformat()
    await db.estate_messages.update_one(
        {"id": message_id},
        {"$set": {"content": content, "edited_at": now}},
    )
    return {"status": "ok", "content": content, "edited_at": now}


@router.delete("/estate-chat/messages/{message_id}")
async def delete_message(
    message_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a message. Sender can delete own; estate owner can delete any."""
    msg = await db.estate_messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.get("estate_id"):
        await _require_estate_chat_access(msg["estate_id"], current_user)
    is_sender = msg["sender_id"] == current_user["id"]
    is_estate_owner = False
    if not is_sender and msg.get("estate_id"):
        estate = await db.estates.find_one(
            {"id": msg["estate_id"], "owner_id": current_user["id"]}, {"_id": 0, "id": 1}
        )
        is_estate_owner = estate is not None
    if not is_sender and not is_estate_owner:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")
    # Soft-delete: retain the record for SOC 2 audit compliance
    now = datetime.now(timezone.utc).isoformat()
    await db.estate_messages.update_one(
        {"id": message_id},
        {"$set": {"deleted_at": now, "deleted_by": current_user["id"]}},
    )
    return {"status": "ok"}


@router.post("/estate-chat/messages/{message_id}/react")
async def toggle_reaction(
    message_id: str,
    data: ReactRequest,
    current_user: dict = Depends(get_current_user),
):
    """Toggle a reaction on a message. If already reacted with same emoji, removes it."""
    if not data.emoji or len(data.emoji) > 20:
        raise HTTPException(status_code=400, detail="Invalid emoji")
    msg = await db.estate_messages.find_one({"id": message_id}, {"_id": 0, "id": 1, "channel_id": 1})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    channel = await db.estate_channels.find_one(
        {"id": msg["channel_id"]}, {"_id": 0, "id": 1, "members": 1, "estate_id": 1}
    )
    if not channel or current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    await _require_estate_chat_access(channel["estate_id"], current_user)
    # Check if already reacted with this emoji
    existing = await db.estate_reactions.find_one(
        {"message_id": message_id, "user_id": current_user["id"], "emoji": data.emoji},
        {"_id": 0},
    )
    if existing:
        await db.estate_reactions.delete_one(
            {"message_id": message_id, "user_id": current_user["id"], "emoji": data.emoji}
        )
        return {"action": "removed", "emoji": data.emoji}
    now = datetime.now(timezone.utc).isoformat()
    reaction = {
        "id": str(uuid4()),
        "message_id": message_id,
        "user_id": current_user["id"],
        "user_name": current_user.get("name", "Unknown"),
        "emoji": data.emoji,
        "created_at": now,
    }
    await db.estate_reactions.insert_one({k: v for k, v in reaction.items()})
    return {"action": "added", "emoji": data.emoji}


@router.post("/estate-chat/messages/{message_id}/pin")
async def toggle_pin(
    message_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Toggle pin on a message. Benefactor only."""
    msg = await db.estate_messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    channel = await db.estate_channels.find_one(
        {"id": msg["channel_id"]}, {"_id": 0, "id": 1, "members": 1, "estate_id": 1}
    )
    if not channel or current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    await _require_estate_chat_access(channel["estate_id"], current_user)
    # Any channel member can pin — no estate ownership check needed
    is_pinned = msg.get("pinned", False)
    now = datetime.now(timezone.utc).isoformat()
    await db.estate_messages.update_one(
        {"id": message_id},
        {
            "$set": {
                "pinned": not is_pinned,
                "pinned_at": now if not is_pinned else None,
                "pinned_by": current_user["id"] if not is_pinned else None,
            }
        },
    )
    return {"pinned": not is_pinned}


@router.get("/estate-chat/channels/{channel_id}/pinned")
async def get_pinned(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get all pinned messages in a channel."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0, "id": 1, "members": 1, "estate_id": 1})
    if not channel or current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    await _require_estate_chat_access(channel["estate_id"], current_user)
    pinned = (
        await db.estate_messages.find(
            {"channel_id": channel_id, "pinned": True, "deleted_at": {"$exists": False}}, {"_id": 0}
        )
        .sort("pinned_at", -1)
        .to_list(20)
    )
    return pinned


# File type constants imported from _core to avoid duplication
