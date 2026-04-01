"""CarryOn™ — Estate Chat Tool (ECT)

Secure, private messaging between estate members (benefactors + beneficiaries).
Three channel types:
  - circle: Auto-created per estate, all accepted members can see it
  - group: Benefactor-created with selected members
  - direct: 1:1 between any two connected estate members
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from config import db
from utils import get_current_user

router = APIRouter()


class CreateChannelRequest(BaseModel):
    estate_id: str
    name: Optional[str] = None
    member_ids: list[str] = []
    channel_type: str = "group"  # "group" or "direct"


class SendMessageRequest(BaseModel):
    content: str


class UpdateMembersRequest(BaseModel):
    member_ids: list[str]


async def _get_user_estate_ids(user_id: str) -> list[str]:
    """Get all estate IDs a user is connected to (as owner or beneficiary)."""
    estate_ids = set()
    async for e in db.estates.find({"owner_id": user_id}, {"_id": 0, "id": 1}):
        estate_ids.add(e["id"])
    async for e in db.estates.find({"beneficiaries": user_id}, {"_id": 0, "id": 1}):
        estate_ids.add(e["id"])
    return list(estate_ids)


async def _is_estate_member(user_id: str, estate_id: str) -> bool:
    """Check if user is owner or accepted beneficiary of an estate."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "owner_id": 1, "beneficiaries": 1})
    if not estate:
        return False
    if estate["owner_id"] == user_id:
        return True
    return user_id in estate.get("beneficiaries", [])


