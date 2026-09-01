"""CarryOn™ Backend — Admin: AI alerting thresholds + run-now (Jun 2026).

Configuration surface for services/xai_alerting.py. Mounted under the
platform_health scope (Admin → Platform → Integrations → AI Alerting).
"""

from fastapi import APIRouter, Depends, HTTPException

from config import db
from guards import require_admin
from services.xai_alerting import CONFIG_DEFAULTS, get_alert_config, run_xai_health_checks

router = APIRouter()


@router.get("/admin/xai-alerting/config")
async def get_config(current_user: dict = Depends(require_admin)):
    return await get_alert_config()


@router.put("/admin/xai-alerting/config")
async def update_config(data: dict, current_user: dict = Depends(require_admin)):
    update = {}
    if "xai_spend_alert_usd" in data:
        try:
            v = float(data["xai_spend_alert_usd"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Spend threshold must be a number")
        if v <= 0:
            raise HTTPException(status_code=400, detail="Spend threshold must be greater than $0")
        update["xai_spend_alert_usd"] = round(v, 2)
    if "xai_substitution_alert_pct" in data:
        try:
            v = float(data["xai_substitution_alert_pct"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Substitution share must be a number")
        if not 0 < v <= 100:
            raise HTTPException(status_code=400, detail="Substitution share must be between 1 and 100")
        update["xai_substitution_alert_pct"] = v
    if "ai_fallback_alert_count" in data:
        try:
            v = int(data["ai_fallback_alert_count"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Fallback count must be a whole number")
        if v < 1:
            raise HTTPException(status_code=400, detail="Fallback count must be at least 1")
        update["ai_fallback_alert_count"] = v
    unknown = set(data) - set(CONFIG_DEFAULTS)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown setting(s): {', '.join(sorted(unknown))}")
    if not update:
        raise HTTPException(status_code=400, detail="No settings provided")
    await db.platform_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    return await get_alert_config()


@router.post("/admin/xai-alerting/run-now")
async def run_now(current_user: dict = Depends(require_admin)):
    """Run all four checks immediately, bypassing the per-day email dedup,
    so the founder can verify alerting end-to-end from production."""
    return await run_xai_health_checks(force=True)
