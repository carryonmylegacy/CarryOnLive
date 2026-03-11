"""CarryOn™ — Operator Activity Dashboard API

Real-time metrics for operator task assignments, completion rates, and shift coverage.
Accessible by Founder (admin) and Operations Managers.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from config import db
from utils import get_current_user

router = APIRouter()


def require_manager_or_founder(user: dict):
    if user.get("role") == "admin":
        return
    if user.get("role") == "operator" and user.get("operator_role") == "manager":
        return
    raise HTTPException(status_code=403, detail="Founder or Manager access required")


def require_staff(user: dict):
    if user.get("role") in ("admin", "operator"):
        return
    raise HTTPException(status_code=403, detail="Staff access required")


@router.get("/ops/dashboard")
async def get_ops_dashboard(current_user: dict = Depends(get_current_user)):
    """Operator Activity Dashboard — real-time metrics."""
    require_manager_or_founder(current_user)

    now = datetime.now(timezone.utc)
    day_ago = (now - timedelta(hours=24)).isoformat()

    # Get all operators
    operators = await db.users.find(
        {"role": "operator"},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "email": 1,
            "operator_role": 1,
            "last_login_at": 1,
            "title": 1,
        },
    ).to_list(100)

    # Get task counts by status
    dts_pipeline = [
        {"$match": {"soft_deleted": {"$ne": True}}},
        {
            "$group": {
                "_id": "$status",
                "count": {"$sum": 1},
            }
        },
    ]
    dts_by_status = {
        r["_id"]: r["count"]
        for r in await db.dts_tasks.aggregate(dts_pipeline).to_list(20)
    }

    # DTS tasks assigned per operator
    dts_assigned_pipeline = [
        {"$match": {"soft_deleted": {"$ne": True}, "assigned_to": {"$ne": None}}},
        {
            "$group": {
                "_id": "$assigned_to",
                "total": {"$sum": 1},
                "completed": {
                    "$sum": {
                        "$cond": [{"$in": ["$status", ["executed", "destroyed"]]}, 1, 0]
                    }
                },
                "active": {
                    "$sum": {
                        "$cond": [
                            {
                                "$in": [
                                    "$status",
                                    ["submitted", "quoted", "approved", "ready"],
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
            }
        },
    ]
    dts_per_operator = {
        r["_id"]: r
        for r in await db.dts_tasks.aggregate(dts_assigned_pipeline).to_list(100)
    }

    # Support conversations with unread messages
    open_support = await db.support_conversations.count_documents(
        {"status": {"$ne": "resolved"}, "deleted_at": {"$exists": False}}
    )
    unanswered_support = await db.support_messages.count_documents(
        {"sender_role": {"$ne": "admin"}, "read": False}
    )

    # TVT (pending + reviewing certificates)
    pending_certs = await db.death_certificates.count_documents({"status": "pending"})
    reviewing_certs = await db.death_certificates.count_documents(
        {"status": "reviewing"}
    )

    # Tier verifications pending
    pending_verifications = await db.tier_verifications.count_documents(
        {"status": "pending"}
    )

    # Escalations
    open_escalations = await db.escalations.count_documents({"status": "open"})

    # Audit trail actions per operator (last 24h)
    audit_pipeline = [
        {"$match": {"timestamp": {"$gte": day_ago}}},
        {
            "$group": {
                "_id": "$actor_id",
                "actions_24h": {"$sum": 1},
            }
        },
    ]
    actions_per_operator = {
        r["_id"]: r["actions_24h"]
        for r in await db.audit_trail.aggregate(audit_pipeline).to_list(100)
    }

    # Shift notes (last 24h)
    recent_shift_notes = (
        await db.shift_notes.find(
            {"created_at": {"$gte": day_ago}},
            {
                "_id": 0,
                "id": 1,
                "content": 1,
                "author_name": 1,
                "category": 1,
                "created_at": 1,
            },
        )
        .sort("created_at", -1)
        .to_list(10)
    )

    # Build operator profiles with metrics
    operator_profiles = []
    for op in operators:
        op_id = op["id"]
        dts_stats = dts_per_operator.get(op_id, {})

        # Determine online status
        last_login = op.get("last_login_at", "")
        is_online = False
        if last_login:
            try:
                ll = datetime.fromisoformat(last_login.replace("Z", "+00:00"))
                is_online = (now - ll).total_seconds() < 3600  # Active in last hour
            except (ValueError, TypeError):
                pass

        operator_profiles.append(
            {
                "id": op_id,
                "name": op.get("name", ""),
                "username": op.get("email", ""),
                "operator_role": op.get("operator_role", "worker"),
                "title": op.get("title", ""),
                "is_online": is_online,
                "last_active": last_login,
                "tasks_assigned": dts_stats.get("total", 0),
                "tasks_active": dts_stats.get("active", 0),
                "tasks_completed": dts_stats.get("completed", 0),
                "completion_rate": round(
                    (dts_stats.get("completed", 0) / dts_stats.get("total", 1)) * 100
                )
                if dts_stats.get("total", 0) > 0
                else 0,
                "actions_24h": actions_per_operator.get(op_id, 0),
            }
        )

    # Sort: managers first, then by activity
    operator_profiles.sort(
        key=lambda x: (
            0 if x["operator_role"] == "manager" else 1,
            -x["actions_24h"],
        )
    )

    return {
        "timestamp": now.isoformat(),
        "operators": operator_profiles,
        "queues": {
            "dts_by_status": dts_by_status,
            "dts_total": sum(dts_by_status.values()),
            "dts_unassigned": await db.dts_tasks.count_documents(
                {
                    "soft_deleted": {"$ne": True},
                    "assigned_to": None,
                    "status": {"$ne": "destroyed"},
                }
            ),
            "support_open": open_support,
            "support_unanswered": unanswered_support,
            "tvt_pending": pending_certs,
            "tvt_reviewing": reviewing_certs,
            "verifications_pending": pending_verifications,
            "escalations_open": open_escalations,
        },
        "recent_shift_notes": recent_shift_notes,
    }


@router.get("/ops/dashboard-events")
async def get_dashboard_events(current_user: dict = Depends(get_current_user)):
    """Get actionable event counts for each dashboard tile.
    Returns new/unprocessed items that need operator attention."""
    require_staff(current_user)

    now = datetime.now(timezone.utc)

    # 1. TVT: Death certificates pending or reviewing
    tvt_pending = await db.death_certificates.count_documents({"status": "pending"})
    tvt_reviewing = await db.death_certificates.count_documents({"status": "reviewing"})

    # 2. Milestone Notifications: Pending review
    milestones_pending = await db.milestone_deliveries.count_documents(
        {"status": "pending_review"}
    )

    # 3. DTS: Active requests (submitted, quoted, approved)
    dts_active = await db.dts_tasks.count_documents(
        {
            "soft_deleted": {"$ne": True},
            "status": {"$in": ["submitted", "quoted", "approved", "ready"]},
        }
    )

    # 4. Emergency Messages: Pending emergency access requests
    emergency_pending = await db.emergency_access.count_documents({"status": "pending"})

    # 5. P1 Emergency: Open P1 conversations (benefactor alive alerts)
    p1_open = await db.support_conversations.count_documents(
        {"priority": "p1", "status": {"$in": ["open", "active"]}}
    )

    # 6. Customer Service: Unread messages from users
    support_unread = await db.support_messages.count_documents(
        {"sender_role": {"$nin": ["admin", "operator"]}, "read": False}
    )

    # Recent events (last 24h) for timeline
    day_ago = (now - timedelta(hours=24)).isoformat()

    recent_tvt = (
        await db.death_certificates.find(
            {"created_at": {"$gte": day_ago}},
            {"_id": 0, "id": 1, "estate_id": 1, "status": 1, "created_at": 1},
        )
        .sort("created_at", -1)
        .to_list(10)
    )

    recent_milestones = (
        await db.milestone_deliveries.find(
            {"created_at": {"$gte": day_ago}},
            {
                "_id": 0,
                "id": 1,
                "estate_id": 1,
                "status": 1,
                "milestone_type": 1,
                "created_at": 1,
            },
        )
        .sort("created_at", -1)
        .to_list(10)
    )

    recent_dts = (
        await db.dts_tasks.find(
            {"created_at": {"$gte": day_ago}, "soft_deleted": {"$ne": True}},
            {
                "_id": 0,
                "id": 1,
                "title": 1,
                "status": 1,
                "task_type": 1,
                "created_at": 1,
            },
        )
        .sort("created_at", -1)
        .to_list(10)
    )

    recent_emergency = (
        await db.emergency_access.find(
            {"created_at": {"$gte": day_ago}},
            {
                "_id": 0,
                "id": 1,
                "estate_id": 1,
                "status": 1,
                "urgency": 1,
                "created_at": 1,
            },
        )
        .sort("created_at", -1)
        .to_list(10)
    )

    return {
        "timestamp": now.isoformat(),
        "events": {
            "tvt": {
                "count": tvt_pending + tvt_reviewing,
                "pending": tvt_pending,
                "reviewing": tvt_reviewing,
                "label": "TVT - Transition Verification",
                "path": "/ops/transition",
            },
            "milestones": {
                "count": milestones_pending,
                "label": "Milestone Notifications",
                "path": "/ops/milestones",
            },
            "dts": {
                "count": dts_active,
                "label": "DTS Requests",
                "path": "/ops/dts",
            },
            "emergency": {
                "count": emergency_pending,
                "label": "Emergency Access",
                "path": "/ops/escalations",
            },
            "p1": {
                "count": p1_open,
                "label": "P1 Emergency - Still Alive",
                "path": "/ops/support",
            },
            "support": {
                "count": support_unread,
                "label": "Customer Service",
                "path": "/ops/support",
            },
        },
        "recent_activity": {
            "tvt": recent_tvt,
            "milestones": recent_milestones,
            "dts": recent_dts,
            "emergency": recent_emergency,
        },
    }


@router.get("/ops/team-tasks")
async def get_team_tasks(current_user: dict = Depends(get_current_user)):
    """Get active tasks per operator for the manager's team overview.
    Shows what each team member is working on across all task types."""
    require_manager_or_founder(current_user)

    now = datetime.now(timezone.utc)

    # Get all operators
    operators = await db.users.find(
        {"role": "operator"},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "first_name": 1,
            "last_name": 1,
            "operator_role": 1,
            "title": 1,
            "last_login_at": 1,
        },
    ).to_list(100)

    op_ids = [op["id"] for op in operators]

    # DTS tasks assigned to operators
    dts_tasks = await db.dts_tasks.find(
        {
            "assigned_to": {"$in": op_ids},
            "soft_deleted": {"$ne": True},
            "status": {"$in": ["submitted", "quoted", "approved", "ready"]},
        },
        {
            "_id": 0,
            "id": 1,
            "title": 1,
            "status": 1,
            "task_type": 1,
            "assigned_to": 1,
            "created_at": 1,
            "updated_at": 1,
        },
    ).to_list(500)

    # Death certificates being reviewed by operators
    tvt_tasks = await db.death_certificates.find(
        {
            "reviewer_id": {"$in": op_ids},
            "status": {"$in": ["pending", "reviewing"]},
        },
        {
            "_id": 0,
            "id": 1,
            "estate_id": 1,
            "status": 1,
            "reviewer_id": 1,
            "created_at": 1,
        },
    ).to_list(500)

    # Milestone deliveries being reviewed
    milestone_tasks = await db.milestone_deliveries.find(
        {
            "reviewer_id": {"$in": op_ids},
            "status": "pending_review",
        },
        {
            "_id": 0,
            "id": 1,
            "estate_id": 1,
            "milestone_type": 1,
            "status": 1,
            "reviewer_id": 1,
            "created_at": 1,
        },
    ).to_list(500)

    # Build per-operator task list
    team_data = []
    for op in operators:
        op_id = op["id"]
        op_name = (
            op.get("name")
            or f"{op.get('first_name', '')} {op.get('last_name', '')}".strip()
        )

        tasks = []

        # DTS tasks
        for t in dts_tasks:
            if t.get("assigned_to") == op_id:
                tasks.append(
                    {
                        "id": t["id"],
                        "type": "dts",
                        "type_label": "DTS Request",
                        "title": t.get("title", "Untitled"),
                        "status": t.get("status", ""),
                        "created_at": t.get("created_at", ""),
                        "path": "/ops/dts",
                    }
                )

        # TVT tasks
        for t in tvt_tasks:
            if t.get("reviewer_id") == op_id:
                tasks.append(
                    {
                        "id": t["id"],
                        "type": "tvt",
                        "type_label": "Death Certificate Review",
                        "title": f"TVT Review - Estate {t.get('estate_id', '')[:8]}",
                        "status": t.get("status", ""),
                        "created_at": t.get("created_at", ""),
                        "path": "/ops/transition",
                    }
                )

        # Milestone tasks
        for t in milestone_tasks:
            if t.get("reviewer_id") == op_id:
                tasks.append(
                    {
                        "id": t["id"],
                        "type": "milestone",
                        "type_label": "Milestone Review",
                        "title": f"Milestone - {t.get('milestone_type', 'Unknown')}",
                        "status": t.get("status", ""),
                        "created_at": t.get("created_at", ""),
                        "path": "/ops/milestones",
                    }
                )

        # Determine online status
        last_login = op.get("last_login_at", "")
        is_online = False
        if last_login:
            try:
                ll = datetime.fromisoformat(last_login.replace("Z", "+00:00"))
                is_online = (now - ll).total_seconds() < 3600
            except (ValueError, TypeError):
                pass

        team_data.append(
            {
                "id": op_id,
                "name": op_name,
                "operator_role": op.get("operator_role", "worker"),
                "title": op.get("title", ""),
                "is_online": is_online,
                "tasks": tasks,
                "task_count": len(tasks),
            }
        )

    # Sort: operators with active tasks first, then by name
    team_data.sort(key=lambda x: (-x["task_count"], x["name"]))

    return {
        "timestamp": now.isoformat(),
        "team": team_data,
        "total_active_tasks": sum(t["task_count"] for t in team_data),
    }
