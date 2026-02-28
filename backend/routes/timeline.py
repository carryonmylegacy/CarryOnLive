"""CarryOn™ Backend — Legacy Timeline Routes"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from config import db
from utils import get_current_user

router = APIRouter()


@router.get("/timeline/{estate_id}")
async def get_legacy_timeline(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Build a chronological timeline of all estate events."""
    # Verify access
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    is_owner = estate.get("owner_id") == current_user["id"]
    is_ben = await db.beneficiaries.find_one(
        {"estate_id": estate_id, "user_id": current_user["id"]}, {"_id": 0}
    )
    is_admin = current_user.get("role") == "admin"
    if not is_owner and not is_ben and not is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    events = []

    # 1. Estate creation
    events.append(
        {
            "type": "estate_created",
            "category": "milestone",
            "title": "Estate Created",
            "description": f'"{estate.get("name", "Estate")}" was established',
            "date": estate.get("created_at", ""),
            "icon": "shield",
        }
    )

    # 2. Documents uploaded
    docs = (
        await db.documents.find({"estate_id": estate_id}, {"_id": 0}).to_list(500)
    )
    for doc in docs:
        events.append(
            {
                "type": "document_uploaded",
                "category": "document",
                "title": "Document Added",
                "description": doc.get("name", "Untitled document"),
                "date": doc.get("created_at", doc.get("uploaded_at", "")),
                "icon": "file",
                "metadata": {
                    "category": doc.get("category", ""),
                    "doc_id": doc.get("id", ""),
                },
            }
        )

    # 3. Beneficiaries added
    bens = (
        await db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
    )
    for ben in bens:
        # Look up name
        ben_user = await db.users.find_one(
            {"id": ben.get("user_id")}, {"_id": 0, "name": 1}
        )
        name = (
            ben_user.get("name", ben.get("email", "Someone"))
            if ben_user
            else ben.get("email", "Someone")
        )
        status = ben.get("status", "invited")
        events.append(
            {
                "type": "beneficiary_added",
                "category": "family",
                "title": "Beneficiary Invited"
                if status == "invited"
                else "Beneficiary Joined",
                "description": name,
                "date": ben.get("created_at", ben.get("invited_at", "")),
                "icon": "users",
                "metadata": {"status": status},
            }
        )

    # 4. Messages created
    msgs = (
        await db.messages.find({"estate_id": estate_id}, {"_id": 0}).to_list(500)
    )
    for msg in msgs:
        events.append(
            {
                "type": "message_created",
                "category": "message",
                "title": f'{msg.get("type", "").replace("_", " ").title()} Message',
                "description": msg.get("title", "Untitled message"),
                "date": msg.get("created_at", ""),
                "icon": "message",
                "metadata": {
                    "recipient": msg.get("recipient_name", ""),
                    "type": msg.get("type", ""),
                },
            }
        )

    # 5. Checklist items completed
    checklists = (
        await db.checklists.find({"estate_id": estate_id}, {"_id": 0}).to_list(500)
    )
    for item in checklists:
        if item.get("completed"):
            events.append(
                {
                    "type": "checklist_completed",
                    "category": "checklist",
                    "title": "Checklist Item Completed",
                    "description": item.get("title", "Untitled item"),
                    "date": item.get(
                        "completed_at", item.get("updated_at", item.get("created_at", ""))
                    ),
                    "icon": "check",
                }
            )

    # 6. Activity log entries (catch-all for other events)
    activities = (
        await db.activity_log.find({"estate_id": estate_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    seen_actions = set()
    for act in activities:
        key = f'{act.get("action")}_{act.get("description", "")}'
        if key in seen_actions:
            continue
        seen_actions.add(key)
        action = act.get("action", "")
        # Skip generic actions already covered above
        if action in ("document_upload", "beneficiary_invite", "message_create"):
            continue
        events.append(
            {
                "type": "activity",
                "category": "activity",
                "title": action.replace("_", " ").title(),
                "description": act.get("description", ""),
                "date": act.get("created_at", ""),
                "icon": "activity",
            }
        )

    # Sort by date descending (newest first)
    def parse_date(e):
        try:
            d = e.get("date", "")
            if not d:
                return datetime.min.replace(tzinfo=timezone.utc)
            return datetime.fromisoformat(d.replace("Z", "+00:00"))
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)

    events.sort(key=parse_date, reverse=True)

    # Build summary stats
    summary = {
        "total_events": len(events),
        "documents": len(docs),
        "beneficiaries": len(bens),
        "messages": len(msgs),
        "checklist_completed": sum(
            1 for c in checklists if c.get("completed")
        ),
        "estate_name": estate.get("name", "Estate"),
        "created_at": estate.get("created_at", ""),
    }

    return {"events": events, "summary": summary}
