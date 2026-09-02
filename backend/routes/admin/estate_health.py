"""CarryOn™ Backend — Admin: Estate Health, Diagnostics, Ghost/Orphan Cleanup"""

from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import db
from guards import require_admin, require_staff
from services.erasure import erase_estate
from services.transcript_purge import purge_user_transcripts

router = APIRouter()


@router.delete("/admin/estates/{estate_id}")
async def delete_estate_only(
    estate_id: str,
    admin_password: str = Query(..., description="Admin password for confirmation"),
    current_user: dict = Depends(require_admin),
):
    """Delete an estate and all associated data WITHOUT deleting the user.
    Resets benefactor flags and onboarding so the user can re-create their estate."""
    admin_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "password": 1})
    if not admin_doc or not bcrypt.checkpw(admin_password.encode(), admin_doc["password"].encode()):
        raise HTTPException(status_code=401, detail="Incorrect admin password")

    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1, "name": 1})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    owner_id = estate["owner_id"]

    # Single erasure executor — every estate-scoped collection in the manifest + blobs.
    await erase_estate(estate_id, actor=current_user, reason="admin_estate_delete")

    # Check if owner has any other estates
    other_estates = await db.estates.count_documents({"owner_id": owner_id})
    if other_estates == 0:
        # Reset benefactor flags and onboarding so they can start fresh
        await db.users.update_one(
            {"id": owner_id},
            {
                "$set": {"is_also_benefactor": False},
                "$unset": {
                    "benefactor_since": "",
                    "guided_activation": "",
                },
            },
        )
        await db.onboarding_progress.delete_many({"user_id": owner_id})

    return {
        "message": f"Estate '{estate.get('name', estate_id)}' and all associated data deleted. User account preserved.",
        "owner_id": owner_id,
        "other_estates_remaining": other_estates,
    }


class CleanupGhostEstatesRequest(BaseModel):
    estate_ids: list[str]
    admin_password: str


@router.post("/admin/cleanup-ghost-estates")
async def cleanup_ghost_estates(
    data: CleanupGhostEstatesRequest,
    current_user: dict = Depends(require_admin),
):
    """Batch-delete ghost estates — admin only, requires password confirmation."""
    admin_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "password": 1})
    if not admin_doc or not bcrypt.checkpw(data.admin_password.encode(), admin_doc["password"].encode()):
        raise HTTPException(status_code=401, detail="Incorrect admin password")

    deleted_count = 0
    reset_users = []

    for estate_id in data.estate_ids:
        estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1, "name": 1})
        if not estate:
            continue

        owner_id = estate["owner_id"]

        await erase_estate(estate_id, actor=current_user, reason="admin_bulk_estate_delete")
        deleted_count += 1

        # Reset benefactor flags if no other estates remain
        other_estates = await db.estates.count_documents({"owner_id": owner_id})
        if other_estates == 0:
            await db.users.update_one(
                {"id": owner_id},
                {
                    "$set": {"is_also_benefactor": False},
                    "$unset": {"benefactor_since": "", "guided_activation": ""},
                },
            )
            await db.onboarding_progress.delete_many({"user_id": owner_id})
            reset_users.append(owner_id)

    return {
        "message": f"Cleaned up {deleted_count} ghost estate(s)",
        "deleted_count": deleted_count,
        "users_reset": len(reset_users),
    }


@router.post("/admin/cleanup-orphans")
async def cleanup_orphans(current_user: dict = Depends(require_admin)):
    """Remove orphaned records not linked to any existing user — admin only"""
    all_users = await db.users.find({}, {"_id": 0, "id": 1}).to_list(100000)
    user_ids = [u["id"] for u in all_users]

    # Find orphan estates (owner_id not in existing users)
    all_estates = await db.estates.find({}, {"_id": 0, "id": 1, "owner_id": 1}).to_list(100000)
    orphan_estates = [e for e in all_estates if e["owner_id"] not in set(user_ids)]
    orphan_estate_ids = [e["id"] for e in orphan_estates]
    orphan_owner_ids = list({e["owner_id"] for e in orphan_estates})

    deleted = {
        "estates": 0,
        "beneficiaries": 0,
        "documents": 0,
        "messages": 0,
        "checklists": 0,
        "subscriptions": 0,
    }

    if orphan_estate_ids:
        for eid in orphan_estate_ids:
            for k, v in (await erase_estate(eid, actor=current_user, reason="orphan_cleanup")).items():
                deleted[k] = deleted.get(k, 0) + v

    if orphan_owner_ids:
        for oid in orphan_owner_ids:
            t = await purge_user_transcripts(oid, orphan_estate_ids)
            deleted["transcripts"] = deleted.get("transcripts", 0) + sum(t.values())
        r = await db.user_subscriptions.delete_many({"user_id": {"$in": orphan_owner_ids}})
        deleted["subscriptions"] = r.deleted_count

    return {"message": "Orphan cleanup complete", "deleted": deleted}


