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
from guards import require_admin
from services.audit import get_client_ip, log_audit_event

router = APIRouter()

VALID_SCOPES = ["founder", "finance", "compliance", "marketing", "platform_health"]

SCOPE_LABELS = {
    "founder": "Founder Admin",
    "finance": "Finance Admin",
    "compliance": "Compliance Admin",
    "marketing": "Marketing Admin",
    "platform_health": "Platform Health Admin",
}


class CreateScopedAdminRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    admin_scope: str


class UpdateScopedAdminRequest(BaseModel):
    admin_scope: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    password: Optional[str] = None


@router.get("/admin/scoped-admins")
async def list_scoped_admins(current_user: dict = Depends(require_admin)):
    """List all admin accounts with their scopes. Founder only."""
    if current_user.get("admin_scope", "founder") != "founder":
        raise HTTPException(status_code=403, detail="Founder access required")

    admins = await db.users.find(
        {"role": "admin"},
        {"_id": 0, "password": 0},
    ).to_list(100)

    for a in admins:
        a["admin_scope"] = a.get("admin_scope", "founder")
        a["scope_label"] = SCOPE_LABELS.get(a["admin_scope"], a["admin_scope"])

    return admins


@router.post("/admin/scoped-admins")
async def create_scoped_admin(
    data: CreateScopedAdminRequest,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Create a scoped admin account. Founder only."""
    if current_user.get("admin_scope", "founder") != "founder":
        raise HTTPException(status_code=403, detail="Only Founder Admin can create scoped admins")

    if data.admin_scope not in VALID_SCOPES:
        raise HTTPException(status_code=400, detail=f"Invalid scope. Must be one of: {', '.join(VALID_SCOPES)}")

    normalized_email = data.email.lower().strip()
    existing = await db.users.find_one({"email": normalized_email}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")

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
        "admin_scope": data.admin_scope,
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
        details={"scope": data.admin_scope, "name": full_name},
        ip_address=get_client_ip(request),
        severity="critical",
    )

    return {
        "id": admin_user["id"],
        "email": normalized_email,
        "name": full_name,
        "admin_scope": data.admin_scope,
        "scope_label": SCOPE_LABELS.get(data.admin_scope, data.admin_scope),
    }


@router.put("/admin/scoped-admins/{admin_id}")
async def update_scoped_admin(
    admin_id: str,
    data: UpdateScopedAdminRequest,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Update a scoped admin's scope or credentials. Founder only."""
    if current_user.get("admin_scope", "founder") != "founder":
        raise HTTPException(status_code=403, detail="Only Founder Admin can modify scoped admins")

    target = await db.users.find_one({"id": admin_id, "role": "admin"}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")

    if target.get("admin_scope", "founder") == "founder" and admin_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Cannot modify another Founder Admin")

    update = {}
    if data.admin_scope is not None:
        if data.admin_scope not in VALID_SCOPES:
            raise HTTPException(status_code=400, detail=f"Invalid scope: {data.admin_scope}")
        if admin_id == current_user["id"] and data.admin_scope != "founder":
            raise HTTPException(status_code=400, detail="Cannot demote yourself from Founder")
        update["admin_scope"] = data.admin_scope

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
    if current_user.get("admin_scope", "founder") != "founder":
        raise HTTPException(status_code=403, detail="Only Founder Admin can delete scoped admins")

    if admin_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    target = await db.users.find_one({"id": admin_id, "role": "admin"}, {"_id": 0, "id": 1, "admin_scope": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")

    if target.get("admin_scope", "founder") == "founder":
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
