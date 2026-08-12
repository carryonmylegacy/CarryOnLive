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

# Public status probe — mounted WITHOUT the router-level
# `require_scope("platform_health")` dependency (see routes/admin/__init__.py).
public_router = APIRouter()


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


@public_router.get("/public/maintenance-status")
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


# ─────────────────────────────────────────────────────────────────────
# Reprocess avatars — one-off maintenance tool. Re-crops every stored
# beneficiary / user / estate photo through the Feb-2026 face-aware
# crop in `_process_image()`. Only photos uploaded after the
# upload_photo() patch that retains `.original` sibling bytes can be
# reprocessed; older photos are reported back so the admin knows which
# users to nudge for a re-upload.
# ─────────────────────────────────────────────────────────────────────


async def _iter_photo_entities():
    """Yield (category, entity_id, photo_url, collection, id_field) tuples
    for every entity that holds an avatar/cover photo."""
    q = {"photo_url": {"$exists": True, "$nin": [None, ""]}}
    async for ben in db.beneficiaries.find(q, {"_id": 0, "id": 1, "photo_url": 1}):
        if ben.get("photo_url", "").startswith("/api/photos/"):
            yield ("beneficiaries", ben["id"], ben["photo_url"], "beneficiaries", "id")
    async for u in db.users.find(q, {"_id": 0, "id": 1, "photo_url": 1}):
        if u.get("photo_url", "").startswith("/api/photos/"):
            yield ("users", u["id"], u["photo_url"], "users", "id")
    async for e in db.estates.find(q, {"_id": 0, "id": 1, "photo_url": 1}):
        if e.get("photo_url", "").startswith("/api/photos/"):
            yield ("estates", e["id"], e["photo_url"], "estates", "id")


def _display_key_from_url(photo_url: str) -> str:
    """Convert `/api/photos/cat/id/file.jpg` to `photos/cat/id/file.jpg`."""
    if not photo_url or not photo_url.startswith("/api/photos/"):
        return ""
    return "photos/" + photo_url[len("/api/photos/") :]


@router.get("/admin/maintenance/reprocess-avatars/scan")
async def reprocess_avatars_scan(current_user: dict = Depends(require_admin)):
    """Dry-run scan — report how many avatars can be reprocessed (have a
    retained `.original` sibling) vs. how many need manual re-upload."""
    from services.photo_storage import _original_key_for
    from services.storage import storage

    total = 0
    reprocessable = 0
    needs_reupload = 0
    needs_reupload_entities: list[dict] = []

    async for category, entity_id, photo_url, _coll, _idf in _iter_photo_entities():
        total += 1
        display_key = _display_key_from_url(photo_url)
        original_key = _original_key_for(display_key)
        has_original = False
        try:
            has_original = bool(original_key) and await storage.exists(original_key)
        except Exception:
            has_original = False
        if has_original:
            reprocessable += 1
        else:
            needs_reupload += 1
            if len(needs_reupload_entities) < 100:  # cap response payload
                needs_reupload_entities.append({"category": category, "entity_id": entity_id, "photo_url": photo_url})

    return {
        "total": total,
        "reprocessable": reprocessable,
        "needs_reupload": needs_reupload,
        "needs_reupload_preview": needs_reupload_entities,
    }


@router.post("/admin/maintenance/reprocess-avatars")
async def reprocess_avatars(
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Re-crop every avatar whose original source bytes are still
    retained. Overwrites the display image with the new face-aware crop.
    Founder only."""
    if not is_founder_scope(current_user):
        raise HTTPException(status_code=403, detail="Founder access required")

    from services.photo_storage import _original_key_for, _process_image
    from services.storage import storage

    processed = 0
    skipped_no_original = 0
    failed = 0
    failures: list[dict] = []

    async for category, entity_id, photo_url, _coll, _idf in _iter_photo_entities():
        display_key = _display_key_from_url(photo_url)
        original_key = _original_key_for(display_key)
        try:
            if not original_key or not await storage.exists(original_key):
                skipped_no_original += 1
                continue
            raw = await storage.download_raw(original_key)
            new_bytes = _process_image(raw, max_size=400)
            await storage.upload_raw(new_bytes, display_key, content_type="image/jpeg")
            processed += 1
        except Exception as e:
            failed += 1
            if len(failures) < 50:
                failures.append({"category": category, "entity_id": entity_id, "error": str(e)[:200]})

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="reprocess_avatars",
        category="platform",
        resource_type="avatar_storage",
        resource_id="all",
        details={"processed": processed, "skipped": skipped_no_original, "failed": failed},
        ip_address=get_client_ip(request),
        severity="info",
    )

    return {
        "success": True,
        "processed": processed,
        "skipped_no_original": skipped_no_original,
        "failed": failed,
        "failures_preview": failures,
    }
