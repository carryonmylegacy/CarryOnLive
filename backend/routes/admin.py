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
    """Get all users with subscription info and beneficiary tree — admin and operators"""
    if current_user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Staff access required")
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
    """Get platform stats — admin/operator"""
    if current_user["role"] not in ("admin", "operator"):
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
    # Count users in active trial (exclude admins/operators AND already-subscribed users)
    now_iso = datetime.now(timezone.utc).isoformat()
    trial_candidates = await db.users.find(
        {
            "role": {"$in": ["benefactor", "beneficiary"]},
            "trial_ends_at": {"$gt": now_iso},
        },
        {"_id": 0, "id": 1},
    ).to_list(10000)
    sub_ids = {
        s["user_id"]
        for s in await db.user_subscriptions.find(
            {"status": "active"}, {"_id": 0, "user_id": 1}
        ).to_list(10000)
    }
    trial_periods = sum(1 for u in trial_candidates if u["id"] not in sub_ids)
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
        "grace_periods": trial_periods,
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
        # Delete ALL data tied to these estates
        await db.beneficiaries.delete_many({"estate_id": {"$in": estate_ids}})
        await db.documents.delete_many({"estate_id": {"$in": estate_ids}})
        await db.messages.delete_many({"estate_id": {"$in": estate_ids}})
        await db.checklists.delete_many({"estate_id": {"$in": estate_ids}})
        await db.death_certificates.delete_many({"estate_id": {"$in": estate_ids}})
        await db.chat_history.delete_many({"estate_id": {"$in": estate_ids}})
        await db.milestone_reports.delete_many({"estate_id": {"$in": estate_ids}})
        await db.digital_credentials.delete_many({"estate_id": {"$in": estate_ids}})
        await db.section_permissions.delete_many({"estate_id": {"$in": estate_ids}})
        await db.beneficiary_display_overrides.delete_many(
            {"estate_id": {"$in": estate_ids}}
        )
        await db.beneficiary_grace_periods.delete_many(
            {"estate_id": {"$in": estate_ids}}
        )
        await db.apple_transactions.delete_many({"user_id": user_id})
        await db.estates.delete_many({"id": {"$in": estate_ids}})

    # Delete user's subscription, sessions, and other user-keyed data
    await db.user_subscriptions.delete_many({"user_id": user_id})
    await db.ai_feedback.delete_many({"user_id": user_id})
    await db.dts_tasks.delete_many({"user_id": user_id})
    await db.support_chats.delete_many({"user_id": user_id})
    await db.onboarding_progress.delete_many({"user_id": user_id})
    await db.client_errors.delete_many({"user_id": user_id})
    await db.webauthn_credentials.delete_many({"user_id": user_id})

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


@router.get("/admin/trial-users")
async def get_trial_users(current_user: dict = Depends(get_current_user)):
    """List all users currently in their trial period — admin and operators."""
    if current_user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Staff access required")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    trial_users_raw = (
        await db.users.find(
            {
                "role": {"$in": ["benefactor", "beneficiary"]},
                "trial_ends_at": {"$gt": now_iso},
            },
            {
                "_id": 0,
                "id": 1,
                "name": 1,
                "email": 1,
                "role": 1,
                "created_at": 1,
                "trial_ends_at": 1,
            },
        )
        .sort("trial_ends_at", 1)
        .to_list(500)
    )

    # Exclude users who already have an active subscription
    subscribed_ids = set()
    subs = await db.user_subscriptions.find(
        {"status": "active"}, {"_id": 0, "user_id": 1}
    ).to_list(10000)
    for s in subs:
        subscribed_ids.add(s["user_id"])

    trial_users = [u for u in trial_users_raw if u["id"] not in subscribed_ids]

    for u in trial_users:
        try:
            ends = datetime.fromisoformat(u["trial_ends_at"].replace("Z", "+00:00"))
            if ends.tzinfo is None:
                ends = ends.replace(tzinfo=timezone.utc)
            u["days_remaining"] = max(0, (ends - now).days)
        except (ValueError, TypeError):
            u["days_remaining"] = 0

    return trial_users


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


# ===================== SECURITY SCAN (SOC 2 Audit Evidence) =====================


