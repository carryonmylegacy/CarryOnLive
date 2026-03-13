"""CarryOn™ Backend — Legacy Timeline Routes"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from config import db
from utils import get_current_user

router = APIRouter()


@router.get("/timeline/{estate_id}")
async def get_legacy_timeline(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
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
            "link": "/dashboard",
        }
    )

    # 2. Documents uploaded
    docs = await db.documents.find({"estate_id": estate_id}, {"_id": 0}).to_list(500)
    for doc in docs:
        events.append(
            {
                "type": "document_uploaded",
                "category": "document",
                "title": "Document Added",
                "description": doc.get("name", "Untitled document"),
                "date": doc.get("created_at", doc.get("uploaded_at", "")),
                "icon": "file",
                "link": "/vault",
                "metadata": {
                    "category": doc.get("category", ""),
                    "doc_id": doc.get("id", ""),
                },
            }
        )

    # 3. Beneficiaries added
    bens = await db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0}).to_list(
        100
    )
    for ben in bens:
        ben_user = await db.users.find_one(
            {"id": ben.get("user_id")}, {"_id": 0, "id": 1, "name": 1}
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
                "link": "/beneficiaries",
                "metadata": {"status": status},
            }
        )

    # 4. Messages created
    msgs = await db.messages.find({"estate_id": estate_id}, {"_id": 0}).to_list(500)
    for msg in msgs:
        events.append(
            {
                "type": "message_created",
                "category": "message",
                "title": f"{msg.get('type', '').replace('_', ' ').title()} Message Created",
                "description": msg.get("title", "Untitled message"),
                "date": msg.get("created_at", ""),
                "icon": "message",
                "link": "/messages",
                "metadata": {
                    "recipient": msg.get("recipient_name", ""),
                    "type": msg.get("type", ""),
                    "msg_id": msg.get("id", ""),
                },
            }
        )

    # 5. Checklist items completed
    checklists = await db.checklists.find({"estate_id": estate_id}, {"_id": 0}).to_list(
        500
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
                        "completed_at",
                        item.get("updated_at", item.get("created_at", "")),
                    ),
                    "icon": "check",
                    "link": "/checklist",
                }
            )

    # 6. Edit history (message edits, document edits, etc.)
    edits = (
        await db.edit_history.find({"estate_id": estate_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    for edit in edits:
        item_type = edit.get("item_type", "item")
        changed = edit.get("changed_fields", [])
        changed_str = ", ".join(changed[:3]) if changed else "content"

        if item_type == "message":
            events.append(
                {
                    "type": "message_edited",
                    "category": "message",
                    "title": "Message Edited",
                    "description": f'Updated {changed_str} on "{edit.get("title", "message")}"',
                    "date": edit.get("created_at", ""),
                    "icon": "message",
                    "link": "/messages",
                    "metadata": {
                        "edited_by": edit.get("user_name", ""),
                        "msg_id": edit.get("item_id", ""),
                    },
                }
            )
        elif item_type == "document":
            events.append(
                {
                    "type": "document_edited",
                    "category": "document",
                    "title": "Document Updated",
                    "description": f'Updated {changed_str} on "{edit.get("title", "document")}"',
                    "date": edit.get("created_at", ""),
                    "icon": "file",
                    "link": "/vault",
                    "metadata": {"edited_by": edit.get("user_name", "")},
                }
            )
        elif item_type == "checklist":
            action = edit.get("action", "edited")
            events.append(
                {
                    "type": f"checklist_{action}",
                    "category": "checklist",
                    "title": f"IAC Item {'Completed' if action == 'completed' else 'Uncompleted' if action == 'uncompleted' else 'Updated'}",
                    "description": edit.get("title", "checklist item"),
                    "date": edit.get("created_at", ""),
                    "icon": "check",
                    "link": "/checklist",
                    "metadata": {"edited_by": edit.get("user_name", "")},
                }
            )
        elif item_type == "digital_wallet":
            events.append(
                {
                    "type": "wallet_edited",
                    "category": "activity",
                    "title": "Digital Wallet Updated",
                    "description": f'Updated "{edit.get("title", "account")}"',
                    "date": edit.get("created_at", ""),
                    "icon": "activity",
                    "link": "/digital-wallet",
                    "metadata": {"edited_by": edit.get("user_name", "")},
                }
            )
        elif item_type == "beneficiary":
            changed = edit.get("changed_fields", [])
            changed_str = ", ".join(changed[:3]) if changed else "details"
            events.append(
                {
                    "type": "beneficiary_edited",
                    "category": "family",
                    "title": "Beneficiary Updated",
                    "description": f"Updated {changed_str} for {edit.get('title', 'beneficiary')}",
                    "date": edit.get("created_at", ""),
                    "icon": "users",
                    "link": "/beneficiaries",
                    "metadata": {"edited_by": edit.get("user_name", "")},
                }
            )

    # 7. Activity log entries (catch-all)
    activities = (
        await db.activity_log.find({"estate_id": estate_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    seen_actions = set()
    for act in activities:
        key = f"{act.get('action')}_{act.get('description', '')}"
        if key in seen_actions:
            continue
        seen_actions.add(key)
        action = act.get("action", "")
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
                "link": None,
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
        "checklist_completed": sum(1 for c in checklists if c.get("completed")),
        "estate_name": estate.get("name", "Estate"),
        "created_at": estate.get("created_at", ""),
    }

    return {"events": events, "summary": summary}