@router.get("/admin/estate-health")
async def get_estate_health(current_user: dict = Depends(require_staff)):
    """Estate health analytics — admin and operators"""
    # Fetch all users, estates, and beneficiaries
    all_users = await db.users.find(
        {},
        {
            "_id": 0,
            "id": 1,
            "role": 1,
            "name": 1,
            "email": 1,
            "first_name": 1,
            "last_name": 1,
            "date_of_birth": 1,
            "photo_url": 1,
            "is_also_benefactor": 1,
        },
    ).to_list(100000)
    user_by_id = {u["id"]: u for u in all_users}

    all_estates = await db.estates.find(
        {}, {"_id": 0, "id": 1, "owner_id": 1, "name": 1, "status": 1, "created_at": 1}
    ).to_list(100000)

    all_bens = await db.beneficiaries.find(
        {},
        {
            "_id": 0,
            "id": 1,
            "estate_id": 1,
            "name": 1,
            "first_name": 1,
            "last_name": 1,
            "email": 1,
            "relation": 1,
            "user_id": 1,
            "is_stub": 1,
            "is_primary": 1,
            "invitation_status": 1,
            "date_of_birth": 1,
            "avatar_color": 1,
            "photo_url": 1,
        },
    ).to_list(100000)

    bens_by_estate = {}
    for b in all_bens:
        eid = b.get("estate_id")
        if eid:
            bens_by_estate.setdefault(eid, []).append(b)

    # Fetch subscription statuses for billing status indicators
    all_subs = await db.user_subscriptions.find(
        {}, {"_id": 0, "id": 1, "user_id": 1, "status": 1, "grace_period_end": 1, "dormant_since": 1}
    ).to_list(100000)
    sub_by_user = {s["user_id"]: s for s in all_subs}
    now_utc = datetime.now(timezone.utc)
    for uid, user in user_by_id.items():
        sub = sub_by_user.get(uid)
        if sub:
            if sub.get("status") == "past_due":
                user["billing_status"] = "grace_period"
            elif sub.get("status") == "dormant":
                user["billing_status"] = "dormant"
            else:
                user["billing_status"] = "active"
        else:
            trial_ends = user.get("trial_ends_at")
            if trial_ends:
                try:
                    ends = datetime.fromisoformat(str(trial_ends).replace("Z", "+00:00"))
                    if ends.tzinfo is None:
                        ends = ends.replace(tzinfo=timezone.utc)
                    user["billing_status"] = "trial" if now_utc < ends else "expired"
                except (ValueError, TypeError):
                    user["billing_status"] = "active"
            else:
                user["billing_status"] = "active"

    # Build per-estate health
    estate_health = []
    totals = {
        "estates": 0,
        "beneficiaries": 0,
        "linked": 0,
        "complete": 0,
        "invited": 0,
        "has_primary": 0,
    }

    for estate in all_estates:
        owner = user_by_id.get(estate.get("owner_id"))
        if not owner or (owner.get("role") != "benefactor" and not owner.get("is_also_benefactor")):
            continue

        bens = bens_by_estate.get(estate["id"], [])
        total = len(bens)
        linked = sum(1 for b in bens if b.get("user_id") or b.get("invitation_status") == "accepted")
        complete = sum(1 for b in bens if not b.get("is_stub"))
        invited = sum(1 for b in bens if b.get("invitation_status") in ("sent", "accepted"))
        has_primary = any(b.get("is_primary") for b in bens)

        # Health score: 0-100
        if total == 0:
            score = 50  # No beneficiaries yet
        else:
            link_pct = (linked / total) * 30
            complete_pct = (complete / total) * 30
            invite_pct = (invited / total) * 20
            primary_pts = 20 if has_primary else 0
            score = round(link_pct + complete_pct + invite_pct + primary_pts)

        # Health status
        if score >= 80:
            status = "healthy"
        elif score >= 50:
            status = "attention"
        else:
            status = "critical"

        estate_health.append(
            {
                "estate_id": estate["id"],
                "estate_name": estate.get("name", f"{owner.get('name', 'Unknown')}'s Estate"),
                "estate_status": estate.get("status", "active"),
                "owner": {
                    "id": owner["id"],
                    "name": owner.get("name", "Unknown"),
                    "first_name": owner.get("first_name", ""),
                    "last_name": owner.get("last_name", ""),
                    "email": owner.get("email", ""),
                    "date_of_birth": owner.get("date_of_birth"),
                    "billing_status": owner.get("billing_status", "active"),
                },
                "beneficiaries": [
                    {
                        "id": b["id"],
                        "name": b.get("name", ""),
                        "first_name": b.get("first_name", ""),
                        "last_name": b.get("last_name", ""),
                        "email": b.get("email", ""),
                        "relation": b.get("relation", ""),
                        "is_primary": b.get("is_primary", False),
                        "is_stub": b.get("is_stub", False),
                        "is_linked": bool(b.get("user_id") or b.get("invitation_status") == "accepted"),
                        "invitation_status": b.get("invitation_status", "none"),
                        "date_of_birth": b.get("date_of_birth"),
                        "avatar_color": b.get("avatar_color", "#60A5FA"),
                    }
                    for b in bens
                ],
                "metrics": {
                    "total": total,
                    "linked": linked,
                    "complete": complete,
                    "invited": invited,
                    "has_primary": has_primary,
                    "health_score": score,
                    "health_status": status,
                },
            }
        )

        totals["estates"] += 1
        totals["beneficiaries"] += total
        totals["linked"] += linked
        totals["complete"] += complete
        totals["invited"] += invited
        if has_primary:
            totals["has_primary"] += 1

    # Sort: critical first, then attention, then healthy
    order = {"critical": 0, "attention": 1, "healthy": 2}
    estate_health.sort(
        key=lambda e: (
            order.get(e["metrics"]["health_status"], 3),
            -e["metrics"]["total"],
        )
    )

    # Detect ghost estates: orphaned (no owner) or empty (0 beneficiaries) with incomplete setup
    ghost_estates = []
    for estate in all_estates:
        owner = user_by_id.get(estate.get("owner_id"))
        bens = bens_by_estate.get(estate["id"], [])
        reason = None
        if not owner:
            reason = "Owner account no longer exists"
        elif len(bens) == 0 and owner.get("role") == "beneficiary" and owner.get("is_also_benefactor"):
            reason = "Incomplete estate from beneficiary conversion"
        elif len(bens) == 0 and estate.get("status") == "pre-transition":
            reason = "Empty estate with no beneficiaries"

        if reason:
            ghost_estates.append(
                {
                    "estate_id": estate["id"],
                    "estate_name": estate.get("name", "Unknown"),
                    "owner_id": estate.get("owner_id"),
                    "owner_name": owner.get("name", "Deleted User") if owner else "Deleted User",
                    "owner_email": owner.get("email", "") if owner else "",
                    "created_at": estate.get("created_at", ""),
                    "reason": reason,
                }
            )

    tb = totals["beneficiaries"]
    return {
        "summary": {
            "total_estates": totals["estates"],
            "total_beneficiaries": tb,
            "linking_rate": round((totals["linked"] / tb * 100) if tb > 0 else 0, 1),
            "completion_rate": round((totals["complete"] / tb * 100) if tb > 0 else 0, 1),
            "invitation_rate": round((totals["invited"] / tb * 100) if tb > 0 else 0, 1),
            "primary_designated_rate": round(
                (totals["has_primary"] / totals["estates"] * 100) if totals["estates"] > 0 else 0,
                1,
            ),
            "healthy_estates": sum(1 for e in estate_health if e["metrics"]["health_status"] == "healthy"),
            "attention_estates": sum(1 for e in estate_health if e["metrics"]["health_status"] == "attention"),
            "critical_estates": sum(1 for e in estate_health if e["metrics"]["health_status"] == "critical"),
            "ghost_estates": len(ghost_estates),
        },
        "estates": estate_health,
        "ghost_estates": ghost_estates,
    }


