"""CarryOn™ — Operator Management & Audit Trail

Multi-tier operator hierarchy:
  - Founder (admin) creates/edits/deletes Managers AND Workers
  - Operations Manager creates/edits/deletes Workers
  - Operations Worker handles assigned tasks
"""

import uuid
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional

from config import db
from services.audit import get_client_ip, log_audit_event
from utils import get_current_user

router = APIRouter()


def require_founder(current_user: dict):
    """Only the founder (role=admin) can manage operators."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Founder access required")


def require_founder_or_manager(current_user: dict):
    """Founder or Operations Manager can manage workers."""
    if current_user.get("role") == "admin":
        return
    if current_user.get("role") == "operator" and current_user.get("operator_role") == "manager":
        return
    raise HTTPException(status_code=403, detail="Manager or Founder access required")


# ── Operator CRUD ────────────────────────────────────────────────────


class CreateOperatorRequest(BaseModel):
    username: str
    password: str
    first_name: str
    last_name: str
    email: str = ""
    phone: str = ""
    title: str = ""
    notes: str = ""
    operator_role: str = "worker"  # "manager" or "worker"


class EditOperatorRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None
    password: Optional[str] = None


@router.post("/founder/operators")
async def create_operator(
    data: CreateOperatorRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Create a new operator account.
    - Founder can create managers and workers.
    - Managers can only create workers."""

    # Validate operator_role
    if data.operator_role not in ("manager", "worker"):
        raise HTTPException(status_code=400, detail="operator_role must be 'manager' or 'worker'")

    # Only founder can create managers
    if data.operator_role == "manager":
        require_founder(current_user)
    else:
        require_founder_or_manager(current_user)

    # Check username uniqueness
    existing = await db.users.find_one({"email": data.username}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=400, detail="Username already in use")

    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
    now = datetime.now(timezone.utc)
    full_name = f"{data.first_name} {data.last_name}".strip()
    operator = {
        "id": str(uuid.uuid4()),
        "email": data.username,
        "name": full_name,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "contact_email": data.email,
        "phone": data.phone,
        "title": data.title,
        "notes": data.notes,
        "password": hashed,
        "role": "operator",
        "operator_role": data.operator_role,
        "is_operator": True,
        "created_at": now.isoformat(),
        "created_by": current_user["id"],
        "created_by_role": current_user.get("role", "unknown"),
    }
    await db.users.insert_one(operator)

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user.get("role", "admin"),
        action="operator_create",
        category="user_mgmt",
        resource_type="user",
        resource_id=operator["id"],
        details={
            "operator_username": data.username,
            "operator_name": full_name,
            "operator_role": data.operator_role,
        },
        ip_address=get_client_ip(request),
        severity="info",
    )

    # NOTIFICATION: If manager created a worker, notify founder
    if current_user.get("role") == "operator" and current_user.get("operator_role") == "manager":
        from services.notifications import notify
        import asyncio
        asyncio.create_task(notify.founder(
            "New Operator Enrolled",
            f"Manager {current_user.get('name', '')} created {data.operator_role} account: {full_name}",
            url="/admin/operators",
            priority="normal",
        ))

    return {
        "id": operator["id"],
        "email": operator["email"],
        "username": operator["email"],
        "name": full_name,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "contact_email": data.email,
        "phone": data.phone,
        "title": data.title,
        "operator_role": data.operator_role,
        "role": "operator",
        "created_at": operator["created_at"],
    }


@router.get("/founder/operators")
async def list_operators(current_user: dict = Depends(get_current_user)):
    """List operator accounts.
    - Founder sees all operators (managers + workers).
    - Managers see only workers."""
    if current_user.get("role") == "admin":
        query = {"role": "operator"}
    elif current_user.get("role") == "operator" and current_user.get("operator_role") == "manager":
        query = {"role": "operator", "operator_role": "worker"}
    else:
        raise HTTPException(status_code=403, detail="Access denied")

    operators = await db.users.find(
        query,
        {"_id": 0, "password": 0},
    ).to_list(100)

    # Ensure operator_role field exists (backcompat for legacy operators)
    for op in operators:
        if "operator_role" not in op:
            op["operator_role"] = "worker"

    return operators


