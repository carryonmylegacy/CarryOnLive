"""CarryOn™ Backend — Customer Support Messaging"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from utils import get_current_user, send_push_notification, send_push_to_all_admins

router = APIRouter()

# ===================== CUSTOMER SUPPORT MESSAGING =====================


class SupportMessageCreate(BaseModel):
    content: str
    conversation_id: Optional[str] = None


class SupportMessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    sender_name: str
    sender_role: str
    content: str
    created_at: str
    read: bool = False


@router.post("/support/messages")
async def send_support_message(
    data: SupportMessageCreate, current_user: dict = Depends(get_current_user)
):
    """Send a message to/from customer support"""
    # For users, conversation_id is their user_id
    # For admins responding, they provide the conversation_id (user's id)

    if current_user["role"] in ("admin", "operator"):
        if not data.conversation_id:
            raise HTTPException(
                status_code=400, detail="Conversation ID required for admin responses"
            )
        conversation_id = data.conversation_id
    else:
        conversation_id = current_user["id"]

    message = {
        "id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", current_user.get("email", "User")),
        "sender_role": "admin" if current_user["role"] in ("admin", "operator") else current_user["role"],
        "content": data.content,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False,
    }

    await db.support_messages.insert_one(message)

    # Send push notification
    if current_user["role"] in ("admin", "operator"):
        # Admin sent message -> notify user
        asyncio.create_task(
            send_push_notification(
                conversation_id,
                "CarryOn™ Support",
                data.content[:100] + "..." if len(data.content) > 100 else data.content,
                "/support",
                "support-message",
                "support",
            )
        )
    else:
        # User sent message -> notify admins
        asyncio.create_task(
            send_push_to_all_admins(
                "New Support Message",
                f"{current_user.get('name', 'User')}: {data.content[:80]}...",
                "/admin/support",
                "admin-support",
            )
        )

    return {k: v for k, v in message.items() if k != "_id"}


@router.get("/support/messages")
async def get_my_support_messages(current_user: dict = Depends(get_current_user)):
    """Get support messages for the current user"""
    conversation_id = current_user["id"]
    messages = (
        await db.support_messages.find({"conversation_id": conversation_id}, {"_id": 0})
        .sort("created_at", 1)
        .to_list(500)
    )

    # Mark messages from support as read
    await db.support_messages.update_many(
        {"conversation_id": conversation_id, "sender_role": "admin", "read": False},
        {"$set": {"read": True}},
    )

    return messages


@router.get("/support/messages/{conversation_id}")
async def get_conversation_messages(
    conversation_id: str, current_user: dict = Depends(get_current_user)
):
    """Admin/Operator: Get messages for a specific conversation"""
    if current_user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Admin access required")

    messages = (
        await db.support_messages.find({"conversation_id": conversation_id}, {"_id": 0})
        .sort("created_at", 1)
        .to_list(500)
    )

    # Mark messages from user as read
    await db.support_messages.update_many(
        {
            "conversation_id": conversation_id,
            "sender_role": {"$ne": "admin"},
            "read": False,
        },
        {"$set": {"read": True}},
    )

    return messages


@router.get("/support/conversations")
async def get_all_conversations(
    include_deleted: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Admin: Get all support conversations with latest message.
    include_deleted=true shows soft-deleted conversations (founder only)."""
    if current_user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Admin access required")

    # Build match stage — exclude soft-deleted unless founder requests them
    match_stage = {}
    if include_deleted and current_user["role"] == "admin":
        # Founder sees everything, including deleted
        pass
    else:
        match_stage["soft_deleted"] = {"$ne": True}

    # Get unique conversation IDs and their latest messages
    pipeline = [
        {"$match": match_stage},
        {"$sort": {"created_at": -1}},
        {
            "$group": {
                "_id": "$conversation_id",
                "latest_message": {"$first": "$content"},
                "latest_time": {"$first": "$created_at"},
                "sender_name": {"$first": "$sender_name"},
                "sender_role": {"$first": "$sender_role"},
                "soft_deleted": {"$first": {"$ifNull": ["$soft_deleted", False]}},
                "deleted_at": {"$first": "$deleted_at"},
                "deleted_by": {"$first": "$deleted_by"},
                "unread_count": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$eq": ["$read", False]},
                                    {"$ne": ["$sender_role", "admin"]},
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
            }
        },
        {"$sort": {"latest_time": -1}},
    ]

    conversations = await db.support_messages.aggregate(pipeline).to_list(200)

    # Enrich with user info
    result = []
    for conv in conversations:
        user = await db.users.find_one(
            {"id": conv["_id"]}, {"_id": 0, "name": 1, "email": 1, "role": 1}
        )
        result.append(
            {
                "conversation_id": str(conv["_id"]),
                "user_name": user.get("name", "Unknown") if user else "Unknown",
                "user_email": user.get("email", "") if user else "",
                "user_role": user.get("role", "benefactor") if user else "benefactor",
                "latest_message": conv["latest_message"][:100] + "..."
                if len(conv["latest_message"]) > 100
                else conv["latest_message"],
                "latest_time": conv["latest_time"],
                "sender_role": conv["sender_role"],
                "unread_count": conv["unread_count"],
                "soft_deleted": conv.get("soft_deleted", False),
                "deleted_at": conv.get("deleted_at"),
            }
        )

    return result


@router.get("/support/unread-count")
async def get_unread_support_count(current_user: dict = Depends(get_current_user)):
    """Get count of unread support messages"""
    if current_user["role"] in ("admin", "operator"):
        # Staff sees unread from users
        count = await db.support_messages.count_documents(
            {"sender_role": {"$ne": "admin"}, "read": False}
        )
    else:
        # User sees unread from support
        count = await db.support_messages.count_documents(
            {
                "conversation_id": current_user["id"],
                "sender_role": "admin",
                "read": False,
            }
        )
    return {"unread_count": count}


@router.delete("/admin/support/conversation/{conversation_id}")
async def delete_support_conversation(
    conversation_id: str, current_user: dict = Depends(get_current_user)
):
    """Soft-delete all messages in a support conversation — admin/operator."""
    if current_user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Admin or operator only")
    # Soft-delete: mark messages as deleted instead of removing them
    await db.support_messages.update_many(
        {"conversation_id": conversation_id},
        {"$set": {
            "soft_deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "deleted_by": current_user["id"],
            "deleted_by_role": current_user["role"],
        }}
    )
    return {"soft_deleted": True, "conversation_id": conversation_id}


@router.post("/admin/support/conversation/{conversation_id}/restore")
async def restore_support_conversation(
    conversation_id: str, current_user: dict = Depends(get_current_user)
):
    """Restore a soft-deleted support conversation — founder (admin) only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only the Founder can restore deleted items")
    result = await db.support_messages.update_many(
        {"conversation_id": conversation_id, "soft_deleted": True},
        {"$unset": {"soft_deleted": "", "deleted_at": "", "deleted_by": "", "deleted_by_role": ""}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="No deleted conversation found")
    return {"restored": True, "conversation_id": conversation_id}
