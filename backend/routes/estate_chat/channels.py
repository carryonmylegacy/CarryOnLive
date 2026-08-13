"""Estate Chat — channel management (list, create, update members, delete, batch-delete)."""

from ._core import (
    router,
    _get_user_estate_ids,
    _ensure_circle,
    _enrich_channel,
    _require_estate_chat_access,
    _estate_chat_section_enabled,
    CreateChannelRequest,
    UpdateMembersRequest,
)
from fastapi import Depends, HTTPException
from utils import get_current_user
from config import db
from uuid import uuid4
from datetime import datetime, timezone
from pydantic import BaseModel
from services.estate_auth import is_estate_member as _is_estate_member, is_estate_owner as _is_estate_owner


@router.get("/estate-chat/channels")
async def get_channels(current_user: dict = Depends(get_current_user)):
    """Get all chat channels the current user belongs to, across all estates."""
    estate_ids = await _get_user_estate_ids(current_user["id"])
    if not estate_ids:
        return []
    # Drop estates whose Messages section is disabled for this beneficiary
    # (audit 18a9d44 F-18-05) — owner/admin always pass.
    estate_ids = [eid for eid in estate_ids if await _estate_chat_section_enabled(eid, current_user)]
    if not estate_ids:
        return []
    # Ensure circles exist for each estate
    for eid in estate_ids:
        await _ensure_circle(eid)
    channels = await db.estate_channels.find(
        {"estate_id": {"$in": estate_ids}, "members": current_user["id"]},
        {"_id": 0},
    ).to_list(200)
    # Filter out channels this user has dismissed
    dismissed = await db.estate_channel_dismissals.find(
        {"user_id": current_user["id"]},
        {"_id": 0, "id": 1, "channel_id": 1},
    ).to_list(500)
    dismissed_ids = {d["channel_id"] for d in dismissed}
    channels = [ch for ch in channels if ch["id"] not in dismissed_ids]
    enriched = []
    for ch in channels:
        enriched.append(await _enrich_channel(ch, current_user["id"]))

    # Sort: circles first, then groups, then directs; within each
    # bucket, most-recently-active conversation on top. The previous
    # implementation used `-len(created_at)` as the tiebreaker, which
    # collapses to the same constant for every ISO timestamp (~26
    # chars), so Python's stable sort fell back to insertion order
    # and the list "flapped" depending on whoever's channel happened
    # to be enumerated last by Mongo. Two-pass stable sort gets the
    # ordering right deterministically.
    def _last_at(c):
        # Prefer last_message.created_at (real activity); fall back to
        # the channel's own updated_at / created_at. ISO-8601 strings
        # compare lexically the same way they compare chronologically,
        # so we sort the raw string descending.
        lm = c.get("last_message") or {}
        return lm.get("created_at") or c.get("updated_at") or c.get("created_at") or ""

    # 1) Most recent first within ties on type. Tiebreaker on stable
    #    channel id so two channels with identical _last_at values don't
    #    reorder between polls (was causing the channel list to "flap"
    #    — top channel swapping every few seconds during demos).
    enriched.sort(key=lambda c: (_last_at(c), c.get("id", "")), reverse=True)
    # 2) Then by channel type so circles are always on top.
    enriched.sort(key=lambda c: {"circle": 0, "group": 1, "direct": 2}.get(c.get("type"), 9))
    return enriched


