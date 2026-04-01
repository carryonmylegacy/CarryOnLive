"""CarryOn™ — Platform Maintenance Mode

Founder can toggle maintenance mode on/off.
When enabled, all non-admin API calls return a maintenance message.
Admin endpoints remain fully functional.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from config import db
from guards import require_admin, is_founder_scope
from services.audit import get_client_ip, log_audit_event

router = APIRouter()


class MaintenanceModeUpdate(BaseModel):
    enabled: bool
    message: Optional[str] = "CarryOn is undergoing scheduled maintenance. We'll be back shortly."
    estimated_end: Optional[str] = None


@router.get("/admin/maintenance-mode")
async def get_maintenance_mode(current_user: dict = Depends(require_admin)):
    """Get current maintenance mode status."""
    doc = await db.platform_settings.find_one({"_id": "maintenance"}, {"_id": 0})
    if not doc:
        return {"enabled": False, "message": "", "estimated_end": None}
    return {
        "enabled": doc.get("enabled", False),
        "message": doc.get("message", ""),
        "estimated_end": doc.get("estimated_end"),
        "enabled_at": doc.get("enabled_at"),
        "enabled_by": doc.get("enabled_by"),
    }


@router.put("/admin/maintenance-mode")
async def toggle_maintenance_mode(
    data: MaintenanceModeUpdate,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Toggle maintenance mode. Founder only."""
    if not is_founder_scope(current_user):
        raise HTTPException(status_code=403, detail="Founder access required")

    now = datetime.now(timezone.utc).isoformat()
    await db.platform_settings.update_one(
        {"_id": "maintenance"},
        {
            "$set": {
                "enabled": data.enabled,
                "message": data.message,
                "estimated_end": data.estimated_end,
                "enabled_at": now if data.enabled else None,
                "enabled_by": current_user["id"] if data.enabled else None,
                "disabled_at": now if not data.enabled else None,
            }
        },
        upsert=True,
    )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="maintenance_mode_toggle",
        category="platform",
        resource_type="settings",
        resource_id="maintenance",
        details={"enabled": data.enabled, "message": data.message},
        ip_address=get_client_ip(request),
        severity="critical",
    )

    return {"success": True, "enabled": data.enabled}


@router.get("/public/maintenance-status")
async def public_maintenance_status():
    """Public endpoint to check maintenance status (no auth)."""
    doc = await db.platform_settings.find_one({"_id": "maintenance"}, {"_id": 0})
    if not doc or not doc.get("enabled"):
        return {"maintenance": False}
    return {
        "maintenance": True,
        "message": doc.get("message", "CarryOn is undergoing scheduled maintenance."),
        "estimated_end": doc.get("estimated_end"),
    }
