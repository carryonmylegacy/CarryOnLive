"""CarryOn™ Backend — Admin: Stats, Revenue, Launch Metrics & Trial Users"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from config import db
from guards import require_admin, require_staff

router = APIRouter()


@router.get("/admin/stats")
async def get_admin_stats(current_user: dict = Depends(require_staff)):
    """Get platform stats — admin/operator"""
    # Get all existing user IDs for cross-referencing
    all_users = await db.users.find({}, {"_id": 0, "id": 1, "role": 1, "email": 1, "benefactor_email": 1}).to_list(
        100000
    )
    user_ids = {u["id"] for u in all_users}

    total_users = len(all_users)
    benefactors = sum(1 for u in all_users if u.get("role") == "benefactor")
    beneficiaries_count = sum(1 for u in all_users if u.get("role") == "beneficiary")
    admins = sum(1 for u in all_users if u.get("role") == "admin")

    # Only count estates owned by existing users
    total_estates = await db.estates.count_documents({"owner_id": {"$in": list(user_ids)}})
    transitioned = await db.estates.count_documents({"owner_id": {"$in": list(user_ids)}, "status": "transitioned"})

    total_docs = await db.documents.count_documents({"owner_id": {"$in": list(user_ids)}})
    total_messages = await db.messages.count_documents({"user_id": {"$in": list(user_ids)}})
    pending_certs = await db.death_certificates.count_documents({"status": "pending"})
    reviewing_certs = await db.death_certificates.count_documents({"status": "reviewing"})
    unanswered_messages = await db.support_messages.count_documents({"sender_role": {"$ne": "admin"}, "read": False})
    pending_verifications = await db.tier_verifications.count_documents({"status": "pending"})
    pending_dts = await db.dts_tasks.count_documents({"status": "pending"})
    # Only count subscriptions for existing users
    active_subs = await db.user_subscriptions.count_documents({"status": "active", "user_id": {"$in": list(user_ids)}})
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
        for s in await db.user_subscriptions.find({"status": "active"}, {"_id": 0, "id": 1, "user_id": 1}).to_list(
            10000
        )
    }
    trial_periods = sum(1 for u in trial_candidates if u["id"] not in sub_ids)
    pending_family = await db.family_plan_requests.count_documents({"status": "pending"})
    deletion_requests = await db.deletion_requests.count_documents({"status": "pending"})

    # Milestone deliveries pending review
    pending_milestones = await db.milestone_deliveries.count_documents({"status": "pending_review"})

    # Emergency access requests pending
    pending_emergency = await db.emergency_access.count_documents({"status": "pending"})

    # P1 emergency conversations
    p1_emergencies = await db.support_conversations.count_documents(
        {"priority": "p1", "status": {"$in": ["open", "active"]}}
    )

    # Open escalations
    open_escalations = await db.escalations.count_documents({"status": "open"})

    # Viral metrics — only count beneficiaries linked to existing benefactors' estates
    benefactor_ids = [u["id"] for u in all_users if u.get("role") == "benefactor"]
    estates_for_benefactors = await db.estates.find({"owner_id": {"$in": benefactor_ids}}, {"_id": 0, "id": 1}).to_list(
        100000
    )
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
        if u.get("role") == "benefactor" and (u.get("benefactor_email") or u["email"] in ben_emails)
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
        "pending_milestones": pending_milestones,
        "pending_emergency": pending_emergency,
        "p1_emergencies": p1_emergencies,
        "open_escalations": open_escalations,
        "avg_beneficiaries_per_benefactor": avg_bens_per_benefactor,
        "beneficiaries_converted": ben_to_benefactor_count,
    }


@router.get("/admin/revenue-metrics")
async def get_revenue_metrics(current_user: dict = Depends(require_admin)):
    """Revenue analytics — admin only."""
    now = datetime.now(timezone.utc)
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    last_month_start = (
        (now.replace(day=1) - timedelta(days=1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    )
    last_month_end = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Active subscriptions with their plan prices
    active_subs = await db.subscriptions.find(
        {"status": "active"},
        {
            "_id": 0,
            "id": 1,
            "plan_id": 1,
            "amount": 1,
            "billing_cycle": 1,
            "created_at": 1,
        },
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
        {"status": "succeeded"}, {"_id": 0, "id": 1, "amount": 1, "created_at": 1}
    ).to_list(100000)
    total_revenue = sum(p.get("amount", 0) for p in payments) / 100  # cents to dollars

    # This month's revenue
    this_month_payments = [p for p in payments if p.get("created_at", "") >= this_month_start]
    revenue_this_month = sum(p.get("amount", 0) for p in this_month_payments) / 100

    # Last month's revenue
    last_month_payments = [p for p in payments if last_month_start <= p.get("created_at", "") < last_month_end]
    revenue_last_month = sum(p.get("amount", 0) for p in last_month_payments) / 100

    # MoM growth rate
    if revenue_last_month > 0:
        mom_growth = round(((revenue_this_month - revenue_last_month) / revenue_last_month) * 100, 1)
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
    churn_rate = round((cancelled_this_month / max(total_subs_start_of_month, 1)) * 100, 1)

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
async def get_launch_metrics(current_user: dict = Depends(require_admin)):
    """Real-time launch metrics — admin only."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    thirty_days_ago = (now - timedelta(days=30)).isoformat()

    # New benefactor signups — today, 7d, 30d, all time
    signups_today = await db.users.count_documents({"role": "benefactor", "created_at": {"$gte": today_start}})
    signups_7d = await db.users.count_documents({"role": "benefactor", "created_at": {"$gte": seven_days_ago}})
    signups_30d = await db.users.count_documents({"role": "benefactor", "created_at": {"$gte": thirty_days_ago}})
    total_benefactors = await db.users.count_documents({"role": "benefactor"})

    # Beneficiaries invited per benefactor
    total_bens = await db.beneficiaries.count_documents({"is_stub": {"$ne": True}})
    avg_invited = round(total_bens / max(total_benefactors, 1), 1)

    # Beneficiary activation rate (accepted invitations / total invitations)
    total_invited = await db.beneficiaries.count_documents(
        {"invitation_status": {"$in": ["sent", "pending", "accepted"]}}
    )
    total_accepted = await db.beneficiaries.count_documents({"invitation_status": "accepted"})
    activation_rate = round((total_accepted / max(total_invited, 1)) * 100, 1)

    # Trial -> paid conversion
    total_trialing = await db.users.count_documents({"role": "benefactor", "subscription_status": "trialing"})
    total_paid = await db.subscriptions.count_documents({"status": "active"})
    total_expired_trials = await db.users.count_documents(
        {"role": "benefactor", "subscription_status": {"$in": ["expired", "inactive"]}}
    )
    conversion_rate = round((total_paid / max(total_paid + total_expired_trials, 1)) * 100, 1)

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


@router.get("/admin/trial-users")
async def get_trial_users(current_user: dict = Depends(require_staff)):
    """List all users currently in their trial period — admin and operators."""
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
    subs = await db.user_subscriptions.find({"status": "active"}, {"_id": 0, "id": 1, "user_id": 1}).to_list(10000)
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
