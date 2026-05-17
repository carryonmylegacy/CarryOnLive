"""CarryOn™ Backend — EGA Chat History + Sessions endpoints

Extracted from `routes/guardian.py` on Feb 17, 2026 as part of the
monolith-reduction pass. Owns the 4 EGA chat-history/session endpoints:

  GET    /chat/history/{session_id}    (per-session messages)
  GET    /chat/sessions                (all sessions for current user)
  DELETE /chat/sessions/{session_id}   (delete one session)
  DELETE /chat/sessions                (clear all conversations)

These endpoints only read/write `db.chat_history` scoped to the
authenticated user's id — they never cross user boundaries and they
share NO state with the rest of guardian.py (no semaphore, no xAI
client, no estate context). Isolating them lets the conversation-list
surface evolve independently of the generation pipeline.

Mounted in `server.py` alongside the rest of the guardian routers.
"""

from fastapi import APIRouter, Depends, HTTPException

from config import db
from utils import get_current_user

router = APIRouter()


@router.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve chat history with the Estate Guardian."""
    history = (
        await db.chat_history.find({"session_id": session_id, "user_id": current_user["id"]}, {"_id": 0})
        .sort("created_at", 1)
        .to_list(100)
    )
    return history


@router.get("/chat/sessions")
async def get_chat_sessions(current_user: dict = Depends(get_current_user)):
    """Get all chat sessions for the current user, most recent first."""
    pipeline = [
        {"$match": {"user_id": current_user["id"]}},
        {"$sort": {"created_at": 1}},
        {
            "$group": {
                "_id": "$session_id",
                "first_message": {"$first": "$content"},
                "first_role": {"$first": "$role"},
                "last_message_at": {"$last": "$created_at"},
                "message_count": {"$sum": 1},
                "messages": {"$push": {"role": "$role", "content": "$content"}},
            }
        },
        {"$sort": {"last_message_at": -1}},
        {"$limit": 100},
    ]
    sessions_raw = await db.chat_history.aggregate(pipeline).to_list(100)

    sessions = []
    for s in sessions_raw:
        # Find the first user message for the title
        user_msgs = [m for m in s["messages"] if m["role"] == "user"]
        title = user_msgs[0]["content"][:80] if user_msgs else "New conversation"
        # Truncate with ellipsis
        if len(title) > 60:
            title = title[:60].rsplit(" ", 1)[0] + "..."

        sessions.append(
            {
                "session_id": str(s["_id"]),
                "title": title,
                "last_message_at": s["last_message_at"],
                "message_count": s["message_count"],
            }
        )

    return sessions


@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a chat session."""
    result = await db.chat_history.delete_many({"session_id": session_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "deleted": result.deleted_count}


@router.delete("/chat/sessions")
async def delete_all_chat_sessions(current_user: dict = Depends(get_current_user)):
    """Hard-delete every EGA conversation belonging to the current user.

    Surfaced as a 'Clear all conversations' button on the Guardian landing
    page. Backed by a destructive delete_many on chat_history scoped to the
    authenticated user's id — never crosses user boundaries.
    """
    result = await db.chat_history.delete_many({"user_id": current_user["id"]})
    return {"success": True, "deleted": result.deleted_count}