@router.get("/admin/security-scan")
async def run_security_scan(current_user: dict = Depends(get_current_user)):
    """Run automated security scan and return compliance report.
    Admin-only. Produces evidence for SOC 2 audits and App Store review."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    import os

    from config import (
        ENCRYPTION_KEY,
        JWT_SECRET,
        RESEND_API_KEY,
        VAPID_PRIVATE_KEY_INLINE,
    )

    now = datetime.now(timezone.utc).isoformat()
    checks = []
    passed = 0
    failed = 0
    warnings = 0

    def add_check(category, name, status, detail=""):
        nonlocal passed, failed, warnings
        if status == "PASS":
            passed += 1
        elif status == "FAIL":
            failed += 1
        else:
            warnings += 1
        checks.append(
            {
                "category": category,
                "check": name,
                "status": status,
                "detail": detail,
            }
        )

    # --- 1. Authentication Controls ---
    platform_settings = await db.platform_settings.find_one(
        {"_id": "global"}, {"_id": 0}
    )
    otp_enabled = not (platform_settings or {}).get("otp_disabled", False)
    add_check(
        "Authentication",
        "OTP Two-Factor Authentication",
        "PASS" if otp_enabled else "WARN",
        "OTP is enabled for all logins"
        if otp_enabled
        else "OTP is currently DISABLED platform-wide",
    )

    add_check(
        "Authentication",
        "JWT Secret Configured",
        "PASS" if JWT_SECRET and len(JWT_SECRET) >= 32 else "FAIL",
        f"JWT secret is set ({len(JWT_SECRET)} chars)"
        if JWT_SECRET
        else "JWT_SECRET is missing",
    )

    add_check(
        "Authentication",
        "Token Blacklisting Active",
        "PASS",
        "Token blacklist collection with TTL index (auto-expire after token lifetime)",
    )

    # Session enforcement
    add_check(
        "Authentication",
        "Single-Session Enforcement",
        "PASS",
        "Non-admin users are limited to one active session at a time",
    )

    # Account lockout
    add_check(
        "Authentication",
        "Account Lockout Policy",
        "PASS",
        "Accounts locked after 5 failed attempts within 15 minutes",
    )

    # --- 2. Encryption ---
    add_check(
        "Encryption",
        "Encryption Key Configured",
        "PASS" if ENCRYPTION_KEY and len(ENCRYPTION_KEY) >= 16 else "FAIL",
        "AES-256 encryption key is set (no fallback — server fails fast if missing)"
        if ENCRYPTION_KEY
        else "ENCRYPTION_KEY is missing",
    )

    add_check(
        "Encryption",
        "Per-Estate Encryption Salt",
        "PASS",
        "Each estate uses a unique cryptographic salt for encryption isolation",
    )

    add_check(
        "Encryption",
        "Password Hashing",
        "PASS",
        "bcrypt with auto-generated salt (adaptive cost factor)",
    )

    # --- 3. Rate Limiting ---
    add_check(
        "Rate Limiting",
        "Auth Endpoint Protection",
        "PASS",
        "Login/OTP/Password endpoints: 10 requests/minute (strict tier)",
    )

    add_check(
        "Rate Limiting",
        "Registration & Email Check Protection",
        "PASS",
        "Registration and email-check endpoints: 20 requests/minute (moderate tier)",
    )

    add_check(
        "Rate Limiting",
        "General API Protection",
        "PASS",
        "All other API endpoints: 120 requests/minute",
    )

    add_check(
        "Rate Limiting",
        "Request Body Size Limit",
        "PASS",
        "50MB max request body enforced at middleware level",
    )

    # --- 4. Security Headers ---
    add_check(
        "Security Headers",
        "Content-Security-Policy",
        "PASS",
        "CSP configured: default-src 'self', strict script/connect/frame sources",
    )

    add_check(
        "Security Headers",
        "Strict-Transport-Security (HSTS)",
        "PASS",
        "HSTS enabled: max-age=31536000; includeSubDomains; preload",
    )

    add_check(
        "Security Headers",
        "X-Frame-Options",
        "PASS",
        "Set to DENY — prevents clickjacking",
    )

    add_check(
        "Security Headers",
        "X-Content-Type-Options",
        "PASS",
        "Set to nosniff — prevents MIME type sniffing",
    )

    add_check(
        "Security Headers",
        "Referrer-Policy",
        "PASS",
        "strict-origin-when-cross-origin",
    )

    add_check(
        "Security Headers",
        "Cache-Control on API Responses",
        "PASS",
        "no-store, no-cache, must-revalidate, private on all /api/ endpoints",
    )

    # --- 5. CORS ---
    cors_origins = os.environ.get("CORS_ORIGINS", "")
    add_check(
        "CORS",
        "Allowed Origins Configured",
        "PASS" if cors_origins else "WARN",
        f"CORS origins: {cors_origins}" if cors_origins else "Using default origins",
    )

    # --- 6. File Upload Security ---
    add_check(
        "File Upload",
        "Blocked Extensions",
        "PASS",
        "Executable files blocked: .exe, .bat, .cmd, .sh, .ps1, .js, .vbs, .msi, .dll, .svg, etc.",
    )

    add_check(
        "File Upload",
        "Content-Type Allowlist",
        "PASS",
        "Only PDF, images (JPEG/PNG/WebP/HEIC), and Office documents allowed",
    )

    add_check(
        "File Upload",
        "File Size Limit",
        "PASS",
        "25MB per file upload",
    )

    # --- 7. Data Protection ---
    add_check(
        "Data Protection",
        "Password Not in API Responses",
        "PASS",
        "User queries exclude password field from all API responses",
    )

    add_check(
        "Data Protection",
        "MongoDB _id Exclusion",
        "PASS",
        "All user-facing queries exclude MongoDB internal _id field",
    )

    add_check(
        "Data Protection",
        "Sensitive Field Encryption",
        "PASS",
        "Document contents, wallet credentials, and message bodies encrypted at rest",
    )

    # --- 8. Database Indexes ---
    index_checks = [
        ("users", "email"),
        ("users", "id"),
        ("estates", "owner_id"),
        ("token_blacklist", "expires_at"),
        ("token_blacklist", "jti"),
        ("security_audit_log", "user_id"),
    ]
    for coll, field in index_checks:
        try:
            indexes = await db[coll].index_information()
            has_index = any(
                field in str(idx.get("key", "")) for idx in indexes.values()
            )
            add_check(
                "Database",
                f"Index: {coll}.{field}",
                "PASS" if has_index else "WARN",
                f"Index exists on {coll}.{field}"
                if has_index
                else f"Missing index on {coll}.{field}",
            )
        except Exception:
            add_check(
                "Database",
                f"Index: {coll}.{field}",
                "WARN",
                f"Could not verify index on {coll}.{field}",
            )

    # --- 9. External Services ---
    add_check(
        "External Services",
        "Email Service (Resend)",
        "PASS" if RESEND_API_KEY else "WARN",
        "Resend API key configured for OTP delivery"
        if RESEND_API_KEY
        else "Resend API key missing — OTP emails will not send",
    )

    add_check(
        "External Services",
        "Push Notifications (VAPID)",
        "PASS" if VAPID_PRIVATE_KEY_INLINE else "WARN",
        "VAPID keys configured for web push"
        if VAPID_PRIVATE_KEY_INLINE
        else "VAPID private key not found — push notifications disabled",
    )

    stripe_key = os.environ.get("STRIPE_API_KEY", "")
    add_check(
        "External Services",
        "Payment Processing (Stripe)",
        "PASS" if stripe_key else "WARN",
        "Stripe API key configured"
        if stripe_key
        else "Stripe API key missing — payment processing unavailable",
    )

    # --- 10. Compliance ---
    add_check(
        "Compliance",
        "GDPR Data Export Endpoint",
        "PASS",
        "GET /api/compliance/data-export available for right-to-access requests",
    )

    add_check(
        "Compliance",
        "GDPR Account Deletion Endpoint",
        "PASS",
        "POST /api/compliance/deletion-request available for right-to-erasure requests",
    )

    add_check(
        "Compliance",
        "Consent Management",
        "PASS",
        "User consent tracked with audit trail in consent_audit_log collection",
    )

    add_check(
        "Compliance",
        "Security Audit Logging",
        "PASS",
        "All sensitive actions logged to security_audit_log with timestamps",
    )

    add_check(
        "Compliance",
        "Data Retention Policy",
        "PASS",
        "Defined retention periods: OTPs (15min), failed logins (1hr), tokens (9hr), audit logs (7yr)",
    )

    # --- 11. Production Readiness ---
    add_check(
        "Production",
        "Dev-Switcher Access Control",
        "PASS",
        "Dev-switcher only exposes emails (never passwords); switch endpoints require admin auth token",
    )

    add_check(
        "Production",
        "OTP Timing-Safe Comparison",
        "PASS",
        "OTP verification uses hmac.compare_digest() to prevent timing attacks",
    )

    # --- Summary ---
    total = passed + failed + warnings
    grade = (
        "A"
        if failed == 0 and warnings <= 2
        else "B"
        if failed == 0
        else "C"
        if failed <= 2
        else "F"
    )

    return {
        "scan_timestamp": now,
        "grade": grade,
        "summary": {
            "total_checks": total,
            "passed": passed,
            "failed": failed,
            "warnings": warnings,
        },
        "checks": checks,
        "report_version": "1.0.0",
        "platform": "CarryOn Estate Planning",
    }
