"""Tier verification, B2B codes, family plans, beneficiary lifecycle, admin stats."""

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, Form, HTTPException, Request
from pydantic import BaseModel

from config import db, logger
from utils import get_current_user
from routes.subscriptions.plans import (
    router,
    DEFAULT_PLANS,
    BENEFICIARY_PLANS,
    get_subscription_settings,
    calculate_trial_status,
)


# ===================== TIER VERIFICATION =====================


@router.post("/verification/upload")
async def upload_verification_document(
    tier_requested: str = Form(...),
    doc_type: str = Form(...),
    file_data: str = Form(...),
    file_name: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a verification document for a special tier (Military/Hospice/Veteran)"""
    valid_tiers = ["military", "hospice", "veteran", "enterprise"]
    if tier_requested not in valid_tiers:
        raise HTTPException(
            status_code=400, detail=f"Invalid tier. Must be one of: {valid_tiers}"
        )

    # Check for existing pending verification
    existing = await db.tier_verifications.find_one(
        {"user_id": current_user["id"], "status": "pending"}, {"_id": 0}
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="You already have a pending verification request"
        )

    import uuid

    verification = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "user_email": current_user.get("email", ""),
        "tier_requested": tier_requested,
        "doc_type": doc_type,
        "file_name": file_name,
        "file_data": file_data,
        "status": "pending",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_at": None,
        "reviewed_by": None,
        "review_notes": None,
    }

    await db.tier_verifications.insert_one(verification)

    return {
        "success": True,
        "verification_id": verification["id"],
        "message": f"Verification document submitted for {tier_requested} tier. We'll review it within 24-48 hours.",
    }


@router.get("/verification/status")
async def get_verification_status(current_user: dict = Depends(get_current_user)):
    """Get current user's verification status"""
    verification = await db.tier_verifications.find_one(
        {"user_id": current_user["id"]},
        {"_id": 0, "file_data": 0},
        sort=[("submitted_at", -1)],
    )
    return verification or {"status": "none"}


# ===================== ADMIN VERIFICATION MANAGEMENT =====================


@router.get("/admin/verifications")
async def get_all_verifications(current_user: dict = Depends(get_current_user)):
    """Get all verification requests (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    verifications = (
        await db.tier_verifications.find({}, {"_id": 0, "file_data": 0})
        .sort("submitted_at", -1)
        .to_list(200)
    )

    return verifications


@router.get("/admin/verifications/{verification_id}/document")
async def get_verification_document(
    verification_id: str, current_user: dict = Depends(get_current_user)
):
    """Download a verification document (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    verification = await db.tier_verifications.find_one(
        {"id": verification_id}, {"_id": 0}
    )
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")

    return {
        "file_data": verification.get("file_data", ""),
        "file_name": verification.get("file_name", "document"),
        "doc_type": verification.get("doc_type", ""),
    }


@router.post("/admin/verifications/{verification_id}/review")
async def review_verification(
    verification_id: str,
    data: VerificationReviewRequest,
    current_user: dict = Depends(get_current_user),
):
    """Approve or deny a verification request (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if data.action not in ["approve", "deny"]:
        raise HTTPException(
            status_code=400, detail="Action must be 'approve' or 'deny'"
        )

    verification = await db.tier_verifications.find_one(
        {"id": verification_id}, {"_id": 0}
    )
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")

    new_status = "approved" if data.action == "approve" else "denied"

    await db.tier_verifications.update_one(
        {"id": verification_id},
        {
            "$set": {
                "status": new_status,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
                "reviewed_by": current_user["id"],
                "review_notes": data.notes,
            }
        },
    )

    # If approved, update user's verified tier
    if data.action == "approve":
        await db.users.update_one(
            {"id": verification["user_id"]},
            {
                "$set": {
                    "verified_tier": verification["tier_requested"],
                    "verification_status": "approved",
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

    action_label = "approved" if data.action == "approve" else "denied"
    return {
        "success": True,
        "message": f"Verification {action_label} for {verification.get('user_name', '')}",
    }


@router.post("/admin/verifications/{verification_id}/notify")
async def notify_benefactor_verified(
    verification_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Send a notification to the benefactor that their verification is approved.
    Creates a message in their customer service portal and sends a push notification."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    verification = await db.tier_verifications.find_one(
        {"id": verification_id}, {"_id": 0}
    )
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")
    if verification.get("status") != "approved":
        raise HTTPException(
            status_code=400, detail="Can only notify for approved verifications"
        )

    import uuid

    tier_label = {
        "military": "Military / First Responder",
        "veteran": "Veteran",
        "hospice": "Hospice",
        "enterprise": "Enterprise / B2B Partner",
    }.get(verification["tier_requested"], verification["tier_requested"])

    # Create a customer service message in the benefactor's support portal
    is_free_tier = verification["tier_requested"] == "hospice"
    message = {
        "id": str(uuid.uuid4()),
        "conversation_id": verification["user_id"],
        "sender_id": current_user["id"],
        "sender_name": "CarryOn Support",
        "sender_role": "admin",
        "content": (
            f"Your {tier_label} verification has been approved. "
            f"You can now subscribe to the {tier_label} plan at no cost. "
            f"Go to Settings → Subscription and click Subscribe under the {tier_label} plan. "
            f"We're here for you."
        ) if is_free_tier else (
            f"Great news! Your {tier_label} verification has been approved. "
            f"You can now subscribe to the {tier_label} plan. "
            f"Go to Settings → Subscription and click Subscribe under the {tier_label} plan — "
            f"it will go through without any further verification needed. "
            f"Thank you for your service!"
        ),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False,
    }

    await db.support_messages.insert_one(message)

    # Mark verification as notified
    await db.tier_verifications.update_one(
        {"id": verification_id},
        {
            "$set": {
                "notified": True,
                "notified_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    # Send push notification
    try:
        from services.notifications import send_push_notification

        import asyncio

        asyncio.create_task(
            send_push_notification(
                verification["user_id"],
                "Verification Approved!",
                f"Your {tier_label} verification is approved. Go to Settings to subscribe.",
                "/settings",
                "verification-approved",
                "support",
            )
        )
    except Exception as e:
        logger.warning(f"Push notification failed: {e}")

    return {
        "success": True,
        "message": f"Notification sent to {verification.get('user_name', verification.get('user_email', ''))}",
    }


@router.get("/admin/subscription-stats")
async def get_subscription_stats(current_user: dict = Depends(get_current_user)):
    """Get detailed subscription statistics (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    total_users = await db.users.count_documents({})
    non_admin_users = await db.users.count_documents({"role": {"$ne": "admin"}})
    active_trials = await db.users.count_documents({"trial_ends_at": {"$gt": now_iso}})
    expired_trials = await db.users.count_documents(
        {
            "trial_ends_at": {"$lte": now_iso},
            "role": {"$ne": "admin"},
        }
    )
    active_subs = await db.user_subscriptions.count_documents({"status": "active"})
    cancelled_subs = await db.user_subscriptions.count_documents(
        {"status": "cancelled"}
    )
    pending_verifications = await db.tier_verifications.count_documents(
        {"status": "pending"}
    )
    free_overrides = await db.subscription_overrides.count_documents(
        {"free_access": True}
    )

    # --- MRR ---
    mrr = 0.0
    active_sub_docs = await db.user_subscriptions.find(
        {"status": "active"}, {"_id": 0}
    ).to_list(5000)
    plan_lookup = {p["id"]: p for p in DEFAULT_PLANS}
    tier_counts = {}
    for sub in active_sub_docs:
        plan_id = sub.get("plan_id", "")
        plan = plan_lookup.get(plan_id)
        if plan:
            monthly = get_price_for_cycle(plan, "monthly")
            mrr += monthly
        tier_counts[plan_id] = tier_counts.get(plan_id, 0) + 1

    # --- Trial conversion % ---
    users_who_left_trial = expired_trials + active_subs + cancelled_subs
    trial_conversion = (
        round((active_subs / users_who_left_trial) * 100, 1)
        if users_who_left_trial > 0
        else 0
    )

    # --- Churn rate ---
    total_ever_subscribed = active_subs + cancelled_subs
    churn_rate = (
        round((cancelled_subs / total_ever_subscribed) * 100, 1)
        if total_ever_subscribed > 0
        else 0
    )

    # --- Tier distribution ---
    tier_distribution = []
    for plan in DEFAULT_PLANS:
        count = tier_counts.get(plan["id"], 0)
        tier_distribution.append(
            {
                "tier": plan["name"],
                "id": plan["id"],
                "count": count,
                "price": plan["price"],
            }
        )

    # --- Signup trend (last 30 days) ---
    signup_trend = []
    for i in range(30):
        day = now - timedelta(days=29 - i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        day_end = day.replace(
            hour=23, minute=59, second=59, microsecond=999999
        ).isoformat()
        count = await db.users.count_documents(
            {"created_at": {"$gte": day_start, "$lte": day_end}}
        )
        signup_trend.append(
            {
                "date": day.strftime("%m/%d"),
                "signups": count,
            }
        )

    # --- Trial status breakdown ---
    trial_breakdown = {
        "active": active_trials,
        "expired_no_sub": max(0, expired_trials - active_subs - cancelled_subs),
        "converted": active_subs,
        "churned": cancelled_subs,
    }

    # --- Revenue by tier ---
    revenue_by_tier = []
    for plan in DEFAULT_PLANS:
        count = tier_counts.get(plan["id"], 0)
        revenue_by_tier.append(
            {
                "tier": plan["name"],
                "id": plan["id"],
                "revenue": round(count * plan["price"], 2),
                "subscribers": count,
            }
        )

    return {
        "total_users": total_users,
        "non_admin_users": non_admin_users,
        "active_trials": active_trials,
        "expired_trials": expired_trials,
        "active_subscriptions": active_subs,
        "cancelled_subscriptions": cancelled_subs,
        "pending_verifications": pending_verifications,
        "free_overrides": free_overrides,
        "mrr": round(mrr, 2),
        "arr": round(mrr * 12, 2),
        "trial_conversion_pct": trial_conversion,
        "churn_rate_pct": churn_rate,
        "tier_distribution": tier_distribution,
        "signup_trend": signup_trend,
        "trial_breakdown": trial_breakdown,
        "revenue_by_tier": revenue_by_tier,
    }


@router.post("/admin/trial-reminders/send")
async def trigger_trial_reminders(current_user: dict = Depends(get_current_user)):
    """Manually trigger trial reminder emails (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    from routes.trial_reminders import send_trial_reminders

    count = await send_trial_reminders()
    return {"success": True, "reminders_sent": count}


# ===================== BENEFICIARY PAYMENT LIFECYCLE =====================


class FamilyPlanRequest(BaseModel):
    benefactor_email: str


@router.post("/subscriptions/family-plan-request")
async def request_family_plan_add(
    data: FamilyPlanRequest,
    current_user: dict = Depends(get_current_user),
):
    """Beneficiary requests a benefactor to add them to their family plan."""
    benefactor = await db.users.find_one(
        {"email": data.benefactor_email, "role": "benefactor"}, {"_id": 0}
    )
    if not benefactor:
        raise HTTPException(
            status_code=404,
            detail="No benefactor account found with that email. Please check the address.",
        )

    # Prevent duplicate requests
    existing = await db.family_plan_requests.find_one(
        {
            "beneficiary_id": current_user["id"],
            "benefactor_id": benefactor["id"],
            "status": "pending",
        },
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=400, detail="Request already pending")

    import uuid

    request_doc = {
        "id": str(uuid.uuid4()),
        "beneficiary_id": current_user["id"],
        "beneficiary_name": current_user.get("name", ""),
        "beneficiary_email": current_user.get("email", ""),
        "benefactor_id": benefactor["id"],
        "benefactor_email": benefactor["email"],
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.family_plan_requests.insert_one(request_doc)

    # Send email notification to the benefactor
    try:
        from services.email import send_email

        await send_email(
            to=benefactor["email"],
            subject="Family Plan Request — CarryOn",
            html=f"""
            <p>Hi {benefactor.get("name", "").split()[0] if benefactor.get("name") else "there"},</p>
            <p><strong>{current_user.get("name", current_user["email"])}</strong> has requested to join your CarryOn Family Plan.</p>
            <p>Log in to your CarryOn account and go to <strong>Settings → Family Plan</strong> to review and approve this request.</p>
            <p>— The CarryOn Team</p>
            """,
        )
    except Exception as e:
        logger.warning(f"Failed to send family plan request email: {e}")

    return {"success": True, "message": "Request sent to the benefactor"}


@router.get("/subscriptions/beneficiary/lifecycle-status")
async def get_beneficiary_lifecycle(current_user: dict = Depends(get_current_user)):
    """Check the beneficiary's lifecycle status — age events, grace periods, etc."""
    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    dob_str = user_doc.get("date_of_birth")
    age = None
    age_events = []

    if dob_str:
        try:
            dob = datetime.fromisoformat(dob_str.replace("Z", "+00:00"))
            if dob.tzinfo is None:
                dob = dob.replace(tzinfo=timezone.utc)
            age = (now - dob).days // 365

            # Check if turning 18 soon or just turned 18
            eighteenth = dob.replace(year=dob.year + 18)
            if eighteenth.tzinfo is None:
                eighteenth = eighteenth.replace(tzinfo=timezone.utc)
            days_to_18 = (eighteenth - now).days
            if -30 <= days_to_18 <= 90:
                age_events.append(
                    {
                        "event": "turning_18",
                        "age": 18,
                        "date": eighteenth.isoformat(),
                        "days_away": days_to_18,
                        "message": "You are approaching 18 — subscription will be required to maintain access."
                        if days_to_18 > 0
                        else "You have turned 18 — please subscribe to continue using CarryOn.",
                    }
                )

            # Check if aging out of New Adult tier at 26
            twentysixth = dob.replace(year=dob.year + 26)
            if twentysixth.tzinfo is None:
                twentysixth = twentysixth.replace(tzinfo=timezone.utc)
            days_to_26 = (twentysixth - now).days
            if -30 <= days_to_26 <= 90:
                age_events.append(
                    {
                        "event": "turning_26",
                        "age": 26,
                        "date": twentysixth.isoformat(),
                        "days_away": days_to_26,
                        "message": "You are aging out of the New Adult tier — your plan will transition to standard pricing."
                        if days_to_26 > 0
                        else "You have turned 26 — your plan has transitioned to standard pricing.",
                    }
                )
        except (ValueError, TypeError):
            pass

    # Check grace period (e.g., benefactor transition)
    grace = await db.beneficiary_grace_periods.find_one(
        {"beneficiary_id": current_user["id"]}, {"_id": 0}
    )
    grace_info = None
    if grace:
        grace_end = datetime.fromisoformat(
            grace["grace_ends_at"].replace("Z", "+00:00")
        )
        if grace_end.tzinfo is None:
            grace_end = grace_end.replace(tzinfo=timezone.utc)
        days_left = max(0, (grace_end - now).days)
        grace_info = {
            "reason": grace.get("reason", "benefactor_transition"),
            "grace_ends_at": grace["grace_ends_at"],
            "days_remaining": days_left,
            "expired": now >= grace_end,
        }

    # Check family plan membership
    family_plan = await db.family_plan_members.find_one(
        {"member_id": current_user["id"], "status": "active"}, {"_id": 0}
    )

    # Check pending family plan requests
    pending_requests = await db.family_plan_requests.find(
        {"beneficiary_id": current_user["id"], "status": "pending"},
        {"_id": 0},
    ).to_list(10)

    return {
        "age": age,
        "age_events": age_events,
        "grace_period": grace_info,
        "in_family_plan": family_plan is not None,
        "family_plan": family_plan,
        "pending_family_requests": len(pending_requests),
        "needs_subscription": not (
            family_plan
            or (grace_info and not grace_info["expired"])
            or (
                await db.user_subscriptions.find_one(
                    {"user_id": current_user["id"], "status": "active"}, {"_id": 0}
                )
            )
        ),
    }


@router.post("/admin/beneficiary/trigger-transition")
async def trigger_benefactor_transition(
    benefactor_id: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """Admin triggers a benefactor transition — starts 30-day grace for their beneficiaries."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    benefactor = await db.users.find_one({"id": benefactor_id}, {"_id": 0})
    if not benefactor:
        raise HTTPException(status_code=404, detail="Benefactor not found")

    # Find all estates owned by this benefactor
    estates = await db.estates.find({"owner_id": benefactor_id}, {"_id": 0}).to_list(50)

    # Collect all beneficiary IDs
    beneficiary_ids = set()
    for estate in estates:
        for ben_id in estate.get("beneficiaries", []):
            beneficiary_ids.add(ben_id)

    import uuid

    now = datetime.now(timezone.utc)
    grace_end = now + timedelta(days=GRACE_PERIOD_DAYS)
    created = 0

    for ben_id in beneficiary_ids:
        # Check if beneficiary already has a subscription or grace period
        existing_sub = await db.user_subscriptions.find_one(
            {"user_id": ben_id, "status": "active"}, {"_id": 0}
        )
        if existing_sub:
            continue  # Already has a plan

        existing_grace = await db.beneficiary_grace_periods.find_one(
            {"beneficiary_id": ben_id}, {"_id": 0}
        )
        if existing_grace:
            continue  # Already has grace period

        # Check if part of a family plan
        family_member = await db.family_plan_members.find_one(
            {"member_id": ben_id, "status": "active"}, {"_id": 0}
        )
        if family_member:
            continue  # Covered by family plan

        await db.beneficiary_grace_periods.insert_one(
            {
                "id": str(uuid.uuid4()),
                "beneficiary_id": ben_id,
                "benefactor_id": benefactor_id,
                "reason": "benefactor_transition",
                "grace_starts_at": now.isoformat(),
                "grace_ends_at": grace_end.isoformat(),
                "created_at": now.isoformat(),
            }
        )
        created += 1

        # Notify beneficiary via email
        ben_user = await db.users.find_one({"id": ben_id}, {"_id": 0})
        if ben_user and ben_user.get("email"):
            try:
                from services.email import send_email

                await send_email(
                    to=ben_user["email"],
                    subject="Important: Your CarryOn Access — Grace Period",
                    html=f"""
                    <p>Dear {ben_user.get("name", "").split()[0] if ben_user.get("name") else "there"},</p>
                    <p>We are reaching out during a difficult time. Your CarryOn access has been placed on a <strong>30-day grace period</strong>.</p>
                    <p>After this period ends on <strong>{grace_end.strftime("%B %d, %Y")}</strong>, you will need to subscribe to continue accessing your estate documents and messages.</p>
                    <p>Log in to your CarryOn account to choose a plan or join a family plan.</p>
                    <p>With care,<br/>The CarryOn Team</p>
                    """,
                )
            except Exception as e:
                logger.warning(f"Failed to send grace period email to {ben_id}: {e}")

    return {
        "success": True,
        "beneficiaries_notified": created,
        "message": f"Transition triggered for {len(beneficiary_ids)} beneficiaries ({created} grace periods created)",
    }


async def check_dob_subscription_events():
    """Background task: check all beneficiaries for DOB-based subscription events.
    Called periodically (e.g., daily) to auto-detect turning 18, turning 26, etc."""
    now = datetime.now(timezone.utc)
    users = await db.users.find(
        {"role": "beneficiary", "date_of_birth": {"$exists": True}},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "date_of_birth": 1},
    ).to_list(5000)

    events_triggered = 0
    for user_doc in users:
        try:
            dob = datetime.fromisoformat(
                user_doc["date_of_birth"].replace("Z", "+00:00")
            )
            if dob.tzinfo is None:
                dob = dob.replace(tzinfo=timezone.utc)
            age = (now - dob).days // 365

            # Turning 18 — needs subscription
            if age == 18:
                eighteenth = dob.replace(year=dob.year + 18)
                if eighteenth.tzinfo is None:
                    eighteenth = eighteenth.replace(tzinfo=timezone.utc)
                days_since = (now - eighteenth).days
                if 0 <= days_since <= 7:
                    # Check not already notified
                    already = await db.lifecycle_events.find_one(
                        {"user_id": user_doc["id"], "event": "turned_18"}
                    )
                    if not already:
                        await db.lifecycle_events.insert_one(
                            {
                                "user_id": user_doc["id"],
                                "event": "turned_18",
                                "triggered_at": now.isoformat(),
                            }
                        )
                        events_triggered += 1
                        try:
                            from services.email import send_email

                            await send_email(
                                to=user_doc["email"],
                                subject="Happy 18th! Time to set up your CarryOn plan",
                                html=f"""
                                <p>Happy Birthday, {user_doc.get("name", "").split()[0] if user_doc.get("name") else "there"}!</p>
                                <p>Now that you're 18, you can manage your own CarryOn account. Choose a plan to keep your estate documents safe.</p>
                                <p>Log in to get started.</p>
                                <p>— The CarryOn Team</p>
                                """,
                            )
                        except Exception:
                            pass

            # Turning 26 — ages out of New Adult tier
            if age == 26:
                twentysixth = dob.replace(year=dob.year + 26)
                if twentysixth.tzinfo is None:
                    twentysixth = twentysixth.replace(tzinfo=timezone.utc)
                days_since = (now - twentysixth).days
                if 0 <= days_since <= 7:
                    already = await db.lifecycle_events.find_one(
                        {"user_id": user_doc["id"], "event": "turned_26"}
                    )
                    if not already:
                        # Auto-migrate from new_adult to standard pricing
                        sub = await db.user_subscriptions.find_one(
                            {
                                "user_id": user_doc["id"],
                                "plan_id": "new_adult",
                                "status": "active",
                            }
                        )
                        if sub:
                            await db.user_subscriptions.update_one(
                                {"user_id": user_doc["id"]},
                                {
                                    "$set": {
                                        "plan_id": "ben_standard",
                                        "plan_name": "Standard",
                                        "updated_at": now.isoformat(),
                                        "migration_reason": "aged_out_new_adult",
                                    }
                                },
                            )

                        await db.lifecycle_events.insert_one(
                            {
                                "user_id": user_doc["id"],
                                "event": "turned_26",
                                "triggered_at": now.isoformat(),
                            }
                        )
                        events_triggered += 1
                        try:
                            from services.email import send_email

                            await send_email(
                                to=user_doc["email"],
                                subject="Your CarryOn plan has been updated",
                                html=f"""
                                <p>Hi {user_doc.get("name", "").split()[0] if user_doc.get("name") else "there"},</p>
                                <p>As you've turned 26, your New Adult tier has transitioned to Standard pricing. No action needed — your access continues uninterrupted.</p>
                                <p>— The CarryOn Team</p>
                                """,
                            )
                        except Exception:
                            pass

        except (ValueError, TypeError, KeyError):
            continue

    return events_triggered


# ═══════════════════════════════════════════════════
# B2B / ENTERPRISE PARTNER CODES
# ═══════════════════════════════════════════════════


@router.get("/admin/b2b-codes")
async def get_b2b_codes(current_user: dict = Depends(get_current_user)):
    """List all B2B partner codes."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    codes = await db.b2b_codes.find({}, {"_id": 0}).to_list(500)
    return codes


@router.post("/admin/b2b-codes")
async def create_b2b_code(
    request: Request, current_user: dict = Depends(get_current_user)
):
    """Create a new B2B partner code."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    data = await request.json()
    raw_code = (data.get("code") or "").strip().upper()
    if not raw_code or len(raw_code) < 3 or len(raw_code) > 50:
        raise HTTPException(status_code=400, detail="Code must be 3-50 characters")
    # Sanitize: alphanumeric + hyphens/underscores only
    import re
    if not re.match(r'^[A-Z0-9_-]+$', raw_code):
        raise HTTPException(status_code=400, detail="Code may only contain letters, numbers, hyphens, and underscores")
    partner_name = (data.get("partner_name") or "")[:100].strip()
    discount = max(0, min(100, int(data.get("discount_percent", 100))))
    max_uses = max(0, int(data.get("max_uses", 0)))
    code = {
        "id": str(uuid.uuid4()),
        "code": raw_code,
        "partner_name": partner_name,
        "discount_percent": discount,
        "max_uses": max_uses,
        "times_used": 0,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # Check uniqueness
    existing = await db.b2b_codes.find_one({"code": code["code"]}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Code already exists")
    await db.b2b_codes.insert_one(code)
    code.pop("_id", None)
    return code


@router.put("/admin/b2b-codes/{code_id}")
async def update_b2b_code(
    code_id: str, request: Request, current_user: dict = Depends(get_current_user)
):
    """Update a B2B partner code."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    data = await request.json()
    update = {}
    if "active" in data:
        update["active"] = data["active"]
    if "discount_percent" in data:
        update["discount_percent"] = int(data["discount_percent"])
    if "partner_name" in data:
        update["partner_name"] = data["partner_name"]
    if "max_uses" in data:
        update["max_uses"] = int(data["max_uses"])
    if update:
        await db.b2b_codes.update_one({"id": code_id}, {"$set": update})
    updated = await db.b2b_codes.find_one({"id": code_id}, {"_id": 0})
    return updated


@router.delete("/admin/b2b-codes/{code_id}")
async def delete_b2b_code(
    code_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete a B2B partner code."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await db.b2b_codes.delete_one({"id": code_id})
    return {"deleted": True}


@router.post("/subscriptions/verify-b2b-code")
async def verify_b2b_code(
    request: Request, current_user: dict = Depends(get_current_user)
):
    """Verify a B2B partner code and apply enterprise tier."""
    data = await request.json()
    code_str = (data.get("code") or "").strip().upper()
    if not code_str or len(code_str) > 50:
        raise HTTPException(status_code=400, detail="Invalid code format")

    # Check if user already has an enterprise verification
    existing = await db.tier_verifications.find_one(
        {"user_id": current_user["id"], "tier_requested": "enterprise", "status": "approved"},
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already have an active enterprise subscription")

    code_doc = await db.b2b_codes.find_one(
        {"code": code_str, "active": True}, {"_id": 0}
    )
    if not code_doc:
        raise HTTPException(status_code=404, detail="Invalid or inactive code")

    # Check max uses
    if code_doc.get("max_uses", 0) > 0 and code_doc["times_used"] >= code_doc["max_uses"]:
        raise HTTPException(status_code=400, detail="This code has reached its usage limit")

    # Apply enterprise tier to user
    discount = code_doc.get("discount_percent", 100)
    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {
                "eligible_tier": "enterprise",
                "special_status": ["enterprise"],
                "b2b_code": code_str,
                "b2b_partner": code_doc.get("partner_name", ""),
                "b2b_discount_percent": discount,
                "verified_tier": "enterprise",
            }
        },
    )

    # Create verification record (auto-approved)
    verification = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_email": current_user.get("email", ""),
        "user_name": current_user.get("name", ""),
        "tier_requested": "enterprise",
        "status": "approved",
        "doc_type": "B2B Partner Code",
        "notes": f"Code: {code_str} | Partner: {code_doc.get('partner_name', 'N/A')} | Discount: {discount}%",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tier_verifications.insert_one(verification)

    # Increment usage count
    await db.b2b_codes.update_one({"code": code_str}, {"$inc": {"times_used": 1}})

    # Apply subscription override with discount
    if discount >= 100:
        await db.subscription_overrides.update_one(
            {"user_id": current_user["id"]},
            {"$set": {"user_id": current_user["id"], "free_access": True, "b2b_partner": code_doc.get("partner_name", "")}},
            upsert=True,
        )
    elif discount > 0:
        await db.subscription_overrides.update_one(
            {"user_id": current_user["id"]},
            {"$set": {"user_id": current_user["id"], "custom_discount": discount, "b2b_partner": code_doc.get("partner_name", "")}},
            upsert=True,
        )

    return {
        "verified": True,
        "partner_name": code_doc.get("partner_name", ""),
        "discount_percent": discount,
    }
