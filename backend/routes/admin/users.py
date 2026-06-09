"""CarryOn™ Backend — Admin: User Management & Activity Log"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from config import db
from guards import require_admin, require_staff
from routes.admin.trial_policy import get_trial_days

router = APIRouter()


@router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(require_staff)):
    """Get all users with subscription info and beneficiary tree — admin and ops_manager.

    SOC2 least-privilege (audit 735b3b7 #1): the router-level `require_scope`
    on this module ("compliance", "ops_manager") now ENFORCES operator scope,
    so an ops_team worker is denied (403) before reaching this handler — they
    never receive the customer roster (emails, subscriptions, beneficiary PII).
    """
    users = await db.users.find({}, {"_id": 0, "password": 0, "onboarding_drip_state": 0, "username_lower": 0}).to_list(
        1000
    )

    # Build estate owner -> beneficiaries map (supports multiple estates per owner)
    estates = await db.estates.find({}, {"_id": 0, "id": 1, "owner_id": 1, "name": 1, "verified_tier": 1}).to_list(
        10000
    )
    estates_by_owner = {}
    estate_ids_owned = []
    for e in estates:
        if e.get("id") and e.get("owner_id"):
            estates_by_owner.setdefault(e["owner_id"], []).append(e["id"])
            estate_ids_owned.append(e["id"])

    # Scoped fetch: only load beneficiaries for estates that exist in this result set.
    # Avoids loading 100k rows when the user list is capped at 1000.
    all_bens = await db.beneficiaries.find(
        {"estate_id": {"$in": estate_ids_owned}} if estate_ids_owned else {},
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
    ).to_list(50000)

    bens_by_estate = {}
    for b in all_bens:
        eid = b.get("estate_id")
        if eid:
            bens_by_estate.setdefault(eid, []).append(b)

    # Batch-load every user's subscription in ONE query. This was an N+1
    # (a separate find_one per user = up to 512 sequential round-trips on the
    # admin roster) and was the dominant cause of the slow /admin/users
    # response. Output is byte-for-byte identical: first subscription per user,
    # same projected fields, None when the user has no subscription.
    _user_ids = [u["id"] for u in users if u.get("id")]
    _subs = await db.user_subscriptions.find(
        {"user_id": {"$in": _user_ids}},
        {
            "_id": 0,
            "user_id": 1,
            "plan_id": 1,
            "plan_name": 1,
            "billing_cycle": 1,
            "status": 1,
            "beta_plan": 1,
        },
    ).to_list(len(_user_ids) + 1000)
    subs_by_user = {}
    for s in _subs:
        uid = s.get("user_id")
        if uid and uid not in subs_by_user:
            subs_by_user[uid] = {k: v for k, v in s.items() if k != "user_id"}

    # Attach subscription info and linked beneficiaries to each user
    for u in users:
        if not u.get("id"):
            continue
        u["subscription"] = subs_by_user.get(u["id"])

        # Surface dual-role estate owners (a user whose primary role is
        # beneficiary but who ALSO owns an estate and runs a Benefactor Portal)
        # so the admin can spot them at a glance. Derived from ACTUAL estate
        # ownership, so it's accurate even if the stored flag ever lags.
        if u.get("id") in estates_by_owner and u.get("role") not in ("benefactor", "admin"):
            u["is_also_benefactor"] = True

        # For benefactors (including multi-role users), attach their beneficiary list
        # across ALL their estates, grouped by estate for tree/graph views
        if u.get("role") == "benefactor" or u.get("is_also_benefactor"):
            estate_ids = estates_by_owner.get(u["id"], [])
            all_linked = []
            estate_groups = []
            for eid in estate_ids:
                bens = bens_by_estate.get(eid, [])
                all_linked.extend(bens)
                estate_info = next((e for e in estates if e["id"] == eid), None)
                estate_groups.append(
                    {
                        "estate_id": eid,
                        "estate_name": estate_info["name"] if estate_info else "Estate",
                        "verified_tier": estate_info.get("verified_tier") if estate_info else None,
                        "beneficiaries": bens,
                    }
                )
            u["linked_beneficiaries"] = all_linked
            u["estate_groups"] = estate_groups

    return [u for u in users if u.get("id")]


@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    admin_password: str = Query(..., description="Admin password for confirmation"),
    current_user: dict = Depends(require_admin),
):
    """Delete a user and all associated data — admin only, requires password"""
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    # Verify admin password
    admin_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "password": 1})
    if not admin_doc or not bcrypt.checkpw(admin_password.encode(), admin_doc["password"].encode()):
        raise HTTPException(status_code=401, detail="Incorrect admin password")

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "role": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Cascade delete all associated data
    # Find estates owned by this user
    estates = await db.estates.find({"owner_id": user_id}, {"_id": 0, "id": 1}).to_list(1000)
    estate_ids = [e["id"] for e in estates]

    if estate_ids:
        # SOC2 deletion finality (audit 5391e8b #6): purge ALL object-storage
        # blobs for each estate BEFORE removing the DB rows that point to them.
        from services.estate_purge import purge_estate_storage

        for _eid in estate_ids:
            await purge_estate_storage(_eid)

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
        await db.beneficiary_display_overrides.delete_many({"estate_id": {"$in": estate_ids}})
        await db.beneficiary_grace_periods.delete_many({"estate_id": {"$in": estate_ids}})
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

    # Remove this user from all estates' beneficiaries arrays (they may be a beneficiary of other estates)
    await db.estates.update_many(
        {"beneficiaries": user_id},
        {"$pull": {"beneficiaries": user_id}},
    )
    # Delete beneficiary records that link this user to other estates
    await db.beneficiaries.delete_many({"user_id": user_id})

    # SOC2 deletion finality (#6): purge the user's personal media (profile
    # photos) from object storage before the user row is removed.
    from services.estate_purge import purge_user_storage

    await purge_user_storage(user_id)

    # Finally delete the user
    await db.users.delete_one({"id": user_id})
    return {"message": "User and all associated data deleted"}


@router.put("/admin/users/{user_id}/role")
async def update_user_role(user_id: str, body: dict, current_user: dict = Depends(require_admin)):
    """Change a user's role — admin only"""
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


@router.put("/admin/users/{user_id}/session-exempt")
async def toggle_session_exempt(user_id: str, current_user: dict = Depends(require_admin)):
    """Toggle session_exempt flag — exempts user from login lockout and single-session enforcement"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "session_exempt": 1, "name": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_val = not user.get("session_exempt", False)
    await db.users.update_one({"id": user_id}, {"$set": {"session_exempt": new_val}})
    if new_val:
        await db.failed_logins.delete_many({"email": user_id})
    await db.activity_log.insert_one(
        {
            "id": str(uuid4()),
            "action": "session_exempt_toggle",
            "actor_id": current_user["id"],
            "actor_name": current_user.get("name", "Admin"),
            "target_id": user_id,
            "details": f"{'Enabled' if new_val else 'Disabled'} session exemption for {user.get('name', user_id)}",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"session_exempt": new_val}


@router.put("/admin/users/{user_id}/ai-unlimited")
async def toggle_ai_unlimited(user_id: str, current_user: dict = Depends(require_admin)):
    """Toggle ai_unlimited flag — when ON, the user bypasses the
    daily EGA / IAC AI rate limits (1/day IAC, 10/day EGA).
    Founder-only override for VIPs, internal testers, and demo
    accounts. Logged to activity_log."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "ai_unlimited": 1, "name": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_val = not user.get("ai_unlimited", False)
    await db.users.update_one({"id": user_id}, {"$set": {"ai_unlimited": new_val}})
    await db.activity_log.insert_one(
        {
            "id": str(uuid4()),
            "action": "ai_unlimited_toggle",
            "actor_id": current_user["id"],
            "actor_name": current_user.get("name", "Admin"),
            "target_id": user_id,
            "details": f"{'Enabled' if new_val else 'Disabled'} AI rate-limit bypass for {user.get('name', user_id)}",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"ai_unlimited": new_val}


@router.post("/admin/users/{user_id}/reset-trial")
async def reset_user_trial(user_id: str, current_user: dict = Depends(require_admin)):
    """Reset a user's free trial — sets trial_ends_at to now + the
    global trial duration, flips subscription_status back to
    'trialing'. Admin-only. Logged to activity_log."""
    user = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "trial_ends_at": 1, "subscription_status": 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    trial_days = await get_trial_days()
    now = datetime.now(timezone.utc)
    new_trial_ends_at = (now + timedelta(days=trial_days)).isoformat()
    prev_trial_ends_at = user.get("trial_ends_at")

    # Clear all previously-sent reminder flags so the new trial gets
    # the full reminder ladder.
    reset_flags = {f"trial_reminder_{d}d_sent": False for d in {1, 2, 3, 5, 7, 10, 14, 21}}
    reset_flags["trial_expired_email_sent"] = False

    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "trial_ends_at": new_trial_ends_at,
                "subscription_status": "trialing",
                "trial_reset_at": now.isoformat(),
                "trial_reset_by": current_user["id"],
                **reset_flags,
            }
        },
    )

    await db.activity_log.insert_one(
        {
            "id": str(uuid4()),
            "action": "trial_reset",
            "actor_id": current_user["id"],
            "actor_name": current_user.get("name", "Admin"),
            "target_id": user_id,
            "details": (
                f"Reset {trial_days}-day trial for {user.get('name', user_id)} "
                f"(previously ended {prev_trial_ends_at or 'never set'})"
            ),
            "created_at": now.isoformat(),
        }
    )
    return {
        "ok": True,
        "trial_ends_at": new_trial_ends_at,
        "subscription_status": "trialing",
        "trial_days": trial_days,
    }


