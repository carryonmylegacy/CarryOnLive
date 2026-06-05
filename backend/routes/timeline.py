"""CarryOn™ Backend — Legacy Timeline Routes"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from config import db
from services.access_control import (
    beneficiary_section_enabled,
    can_access_document,
    can_access_message,
    require_beneficiary_section_access,
    require_estate_actor,
)
from utils import get_current_user

router = APIRouter()


@router.get("/timeline/{estate_id}")
async def get_legacy_timeline(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Build a chronological timeline of all estate events."""
    actor = await require_estate_actor(estate_id, current_user, allow_staff=True)
    await require_beneficiary_section_access(actor, "timeline")
    estate = actor["estate"]
    can_view_all = actor.get("is_owner") or actor.get("is_admin") or actor.get("is_operator")
    # Per-section gates — a beneficiary whose Vault / Messages / Checklist section
    # is disabled must not learn anything about those sections via the timeline
    # (audit 05c1776 P1.5).
    vault_ok = bool(can_view_all) or await beneficiary_section_enabled(actor, "vault")
    messages_ok = bool(can_view_all) or await beneficiary_section_enabled(actor, "messages")
    checklist_ok = bool(can_view_all) or await beneficiary_section_enabled(actor, "checklist")

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
    docs = []
    if vault_ok:
        docs = await db.documents.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
        if not can_view_all:
            docs = [doc for doc in docs if can_access_document(doc, actor)]
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

    # 3. Beneficiaries added — roster events are owner/admin only (a beneficiary
    # must not learn the full co-beneficiary roster via the timeline).
    bens = []
    if can_view_all:
        bens = await db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
        for ben in bens:
            ben_user = await db.users.find_one({"id": ben.get("user_id")}, {"_id": 0, "id": 1, "name": 1})
            name = ben_user.get("name", ben.get("email", "Someone")) if ben_user else ben.get("email", "Someone")
            status = ben.get("status", "invited")
            events.append(
                {
                    "type": "beneficiary_added",
                    "category": "family",
                    "title": "Beneficiary Invited" if status == "invited" else "Beneficiary Joined",
                    "description": name,
                    "date": ben.get("created_at", ben.get("invited_at", "")),
                    "icon": "users",
                    "link": "/beneficiaries",
                    "metadata": {"status": status},
                }
            )

    # 4. Messages created
    msgs = []
    if messages_ok:
        msgs = await db.messages.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
        if not can_view_all:
            msgs = [msg for msg in msgs if can_access_message(msg, actor)]
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
    checklists = []
    if checklist_ok:
        checklists = await db.checklists.find({"estate_id": estate_id}, {"_id": 0}).to_list(500)
    for item in checklists:
        if item.get("is_completed") or item.get("completed"):
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

    # 6. Edit history — owner/admin only. Edit metadata (editor names, wallet /
    # beneficiary / document change details) must never be exposed to a
    # beneficiary through the timeline.
    edits = []
    if can_view_all:
        edits = await db.edit_history.find({"estate_id": estate_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
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

    # 7. Activity log entries (catch-all) — owner/admin only.
    activities = []
    if can_view_all:
        activities = (
            await db.activity_log.find({"estate_id": estate_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
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
        "checklist_completed": sum(1 for c in checklists if c.get("is_completed") or c.get("completed")),
        "estate_name": estate.get("name", "Estate"),
        "created_at": estate.get("created_at", ""),
    }

    return {"events": events, "summary": summary}
