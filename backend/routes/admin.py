"""CarryOn™ Backend — Admin Routes"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
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
    """Get all users with subscription info — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    # Attach subscription info to each user
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
    return users


@router.get("/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    """Get platform stats — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    total_users = await db.users.count_documents({})
    benefactors = await db.users.count_documents({"role": "benefactor"})
    beneficiaries = await db.users.count_documents({"role": "beneficiary"})
    admins = await db.users.count_documents({"role": "admin"})
    total_estates = await db.estates.count_documents({})
    transitioned = await db.estates.count_documents({"status": "transitioned"})
    total_docs = await db.documents.count_documents({})
    total_messages = await db.messages.count_documents({})
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
    active_subs = await db.user_subscriptions.count_documents({"status": "active"})
    grace_periods = await db.beneficiary_grace_periods.count_documents({})
    pending_family = await db.family_plan_requests.count_documents(
        {"status": "pending"}
    )
    deletion_requests = await db.deletion_requests.count_documents(
        {"status": "pending"}
    )
    # Viral metrics
    total_beneficiary_records = await db.beneficiaries.count_documents(
        {"is_stub": {"$ne": True}}
    )
    avg_bens_per_benefactor = round(total_beneficiary_records / max(benefactors, 1), 1)
    # Beneficiaries who became benefactors
    beneficiary_emails = await db.users.find(
        {"role": "beneficiary"}, {"_id": 0, "email": 1}
    ).to_list(10000)
    ben_emails = {u["email"] for u in beneficiary_emails}
    benefactor_emails = await db.users.find(
        {"role": "benefactor"}, {"_id": 0, "email": 1, "benefactor_email": 1}
    ).to_list(10000)
    ben_to_benefactor_count = sum(
        1
        for u in benefactor_emails
        if u.get("benefactor_email") or u["email"] in ben_emails
    )

    return {
        "users": {
            "total": total_users,
            "benefactors": benefactors,
            "beneficiaries": beneficiaries,
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


@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a user — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


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
