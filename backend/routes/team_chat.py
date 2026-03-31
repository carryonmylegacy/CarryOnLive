"""CarryOn™ — Internal Team Chat

Staff-only messaging system with predefined channels and direct messages.
Real-time delivery via existing WebSocket infrastructure.
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from config import db
from guards import require_staff
from routes.ws_notifications import send_to_user, broadcast_to_staff

router = APIRouter()

SYSTEM_CHANNELS = [
    {"id": "general", "name": "General", "type": "system", "description": "Company-wide announcements and chat"},
    {"id": "ops", "name": "Operations", "type": "system", "description": "Ops team coordination"},
    {"id": "finance", "name": "Finance", "type": "system", "description": "Finance team discussion"},
    {"id": "marketing", "name": "Marketing", "type": "system", "description": "Marketing team discussion"},
    {"id": "compliance", "name": "Compliance", "type": "system", "description": "Compliance and audit discussion"},
    {"id": "platform", "name": "Platform", "type": "system", "description": "Platform health and engineering"},
]


class SendMessageRequest(BaseModel):
    channel_id: str
    content: str


class CreateDirectChannelRequest(BaseModel):
    recipient_id: str


@router.get("/team/channels")
async def get_channels(current_user: dict = Depends(require_staff)):
    """Get all accessible channels for the current user."""
    channels = []

    for ch in SYSTEM_CHANNELS:
        last_read = await db.team_channel_reads.find_one(
            {"channel_id": ch["id"], "user_id": current_user["id"]},
            {"_id": 0},
        )
        last_read_at = last_read.get("last_read_at", "") if last_read else ""

        unread_query = {"channel_id": ch["id"]}
        if last_read_at:
            unread_query["created_at"] = {"$gt": last_read_at}
        unread = await db.team_messages.count_documents(unread_query)

        last_msg = await db.team_messages.find_one(
            {"channel_id": ch["id"]},
            {"_id": 0, "content": 1, "sender_name": 1, "created_at": 1},
            sort=[("created_at", -1)],
        )
        preview = None
        if last_msg:
            preview = {
                "content": last_msg["content"][:60],
                "sender_name": last_msg.get("sender_name", ""),
                "created_at": last_msg.get("created_at", ""),
            }

        channels.append({**ch, "unread_count": unread, "last_message": preview})

    dm_channels = await db.team_channels.find(
        {"type": "direct", "members": current_user["id"]},
        {"_id": 0},
    ).to_list(50)

    for dm in dm_channels:
        other_ids = [m for m in dm.get("members", []) if m != current_user["id"]]
        other_user = None
        if other_ids:
            other_user = await db.users.find_one(
                {"id": other_ids[0]},
                {"_id": 0, "name": 1, "role": 1, "operator_role": 1},
            )

        last_read = await db.team_channel_reads.find_one(
            {"channel_id": dm["id"], "user_id": current_user["id"]},
            {"_id": 0},
        )
        last_read_at = last_read.get("last_read_at", "") if last_read else ""

        unread_query = {"channel_id": dm["id"]}
        if last_read_at:
            unread_query["created_at"] = {"$gt": last_read_at}
        unread = await db.team_messages.count_documents(unread_query)

        last_msg = await db.team_messages.find_one(
            {"channel_id": dm["id"]},
            {"_id": 0, "content": 1, "sender_name": 1, "created_at": 1},
            sort=[("created_at", -1)],
        )
        preview = None
        if last_msg:
            preview = {
                "content": last_msg["content"][:60],
                "sender_name": last_msg.get("sender_name", ""),
                "created_at": last_msg.get("created_at", ""),
            }

        channels.append(
            {
                "id": dm["id"],
                "name": other_user["name"] if other_user else "Direct Message",
                "type": "direct",
                "recipient_role": (other_user.get("operator_role") or other_user.get("role", "") if other_user else ""),
                "unread_count": unread,
                "last_message": preview,
            }
        )

    return channels


@router.get("/team/messages/{channel_id}")
async def get_messages(
    channel_id: str,
    limit: int = Query(50, le=200),
    before: Optional[str] = Query(None),
    current_user: dict = Depends(require_staff),
):
    """Get messages from a channel."""
    query = {"channel_id": channel_id}
    if before:
        query["created_at"] = {"$lt": before}

    messages = await db.team_messages.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    now = datetime.now(timezone.utc).isoformat()
    await db.team_channel_reads.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )

    return messages[::-1]


@router.post("/team/messages")
async def send_message(
    data: SendMessageRequest,
    current_user: dict = Depends(require_staff),
):
    """Send a message to a channel."""
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 characters)")

    now = datetime.now(timezone.utc).isoformat()
    msg_id = str(uuid4())

    message = {
        "id": msg_id,
        "channel_id": data.channel_id,
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", "Unknown"),
        "sender_role": current_user.get("operator_role") or current_user.get("role", ""),
        "content": content,
        "created_at": now,
    }

    await db.team_messages.insert_one({k: v for k, v in message.items()})

    await db.team_channel_reads.update_one(
        {"channel_id": data.channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )

    ws_payload = {"type": "chat_message", "channel_id": data.channel_id, "message": message}

    if data.channel_id.startswith("dm_"):
        dm_channel = await db.team_channels.find_one({"id": data.channel_id}, {"_id": 0})
        if dm_channel:
            for member_id in dm_channel.get("members", []):
                if member_id != current_user["id"]:
                    await send_to_user(member_id, ws_payload)
    else:
        await broadcast_to_staff(ws_payload)

    return message


@router.post("/team/channels/direct")
async def create_direct_channel(
    data: CreateDirectChannelRequest,
    current_user: dict = Depends(require_staff),
):
    """Create or get a direct message channel between two staff members."""
    if data.recipient_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot create a DM with yourself")

    recipient = await db.users.find_one(
        {"id": data.recipient_id, "role": {"$in": ["admin", "operator"]}},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "operator_role": 1},
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    members = sorted([current_user["id"], data.recipient_id])
    existing = await db.team_channels.find_one(
        {"type": "direct", "members": {"$all": members, "$size": 2}},
        {"_id": 0},
    )
    if existing:
        return {
            "id": existing["id"],
            "name": recipient["name"],
            "type": "direct",
            "recipient_role": recipient.get("operator_role") or recipient.get("role", ""),
        }

    channel_id = f"dm_{str(uuid4())[:8]}"
    channel = {
        "id": channel_id,
        "type": "direct",
        "members": members,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"],
    }
    await db.team_channels.insert_one({k: v for k, v in channel.items()})

    return {
        "id": channel_id,
        "name": recipient["name"],
        "type": "direct",
        "recipient_role": recipient.get("operator_role") or recipient.get("role", ""),
    }


@router.get("/team/staff")
async def get_staff_members(current_user: dict = Depends(require_staff)):
    """Get all staff members for DM recipient selection."""
    staff = await db.users.find(
        {"role": {"$in": ["admin", "operator"]}, "id": {"$ne": current_user["id"]}},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "operator_role": 1},
    ).to_list(100)
    return staff
