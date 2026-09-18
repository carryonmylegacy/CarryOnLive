"""Guides — the founder's launch switch for the public /guides section.

The five articles ship in the frontend registry (frontend/src/copy/siteCopyGuides.js) but stay
hidden (noindex, no footer link) until the founder presses Launch in Admin → Marketing → Guides.

GET /api/public/guides/status      — {launched, launched_at}
PUT /api/admin/guides/launch       — {launched: bool}; marketing scope; audited
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from config import db
from guards import require_scope
from services.audit import get_client_ip, log_audit_event

router = APIRouter()


class LaunchIn(BaseModel):
    launched: bool


async def guides_status() -> dict:
    projection = {"_id": 0, "guides_launched": 1, "guides_launched_at": 1}  # allow-missing-id: settings singleton
    doc = await db.platform_settings.find_one({"_id": "global"}, projection) or {}
    return {"launched": bool(doc.get("guides_launched")), "launched_at": doc.get("guides_launched_at")}


@router.get("/public/guides/status")
async def get_guides_status():
    return await guides_status()


@router.put("/admin/guides/launch")
async def put_guides_launch(
    payload: LaunchIn, request: Request, current_user: dict = Depends(require_scope("marketing"))
):
    update = {"guides_launched": payload.launched}
    if payload.launched:
        update["guides_launched_at"] = datetime.now(timezone.utc).isoformat()
    await db.platform_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", "admin"),
        action="guides_launch" if payload.launched else "guides_unpublish",
        category="platform",
        resource_type="guides",
        resource_id="public-site",
        details=update,
        ip_address=get_client_ip(request),
    )
    return await guides_status()
