"""CarryOn™ — Admin Session Inactivity Policy

Founder-controlled session timeout settings per staff role type.
When enabled, enforces max inactivity timeout per role.
The Founder can exempt any role (including themselves).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from guards import require_admin, is_founder_scope

router = APIRouter()

DEFAULT_POLICIES = {
    "admin": {"timeout_minutes": 480, "enabled": False, "label": "Founder / Admin"},
    "manager": {"timeout_minutes": 30, "enabled": False, "label": "Ops Manager"},
    "worker": {"timeout_minutes": 15, "enabled": False, "label": "Ops Worker"},
    "benefactor": {"timeout_minutes": 0, "enabled": False, "label": "Benefactor"},
    "beneficiary": {"timeout_minutes": 0, "enabled": False, "label": "Beneficiary"},
}


class SessionPolicyUpdate(BaseModel):
    role_type: str
    timeout_minutes: int
    enabled: bool


@router.get("/admin/session-policy")
async def get_session_policies(current_user: dict = Depends(require_admin)):
    """Get session timeout policies for all role types. Founder only."""
    if not is_founder_scope(current_user):
        raise HTTPException(status_code=403, detail="Founder access required")

    doc = await db.session_policies.find_one({"_id": "global"}, {"_id": 0})
    policies = doc.get("policies", {}) if doc else {}

    result = []
    for role_type, defaults in DEFAULT_POLICIES.items():
        saved = policies.get(role_type, {})
        result.append(
            {
                "role_type": role_type,
                "label": defaults["label"],
                "timeout_minutes": saved.get("timeout_minutes", defaults["timeout_minutes"]),
                "enabled": saved.get("enabled", defaults["enabled"]),
            }
        )

    return result


@router.put("/admin/session-policy")
async def update_session_policy(
    data: SessionPolicyUpdate,
    current_user: dict = Depends(require_admin),
):
    """Update session timeout policy for a specific role type. Founder only."""
    if not is_founder_scope(current_user):
        raise HTTPException(status_code=403, detail="Founder access required")

    if data.role_type not in DEFAULT_POLICIES:
        raise HTTPException(status_code=400, detail=f"Invalid role type: {data.role_type}")

    if data.enabled and (data.timeout_minutes < 1 or data.timeout_minutes > 1440):
        raise HTTPException(status_code=400, detail="Timeout must be between 1 and 1440 minutes")

    now = datetime.now(timezone.utc).isoformat()

    await db.session_policies.update_one(
        {"_id": "global"},
        {
            "$set": {
                f"policies.{data.role_type}.timeout_minutes": data.timeout_minutes,
                f"policies.{data.role_type}.enabled": data.enabled,
                "updated_at": now,
                "updated_by": current_user["id"],
            }
        },
        upsert=True,
    )

    return {"success": True, "role_type": data.role_type, "enabled": data.enabled}


async def get_session_timeout_for_user(user: dict):
    """Get the applicable session timeout in minutes for a user.
    Returns None if no policy is set or disabled."""
    role = user.get("role", "")
    operator_role = user.get("operator_role", "")

    if role == "admin":
        role_type = "admin"
    elif role == "operator":
        role_type = "manager" if operator_role == "manager" else "worker"
    elif role == "benefactor":
        role_type = "benefactor"
    elif role == "beneficiary":
        role_type = "beneficiary"
    else:
        return None

    doc = await db.session_policies.find_one({"_id": "global"}, {"_id": 0})
    if not doc:
        return None

    policy = doc.get("policies", {}).get(role_type, {})
    if not policy.get("enabled"):
        return None

    return policy.get("timeout_minutes")