@router.put("/founder/operators/{operator_id}")
async def edit_operator(
    operator_id: str,
    data: EditOperatorRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Edit an operator account.
    - Founder can edit any operator.
    - Managers can only edit workers."""
    op = await db.users.find_one(
        {"id": operator_id, "role": "operator"}, {"_id": 0}
    )
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")

    op_role = op.get("operator_role", "worker")

    # Managers can only edit workers
    if current_user.get("role") == "operator":
        if current_user.get("operator_role") != "manager":
            raise HTTPException(status_code=403, detail="Manager access required")
        if op_role == "manager":
            raise HTTPException(status_code=403, detail="Managers cannot edit other managers")
    elif current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    update_fields = {}
    if data.first_name is not None:
        update_fields["first_name"] = data.first_name
    if data.last_name is not None:
        update_fields["last_name"] = data.last_name
    if data.first_name is not None or data.last_name is not None:
        fn = data.first_name if data.first_name is not None else op.get("first_name", "")
        ln = data.last_name if data.last_name is not None else op.get("last_name", "")
        update_fields["name"] = f"{fn} {ln}".strip()
    if data.email is not None:
        update_fields["contact_email"] = data.email
    if data.phone is not None:
        update_fields["phone"] = data.phone
    if data.title is not None:
        update_fields["title"] = data.title
    if data.notes is not None:
        update_fields["notes"] = data.notes
    if data.password is not None and data.password:
        update_fields["password"] = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()

    if not update_fields:
        return {"updated": False, "message": "No fields to update"}

    await db.users.update_one({"id": operator_id}, {"$set": update_fields})

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user.get("role", "admin"),
        action="operator_edit",
        category="user_mgmt",
        resource_type="user",
        resource_id=operator_id,
        details={"fields_updated": list(update_fields.keys())},
        ip_address=get_client_ip(request),
        severity="info",
    )

    return {"updated": True}


@router.delete("/founder/operators/{operator_id}")
async def delete_operator(
    operator_id: str,
    admin_password: str = Query(...),
    request: Request = None,
    current_user: dict = Depends(get_current_user),
):
    """Delete an operator account.
    - Founder can delete any operator (manager or worker).
    - Managers can only delete workers."""
    op = await db.users.find_one(
        {"id": operator_id, "role": "operator"}, {"_id": 0, "email": 1, "operator_role": 1}
    )
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")

    op_role = op.get("operator_role", "worker")

    # Permission check
    if current_user.get("role") == "operator":
        if current_user.get("operator_role") != "manager":
            raise HTTPException(status_code=403, detail="Manager access required")
        if op_role == "manager":
            raise HTTPException(status_code=403, detail="Managers cannot delete other managers")
    elif current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    # Verify caller's password
    caller_doc = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "password": 1}
    )
    if not caller_doc or not bcrypt.checkpw(
        admin_password.encode(), caller_doc["password"].encode()
    ):
        raise HTTPException(status_code=401, detail="Incorrect password")

    await db.users.delete_one({"id": operator_id})

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user.get("role", "admin"),
        action="operator_delete",
        category="user_mgmt",
        resource_type="user",
        resource_id=operator_id,
        details={"operator_email": op["email"], "operator_role": op_role},
        ip_address=get_client_ip(request) if request else "",
        severity="critical",
    )

    # NOTIFICATION: If manager deleted a worker, notify founder
    if current_user.get("role") == "operator" and current_user.get("operator_role") == "manager":
        from services.notifications import notify
        import asyncio
        asyncio.create_task(notify.founder(
            "Operator Deleted",
            f"Manager {current_user.get('name', '')} removed {op_role}: {op['email']}",
            url="/admin/operators",
            priority="normal",
        ))

    return {"deleted": True}


# ── Audit Trail Query ────────────────────────────────────────────────


@router.get("/founder/audit-trail")
async def get_audit_trail(
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    actor_id: str = Query(""),
    category: str = Query(""),
    severity: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    """Query the immutable audit trail — founder only."""
    require_founder(current_user)

    query = {}
    if actor_id:
        query["actor_id"] = actor_id
    if category:
        query["category"] = category
    if severity:
        query["severity"] = severity

    total = await db.audit_trail.count_documents(query)
    entries = (
        await db.audit_trail.find(query, {"_id": 0})
        .sort("timestamp", -1)
        .skip(offset)
        .limit(limit)
        .to_list(limit)
    )

    return {"total": total, "entries": entries}


# ── P1 Contact Settings (Founder only) ──────────────────────────────


class P1ContactSettings(BaseModel):
    email: str = "founder@carryon.us"
    phone: str = "(808) 585-1156"
    chat_enabled: bool = True


@router.get("/founder/p1-contact-settings")
async def get_p1_contact_settings(
    current_user: dict = Depends(get_current_user),
):
    """Get Priority 1 contact settings. Readable by all staff."""
    if current_user.get("role") not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Staff access required")

    settings = await db.platform_settings.find_one(
        {"_id": "p1_contact"}, {"_id": 0}
    )
    if not settings:
        settings = {
            "email": "founder@carryon.us",
            "phone": "(808) 585-1156",
            "chat_enabled": True,
        }
    return settings


@router.put("/founder/p1-contact-settings")
async def update_p1_contact_settings(
    data: P1ContactSettings,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Update Priority 1 contact settings — Founder only."""
    require_founder(current_user)

    await db.platform_settings.update_one(
        {"_id": "p1_contact"},
        {"$set": {
            "email": data.email,
            "phone": data.phone,
            "chat_enabled": data.chat_enabled,
        }},
        upsert=True,
    )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="p1_contact_update",
        category="platform",
        resource_type="settings",
        resource_id="p1_contact",
        details={"email": data.email, "phone_updated": True, "chat_enabled": data.chat_enabled},
        ip_address=get_client_ip(request),
        severity="info",
    )

    return {"updated": True}



@router.get("/founder/p1-contact-settings-public")
async def get_p1_contact_settings_public():
    """Get Priority 1 contact settings — public, no auth required.
    This is a critical safety endpoint for the sealed account screen."""
    settings = await db.platform_settings.find_one(
        {"_id": "p1_contact"}, {"_id": 0}
    )
    if not settings:
        settings = {
            "email": "founder@carryon.us",
            "phone": "(808) 585-1156",
            "chat_enabled": True,
        }
    return settings
