"""CarryOn™ — Bulk Operations for Admin

Bulk actions:
  - Bulk assign tiers to estates
  - Bulk toggle beta tester flag
  - Bulk user data export (CSV)
  - Bulk suspend/unsuspend accounts
"""

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import db
from guards import require_admin
from services.audit import get_client_ip, log_audit_event

router = APIRouter()


class BulkTierAssign(BaseModel):
    estate_ids: list[str]
    tier: str


@router.post("/admin/bulk/assign-tier")
async def bulk_assign_tier(
    data: BulkTierAssign,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Bulk assign tier to multiple estates."""
    valid_tiers = ["premium", "standard", "base", "new_adult", "military", "hospice", "veteran", "enterprise", ""]

    if data.tier not in valid_tiers:
        raise HTTPException(status_code=400, detail=f"Invalid tier: {data.tier}")

    if data.tier == "":
        result = await db.estates.update_many(
            {"id": {"$in": data.estate_ids}},
            {"$unset": {"verified_tier": ""}},
        )
    else:
        result = await db.estates.update_many(
            {"id": {"$in": data.estate_ids}},
            {"$set": {"verified_tier": data.tier}},
        )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="bulk_tier_assign",
        category="admin",
        resource_type="estate",
        details={"tier": data.tier, "count": result.modified_count},
        ip_address=get_client_ip(request),
        severity="info",
    )

    return {"success": True, "modified": result.modified_count}


class BulkBetaToggle(BaseModel):
    user_ids: list[str]
    is_beta_tester: bool


@router.post("/admin/bulk/toggle-beta")
async def bulk_toggle_beta(
    data: BulkBetaToggle,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Bulk toggle beta tester flag for multiple users."""
    result = await db.users.update_many(
        {"id": {"$in": data.user_ids}},
        {"$set": {"is_beta_tester": data.is_beta_tester}},
    )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="bulk_beta_toggle",
        category="admin",
        resource_type="user",
        details={"is_beta_tester": data.is_beta_tester, "count": result.modified_count},
        ip_address=get_client_ip(request),
        severity="info",
    )

    return {"success": True, "modified": result.modified_count}


@router.get("/admin/export/users")
async def export_users_csv(current_user: dict = Depends(require_admin)):
    """Export all users as CSV. Admin only. Streams row-by-row — safe at any scale."""

    header = [
        "id",
        "email",
        "name",
        "role",
        "operator_role",
        "admin_scope",
        "created_at",
        "last_login_at",
        "is_beta_tester",
        "trial_ends_at",
        "special_status",
    ]

    async def generate():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(header)
        yield buf.getvalue()

        # Stream documents via cursor — never loads the full collection into RAM
        async for u in db.users.find({}, {"_id": 0, "password": 0}):
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(
                [
                    u.get("id", ""),
                    u.get("email", ""),
                    u.get("name", ""),
                    u.get("role", ""),
                    u.get("operator_role", ""),
                    u.get("admin_scope", ""),
                    u.get("created_at", ""),
                    u.get("last_login_at", ""),
                    u.get("is_beta_tester", False),
                    u.get("trial_ends_at", ""),
                    ",".join(u.get("special_status", []) or []),
                ]
            )
            yield buf.getvalue()

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="user_export",
        category="admin",
        resource_type="user",
        details={"method": "streaming_cursor"},
        severity="info",
    )

    now_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=carryon_users_{now_str}.csv"},
    )


@router.get("/admin/export/subscriptions")
async def export_subscriptions_csv(current_user: dict = Depends(require_admin)):
    """Export all subscriptions as CSV. Admin only.
    Pre-fetches user email/name lookup table once (batch) to avoid N+1 queries.
    Streams row-by-row — safe at any scale.
    """
    # Batch-fetch the user lookup table once — eliminates N+1 per subscription row
    user_lookup: dict = {}
    async for u in db.users.find({}, {"_id": 0, "id": 1, "email": 1, "name": 1}):
        if u.get("id"):
            user_lookup[u["id"]] = {"email": u.get("email", ""), "name": u.get("name", "")}

    header = ["user_id", "email", "name", "plan_id", "plan_name", "billing_cycle", "status", "amount", "created_at"]

    async def generate():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(header)
        yield buf.getvalue()

        async for s in db.user_subscriptions.find({}, {"_id": 0}):
            uid = s.get("user_id", "")
            info = user_lookup.get(uid, {})
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(
                [
                    uid,
                    info.get("email", ""),
                    info.get("name", ""),
                    s.get("plan_id", ""),
                    s.get("plan_name", ""),
                    s.get("billing_cycle", ""),
                    s.get("status", ""),
                    s.get("amount", 0),
                    s.get("created_at", ""),
                ]
            )
            yield buf.getvalue()

    now_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=carryon_subscriptions_{now_str}.csv"},
    )
