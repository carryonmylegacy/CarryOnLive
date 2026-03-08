"""CarryOn™ — In-App Notifications API

Endpoints for fetching, marking read, and managing notifications.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from config import db
from utils import get_current_user

router = APIRouter()


@router.get("/notifications")
async def get_notifications(
    limit: int = Query(50, le=200),
    unread_only: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    """Get notifications for the current user."""
    query = {"user_id": current_user["id"]}
    if unread_only:
        query["read"] = False
    notifications = (
        await db.notifications.find(query, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
        .to_list(limit)
    )
    unread_count = await db.notifications.count_documents(
        {"user_id": current_user["id"], "read": False}
    )
    return {"notifications": notifications, "unread_count": unread_count}


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str, current_user: dict = Depends(get_current_user)
):
    """Mark a single notification as read."""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["id"]},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"read": True}


@router.post("/notifications/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    """Mark all notifications as read."""
    result = await db.notifications.update_many(
        {"user_id": current_user["id"], "read": False},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"marked_read": result.modified_count}


@router.get("/notifications/unread-count")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    """Get unread notification count (lightweight endpoint for polling)."""
    count = await db.notifications.count_documents(
        {"user_id": current_user["id"], "read": False}
    )
    return {"unread_count": count}
