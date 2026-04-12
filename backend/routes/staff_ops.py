"""CarryOn™ — Staff Operations Routes

Extracted from staff_tools.py for maintainability.
Operator-facing endpoints: Activity Log, Quick Search, Escalations,
Shift Notes, and Knowledge Base.
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from config import db
from guards import check_founder_role as require_founder
from guards import check_staff_role as require_staff
from services.audit import get_client_ip, log_audit_event
from utils import get_current_user

router = APIRouter()


# ══════════════════════════════════════════════════════════
# MY ACTIVITY LOG (Operator sees own actions)
# ══════════════════════════════════════════════════════════


@router.get("/ops/my-activity")
async def get_my_activity(
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    entries = (
        await db.audit_trail.find({"actor_id": current_user["id"]}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(limit)
        .to_list(limit)
    )
    return entries


# ══════════════════════════════════════════════════════════
# QUICK SEARCH (Search across all queues)
# ══════════════════════════════════════════════════════════


@router.get("/ops/search")
async def quick_search(
    q: str = Query(..., min_length=2),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    query_lower = q.lower()
    results = []

    # Search support conversations
    support = await db.support_conversations.find(
        {"deleted_at": {"$exists": False}},
        {"_id": 0, "id": 1, "user_email": 1, "user_name": 1, "status": 1, "subject": 1},
    ).to_list(500)
    for s in support:
        if not s.get("id"):
            continue  # Skip records without id
        if (
            query_lower in (s.get("user_email", "") or "").lower()
            or query_lower in (s.get("user_name", "") or "").lower()
            or query_lower in (s.get("subject", "") or "").lower()
        ):
            results.append(
                {
                    "type": "support",
                    "id": s["id"],
                    "title": s.get("subject", s.get("user_name", "Support Ticket")),
                    "subtitle": s.get("user_email", ""),
                    "status": s.get("status", ""),
                }
            )

    # Search users
    users = await db.users.find(
        {
            "$or": [
                {"email": {"$regex": q, "$options": "i"}},
                {"name": {"$regex": q, "$options": "i"}},
            ]
        },
        {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1},
    ).to_list(20)
    for u in users:
        if not u.get("id"):
            continue  # Skip records without id
        results.append(
            {
                "type": "user",
                "id": u["id"],
                "title": u.get("name", u.get("email", "")),
                "subtitle": u.get("email", ""),
                "status": u.get("role", ""),
            }
        )

    # Search DTS tasks
    dts = await db.dts_tasks.find(
        {"deleted_at": {"$exists": False}},
        {"_id": 0, "id": 1, "benefactor_name": 1, "benefactor_email": 1, "status": 1},
    ).to_list(500)
    for d in dts:
        if not d.get("id"):
            continue  # Skip records without id
        if (
            query_lower in (d.get("benefactor_email", "") or "").lower()
            or query_lower in (d.get("benefactor_name", "") or "").lower()
        ):
            results.append(
                {
                    "type": "dts",
                    "id": d["id"],
                    "title": d.get("benefactor_name", "DTS Task"),
                    "subtitle": d.get("benefactor_email", ""),
                    "status": d.get("status", ""),
                }
            )

    # Search verifications
    verifications = await db.id_verifications.find(
        {"deleted_at": {"$exists": False}},
        {
            "_id": 0,
            "id": 1,
            "user_email": 1,
            "user_name": 1,
            "status": 1,
            "verification_type": 1,
        },
    ).to_list(500)
    for v in verifications:
        if not v.get("id"):
            continue  # Skip records without id
        if (
            query_lower in (v.get("user_email", "") or "").lower()
            or query_lower in (v.get("user_name", "") or "").lower()
        ):
            results.append(
                {
                    "type": "verification",
                    "id": v["id"],
                    "title": v.get("user_name", "Verification"),
                    "subtitle": v.get("verification_type", v.get("user_email", "")),
                    "status": v.get("status", ""),
                }
            )

    return results[:50]


# ══════════════════════════════════════════════════════════
# ESCALATIONS (Operator creates, Manager/Founder resolves, Founder vetoes)
# ══════════════════════════════════════════════════════════


class EscalationCreate(BaseModel):
    subject: str
    description: str
    priority: str = "normal"  # low, normal, high, critical
    related_type: str = ""  # support, dts, verification, tvt
    related_id: str = ""


@router.post("/ops/escalations")
async def create_escalation(
    data: EscalationCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    now = datetime.now(timezone.utc)
    escalation = {
        "id": str(uuid4()),
        "subject": data.subject,
        "description": data.description,
        "priority": data.priority,
        "related_type": data.related_type,
        "related_id": data.related_id,
        "status": "open",
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", current_user["email"]),
        "created_at": now.isoformat(),
    }
    await db.escalations.insert_one(escalation)
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user.get("role", "operator"),
        action="escalation_create",
        category="operations",
        resource_type="escalation",
        resource_id=escalation["id"],
        details={"subject": data.subject, "priority": data.priority},
        ip_address=get_client_ip(request),
        severity="warning" if data.priority in ("high", "critical") else "info",
    )
    return {k: v for k, v in escalation.items() if k != "_id"}


@router.get("/ops/escalations")
async def list_escalations(
    status: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    query = {}
    if status:
        query["status"] = status
    items = await db.escalations.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


class EscalationResolve(BaseModel):
    resolution_note: str


@router.put("/ops/escalations/{escalation_id}/resolve")
async def resolve_escalation(
    escalation_id: str,
    data: EscalationResolve,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Resolve an escalation. Managers and Founders can resolve."""
    # Allow both admin AND managers to resolve
    if current_user.get("role") == "admin":
        pass  # Founder can always resolve
    elif current_user.get("role") == "operator" and current_user.get("operator_role") == "manager":
        pass  # Managers can resolve within their scope
    else:
        raise HTTPException(status_code=403, detail="Manager or Founder access required")

    now = datetime.now(timezone.utc)
    resolver_role = "admin" if current_user.get("role") == "admin" else "manager"

    result = await db.escalations.update_one(
        {"id": escalation_id, "status": "open"},
        {
            "$set": {
                "status": "resolved",
                "resolved_at": now.isoformat(),
                "resolved_by": current_user["id"],
                "resolved_by_name": current_user.get("name", current_user["email"]),
                "resolved_by_role": resolver_role,
                "resolution_note": data.resolution_note,
            }
        },
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Escalation not found or already resolved")
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user.get("role", "operator"),
        action="escalation_resolve",
        category="operations",
        resource_type="escalation",
        resource_id=escalation_id,
        details={"resolution_note": data.resolution_note[:200], "resolver_role": resolver_role},
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {"resolved": True}


class EscalationVeto(BaseModel):
    veto_note: str


@router.put("/ops/escalations/{escalation_id}/veto")
async def veto_escalation(
    escalation_id: str,
    data: EscalationVeto,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Founder vetoes/undoes a manager's resolution. Reopens the escalation."""
    require_founder(current_user)
    now = datetime.now(timezone.utc)

    esc = await db.escalations.find_one({"id": escalation_id}, {"_id": 0})
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation not found")

    if esc.get("status") != "resolved":
        raise HTTPException(status_code=400, detail="Can only veto resolved escalations")

    await db.escalations.update_one(
        {"id": escalation_id},
        {
            "$set": {
                "status": "open",
                "vetoed": True,
                "veto_note": data.veto_note,
                "vetoed_by": current_user["id"],
                "vetoed_by_name": current_user.get("name", current_user["email"]),
                "vetoed_at": now.isoformat(),
                "previous_resolution": esc.get("resolution_note"),
                "previous_resolved_by": esc.get("resolved_by_name"),
            },
            "$unset": {
                "resolved_at": "",
                "resolved_by": "",
                "resolved_by_name": "",
                "resolution_note": "",
            },
        },
    )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="escalation_veto",
        category="operations",
        resource_type="escalation",
        resource_id=escalation_id,
        details={"veto_note": data.veto_note[:200]},
        ip_address=get_client_ip(request),
        severity="warning",
    )
    return {"vetoed": True}


# ══════════════════════════════════════════════════════════
# SHIFT NOTES (Operators leave notes for each other)
# ══════════════════════════════════════════════════════════


class ShiftNoteCreate(BaseModel):
    content: str
    category: str = "general"  # general, urgent, followup


@router.post("/ops/shift-notes")
async def create_shift_note(
    data: ShiftNoteCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    now = datetime.now(timezone.utc)
    note = {
        "id": str(uuid4()),
        "content": data.content,
        "category": data.category,
        "author_id": current_user["id"],
        "author_name": current_user.get("name", current_user["email"]),
        "created_at": now.isoformat(),
        "acknowledged_by": [],
    }
    await db.shift_notes.insert_one(note)
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user.get("role", "operator"),
        action="shift_note_create",
        category="operations",
        resource_type="shift_note",
        resource_id=note["id"],
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {k: v for k, v in note.items() if k != "_id"}


@router.get("/ops/shift-notes")
async def list_shift_notes(
    limit: int = Query(30, le=100),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    items = await db.shift_notes.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items


@router.post("/ops/shift-notes/{note_id}/acknowledge")
async def acknowledge_shift_note(
    note_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    await db.shift_notes.update_one(
        {"id": note_id},
        {
            "$addToSet": {
                "acknowledged_by": {
                    "user_id": current_user["id"],
                    "name": current_user.get("name", current_user["email"]),
                    "at": datetime.now(timezone.utc).isoformat(),
                }
            }
        },
    )
    return {"acknowledged": True}


# ══════════════════════════════════════════════════════════
# KNOWLEDGE BASE / SOPs (Founder creates, operators read)
# ══════════════════════════════════════════════════════════


class KBArticleCreate(BaseModel):
    title: str
    content: str
    category: str = "general"  # general, support, verification, dts, tvt
    tags: list[str] = []


@router.post("/admin/knowledge-base")
async def create_kb_article(
    data: KBArticleCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_founder(current_user)
    now = datetime.now(timezone.utc)
    article = {
        "id": str(uuid4()),
        "title": data.title,
        "content": data.content,
        "category": data.category,
        "tags": data.tags,
        "author_id": current_user["id"],
        "author_name": current_user.get("name", current_user["email"]),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.knowledge_base.insert_one(article)
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="kb_article_create",
        category="platform",
        resource_type="kb_article",
        resource_id=article["id"],
        details={"title": data.title},
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {k: v for k, v in article.items() if k != "_id"}


@router.get("/admin/knowledge-base")
async def list_kb_articles(
    category: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    query = {"deleted_at": None}
    if category:
        query["category"] = category
    items = await db.knowledge_base.find(query, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return items


@router.put("/admin/knowledge-base/{article_id}")
async def update_kb_article(
    article_id: str,
    data: KBArticleCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_founder(current_user)
    result = await db.knowledge_base.update_one(
        {"id": article_id},
        {
            "$set": {
                "title": data.title,
                "content": data.content,
                "category": data.category,
                "tags": data.tags,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"updated": True}


@router.delete("/admin/knowledge-base/{article_id}")
async def delete_kb_article(
    article_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_founder(current_user)
    result = await db.knowledge_base.update_one(
        {"id": article_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )  # soft_delete
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Article not found")
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="kb_article_delete",
        category="platform",
        resource_type="kb_article",
        resource_id=article_id,
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {"deleted": True}
