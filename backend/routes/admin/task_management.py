"""CarryOn™ — Task Management, Assignment & SLA Tracking

Provides:
  - Task claiming (worker self-assigns from queue)
  - Task assignment (manager assigns to worker)
  - Task reassignment
  - SLA tracking with configurable timers
  - Queue prioritization (manual pin/reorder)
  - Customer context panel (consolidated user view)
  - Worker performance metrics
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from config import db
from guards import check_staff_role as require_staff, check_manager_or_admin as require_manager_or_founder
from services.audit import get_client_ip, log_audit_event
from utils import get_current_user

router = APIRouter()

# SLA defaults (hours)
SLA_DEFAULTS = {
    "support": 4,
    "dts": 24,
    "tvt": 48,
    "milestone": 48,
    "emergency": 1,
    "p1": 0.5,
    "verification": 72,
}


# ── Task Claiming ─────────────────────────────────────────


class ClaimTaskRequest(BaseModel):
    task_type: str  # support, dts, tvt, milestone, verification
    task_id: str


@router.post("/ops/tasks/claim")
async def claim_task(
    data: ClaimTaskRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Worker claims a task from the queue."""
    require_staff(current_user)

    collection_map = {
        "support": "support_conversations",
        "dts": "dts_tasks",
        "tvt": "death_certificates",
        "milestone": "milestone_deliveries",
        "verification": "tier_verifications",
    }

    coll_name = collection_map.get(data.task_type)
    if not coll_name:
        raise HTTPException(status_code=400, detail=f"Invalid task type: {data.task_type}")

    coll = db[coll_name]
    task = await coll.find_one({"id": data.task_id}, {"_id": 0, "id": 1, "assigned_to": 1, "claimed_by": 1})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.get("claimed_by") and task["claimed_by"] != current_user["id"]:
        raise HTTPException(status_code=409, detail="Task already claimed by another operator")

    now = datetime.now(timezone.utc).isoformat()
    sla_hours = SLA_DEFAULTS.get(data.task_type, 24)
    sla_deadline = (datetime.now(timezone.utc) + timedelta(hours=sla_hours)).isoformat()

    await coll.update_one(
        {"id": data.task_id},
        {
            "$set": {
                "claimed_by": current_user["id"],
                "claimed_by_name": current_user.get("name", ""),
                "claimed_at": now,
                "sla_deadline": sla_deadline,
            }
        },
    )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user.get("role", "operator"),
        action="task_claim",
        category="operations",
        resource_type=data.task_type,
        resource_id=data.task_id,
        ip_address=get_client_ip(request),
        severity="info",
    )

    return {"claimed": True, "sla_deadline": sla_deadline}


