"""CarryOn™ Backend — Admin: Dev Switcher Configuration"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from guards import require_admin

router = APIRouter()


class DevSwitcherConfig(BaseModel):
    benefactor_email: str = ""
    benefactor_password: str = ""
    beneficiary_email: str = ""
    beneficiary_password: str = ""
    enabled: bool = True
    portal_visibility: dict = {}


class PortalVisibilityUpdate(BaseModel):
    portal_visibility: dict


@router.get("/admin/dev-switcher")
async def get_dev_switcher_config(current_user: dict = Depends(require_admin)):
    """Get dev switcher configuration — admin only"""
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
        "portal_visibility": config.get("portal_visibility", {}),
    }


@router.put("/admin/dev-switcher")
async def update_dev_switcher_config(data: DevSwitcherConfig, current_user: dict = Depends(require_admin)):
    """Update dev switcher configuration — admin only"""
    # Validate that the accounts exist if provided
    if data.benefactor_email:
        user = await db.users.find_one({"email": data.benefactor_email}, {"_id": 0})
        if not user:
            raise HTTPException(
                status_code=400,
                detail=f"Benefactor account not found: {data.benefactor_email}",
            )
        if user["role"] != "benefactor" and not user.get("is_also_benefactor"):
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
        if user["role"] != "beneficiary" and not user.get("is_also_beneficiary"):
            raise HTTPException(
                status_code=400,
                detail=f"Account is not a beneficiary: {data.beneficiary_email}",
            )

    update_fields = {
        "benefactor_email": data.benefactor_email,
        "beneficiary_email": data.beneficiary_email,
        "enabled": data.enabled,
    }
    if data.portal_visibility:
        update_fields["portal_visibility"] = data.portal_visibility
    # Only update passwords if provided (don't clear with empty string)
    if data.benefactor_password:
        update_fields["benefactor_password"] = (
            data.benefactor_password
        )  # dev-only portal-switcher config (hk-14 reviewed)
    if data.beneficiary_password:
        update_fields["beneficiary_password"] = (
            data.beneficiary_password
        )  # dev-only portal-switcher config (hk-14 reviewed)

    await db.dev_config.update_one(
        {"id": "dev_switcher"},
        {"$set": update_fields},
        upsert=True,
    )

    return {"message": "Dev switcher config updated"}


@router.put("/admin/dev-switcher/portal-visibility")
async def update_portal_visibility(data: PortalVisibilityUpdate, current_user: dict = Depends(require_admin)):
    """Update which portals are visible in the logo portal switcher — admin only."""
    await db.dev_config.update_one(
        {"id": "dev_switcher"},
        {"$set": {"portal_visibility": data.portal_visibility}},
        upsert=True,
    )
    return {"message": "Portal visibility updated", "portal_visibility": data.portal_visibility}


@router.get("/dev-switcher/config")
async def get_public_dev_switcher_config():
    """Get dev switcher config for frontend — only returns enabled status and emails (never passwords)"""
    config = await db.dev_config.find_one({"id": "dev_switcher"}, {"_id": 0})
    if not config or not config.get("enabled", True):
        return {"enabled": False}

    return {
        "enabled": config.get("enabled", True),
        "portal_visibility": config.get("portal_visibility", {}),
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
