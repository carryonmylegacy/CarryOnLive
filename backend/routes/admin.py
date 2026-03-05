"""CarryOn™ Backend — Admin Routes"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
import bcrypt
from pydantic import BaseModel

from config import db
from utils import get_current_user

router = APIRouter()

# ===================== ADMIN ROUTES =====================


class DevSwitcherConfig(BaseModel):
    benefactor_email: str = ""
    benefactor_password: str = ""
    beneficiary_email: str = ""
    beneficiary_password: str = ""
    enabled: bool = True


@router.get("/admin/dev-switcher")
async def get_dev_switcher_config(current_user: dict = Depends(get_current_user)):
    """Get dev switcher configuration — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    config = await db.dev_config.find_one({"id": "dev_switcher"}, {"_id": 0})
    if not config:
        config = {
            "id": "dev_switcher",
            "benefactor_email": "",
            "benefactor_password": "",
            "beneficiary_email": "",
            "beneficiary_password": "",
            "enabled": True,
        }
        await db.dev_config.insert_one(config)

    # Don't expose passwords in GET response - just indicate if set
    return {
        "benefactor_email": config.get("benefactor_email", ""),
        "benefactor_configured": bool(config.get("benefactor_password")),
        "beneficiary_email": config.get("beneficiary_email", ""),
        "beneficiary_configured": bool(config.get("beneficiary_password")),
        "enabled": config.get("enabled", True),
    }


@router.put("/admin/dev-switcher")
async def update_dev_switcher_config(
    data: DevSwitcherConfig, current_user: dict = Depends(get_current_user)
):
    """Update dev switcher configuration — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    # Validate that the accounts exist if provided
    if data.benefactor_email:
        user = await db.users.find_one({"email": data.benefactor_email}, {"_id": 0})
        if not user:
            raise HTTPException(
                status_code=400,
                detail=f"Benefactor account not found: {data.benefactor_email}",
            )
        if user["role"] != "benefactor":
            raise HTTPException(
                status_code=400,
                detail=f"Account is not a benefactor: {data.benefactor_email}",
            )

    if data.beneficiary_email:
        user = await db.users.find_one({"email": data.beneficiary_email}, {"_id": 0})
        if not user:
            raise HTTPException(
                status_code=400,
                detail=f"Beneficiary account not found: {data.beneficiary_email}",
            )
        if user["role"] != "beneficiary":
            raise HTTPException(
                status_code=400,
                detail=f"Account is not a beneficiary: {data.beneficiary_email}",
            )

    update_fields = {
        "benefactor_email": data.benefactor_email,
        "beneficiary_email": data.beneficiary_email,
        "enabled": data.enabled,
    }
    # Only update passwords if provided (don't clear with empty string)
    if data.benefactor_password:
        update_fields["benefactor_password"] = data.benefactor_password
    if data.beneficiary_password:
        update_fields["beneficiary_password"] = data.beneficiary_password

    await db.dev_config.update_one(
        {"id": "dev_switcher"},
        {"$set": update_fields},
        upsert=True,
    )

    return {"message": "Dev switcher config updated"}


@router.get("/dev-switcher/config")
async def get_public_dev_switcher_config():
    """Get dev switcher config for frontend — only returns enabled status and emails (never passwords)"""
    config = await db.dev_config.find_one({"id": "dev_switcher"}, {"_id": 0})
    if not config or not config.get("enabled", True):
        return {"enabled": False}

    return {
        "enabled": config.get("enabled", True),
        "benefactor": {
            "email": config.get("benefactor_email", ""),
        }
        if config.get("benefactor_email")
        else None,
        "beneficiary": {
            "email": config.get("beneficiary_email", ""),
        }
        if config.get("beneficiary_email")
        else None,
    }


@router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    """Get all users with subscription info and beneficiary tree — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)

    # Build estate owner → beneficiaries map
    estates = await db.estates.find({}, {"_id": 0, "id": 1, "owner_id": 1}).to_list(
        10000
    )
    estate_by_owner = {e["owner_id"]: e["id"] for e in estates}

    all_bens = await db.beneficiaries.find(
        {},
        {
            "_id": 0,
            "id": 1,
            "estate_id": 1,
            "name": 1,
            "email": 1,
            "relation": 1,
            "user_id": 1,
            "is_stub": 1,
            "invitation_status": 1,
        },
    ).to_list(100000)

    bens_by_estate = {}
    for b in all_bens:
        eid = b.get("estate_id")
        if eid:
            bens_by_estate.setdefault(eid, []).append(b)

    # Attach subscription info and linked beneficiaries to each user
    for u in users:
        sub = await db.user_subscriptions.find_one(
            {"user_id": u["id"]},
            {
                "_id": 0,
                "plan_id": 1,
                "plan_name": 1,
                "billing_cycle": 1,
                "status": 1,
                "beta_plan": 1,
            },
        )
        u["subscription"] = sub

        # For benefactors, attach their beneficiary list
        if u.get("role") == "benefactor":
            estate_id = estate_by_owner.get(u["id"])
            u["linked_beneficiaries"] = bens_by_estate.get(estate_id, [])

    return users