async def _is_estate_owner(user_id: str, estate_id: str) -> bool:
    """Check if user is the owner (benefactor) of an estate."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "owner_id": 1})
    return estate is not None and estate["owner_id"] == user_id


async def _ensure_circle(estate_id: str) -> dict:
    """Ensure a Circle channel exists for this estate; create if not."""
    circle = await db.estate_channels.find_one({"estate_id": estate_id, "type": "circle"}, {"_id": 0})
    if circle:
        return circle
    estate = await db.estates.find_one(
        {"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1, "name": 1, "beneficiaries": 1}
    )
    if not estate:
        return None
    members = list({estate["owner_id"]} | set(estate.get("beneficiaries", [])))
    now = datetime.now(timezone.utc).isoformat()
    circle_doc = {
        "id": f"circle_{estate_id[:8]}",
        "estate_id": estate_id,
        "type": "circle",
        "name": f"{estate.get('name', 'Estate')} Circle",
        "members": members,
        "created_by": estate["owner_id"],
        "created_at": now,
    }
    await db.estate_channels.insert_one({k: v for k, v in circle_doc.items()})
    return circle_doc


async def _enrich_channel(channel: dict, current_user_id: str) -> dict:
    """Add unread count, last message preview, and member names."""
    ch_id = channel["id"]
    last_read = await db.estate_channel_reads.find_one({"channel_id": ch_id, "user_id": current_user_id}, {"_id": 0})
    last_read_at = last_read.get("last_read_at", "") if last_read else ""
    unread_query = {"channel_id": ch_id}
    if last_read_at:
        unread_query["created_at"] = {"$gt": last_read_at}
    unread = await db.estate_messages.count_documents(unread_query)
    last_msg = await db.estate_messages.find_one(
        {"channel_id": ch_id},
        {"_id": 0, "content": 1, "sender_name": 1, "created_at": 1},
        sort=[("created_at", -1)],
    )
    preview = None
    if last_msg:
        preview = {
            "content": last_msg["content"][:80],
            "sender_name": last_msg.get("sender_name", ""),
            "created_at": last_msg.get("created_at", ""),
        }
    # For direct channels, resolve the other person's name
    display_name = channel.get("name", "")
    if channel["type"] == "direct":
        other_ids = [m for m in channel.get("members", []) if m != current_user_id]
        if other_ids:
            other = await db.users.find_one({"id": other_ids[0]}, {"_id": 0, "name": 1})
            if other:
                display_name = other["name"]
    # Get estate name for the tag
    estate_name = ""
    estate = await db.estates.find_one({"id": channel.get("estate_id", "")}, {"_id": 0, "name": 1})
    if estate:
        estate_name = estate.get("name", "")
    return {
        "id": ch_id,
        "estate_id": channel.get("estate_id", ""),
        "estate_name": estate_name,
        "type": channel["type"],
        "name": display_name,
        "members": channel.get("members", []),
        "created_by": channel.get("created_by", ""),
        "created_at": channel.get("created_at", ""),
        "unread_count": unread,
        "last_message": preview,
    }


@router.get("/estate-chat/contacts")
async def get_contacts(current_user: dict = Depends(get_current_user)):
    """Get all people connected to the user across all estates, grouped by estate."""
    estate_ids = await _get_user_estate_ids(current_user["id"])
    if not estate_ids:
        return []
    result = []
    for eid in estate_ids:
        estate = await db.estates.find_one(
            {"id": eid}, {"_id": 0, "id": 1, "name": 1, "owner_id": 1, "beneficiaries": 1}
        )
        if not estate:
            continue
        all_member_ids = list({estate["owner_id"]} | set(estate.get("beneficiaries", [])))
        all_member_ids = [m for m in all_member_ids if m != current_user["id"]]
        if not all_member_ids:
            continue
        users = await db.users.find(
            {"id": {"$in": all_member_ids}},
            {"_id": 0, "id": 1, "name": 1, "role": 1, "photo_url": 1},
        ).to_list(100)
        # Get relationship info from beneficiaries collection
        ben_records = await db.beneficiaries.find(
            {"estate_id": eid, "user_id": {"$in": all_member_ids}, "deleted_at": None},
            {"_id": 0, "user_id": 1, "relation": 1},
        ).to_list(100)
        relation_map = {b["user_id"]: b.get("relation", "") for b in ben_records}
        members = []
        for u in users:
            is_owner = u["id"] == estate["owner_id"]
            members.append(
                {
                    "id": u["id"],
                    "name": u.get("name", "Unknown"),
                    "photo_url": u.get("photo_url", ""),
                    "role_in_estate": "benefactor" if is_owner else "beneficiary",
                    "relation": relation_map.get(u["id"], "benefactor" if is_owner else ""),
                }
            )
        result.append(
            {
                "estate_id": eid,
                "estate_name": estate.get("name", "Estate"),
                "members": members,
            }
        )
    return result


@router.get("/estate-chat/channels")
async def get_channels(current_user: dict = Depends(get_current_user)):
    """Get all chat channels the current user belongs to, across all estates."""
    estate_ids = await _get_user_estate_ids(current_user["id"])
    if not estate_ids:
        return []
    # Ensure circles exist for each estate
    for eid in estate_ids:
        await _ensure_circle(eid)
    channels = await db.estate_channels.find(
        {"estate_id": {"$in": estate_ids}, "members": current_user["id"]},
        {"_id": 0},
    ).to_list(200)
    enriched = []
    for ch in channels:
        enriched.append(await _enrich_channel(ch, current_user["id"]))

    # Sort: circles first, then by last_message date descending
    def sort_key(c):
        type_order = {"circle": 0, "group": 1, "direct": 2}
        lm = c.get("last_message")
        ts = lm["created_at"] if lm else ""
        return (type_order.get(c["type"], 9), "" if ts else "z", ts)

    enriched.sort(
        key=lambda c: (
            {"circle": 0, "group": 1, "direct": 2}.get(c["type"], 9),
            -(len(c.get("last_message", {}).get("created_at", "") or "0")),
        )
    )
    return enriched


@router.post("/estate-chat/channels")
async def create_channel(
    data: CreateChannelRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a group or direct message channel."""
    if not await _is_estate_member(current_user["id"], data.estate_id):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    if data.channel_type == "group":
        if not await _is_estate_owner(current_user["id"], data.estate_id):
            raise HTTPException(status_code=403, detail="Only the benefactor can create group channels")
        if not data.name or not data.name.strip():
            raise HTTPException(status_code=400, detail="Group name is required")
        members = list(set([current_user["id"]] + data.member_ids))
        for mid in data.member_ids:
            if not await _is_estate_member(mid, data.estate_id):
                raise HTTPException(status_code=400, detail=f"User {mid} is not a member of this estate")
        now = datetime.now(timezone.utc).isoformat()
        channel = {
            "id": f"grp_{str(uuid4())[:8]}",
            "estate_id": data.estate_id,
            "type": "group",
            "name": data.name.strip(),
            "members": members,
            "created_by": current_user["id"],
            "created_at": now,
        }
        await db.estate_channels.insert_one({k: v for k, v in channel.items()})
        return await _enrich_channel(channel, current_user["id"])
    elif data.channel_type == "direct":
        if len(data.member_ids) != 1:
            raise HTTPException(status_code=400, detail="Direct messages require exactly one other member")
        other_id = data.member_ids[0]
        if other_id == current_user["id"]:
            raise HTTPException(status_code=400, detail="Cannot create a DM with yourself")
        if not await _is_estate_member(other_id, data.estate_id):
            raise HTTPException(status_code=400, detail="Recipient is not a member of this estate")
        members = sorted([current_user["id"], other_id])
        existing = await db.estate_channels.find_one(
            {
                "type": "direct",
                "estate_id": data.estate_id,
                "members": {"$all": members, "$size": 2},
            },
            {"_id": 0},
        )
        if existing:
            return await _enrich_channel(existing, current_user["id"])
        now = datetime.now(timezone.utc).isoformat()
        channel = {
            "id": f"dm_{str(uuid4())[:8]}",
            "estate_id": data.estate_id,
            "type": "direct",
            "name": "",
            "members": members,
            "created_by": current_user["id"],
            "created_at": now,
        }
        await db.estate_channels.insert_one({k: v for k, v in channel.items()})
        return await _enrich_channel(channel, current_user["id"])
    else:
        raise HTTPException(status_code=400, detail="Invalid channel type")


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
    query = {"channel_id": channel_id}
    if before:
        query["created_at"] = {"$lt": before}
    messages = await db.estate_messages.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    now = datetime.now(timezone.utc).isoformat()
    await db.estate_channel_reads.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    return messages[::-1]


