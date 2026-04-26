"""CarryOn™ Backend — Customer Support Messaging"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from guards import require_admin, require_staff
from utils import get_current_user, send_push_notification, send_push_to_all_admins

router = APIRouter()

# ===================== CUSTOMER SUPPORT MESSAGING =====================


class SupportMessageCreate(BaseModel):
    content: str
    conversation_id: Optional[str] = None
    thread_id: Optional[str] = None  # Topic thread within the user's conversation.


class SupportMessageResponse(BaseModel):
    id: str
    conversation_id: str
    thread_id: Optional[str] = None
    sender_id: str
    sender_name: str
    sender_role: str
    content: str
    created_at: str
    read: bool = False


class SupportThreadCreate(BaseModel):
    """User-facing: create a new topic thread with CarryOn Customer Support (CCS)."""

    title: str


@router.post("/support/messages")
async def send_support_message(data: SupportMessageCreate, current_user: dict = Depends(get_current_user)):
    """Send a message to/from customer support"""
    # For users, conversation_id is their user_id
    # For admins responding, they provide the conversation_id (user's id)

    if current_user["role"] in ("admin", "operator"):
        if not data.conversation_id:
            raise HTTPException(status_code=400, detail="Conversation ID required for admin responses")
        conversation_id = data.conversation_id
    else:
        conversation_id = current_user["id"]

    message = {
        "id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        # Thread = a topic-scoped sub-conversation within the user's support
        # history. "default" is the catch-all legacy bucket. A user can
        # open as many named threads as they like ("Billing question",
        # "How do I invite my dad?", etc.) — see CCS two-pane UI.
        "thread_id": data.thread_id or "default",
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", current_user.get("email", "User")),
        "sender_role": "admin" if current_user["role"] in ("admin", "operator") else current_user["role"],
        "content": data.content,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False,
    }

    await db.support_messages.insert_one(message)

    # Send push notification + in-app notification
    from services.notifications import notify

    if current_user["role"] in ("admin", "operator"):
        # Admin sent message -> notify user (push + in-app)
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
        asyncio.create_task(
            notify.benefactor(
                conversation_id,
                "Support Reply",
                data.content[:100] + ("..." if len(data.content) > 100 else ""),
                url="/support",
            )
        )
    else:
        # User sent message -> notify all staff (push + in-app)
        asyncio.create_task(
            send_push_to_all_admins(
                "New Support Message",
                f"{current_user.get('name', 'User')}: {data.content[:80]}...",
                "/admin/support",
                "admin-support",
            )
        )
        asyncio.create_task(
            notify.p4_alert(
                "New Support Message",
                f"{current_user.get('name', 'User')}: {data.content[:80]}",
                url="/ops/support",
            )
        )

    return {k: v for k, v in message.items() if k != "_id"}


@router.get("/support/messages")
async def get_my_support_messages(
    thread_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get support messages for the current user, optionally scoped to a
    single topic thread. Omitting `thread_id` returns the legacy "default"
    thread for backward compatibility with old clients."""
    conversation_id = current_user["id"]
    query = {"conversation_id": conversation_id}
    query["thread_id"] = thread_id if thread_id else "default"

    messages = await db.support_messages.find(query, {"_id": 0}).sort("created_at", 1).to_list(500)

    # Mark messages from support as read in THIS thread only.
    await db.support_messages.update_many(
        {**query, "sender_role": "admin", "read": False},
        {"$set": {"read": True}},
    )

    return messages


