"""CarryOn™ — IP Whitelist per Account Type

Founder-controlled IP restrictions selectable per role/account type.
When enabled for a role, only whitelisted IPs can log in as that role.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from config import db
from guards import require_admin
from services.audit import get_client_ip, log_audit_event

router = APIRouter()

ACCOUNT_TYPES = ["admin", "operator_manager", "operator_worker", "benefactor", "beneficiary"]

ACCOUNT_TYPE_LABELS = {
    "admin": "Admin / Founder",
    "operator_manager": "Ops Manager",
    "operator_worker": "Ops Worker",
    "benefactor": "Benefactor",
    "beneficiary": "Beneficiary",
}


class IPWhitelistUpdate(BaseModel):
    account_type: str
    enabled: bool
    allowed_ips: list[str] = []
    notes: Optional[str] = None


@router.get("/admin/ip-whitelist")
async def get_ip_whitelist(current_user: dict = Depends(require_admin)):
    """Get IP whitelist settings for all account types. Founder only."""
    if current_user.get("admin_scope", "founder") != "founder":
        raise HTTPException(status_code=403, detail="Founder access required")

    configs = []
    for at in ACCOUNT_TYPES:
        doc = await db.ip_whitelist.find_one({"account_type": at}, {"_id": 0})
        configs.append(
            {
                "account_type": at,
                "label": ACCOUNT_TYPE_LABELS.get(at, at),
                "enabled": doc.get("enabled", False) if doc else False,
                "allowed_ips": doc.get("allowed_ips", []) if doc else [],
                "notes": doc.get("notes", "") if doc else "",
                "updated_at": doc.get("updated_at", "") if doc else "",
            }
        )

    return configs


@router.put("/admin/ip-whitelist")
async def update_ip_whitelist(
    data: IPWhitelistUpdate,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Update IP whitelist for a specific account type. Founder only."""
    if current_user.get("admin_scope", "founder") != "founder":
        raise HTTPException(status_code=403, detail="Founder access required")

    if data.account_type not in ACCOUNT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid account type: {data.account_type}")

    # Clean and validate IPs
    clean_ips = []
    for ip in data.allowed_ips:
        stripped = ip.strip()
        if stripped:
            clean_ips.append(stripped)

    now = datetime.now(timezone.utc).isoformat()

    await db.ip_whitelist.update_one(
        {"account_type": data.account_type},
        {
            "$set": {
                "account_type": data.account_type,
                "enabled": data.enabled,
                "allowed_ips": clean_ips,
                "notes": data.notes or "",
                "updated_at": now,
                "updated_by": current_user["id"],
            }
        },
        upsert=True,
    )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="ip_whitelist_update",
        category="security",
        resource_type="ip_whitelist",
        resource_id=data.account_type,
        details={
            "enabled": data.enabled,
            "ip_count": len(clean_ips),
        },
        ip_address=get_client_ip(request),
        severity="critical",
    )

    return {"success": True, "account_type": data.account_type, "enabled": data.enabled}


async def check_ip_whitelist(user_role: str, operator_role: str, client_ip: str) -> bool:
    """Check if the user's IP is allowed based on their role.
    Returns True if allowed, False if blocked."""

    # Map user role to account_type
    if user_role == "admin":
        account_type = "admin"
    elif user_role == "operator":
        account_type = f"operator_{operator_role}" if operator_role else "operator_worker"
    elif user_role == "benefactor":
        account_type = "benefactor"
    elif user_role == "beneficiary":
        account_type = "beneficiary"
    else:
        return True

    doc = await db.ip_whitelist.find_one({"account_type": account_type}, {"_id": 0})
    if not doc or not doc.get("enabled"):
        return True

    allowed = doc.get("allowed_ips", [])
    if not allowed:
        return True

    # Check if client IP matches any allowed IP (supports exact match and CIDR prefix)
    for allowed_ip in allowed:
        if allowed_ip == client_ip:
            return True
        # Simple prefix match for ranges like "192.168.1."
        if allowed_ip.endswith(".") and client_ip.startswith(allowed_ip):
            return True
        # Wildcard support
        if allowed_ip == "*":
            return True

    return False
