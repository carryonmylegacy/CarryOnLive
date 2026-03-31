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
    """Export all users as CSV. Admin only."""
    users = await db.users.find(
        {},
        {"_id": 0, "password": 0},
    ).to_list(100000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "email", "name", "role", "operator_role", "admin_scope",
        "created_at", "last_login_at", "is_beta_tester", "trial_ends_at",
        "special_status",
    ])

    for u in users:
        writer.writerow([
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
        ])

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="user_export",
        category="admin",
        resource_type="user",
        details={"count": len(users)},
        severity="info",
    )

    output.seek(0)
    now_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=carryon_users_{now_str}.csv"},
    )


@router.get("/admin/export/subscriptions")
async def export_subscriptions_csv(current_user: dict = Depends(require_admin)):
    """Export all subscriptions as CSV. Admin only."""
    subs = await db.user_subscriptions.find({}, {"_id": 0}).to_list(100000)

    # Get user emails for cross-reference
    user_emails = {}
    for s in subs:
        uid = s.get("user_id")
        if uid:
            u = await db.users.find_one({"id": uid}, {"_id": 0, "email": 1, "name": 1})
            if u:
                user_emails[uid] = {"email": u.get("email", ""), "name": u.get("name", "")}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "user_id", "email", "name", "plan_id", "plan_name",
        "billing_cycle", "status", "amount", "created_at",
    ])

    for s in subs:
        uid = s.get("user_id", "")
        info = user_emails.get(uid, {})
        writer.writerow([
            uid,
            info.get("email", ""),
            info.get("name", ""),
            s.get("plan_id", ""),
            s.get("plan_name", ""),
            s.get("billing_cycle", ""),
            s.get("status", ""),
            s.get("amount", 0),
            s.get("created_at", ""),
        ])

    output.seek(0)
    now_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=carryon_subscriptions_{now_str}.csv"},
    )