@router.get("/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    """Get platform stats — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    # Get all existing user IDs for cross-referencing
    all_users = await db.users.find(
        {}, {"_id": 0, "id": 1, "role": 1, "email": 1, "benefactor_email": 1}
    ).to_list(100000)
    user_ids = {u["id"] for u in all_users}

    total_users = len(all_users)
    benefactors = sum(1 for u in all_users if u.get("role") == "benefactor")
    beneficiaries_count = sum(1 for u in all_users if u.get("role") == "beneficiary")
    admins = sum(1 for u in all_users if u.get("role") == "admin")

    # Only count estates owned by existing users
    total_estates = await db.estates.count_documents(
        {"owner_id": {"$in": list(user_ids)}}
    )
    transitioned = await db.estates.count_documents(
        {"owner_id": {"$in": list(user_ids)}, "status": "transitioned"}
    )

    total_docs = await db.documents.count_documents(
        {"owner_id": {"$in": list(user_ids)}}
    )
    total_messages = await db.messages.count_documents(
        {"user_id": {"$in": list(user_ids)}}
    )
    pending_certs = await db.death_certificates.count_documents({"status": "pending"})
    reviewing_certs = await db.death_certificates.count_documents(
        {"status": "reviewing"}
    )
    unanswered_messages = await db.support_messages.count_documents(
        {"sender_role": {"$ne": "admin"}, "read": False}
    )
    pending_verifications = await db.tier_verifications.count_documents(
        {"status": "pending"}
    )
    pending_dts = await db.dts_tasks.count_documents({"status": "pending"})
    # Only count subscriptions for existing users
    active_subs = await db.user_subscriptions.count_documents(
        {"status": "active", "user_id": {"$in": list(user_ids)}}
    )
    grace_periods = await db.beneficiary_grace_periods.count_documents({})
    pending_family = await db.family_plan_requests.count_documents(
        {"status": "pending"}
    )
    deletion_requests = await db.deletion_requests.count_documents(
        {"status": "pending"}
    )

    # Viral metrics — only count beneficiaries linked to existing benefactors' estates
    benefactor_ids = [u["id"] for u in all_users if u.get("role") == "benefactor"]
    estates_for_benefactors = await db.estates.find(
        {"owner_id": {"$in": benefactor_ids}}, {"_id": 0, "id": 1}
    ).to_list(100000)
    benefactor_estate_ids = [e["id"] for e in estates_for_benefactors]

    total_beneficiary_records = await db.beneficiaries.count_documents(
        {"estate_id": {"$in": benefactor_estate_ids}, "is_stub": {"$ne": True}}
    )
    avg_bens_per_benefactor = round(total_beneficiary_records / max(benefactors, 1), 1)

    # Beneficiaries who became benefactors
    ben_emails = {u["email"] for u in all_users if u.get("role") == "beneficiary"}
    ben_to_benefactor_count = sum(
        1
        for u in all_users
        if u.get("role") == "benefactor"
        and (u.get("benefactor_email") or u["email"] in ben_emails)
    )

    return {
        "users": {
            "total": total_users,
            "benefactors": benefactors,
            "beneficiaries": beneficiaries_count,
            "admins": admins,
        },
        "estates": {
            "total": total_estates,
            "transitioned": transitioned,
            "active": total_estates - transitioned,
        },
        "documents": total_docs,
        "messages": total_messages,
        "pending_certificates": pending_certs,
        "reviewing_certificates": reviewing_certs,
        "unanswered_support": unanswered_messages,
        "pending_verifications": pending_verifications,
        "pending_dts": pending_dts,
        "active_subscriptions": active_subs,
        "grace_periods": grace_periods,
        "pending_family_requests": pending_family,
        "pending_deletions": deletion_requests,
        "avg_beneficiaries_per_benefactor": avg_bens_per_benefactor,
        "beneficiaries_converted": ben_to_benefactor_count,
    }


@router.get("/admin/revenue-metrics")
async def get_revenue_metrics(current_user: dict = Depends(get_current_user)):
    """Revenue analytics — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    now = datetime.now(timezone.utc)
    this_month_start = now.replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    ).isoformat()
    last_month_start = (
        (now.replace(day=1) - timedelta(days=1))
        .replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        .isoformat()
    )
    last_month_end = now.replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    ).isoformat()

    # Active subscriptions with their plan prices
    active_subs = await db.subscriptions.find(
        {"status": "active"},
        {"_id": 0, "plan_id": 1, "amount": 1, "billing_cycle": 1, "created_at": 1},
    ).to_list(100000)

    # Calculate MRR from active subscriptions
    mrr = 0.0
    for sub in active_subs:
        amount = sub.get("amount", 0) or 0
        cycle = sub.get("billing_cycle", "monthly")
        if cycle == "annual":
            mrr += amount / 12
        elif cycle == "quarterly":
            mrr += amount / 3
        else:
            mrr += amount

    arr = mrr * 12

    # Total revenue (all time) from completed payments
    payments = await db.payments.find(
        {"status": "succeeded"}, {"_id": 0, "amount": 1, "created_at": 1}
    ).to_list(100000)
    total_revenue = sum(p.get("amount", 0) for p in payments) / 100  # cents to dollars

    # This month's revenue
    this_month_payments = [
        p for p in payments if p.get("created_at", "") >= this_month_start
    ]
    revenue_this_month = sum(p.get("amount", 0) for p in this_month_payments) / 100

    # Last month's revenue
    last_month_payments = [
        p
        for p in payments
        if last_month_start <= p.get("created_at", "") < last_month_end
    ]
    revenue_last_month = sum(p.get("amount", 0) for p in last_month_payments) / 100

    # MoM growth rate
    if revenue_last_month > 0:
        mom_growth = round(
            ((revenue_this_month - revenue_last_month) / revenue_last_month) * 100, 1
        )
    else:
        mom_growth = 0 if revenue_this_month == 0 else 100

    # ARPU (Average Revenue Per User)
    total_paying = len(active_subs)
    arpu_monthly = round(mrr / max(total_paying, 1), 2)
    arpu_annual = round(arr / max(total_paying, 1), 2)

    # Churn: users who cancelled this month
    cancelled_this_month = await db.subscriptions.count_documents(
        {"status": "cancelled", "cancelled_at": {"$gte": this_month_start}}
    )
    total_subs_start_of_month = total_paying + cancelled_this_month
    churn_rate = round(
        (cancelled_this_month / max(total_subs_start_of_month, 1)) * 100, 1
    )

    # LTV estimate (ARPU / churn rate)
    if churn_rate > 0:
        ltv = round(arpu_monthly / (churn_rate / 100), 2)
    else:
        ltv = arpu_annual * 3  # Assume 3-year lifetime if no churn yet

    return {
        "mrr": round(mrr, 2),
        "arr": round(arr, 2),
        "total_revenue": round(total_revenue, 2),
        "revenue_this_month": round(revenue_this_month, 2),
        "revenue_last_month": round(revenue_last_month, 2),
        "mom_growth": mom_growth,
        "paying_subscribers": total_paying,
        "arpu_monthly": arpu_monthly,
        "arpu_annual": arpu_annual,
        "churn_rate": churn_rate,
        "ltv": round(ltv, 2),
    }


@router.get("/admin/launch-metrics")
async def get_launch_metrics(current_user: dict = Depends(get_current_user)):
    """Real-time launch metrics — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    thirty_days_ago = (now - timedelta(days=30)).isoformat()

    # New benefactor signups — today, 7d, 30d, all time
    signups_today = await db.users.count_documents(
        {"role": "benefactor", "created_at": {"$gte": today_start}}
    )
    signups_7d = await db.users.count_documents(
        {"role": "benefactor", "created_at": {"$gte": seven_days_ago}}
    )
    signups_30d = await db.users.count_documents(
        {"role": "benefactor", "created_at": {"$gte": thirty_days_ago}}
    )
    total_benefactors = await db.users.count_documents({"role": "benefactor"})

    # Beneficiaries invited per benefactor
    total_bens = await db.beneficiaries.count_documents({"is_stub": {"$ne": True}})
    avg_invited = round(total_bens / max(total_benefactors, 1), 1)

    # Beneficiary activation rate (accepted invitations / total invitations)
    total_invited = await db.beneficiaries.count_documents(
        {"invitation_status": {"$in": ["sent", "pending", "accepted"]}}
    )
    total_accepted = await db.beneficiaries.count_documents(
        {"invitation_status": "accepted"}
    )
    activation_rate = round((total_accepted / max(total_invited, 1)) * 100, 1)

    # Trial → paid conversion
    total_trialing = await db.users.count_documents(
        {"role": "benefactor", "subscription_status": "trialing"}
    )
    total_paid = await db.subscriptions.count_documents({"status": "active"})
    total_expired_trials = await db.users.count_documents(
        {"role": "benefactor", "subscription_status": {"$in": ["expired", "inactive"]}}
    )
    conversion_rate = round(
        (total_paid / max(total_paid + total_expired_trials, 1)) * 100, 1
    )

    # Day-7 retention: users who signed up 7+ days ago and logged in within last 7 days
    users_7d_old = await db.users.find(
        {"role": "benefactor", "created_at": {"$lte": seven_days_ago}},
        {"_id": 0, "id": 1},
    ).to_list(10000)
    old_user_ids = [u["id"] for u in users_7d_old]
    if old_user_ids:
        active_7d = await db.users.count_documents(
            {
                "id": {"$in": old_user_ids},
                "last_login_at": {"$gte": seven_days_ago},
            }
        )
        retention_7d = round((active_7d / len(old_user_ids)) * 100, 1)
    else:
        retention_7d = 0

    # Day-30 retention
    users_30d_old = await db.users.find(
        {"role": "benefactor", "created_at": {"$lte": thirty_days_ago}},
        {"_id": 0, "id": 1},
    ).to_list(10000)
    old_30_ids = [u["id"] for u in users_30d_old]
    if old_30_ids:
        active_30d = await db.users.count_documents(
            {
                "id": {"$in": old_30_ids},
                "last_login_at": {"$gte": thirty_days_ago},
            }
        )
        retention_30d = round((active_30d / len(old_30_ids)) * 100, 1)
    else:
        retention_30d = 0

    return {
        "signups": {
            "today": signups_today,
            "last_7d": signups_7d,
            "last_30d": signups_30d,
            "all_time": total_benefactors,
        },
        "avg_beneficiaries_invited": avg_invited,
        "activation": {
            "total_invited": total_invited,
            "total_accepted": total_accepted,
            "rate": activation_rate,
        },
        "conversion": {
            "trialing": total_trialing,
            "paid": total_paid,
            "expired": total_expired_trials,
            "rate": conversion_rate,
        },
        "retention": {
            "day_7": retention_7d,
            "day_30": retention_30d,
        },
    }


@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    admin_password: str = Query(..., description="Admin password for confirmation"),
    current_user: dict = Depends(get_current_user),
):
    """Delete a user and all associated data — admin only, requires password"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    # Verify admin password
    admin_doc = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "password": 1}
    )
    if not admin_doc or not bcrypt.checkpw(
        admin_password.encode(), admin_doc["password"].encode()
    ):
        raise HTTPException(status_code=401, detail="Incorrect admin password")

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "role": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Cascade delete all associated data
    # Find estates owned by this user
    estates = await db.estates.find({"owner_id": user_id}, {"_id": 0, "id": 1}).to_list(
        1000
    )
    estate_ids = [e["id"] for e in estates]

    if estate_ids:
        # Delete beneficiaries, documents, messages tied to these estates
        await db.beneficiaries.delete_many({"estate_id": {"$in": estate_ids}})
        await db.documents.delete_many({"estate_id": {"$in": estate_ids}})
        await db.messages.delete_many({"estate_id": {"$in": estate_ids}})
        await db.checklists.delete_many({"estate_id": {"$in": estate_ids}})
        await db.estates.delete_many({"id": {"$in": estate_ids}})

    # Delete user's subscription, sessions, and other user-keyed data
    await db.user_subscriptions.delete_many({"user_id": user_id})
    await db.ai_feedback.delete_many({"user_id": user_id})
    await db.dts_tasks.delete_many({"user_id": user_id})

    # Finally delete the user
    await db.users.delete_one({"id": user_id})
    return {"message": "User and all associated data deleted"}


@router.post("/admin/cleanup-orphans")
async def cleanup_orphans(current_user: dict = Depends(get_current_user)):
    """Remove orphaned records not linked to any existing user — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    all_users = await db.users.find({}, {"_id": 0, "id": 1}).to_list(100000)
    user_ids = [u["id"] for u in all_users]

    # Find orphan estates (owner_id not in existing users)
    all_estates = await db.estates.find({}, {"_id": 0, "id": 1, "owner_id": 1}).to_list(
        100000
    )
    orphan_estates = [e for e in all_estates if e["owner_id"] not in set(user_ids)]
    orphan_estate_ids = [e["id"] for e in orphan_estates]
    orphan_owner_ids = list({e["owner_id"] for e in orphan_estates})

    deleted = {
        "estates": 0,
        "beneficiaries": 0,
        "documents": 0,
        "messages": 0,
        "checklists": 0,
        "subscriptions": 0,
    }

    if orphan_estate_ids:
        r = await db.beneficiaries.delete_many(
            {"estate_id": {"$in": orphan_estate_ids}}
        )
        deleted["beneficiaries"] = r.deleted_count
        r = await db.documents.delete_many({"estate_id": {"$in": orphan_estate_ids}})
        deleted["documents"] = r.deleted_count
        r = await db.messages.delete_many({"estate_id": {"$in": orphan_estate_ids}})
        deleted["messages"] = r.deleted_count
        r = await db.checklists.delete_many({"estate_id": {"$in": orphan_estate_ids}})
        deleted["checklists"] = r.deleted_count
        r = await db.estates.delete_many({"id": {"$in": orphan_estate_ids}})
        deleted["estates"] = r.deleted_count

    if orphan_owner_ids:
        r = await db.user_subscriptions.delete_many(
            {"user_id": {"$in": orphan_owner_ids}}
        )
        deleted["subscriptions"] = r.deleted_count

    return {"message": "Orphan cleanup complete", "deleted": deleted}


