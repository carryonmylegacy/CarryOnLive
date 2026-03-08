"""CarryOn™ — Operator Management & Audit Trail

Founder-only endpoints for:
  - Creating/deleting operator accounts
  - Querying the immutable audit trail
  - Viewing operator activity
"""

import uuid
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from config import db
from services.audit import get_client_ip, log_audit_event
from utils import get_current_user

router = APIRouter()


def require_founder(current_user: dict):
    """Only the founder (role=admin) can manage operators."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Founder access required")


# ── Operator CRUD ────────────────────────────────────────────────────


class CreateOperatorRequest(BaseModel):
    email: str
    password: str
    name: str


@router.post("/founder/operators")
async def create_operator(
    data: CreateOperatorRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Create a new operator account — founder only."""
    require_founder(current_user)

    existing = await db.users.find_one({"email": data.email}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")

    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
    now = datetime.now(timezone.utc)
    operator = {
        "id": str(uuid.uuid4()),
        "email": data.email,
        "name": data.name,
        "password": hashed,
        "role": "operator",
        "created_at": now.isoformat(),
        "created_by": current_user["id"],
    }
    await db.users.insert_one(operator)

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="operator_create",
        category="user_mgmt",
        resource_type="user",
        resource_id=operator["id"],
        details={"operator_email": data.email, "operator_name": data.name},
        ip_address=get_client_ip(request),
        severity="info",
    )

    return {
        "id": operator["id"],
        "email": operator["email"],
        "name": operator["name"],
        "role": "operator",
        "created_at": operator["created_at"],
    }


@router.get("/founder/operators")
async def list_operators(current_user: dict = Depends(get_current_user)):
    """List all operator accounts — founder only."""
    require_founder(current_user)

    operators = await db.users.find(
        {"role": "operator"}, {"_id": 0, "password": 0}
    ).to_list(100)
    return operators


@router.delete("/founder/operators/{operator_id}")
async def delete_operator(
    operator_id: str,
    admin_password: str = Query(...),
    request: Request = None,
    current_user: dict = Depends(get_current_user),
):
    """Delete an operator account — founder only, requires password."""
    require_founder(current_user)

    admin_doc = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "password": 1}
    )
    if not admin_doc or not bcrypt.checkpw(
        admin_password.encode(), admin_doc["password"].encode()
    ):
        raise HTTPException(status_code=401, detail="Incorrect password")

    op = await db.users.find_one(
        {"id": operator_id, "role": "operator"}, {"_id": 0, "email": 1}
    )
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")

    await db.users.delete_one({"id": operator_id})

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="operator_delete",
        category="user_mgmt",
        resource_type="user",
        resource_id=operator_id,
        details={"operator_email": op["email"]},
        ip_address=get_client_ip(request) if request else "",
        severity="critical",
    )

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
    """Query the immutable audit trail — founder only.
    Supports filtering by actor, category, and severity.
    Results are ordered newest-first."""
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
