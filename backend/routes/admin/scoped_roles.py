"""CarryOn™ — Scoped Admin Roles

Sub-admin types with limited access to specific portal sections:
  - founder: God mode — sees everything, controls everything (default admin)
  - finance: Revenue, Subscriptions, Grace Periods, Billing
  - compliance: Audit Trail, Security Scan, Estate Health, GDPR
  - marketing: Funnel, Beta Testing, Site Content, Emails, Invites
  - platform_health: System Health, Code Health, Integrations, Operators

Founder Admin can create/manage scoped admins.
Scoped admins can only access their designated sections.
"""

import uuid
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from typing import Optional

from config import db
from guards import require_admin, is_founder_scope
from services.audit import get_client_ip, log_audit_event

router = APIRouter()

VALID_SCOPES = [
    "founder", "finance", "compliance", "marketing", "platform_health",
    "ops_manager", "ops_team",
]

SCOPE_LABELS = {
    "founder": "Founder Admin",
    "finance": "Finance Admin",
    "compliance": "Compliance Admin",
    "marketing": "Marketing Admin",
    "platform_health": "Platform Health Admin",
    "ops_manager": "Operations Manager",
    "ops_team": "Operations Team Member",
}


def normalize_scopes(raw):
    """Convert admin_scope from legacy string or list to a list."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str) and raw:
        return [raw]
    return ["founder"]


class CreateScopedAdminRequest(BaseModel):
    email: str
    password: str
    first_name: str
    last_name: str
    admin_scope: str | list[str]


class UpdateScopedAdminRequest(BaseModel):
    admin_scope: str | list[str] | None = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    password: Optional[str] = None


@router.get("/admin/scoped-admins")
async def list_scoped_admins(current_user: dict = Depends(require_admin)):
    """List all admin and operator accounts with their scopes. Founder only."""
    if not is_founder_scope(current_user):
        raise HTTPException(status_code=403, detail="Founder access required")

    # Fetch both admin and operator accounts for unified management
    users = await db.users.find(
        {"role": {"$in": ["admin", "operator"]}},
        {"_id": 0, "password": 0},
    ).to_list(200)

    for a in users:
        scopes = normalize_scopes(a.get("admin_scope"))
        # For operators without explicit admin_scope, derive from operator_role
        if a.get("role") == "operator" and not a.get("admin_scope"):
            op_role = a.get("operator_role", "worker")
            scopes = ["ops_manager"] if op_role == "manager" else ["ops_team"]
        a["admin_scope"] = scopes
        a["scope_label"] = ", ".join(SCOPE_LABELS.get(s, s) for s in scopes)

    return users


@router.post("/admin/scoped-admins")
async def create_scoped_admin(
    data: CreateScopedAdminRequest,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Create a scoped admin account. Founder only."""
    if not is_founder_scope(current_user):
        raise HTTPException(status_code=403, detail="Only Founder Admin can create scoped admins")

    scopes = data.admin_scope if isinstance(data.admin_scope, list) else [data.admin_scope]
    for s in scopes:
        if s not in VALID_SCOPES:
            raise HTTPException(status_code=400, detail=f"Invalid scope '{s}'. Must be one of: {', '.join(VALID_SCOPES)}")

    normalized_email = data.email.lower().strip()
    existing = await db.users.find_one({"email": normalized_email}, {"_id": 0})

    if existing:
        # Merge scopes into the existing user instead of rejecting
        raw_scope = existing.get("admin_scope")
        if raw_scope:
            existing_scopes = normalize_scopes(raw_scope)
        elif existing.get("role") == "operator":
            # Operator without admin_scope — derive from operator_role
            op_role = existing.get("operator_role", "worker")
            existing_scopes = ["ops_manager"] if op_role == "manager" else ["ops_team"]
        else:
            existing_scopes = []
        merged = list(dict.fromkeys(existing_scopes + scopes))  # preserve order, dedupe
        update_fields: dict = {"admin_scope": merged, "role": "admin"}
        if data.first_name:
            update_fields["first_name"] = data.first_name
        if data.last_name:
            update_fields["last_name"] = data.last_name
        if data.first_name or data.last_name:
            fn = data.first_name or existing.get("first_name", "")
            ln = data.last_name or existing.get("last_name", "")
            update_fields["name"] = f"{fn} {ln}".strip()
        await db.users.update_one({"id": existing["id"]}, {"$set": update_fields})

        await log_audit_event(
            actor_id=current_user["id"],
            actor_email=current_user["email"],
            actor_role="admin",
            action="scoped_admin_merge",
            category="user_mgmt",
            resource_type="user",
            resource_id=existing["id"],
            details={"merged_scopes": scopes, "final_scopes": merged},
            ip_address=get_client_ip(request),
            severity="critical",
        )

        return {
            "id": existing["id"],
            "email": normalized_email,
            "name": update_fields.get("name", existing.get("name", "")),
            "admin_scope": merged,
            "scope_label": ", ".join(SCOPE_LABELS.get(s, s) for s in merged),
            "merged": True,
        }

    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
    now = datetime.now(timezone.utc)
    full_name = f"{data.first_name} {data.last_name}".strip()

    admin_user = {
        "id": str(uuid.uuid4()),
        "email": normalized_email,
        "name": full_name,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "password": hashed,
        "role": "admin",
        "admin_scope": scopes,
        "created_at": now.isoformat(),
        "created_by": current_user["id"],
    }
    await db.users.insert_one(admin_user)

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="scoped_admin_create",
        category="user_mgmt",
        resource_type="user",
        resource_id=admin_user["id"],
        details={"scope": scopes, "name": full_name},
        ip_address=get_client_ip(request),
        severity="critical",
    )

    return {
        "id": admin_user["id"],
        "email": normalized_email,
        "name": full_name,
        "admin_scope": scopes,
        "scope_label": ", ".join(SCOPE_LABELS.get(s, s) for s in scopes),
    }