@router.put("/admin/users/{user_id}/role")
async def update_user_role(
    user_id: str, body: dict, current_user: dict = Depends(get_current_user)
):
    """Change a user's role — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    new_role = body.get("role", "")
    if new_role not in ("benefactor", "beneficiary", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    result = await db.users.update_one({"id": user_id}, {"$set": {"role": new_role}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await db.activity_log.insert_one(
        {
            "id": str(uuid4()),
            "action": "role_change",
            "actor_id": current_user["id"],
            "actor_name": current_user.get("name", "Admin"),
            "target_id": user_id,
            "details": f"Changed role to {new_role}",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"message": f"Role updated to {new_role}"}


@router.get("/admin/activity")
async def get_activity_log(current_user: dict = Depends(get_current_user)):
    """Get recent platform activity — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    # Collect recent activity from multiple collections
    activities = []
    # Recent user registrations
    recent_users = (
        await db.users.find(
            {}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "created_at": 1}
        )
        .sort("created_at", -1)
        .to_list(20)
    )
    for u in recent_users:
        if u.get("created_at"):
            activities.append(
                {
                    "type": "user_registered",
                    "icon": "user-plus",
                    "description": f"{u.get('name', u['email'])} registered as {u.get('role', 'user')}",
                    "timestamp": u["created_at"],
                }
            )
    # Recent estates
    recent_estates = (
        await db.estates.find(
            {}, {"_id": 0, "id": 1, "name": 1, "created_at": 1, "status": 1}
        )
        .sort("created_at", -1)
        .to_list(20)
    )
    for e in recent_estates:
        if e.get("created_at"):
            activities.append(
                {
                    "type": "estate_created",
                    "icon": "folder-lock",
                    "description": f"Estate '{e.get('name', 'Unnamed')}' created",
                    "timestamp": e["created_at"],
                    "status": e.get("status"),
                }
            )
    # Recent documents
    recent_docs = (
        await db.documents.find({}, {"_id": 0, "id": 1, "name": 1, "created_at": 1})
        .sort("created_at", -1)
        .to_list(10)
    )
    for d in recent_docs:
        if d.get("created_at"):
            activities.append(
                {
                    "type": "document_uploaded",
                    "icon": "file-up",
                    "description": f"Document '{d.get('name', 'file')}' uploaded",
                    "timestamp": d["created_at"],
                }
            )
    # Admin actions from activity_log collection
    admin_actions = (
        await db.activity_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(20)
    )
    for a in admin_actions:
        activities.append(
            {
                "type": a.get("action", "admin_action"),
                "icon": "shield",
                "description": f"{a.get('actor_name', 'Admin')}: {a.get('details', '')}",
                "timestamp": a.get("created_at", ""),
            }
        )
    # Sort all activities by timestamp descending
    activities.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return activities[:50]


# ===================== PLATFORM SETTINGS =====================


@router.get("/admin/platform-settings")
async def get_platform_settings(current_user: dict = Depends(get_current_user)):
    """Get platform-wide settings (admin only)."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    return settings or {"otp_disabled": False}


@router.put("/admin/platform-settings")
async def update_platform_settings(
    data: dict, current_user: dict = Depends(get_current_user)
):
    """Update platform-wide settings (admin only)."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    allowed_keys = {"otp_disabled"}
    update = {k: v for k, v in data.items() if k in allowed_keys}
    if update:
        await db.platform_settings.update_one(
            {"_id": "global"}, {"$set": update}, upsert=True
        )
    settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    return settings or {"otp_disabled": False}