@router.get("/estate-chat/channels/{channel_id}/read-status")
async def get_read_status(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get read timestamps for all members of a channel (for read receipts)."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
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
    await db.estate_messages.insert_one({k: v for k, v in message.items()})
    await db.estate_channel_reads.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    return message


@router.put("/estate-chat/channels/{channel_id}/members")
async def update_members(
    channel_id: str,
    data: UpdateMembersRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update members of a group channel. Benefactor only."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if channel["type"] != "group":
        raise HTTPException(status_code=400, detail="Can only update members of group channels")
    if not await _is_estate_owner(current_user["id"], channel["estate_id"]):
        raise HTTPException(status_code=403, detail="Only the benefactor can update group members")
    new_members = list(set([current_user["id"]] + data.member_ids))
    for mid in data.member_ids:
        if not await _is_estate_member(mid, channel["estate_id"]):
            raise HTTPException(status_code=400, detail=f"User {mid} is not a member of this estate")
    await db.estate_channels.update_one({"id": channel_id}, {"$set": {"members": new_members}})
    return {"success": True, "members": new_members}


@router.delete("/estate-chat/channels/{channel_id}")
async def delete_channel(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a group channel. Benefactor only. Cannot delete circles or DMs."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if channel["type"] != "group":
        raise HTTPException(status_code=400, detail="Can only delete group channels")
    if not await _is_estate_owner(current_user["id"], channel["estate_id"]):
        raise HTTPException(status_code=403, detail="Only the benefactor can delete group channels")
    await db.estate_channels.delete_one({"id": channel_id})
    await db.estate_messages.delete_many({"channel_id": channel_id})
    await db.estate_channel_reads.delete_many({"channel_id": channel_id})
    return {"success": True}


@router.get("/estate-chat/unread-total")
async def get_unread_total(current_user: dict = Depends(get_current_user)):
    """Get total unread message count across all estate channels for badge display."""
    estate_ids = await _get_user_estate_ids(current_user["id"])
    if not estate_ids:
        return {"total": 0}
    channels = await db.estate_channels.find(
        {"estate_id": {"$in": estate_ids}, "members": current_user["id"]},
        {"_id": 0, "id": 1},
    ).to_list(200)
    total = 0
    for ch in channels:
        last_read = await db.estate_channel_reads.find_one(
            {"channel_id": ch["id"], "user_id": current_user["id"]},
            {"_id": 0, "last_read_at": 1},
        )
        last_read_at = last_read.get("last_read_at", "") if last_read else ""
        q = {"channel_id": ch["id"]}
        if last_read_at:
            q["created_at"] = {"$gt": last_read_at}
        total += await db.estate_messages.count_documents(q)
    return {"total": total}