# ── User-facing topic threads (CCS two-pane UI) ────────────────────────────
@router.get("/support/threads")
async def list_my_support_threads(current_user: dict = Depends(get_current_user)):
    """List every CCS conversation thread the current user has ever opened,
    newest-activity first, with last-message preview + unread count."""
    conversation_id = current_user["id"]
    pipeline = [
        {"$match": {"conversation_id": conversation_id, "soft_deleted": {"$ne": True}}},
        {"$sort": {"created_at": -1}},
        {
            "$group": {
                "_id": {"$ifNull": ["$thread_id", "default"]},
                "latest_message": {"$first": "$content"},
                "latest_time": {"$first": "$created_at"},
                "latest_sender_role": {"$first": "$sender_role"},
                "unread_count": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$eq": ["$read", False]},
                                    {"$eq": ["$sender_role", "admin"]},
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
    grouped = await db.support_messages.aggregate(pipeline).to_list(200)

    # Overlay any titles stored in support_threads (user-provided names).
    titles = {}
    async for doc in db.support_threads.find(
        {"conversation_id": conversation_id}, {"_id": 0, "id": 1, "thread_id": 1, "title": 1}
    ):
        titles[doc["thread_id"]] = doc.get("title", "")

    threads = []
    for row in grouped:
        tid = row["_id"] or "default"
        threads.append(
            {
                "thread_id": tid,
                "title": titles.get(tid, "General support" if tid == "default" else "Conversation"),
                "latest_message": (row["latest_message"][:120] + "…")
                if len(row["latest_message"]) > 120
                else row["latest_message"],
                "latest_time": row["latest_time"],
                "latest_sender_role": row["latest_sender_role"],
                "unread_count": row["unread_count"],
            }
        )
    return threads


@router.post("/support/threads")
async def create_my_support_thread(
    data: SupportThreadCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new named topic thread under the user's conversation. Does
    NOT post a message — the thread becomes visible in the list as soon as
    the first message is sent to it."""
    title = (data.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if len(title) > 120:
        title = title[:120]
    thread_id = str(uuid.uuid4())
    await db.support_threads.insert_one(
        {
            "thread_id": thread_id,
            "conversation_id": current_user["id"],
            "title": title,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"thread_id": thread_id, "title": title}


@router.get("/support/messages/{conversation_id}")
async def get_conversation_messages(conversation_id: str, current_user: dict = Depends(require_staff)):
    """Admin/Operator: Get messages for a specific conversation"""

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
async def get_all_conversations(include_deleted: bool = False, current_user: dict = Depends(require_staff)):
    """Admin: Get all support conversations with latest message.
    include_deleted=true shows soft-deleted conversations (founder only)."""

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
        user = await db.users.find_one({"id": conv["_id"]}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1})
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


@router.get("/support/conversations-by-thread")
async def get_conversations_by_thread(
    include_deleted: bool = False,
    current_user: dict = Depends(require_staff),
):
    """Admin variant of /support/conversations that groups by
    (conversation_id, thread_id) so the Customer Support panel can
    show one row per topic-thread instead of a single flattened row
    per user. Each row carries the latest message + unread count for
    that specific thread.
    """
    match_stage: dict = {}
    if not (include_deleted and current_user["role"] == "admin"):
        match_stage["soft_deleted"] = {"$ne": True}

    pipeline = [
        {"$match": match_stage},
        {"$sort": {"created_at": -1}},
        {
            "$group": {
                "_id": {
                    "conversation_id": "$conversation_id",
                    "thread_id": {"$ifNull": ["$thread_id", "default"]},
                },
                "latest_message": {"$first": "$content"},
                "latest_time": {"$first": "$created_at"},
                "sender_name": {"$first": "$sender_name"},
                "sender_role": {"$first": "$sender_role"},
                "soft_deleted": {"$first": {"$ifNull": ["$soft_deleted", False]}},
                "deleted_at": {"$first": "$deleted_at"},
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
                "message_count": {"$sum": 1},
            }
        },
        {"$sort": {"latest_time": -1}},
    ]

    rows = await db.support_messages.aggregate(pipeline).to_list(500)

    # Look up thread titles in bulk to avoid N user lookups.
    thread_keys = {(r["_id"]["conversation_id"], r["_id"]["thread_id"]) for r in rows}
    titles = {}
    if thread_keys:
        thread_docs = await db.support_threads.find(
            {"$or": [{"conversation_id": c, "thread_id": t} for c, t in thread_keys]},
            {"_id": 0, "id": 1, "conversation_id": 1, "thread_id": 1, "title": 1},
        ).to_list(1000)
        for d in thread_docs:
            titles[(d["conversation_id"], d["thread_id"])] = d.get("title", "")

    user_ids = list({r["_id"]["conversation_id"] for r in rows})
    users = await db.users.find(
        {"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
    ).to_list(500)
    user_by_id = {u["id"]: u for u in users}

    result = []
    for r in rows:
        cid = r["_id"]["conversation_id"]
        tid = r["_id"]["thread_id"]
        u = user_by_id.get(cid, {})
        msg = r["latest_message"] or ""
        result.append(
            {
                "conversation_id": cid,
                "thread_id": tid,
                "thread_title": titles.get((cid, tid), "" if tid == "default" else "(untitled thread)"),
                "user_name": u.get("name", "Unknown"),
                "user_email": u.get("email", ""),
                "user_role": u.get("role", "benefactor"),
                "latest_message": msg[:100] + ("..." if len(msg) > 100 else ""),
                "latest_time": r["latest_time"],
                "sender_role": r["sender_role"],
                "unread_count": r["unread_count"],
                "message_count": r["message_count"],
                "soft_deleted": r.get("soft_deleted", False),
                "deleted_at": r.get("deleted_at"),
            }
        )
    return result


@router.get("/support/unread-count")
async def get_unread_support_count(current_user: dict = Depends(get_current_user)):
    """Get count of unread support messages"""
    if current_user["role"] in ("admin", "operator"):
        # Staff sees unread from users
        count = await db.support_messages.count_documents({"sender_role": {"$ne": "admin"}, "read": False})
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
async def delete_support_conversation(conversation_id: str, current_user: dict = Depends(require_staff)):
    """Soft-delete all messages in a support conversation — admin/operator."""
    # Soft-delete: mark messages as deleted instead of removing them
    await db.support_messages.update_many(
        {"conversation_id": conversation_id},
        {
            "$set": {
                "soft_deleted": True,
                "deleted_at": datetime.now(timezone.utc).isoformat(),
                "deleted_by": current_user["id"],
                "deleted_by_role": current_user["role"],
            }
        },
    )
    return {"soft_deleted": True, "conversation_id": conversation_id}


@router.post("/admin/support/conversation/{conversation_id}/restore")
async def restore_support_conversation(conversation_id: str, current_user: dict = Depends(require_admin)):
    """Restore a soft-deleted support conversation — founder (admin) only."""
    result = await db.support_messages.update_many(
        {"conversation_id": conversation_id, "soft_deleted": True},
        {
            "$unset": {
                "soft_deleted": "",
                "deleted_at": "",
                "deleted_by": "",
                "deleted_by_role": "",
            }
        },
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="No deleted conversation found")
    return {"restored": True, "conversation_id": conversation_id}


class P1EmergencyRequest(BaseModel):
    reason: str = "sealed_account"  # sealed_account, death_cert_error, transition_error


@router.post("/support/p1-emergency")
async def create_p1_emergency_thread(
    data: P1EmergencyRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a Priority 1 emergency support thread.
    Auto-sends a message and alerts ALL staff with Amber Alert."""
    reason_labels = {
        "sealed_account": "Account incorrectly sealed — benefactor reports being alive",
        "death_cert_error": "Death certificate uploaded in error — benefactor reports being alive",
        "transition_error": "Estate transition initiated in error — benefactor reports being alive",
    }

    reason_text = reason_labels.get(data.reason, f"Priority 1 Emergency: {data.reason}")

    # Create the emergency message
    message = {
        "id": str(uuid.uuid4()),
        "conversation_id": current_user["id"],
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", current_user.get("email", "User")),
        "sender_role": current_user["role"],
        "content": f"PRIORITY 1 EMERGENCY: {reason_text}\n\nThis user has triggered an emergency alert indicating they are alive and their account may have been incorrectly transitioned. IMMEDIATE ACTION REQUIRED.",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False,
        "priority": "p1",
        "is_emergency": True,
    }
    await db.support_messages.insert_one(message)

    # Mark conversation as P1
    await db.support_conversations.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "user_id": current_user["id"],
                "priority": "p1",
                "is_emergency": True,
                "status": "open",
                "subject": f"P1 EMERGENCY: {current_user.get('name', 'User')}",
                "user_name": current_user.get("name", ""),
                "user_email": current_user.get("email", ""),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )

    # Send Amber Alert to ALL staff (critical security alert)
    from services.notifications import notify

    asyncio.create_task(
        notify.all_staff_security(
            "P1 EMERGENCY: Benefactor Reports Being Alive",
            f"{current_user.get('name', 'User')} ({current_user.get('email', '')}) has triggered an I'm Still Alive emergency. Reason: {data.reason}. IMMEDIATE ACTION REQUIRED.",
            url="/ops/support",
            metadata={
                "user_id": current_user["id"],
                "user_name": current_user.get("name", ""),
                "reason": data.reason,
                "emergency": True,
            },
        )
    )

    return {
        "success": True,
        "message": "Emergency alert sent to all staff. A support team member will contact you immediately.",
        "conversation_id": current_user["id"],
    }