@router.get("/admin/activity")
async def get_activity_log(current_user: dict = Depends(require_admin)):
    """Get recent platform activity — admin only"""
    # Collect recent activity from multiple collections
    activities = []
    # Recent user registrations
    recent_users = (
        await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "created_at": 1})
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
        await db.estates.find({}, {"_id": 0, "id": 1, "name": 1, "created_at": 1, "status": 1})
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
        await db.documents.find({}, {"_id": 0, "id": 1, "name": 1, "created_at": 1}).sort("created_at", -1).to_list(10)
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
    admin_actions = await db.activity_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(20)
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


@router.put("/admin/estate/{estate_id}/tier")
async def set_estate_tier(estate_id: str, request: Request, current_user: dict = Depends(require_admin)):
    """Set the verified_tier on an estate (Founder only).

    Each estate (benefactor account) can have its own tier assignment,
    which controls feature-gate visibility for that estate's owner
    and its beneficiaries.
    """
    body = await request.json()
    tier = body.get("tier")

    valid_tiers = ["premium", "standard", "base", "new_adult", "military", "hospice", "veteran", "enterprise", ""]
    if tier is not None and tier not in valid_tiers:
        raise HTTPException(status_code=400, detail=f"Invalid tier: {tier}")

    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    if tier == "" or tier is None:
        await db.estates.update_one({"id": estate_id}, {"$unset": {"verified_tier": ""}})
    else:
        await db.estates.update_one({"id": estate_id}, {"$set": {"verified_tier": tier}})

    return {"success": True, "estate_id": estate_id, "verified_tier": tier if tier else None}