@router.post("/ops/tasks/unclaim")
async def unclaim_task(
    data: ClaimTaskRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Worker releases a claimed task back to the queue."""
    require_staff(current_user)

    collection_map = {
        "support": "support_conversations",
        "dts": "dts_tasks",
        "tvt": "death_certificates",
        "milestone": "milestone_deliveries",
        "verification": "tier_verifications",
    }

    coll_name = collection_map.get(data.task_type)
    if not coll_name:
        raise HTTPException(status_code=400, detail=f"Invalid task type: {data.task_type}")

    coll = db[coll_name]

    await coll.update_one(
        {"id": data.task_id},
        {"$unset": {"claimed_by": "", "claimed_by_name": "", "claimed_at": "", "sla_deadline": ""}},
    )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user.get("role", "operator"),
        action="task_unclaim",
        category="operations",
        resource_type=data.task_type,
        resource_id=data.task_id,
        ip_address=get_client_ip(request),
        severity="info",
    )

    return {"unclaimed": True}


# ── Task Assignment (Manager / Founder) ───────────────────


class AssignTaskRequest(BaseModel):
    task_type: str
    task_id: str
    operator_id: str


@router.post("/ops/tasks/assign")
async def assign_task(
    data: AssignTaskRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Manager or Founder assigns a task to a specific operator."""
    require_manager_or_founder(current_user)

    # Verify operator exists
    operator = await db.users.find_one(
        {"id": data.operator_id, "role": "operator"},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")

    collection_map = {
        "support": "support_conversations",
        "dts": "dts_tasks",
        "tvt": "death_certificates",
        "milestone": "milestone_deliveries",
        "verification": "tier_verifications",
    }

    coll_name = collection_map.get(data.task_type)
    if not coll_name:
        raise HTTPException(status_code=400, detail=f"Invalid task type: {data.task_type}")

    coll = db[coll_name]

    now = datetime.now(timezone.utc).isoformat()
    sla_hours = SLA_DEFAULTS.get(data.task_type, 24)
    sla_deadline = (datetime.now(timezone.utc) + timedelta(hours=sla_hours)).isoformat()

    # For DTS tasks, use existing assigned_to field
    update_fields = {
        "claimed_by": data.operator_id,
        "claimed_by_name": operator.get("name", ""),
        "claimed_at": now,
        "assigned_by": current_user["id"],
        "assigned_by_name": current_user.get("name", ""),
        "assigned_at": now,
        "sla_deadline": sla_deadline,
    }
    if data.task_type == "dts":
        update_fields["assigned_to"] = data.operator_id

    await coll.update_one({"id": data.task_id}, {"$set": update_fields})

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user.get("role", "admin"),
        action="task_assign",
        category="operations",
        resource_type=data.task_type,
        resource_id=data.task_id,
        details={"assigned_to": data.operator_id, "operator_name": operator.get("name", "")},
        ip_address=get_client_ip(request),
        severity="info",
    )

    # Notify the assigned operator
    from services.notifications import notify
    import asyncio

    asyncio.create_task(
        notify.user(
            data.operator_id,
            f"Task Assigned: {data.task_type.upper()}",
            f"{current_user.get('name', 'Manager')} assigned you a {data.task_type} task.",
            url=f"/ops/{data.task_type}",
        )
    )

    return {"assigned": True, "operator_id": data.operator_id, "sla_deadline": sla_deadline}


# ── Queue Prioritization ─────────────────────────────────


class PrioritizeTaskRequest(BaseModel):
    task_type: str
    task_id: str
    priority_level: int  # 1=highest, 5=lowest


@router.put("/ops/tasks/prioritize")
async def prioritize_task(
    data: PrioritizeTaskRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Set manual priority on a task. Manager or Founder only."""
    require_manager_or_founder(current_user)

    collection_map = {
        "support": "support_conversations",
        "dts": "dts_tasks",
        "tvt": "death_certificates",
        "milestone": "milestone_deliveries",
        "verification": "tier_verifications",
    }

    coll_name = collection_map.get(data.task_type)
    if not coll_name:
        raise HTTPException(status_code=400, detail=f"Invalid task type: {data.task_type}")

    await db[coll_name].update_one(
        {"id": data.task_id},
        {"$set": {"manual_priority": data.priority_level}},
    )

    return {"prioritized": True}


# ── Customer Context Panel ────────────────────────────────


@router.get("/ops/customer-context/{user_id}")
async def get_customer_context(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Consolidated view of a user's full account for operator reference."""
    require_staff(current_user)

    user = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "password": 0},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get estates
    estates = await db.estates.find(
        {"owner_id": user_id},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "readiness_score": 1, "verified_tier": 1, "created_at": 1},
    ).to_list(20)

    estate_ids = [e["id"] for e in estates]

    # Get subscription
    sub = await db.user_subscriptions.find_one({"user_id": user_id}, {"_id": 0})

    # Get beneficiaries
    beneficiaries = await db.beneficiaries.find(
        {"estate_id": {"$in": estate_ids}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "relation": 1, "invitation_status": 1},
    ).to_list(100)

    # Get recent documents count
    doc_count = await db.documents.count_documents({"estate_id": {"$in": estate_ids}})

    # Get recent support conversations
    support = (
        await db.support_conversations.find(
            {"user_id": user_id, "deleted_at": {"$exists": False}},
            {"_id": 0, "id": 1, "subject": 1, "status": 1, "created_at": 1, "priority": 1},
        )
        .sort("created_at", -1)
        .to_list(5)
    )

    # DTS tasks
    dts = (
        await db.dts_tasks.find(
            {"user_id": user_id, "soft_deleted": {"$ne": True}},
            {"_id": 0, "id": 1, "title": 1, "status": 1, "task_type": 1, "created_at": 1},
        )
        .sort("created_at", -1)
        .to_list(5)
    )

    # Recent activity
    activity = (
        await db.audit_trail.find(
            {"actor_id": user_id},
            # pre-push-invariants: allow-missing-id (read-only audit rows; downstream uses only action/category/timestamp)
            {"_id": 0, "action": 1, "category": 1, "timestamp": 1},
        )
        .sort("timestamp", -1)
        .to_list(10)
    )

    # Login history
    last_login = user.get("last_login_at", "")
    login_count = user.get("login_count", 0)

    return {
        "user": {
            "id": user.get("id"),
            "email": user.get("email"),
            "name": user.get("name"),
            "role": user.get("role"),
            "created_at": user.get("created_at"),
            "last_login_at": last_login,
            "login_count": login_count,
            "is_beta_tester": user.get("is_beta_tester", False),
            "trial_ends_at": user.get("trial_ends_at"),
            "special_status": user.get("special_status", []),
        },
        "subscription": sub,
        "estates": estates,
        "beneficiaries": beneficiaries,
        "documents_count": doc_count,
        "recent_support": support,
        "recent_dts": dts,
        "recent_activity": activity,
    }