@router.post("/estate-chat/channels")
async def create_channel(
    data: CreateChannelRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a group or direct message channel."""
    await _require_estate_chat_access(data.estate_id, current_user)
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
    """Delete a channel. Benefactors hard-delete for all members; others only dismiss (hide) for themselves."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    user_id = current_user["id"]
    await _require_estate_chat_access(channel["estate_id"], current_user)
    is_owner = await _is_estate_owner(user_id, channel["estate_id"])
    is_admin = current_user.get("role") == "admin"
    is_member = user_id in channel.get("members", [])
    if not (is_owner or is_admin or is_member):
        raise HTTPException(status_code=403, detail="Not authorized to delete this channel")
    now = datetime.now(timezone.utc).isoformat()
    if is_owner or is_admin:
        # Benefactor/admin: hard-delete channel and all messages for everyone.
        # Collect message ids BEFORE deleting messages so reactions are cleaned
        # up too (audit 18a9d44 F-18-13 — deleting messages first orphaned them).
        if channel.get("type") != "circle":
            msg_ids = [m["id"] async for m in db.estate_messages.find({"channel_id": channel_id}, {"id": 1, "_id": 0})]
            await db.estate_channels.delete_one({"id": channel_id})  # cascade: channel teardown (hk-25 reviewed)
            if msg_ids:
                await db.estate_reactions.delete_many({"message_id": {"$in": msg_ids}})
            await db.estate_messages.delete_many({"channel_id": channel_id})  # hk-25: cascade
        else:
            # Circle: dismiss for all members
            for mid in channel.get("members", []):
                await db.estate_channel_dismissals.update_one(
                    {"user_id": mid, "channel_id": channel_id},
                    {"$set": {"user_id": mid, "channel_id": channel_id, "dismissed_at": now}},
                    upsert=True,
                )
        await db.estate_channel_reads.delete_many({"channel_id": channel_id})
    else:
        # Non-benefactor: only hide for themselves
        await db.estate_channel_dismissals.update_one(
            {"user_id": user_id, "channel_id": channel_id},
            {"$set": {"user_id": user_id, "channel_id": channel_id, "dismissed_at": now}},
            upsert=True,
        )
    return {"success": True}


class BatchDeleteRequest(BaseModel):
    channel_ids: list[str]


@router.post("/estate-chat/channels/batch-delete")
async def batch_delete_channels(
    data: BatchDeleteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Delete multiple channels at once. User must be a member of each channel."""
    if not data.channel_ids:
        raise HTTPException(status_code=400, detail="No channels specified")
    if len(data.channel_ids) > 50:
        raise HTTPException(status_code=400, detail="Cannot delete more than 50 channels at once")
    deleted = []
    failed = []
    now = datetime.now(timezone.utc).isoformat()
    for ch_id in data.channel_ids:
        channel = await db.estate_channels.find_one({"id": ch_id}, {"_id": 0})
        if not channel:
            failed.append({"id": ch_id, "reason": "Not found"})
            continue
        user_id = current_user["id"]
        if not await _estate_chat_section_enabled(channel["estate_id"], current_user):
            failed.append({"id": ch_id, "reason": "Messages section not available"})
            continue
        is_owner = await _is_estate_owner(user_id, channel["estate_id"])
        is_admin = current_user.get("role") == "admin"
        is_member = user_id in channel.get("members", [])
        if not (is_owner or is_admin or is_member):
            failed.append({"id": ch_id, "reason": "Not authorized"})
            continue
        # Record dismissal so channel stays hidden for this user
        await db.estate_channel_dismissals.update_one(
            {"user_id": user_id, "channel_id": ch_id},
            {"$set": {"user_id": user_id, "channel_id": ch_id, "dismissed_at": now}},
            upsert=True,
        )
        # Only the benefactor/admin may HARD-delete a channel for everyone. A
        # regular member can only dismiss (hide) it for themselves — otherwise
        # any member could wipe a shared DM/group for all participants
        # (audit 05c1776 P2.2).
        if (is_owner or is_admin) and channel.get("type") != "circle":
            # Collect message ids BEFORE deleting so reactions are cleaned up
            # too (audit 512bd5c F-18-09 — batch path orphaned reactions).
            msg_ids = [m["id"] async for m in db.estate_messages.find({"channel_id": ch_id}, {"id": 1, "_id": 0})]
            await db.estate_channels.delete_one({"id": ch_id})  # cascade: channel teardown (hk-25 reviewed)
            if msg_ids:
                await db.estate_reactions.delete_many({"message_id": {"$in": msg_ids}})
            await db.estate_messages.delete_many({"channel_id": ch_id})  # cascade: channel teardown (hk-25 reviewed)
            await db.estate_channel_reads.delete_many({"channel_id": ch_id})
        deleted.append(ch_id)
    return {"deleted": deleted, "failed": failed}
