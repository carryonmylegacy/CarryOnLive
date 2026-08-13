"""CarryOn™ Backend — Admin: Grace Period Management"""

from fastapi import APIRouter, Depends, HTTPException, Query

from config import db
from guards import require_staff
from utils import verify_password

router = APIRouter()


@router.get("/admin/grace-periods")
async def get_grace_periods(
    status: str = Query("active"),
    current_user: dict = Depends(require_staff),
):
    """Get grace periods. Staff only."""
    query = {}
    if status and status != "all":
        query["status"] = status

    periods = await db.grace_periods.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    # Batch-load referenced users/estates in two queries instead of an N+1
    # (was 2 find_one per period = up to 400 sequential round-trips on the
    # admin Grace Periods tab). Output is identical: same per-period
    # user_name / user_email / estate_name fields.
    user_ids = list({p.get("user_id") for p in periods if p.get("user_id")})
    estate_ids = list({p.get("estate_id") for p in periods if p.get("estate_id")})
    users = (
        await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(
            len(user_ids) + 1
        )
        if user_ids
        else []
    )
    estates = (
        await db.estates.find({"id": {"$in": estate_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(estate_ids) + 1)
        if estate_ids
        else []
    )
    users_by_id = {u["id"]: u for u in users}
    estates_by_id = {e["id"]: e for e in estates}

    # Enrich with user/estate info
    for p in periods:
        user = users_by_id.get(p.get("user_id"))
        p["user_name"] = (user or {}).get("name", "Unknown")
        p["user_email"] = (user or {}).get("email", "")
        estate = estates_by_id.get(p.get("estate_id"))
        p["estate_name"] = (estate or {}).get("name", "Unknown Estate")

    return periods


@router.post("/admin/grace-periods/{gp_id}/hold")
async def toggle_grace_period_hold(
    gp_id: str,
    data: dict,
    current_user: dict = Depends(require_staff),
):
    """Place or remove a hold on a grace period."""
    from services.grace_period import toggle_hold

    hold_active = data.get("hold_active", True)
    reason = data.get("reason", "")
    await toggle_hold(gp_id, hold_active, current_user, reason)
    return {"status": "hold_active" if hold_active else "hold_removed"}


@router.post("/admin/grace-periods/{gp_id}/confirm")
async def confirm_grace_period(
    gp_id: str,
    current_user: dict = Depends(require_staff),
):
    """Confirm an auto-paused grace period for a transitioned estate — starts the 90-day clock."""
    from services.grace_period import confirm_transitioned_grace_period

    await confirm_transitioned_grace_period(gp_id, current_user)
    return {"status": "confirmed", "message": "Grace period confirmed. 90-day clock started."}


@router.post("/admin/grace-periods/{gp_id}/purge")
async def execute_grace_period_purge(
    gp_id: str,
    current_user: dict = Depends(require_staff),
):
    """Execute file purge for an expired grace period. Admin/Ops only. Does NOT purge Milestone Messages."""
    gp = await db.grace_periods.find_one({"id": gp_id}, {"_id": 0})
    if not gp:
        raise HTTPException(status_code=404, detail="Grace period not found")
    if gp.get("hold_active"):
        raise HTTPException(status_code=400, detail="Cannot purge — hold is active")

    from services.grace_period import execute_purge

    count = await execute_purge(gp_id, current_user["id"])
    return {"status": "files_purged", "files_purged": count, "mm_purge_pending": True}


@router.post("/admin/grace-periods/{gp_id}/purge-mm")
async def execute_mm_purge_endpoint(
    gp_id: str,
    data: dict,
    current_user: dict = Depends(require_staff),
):
    """Final purge: Remove undelivered Milestone Messages. Admin/Ops only.
    Requires password confirmation. This is the LAST and irreversible action."""
    password = data.get("password")  # confirmation input, verified against bcrypt below (hk-14)
    if not password:
        raise HTTPException(status_code=400, detail="Password confirmation required")

    # Verify password
    user_record = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "password_hash": 1})
    if not user_record or not verify_password(password, user_record["password_hash"]):
        raise HTTPException(status_code=403, detail="Password verification failed")

    gp = await db.grace_periods.find_one({"id": gp_id}, {"_id": 0})
    if not gp:
        raise HTTPException(status_code=404, detail="Grace period not found")
    if gp.get("hold_active"):
        raise HTTPException(status_code=400, detail="Cannot purge — hold is active")
    if gp.get("status") not in ("files_purged", "active"):
        raise HTTPException(
            status_code=400,
            detail=f"Grace period status must be 'files_purged' to purge MMs, current: {gp.get('status')}",
        )

    from services.grace_period import execute_mm_purge

    count = await execute_mm_purge(gp_id, current_user)
    return {"status": "completed", "messages_purged": count}