@router.get("/admin/estate-diagnostic")
async def estate_diagnostic(current_user: dict = Depends(require_admin)):
    """Admin diagnostic: show all estates grouped by owner, with beneficiary links."""
    owners = {}
    async for estate in db.estates.find(
        {}, {"_id": 0, "id": 1, "name": 1, "owner_id": 1, "beneficiaries": 1, "status": 1}
    ):
        oid = estate.get("owner_id", "unknown")
        if oid not in owners:
            owner = await db.users.find_one({"id": oid}, {"_id": 0, "id": 1, "name": 1, "email": 1})
            owners[oid] = {"owner": owner or {"id": oid, "name": "Unknown"}, "estates": []}
        owners[oid]["estates"].append(
            {
                "id": estate["id"],
                "name": estate.get("name", "NO NAME"),
                "beneficiary_count": len(estate.get("beneficiaries", [])),
                "beneficiary_ids": estate.get("beneficiaries", [])[:5],
                "status": estate.get("status", "unknown"),
            }
        )

    # Flag owners with multiple estates
    results = []
    for oid, data in owners.items():
        entry = {
            "owner_name": data["owner"].get("name", "Unknown"),
            "owner_email": data["owner"].get("email", "Unknown"),
            "estate_count": len(data["estates"]),
            "estates": data["estates"],
            "has_duplicates": len(data["estates"]) > 1,
        }
        results.append(entry)

    results.sort(key=lambda x: (-x["estate_count"], x["owner_name"]))
    return results