# ── Worker Performance Metrics ────────────────────────────


@router.get("/ops/performance")
async def get_worker_performance(
    operator_id: str = Query(""),
    days: int = Query(30, le=90),
    current_user: dict = Depends(get_current_user),
):
    """Get performance metrics for operators. Self or manager/founder view."""
    require_staff(current_user)

    target_id = operator_id or current_user["id"]

    # Workers can only see their own performance
    if current_user.get("role") == "operator" and current_user.get("operator_role") == "worker":
        target_id = current_user["id"]

    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=days)).isoformat()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Audit trail actions
    total_actions = await db.audit_trail.count_documents({"actor_id": target_id, "timestamp": {"$gte": cutoff}})
    actions_today = await db.audit_trail.count_documents({"actor_id": target_id, "timestamp": {"$gte": today_start}})

    # Actions by category
    cat_pipeline = [
        {"$match": {"actor_id": target_id, "timestamp": {"$gte": cutoff}}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
    ]
    categories = {r["_id"]: r["count"] for r in await db.audit_trail.aggregate(cat_pipeline).to_list(20)}

    # Tasks completed (across all task types)
    tasks_resolved = 0
    for coll_name in [
        "support_conversations",
        "dts_tasks",
        "death_certificates",
        "milestone_deliveries",
        "tier_verifications",
    ]:
        count = await db[coll_name].count_documents(
            {
                "claimed_by": target_id,
                "$or": [
                    {"status": {"$in": ["resolved", "completed", "approved", "executed", "verified"]}},
                ],
            }
        )
        tasks_resolved += count

    # Active tasks
    tasks_active = 0
    for coll_name in [
        "support_conversations",
        "dts_tasks",
        "death_certificates",
        "milestone_deliveries",
        "tier_verifications",
    ]:
        count = await db[coll_name].count_documents(
            {
                "claimed_by": target_id,
                "status": {
                    "$nin": ["resolved", "completed", "approved", "executed", "verified", "rejected", "destroyed"]
                },
            }
        )
        tasks_active += count

    # SLA breaches
    sla_breaches = 0
    for coll_name in ["support_conversations", "dts_tasks", "death_certificates", "milestone_deliveries"]:
        count = await db[coll_name].count_documents(
            {
                "claimed_by": target_id,
                "sla_deadline": {"$lt": now.isoformat()},
                "status": {
                    "$nin": ["resolved", "completed", "approved", "executed", "verified", "rejected", "destroyed"]
                },
            }
        )
        sla_breaches += count

    # Get operator info
    op = await db.users.find_one({"id": target_id}, {"_id": 0, "id": 1, "name": 1, "operator_role": 1, "title": 1})

    return {
        "operator_id": target_id,
        "operator_name": op.get("name", "") if op else "",
        "operator_role": op.get("operator_role", "") if op else "",
        "period_days": days,
        "total_actions": total_actions,
        "actions_today": actions_today,
        "actions_by_category": categories,
        "tasks_resolved": tasks_resolved,
        "tasks_active": tasks_active,
        "sla_breaches": sla_breaches,
        "avg_actions_per_day": round(total_actions / max(days, 1), 1),
    }


# ── SLA Configuration ────────────────────────────────────


@router.get("/ops/sla-config")
async def get_sla_config(current_user: dict = Depends(get_current_user)):
    """Get SLA configuration."""
    require_staff(current_user)
    doc = await db.platform_settings.find_one({"_id": "sla_config"}, {"_id": 0})
    if doc:
        return doc
    return {"sla_hours": SLA_DEFAULTS}


class SLAConfigUpdate(BaseModel):
    sla_hours: dict


@router.put("/ops/sla-config")
async def update_sla_config(
    data: SLAConfigUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update SLA configuration. Founder only."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    await db.platform_settings.update_one(
        {"_id": "sla_config"},
        {"$set": {"sla_hours": data.sla_hours}},
        upsert=True,
    )
    return {"updated": True}