@router.put("/admin/scoped-admins/{admin_id}")
async def update_scoped_admin(
    admin_id: str,
    data: UpdateScopedAdminRequest,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Update a scoped admin's scope or credentials. Founder only."""
    if not is_founder_scope(current_user):
        raise HTTPException(status_code=403, detail="Only Founder Admin can modify scoped admins")

    target = await db.users.find_one(
        {"id": admin_id, "role": {"$in": ["admin", "operator"]}}, {"_id": 0},
    )
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")

    # Derive scopes: use admin_scope if set, else derive from operator_role for operators
    if target.get("admin_scope"):
        target_scopes = normalize_scopes(target.get("admin_scope"))
    elif target.get("role") == "operator":
        op_role = target.get("operator_role", "worker")
        target_scopes = ["ops_manager"] if op_role == "manager" else ["ops_team"]
    else:
        target_scopes = ["founder"]  # Default for admins without scope
    
    if "founder" in target_scopes and admin_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Cannot modify another Founder Admin")

    update = {}
    if data.admin_scope is not None:
        new_scopes = data.admin_scope if isinstance(data.admin_scope, list) else [data.admin_scope]
        for s in new_scopes:
            if s not in VALID_SCOPES:
                raise HTTPException(status_code=400, detail=f"Invalid scope: {s}")
        if admin_id == current_user["id"] and "founder" not in new_scopes:
            raise HTTPException(status_code=400, detail="Cannot demote yourself from Founder")
        update["admin_scope"] = new_scopes
        # Upgrade role to admin when scopes are assigned
        if target.get("role") == "operator":
            update["role"] = "admin"

    if data.first_name is not None:
        update["first_name"] = data.first_name
    if data.last_name is not None:
        update["last_name"] = data.last_name
    if data.first_name is not None or data.last_name is not None:
        fn = data.first_name if data.first_name is not None else target.get("first_name", "")
        ln = data.last_name if data.last_name is not None else target.get("last_name", "")
        update["name"] = f"{fn} {ln}".strip()
    if data.password is not None and data.password:
        update["password"] = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()

    if not update:
        return {"updated": False}

    await db.users.update_one({"id": admin_id}, {"$set": update})

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="scoped_admin_update",
        category="user_mgmt",
        resource_type="user",
        resource_id=admin_id,
        details={"fields": list(update.keys())},
        ip_address=get_client_ip(request),
        severity="info",
    )

    return {"updated": True}


@router.delete("/admin/scoped-admins/{admin_id}")
async def delete_scoped_admin(
    admin_id: str,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Delete a scoped admin. Founder only. Cannot delete self or other founders."""
    if not is_founder_scope(current_user):
        raise HTTPException(status_code=403, detail="Only Founder Admin can delete scoped admins")

    if admin_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    target = await db.users.find_one(
        {"id": admin_id, "role": {"$in": ["admin", "operator"]}},
        {"_id": 0, "id": 1, "admin_scope": 1, "role": 1, "operator_role": 1},
    )
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")

    # Derive scopes: use admin_scope if set, else derive from operator_role for operators
    if target.get("admin_scope"):
        target_scopes = normalize_scopes(target.get("admin_scope"))
    elif target.get("role") == "operator":
        op_role = target.get("operator_role", "worker")
        target_scopes = ["ops_manager"] if op_role == "manager" else ["ops_team"]
    else:
        target_scopes = ["founder"]  # Default for admins without scope
    
    if "founder" in target_scopes:
        raise HTTPException(status_code=403, detail="Cannot delete a Founder Admin")

    await db.users.delete_one({"id": admin_id})

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="scoped_admin_delete",
        category="user_mgmt",
        resource_type="user",
        resource_id=admin_id,
        ip_address=get_client_ip(request),
        severity="critical",
    )

    return {"deleted": True}
