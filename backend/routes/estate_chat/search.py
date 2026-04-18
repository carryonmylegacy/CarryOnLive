"""Estate Chat — unread badge count and full-text search."""

from ._core import router, _get_user_estate_ids
from fastapi import Depends, Query
from utils import get_current_user
from config import db


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
    # Exclude dismissed channels from unread count
    dismissed = await db.estate_channel_dismissals.find(
        {"user_id": current_user["id"]},
        {"_id": 0, "id": 1, "channel_id": 1},
    ).to_list(500)
    dismissed_ids = {d["channel_id"] for d in dismissed}
    total = 0
    for ch in channels:
        if ch["id"] in dismissed_ids:
            continue
        last_read = await db.estate_channel_reads.find_one(
            {"channel_id": ch["id"], "user_id": current_user["id"]},
            {"_id": 0, "id": 1, "last_read_at": 1},
        )
        last_read_at = last_read.get("last_read_at", "") if last_read else ""
        q = {"channel_id": ch["id"], "deleted_at": {"$exists": False}}
        if last_read_at:
            q["created_at"] = {"$gt": last_read_at}
        total += await db.estate_messages.count_documents(q)
    return {"total": total}


@router.get("/estate-chat/search")
async def search_messages(
    q: str = Query(..., min_length=1, max_length=200),
    current_user: dict = Depends(get_current_user),
):
    """Search messages across all user's estate channels by keyword."""
    estate_ids = await _get_user_estate_ids(current_user["id"])
    if not estate_ids:
        return []
    channels = await db.estate_channels.find(
        {"estate_id": {"$in": estate_ids}, "members": current_user["id"]},
        {"_id": 0, "id": 1, "name": 1, "type": 1, "estate_id": 1, "members": 1},
    ).to_list(200)
    if not channels:
        return []
    channel_ids = [c["id"] for c in channels]
    channel_map = {c["id"]: c for c in channels}
    results = (
        await db.estate_messages.find(
            {
                "channel_id": {"$in": channel_ids},
                "content": {"$regex": q, "$options": "i"},
                "deleted_at": {"$exists": False},
            },
            {"_id": 0},
        )
        .sort("created_at", -1)
        .limit(30)
        .to_list(30)
    )
    # Enrich with channel info
    for msg in results:
        ch = channel_map.get(msg.get("channel_id", ""), {})
        msg["channel_name"] = ch.get("name", "")
        msg["channel_type"] = ch.get("type", "")
        # For DMs, resolve the other person's name
        if ch.get("type") == "direct":
            other_ids = [m for m in ch.get("members", []) if m != current_user["id"]]
            if other_ids:
                other = await db.users.find_one({"id": other_ids[0]}, {"_id": 0, "id": 1, "name": 1})
                if other:
                    msg["channel_name"] = other["name"]
    return results
