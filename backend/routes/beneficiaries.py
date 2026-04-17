"""CarryOn™ Backend — Beneficiary Routes"""

import asyncio
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import resend
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from config import RESEND_API_KEY, SENDER_EMAIL, db, logger
from guards import is_benefactor_or_admin, require_benefactor_role
from models import Beneficiary, BeneficiaryCreate
from routes.auth import generate_unique_username, validate_username
from utils import (
    create_token,
    get_current_user,
    hash_password,
    verify_password,
    log_activity,
    send_push_notification,
    update_estate_readiness,
)
from services.photo_urls import resolve_photo_url
from services.audit import log_audit_event, get_client_ip

router = APIRouter()


async def _grant_fc_free_access_if_applicable(estate_id: str, user_id: str) -> bool:
    """If `estate_id` has an active Founders Circle subscription, grant this
    beneficiary a free_access subscription override. Idempotent.

    Called whenever a beneficiary is linked to an estate (new account, existing
    account, or username/password login) so that beneficiaries ADDED AFTER FC
    activation also receive the promised free access.

    Returns True if an override was granted (or already existed), False otherwise.
    """
    try:
        fc = await db.founders_circle.find_one(
            {"estate_id": estate_id, "status": "active"},
            {"_id": 0, "id": 1, "tier": 1, "estate_id": 1},
        )
        if not fc:
            return False
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.subscription_overrides.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "user_id": user_id,
                    "free_access": True,
                    "reason": f"Founders Circle beneficiary (estate: {estate_id}, tier: {fc.get('tier')})",
                    "fc_estate_id": estate_id,
                    "fc_tier": fc.get("tier"),
                    "granted_at": now_iso,
                }
            },
            upsert=True,
        )
        logger.info(f"FC free_access granted to user {user_id} for estate {estate_id}")
        return True
    except Exception as e:
        # Failure here must NOT block the invitation acceptance flow. Log and
        # continue; an admin can grant the override manually if needed.
        logger.error(f"_grant_fc_free_access_if_applicable failed (estate={estate_id}, user={user_id}): {e}")
        return False


# ===================== BENEFICIARY ROUTES =====================


@router.get("/beneficiaries/{estate_id}")
async def get_beneficiaries(estate_id: str, request: Request = None, current_user: dict = Depends(get_current_user)):
    """List all beneficiaries for an estate, sorted by sort_order."""
    beneficiaries = await db.beneficiaries.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(100)
    # Normalize dob → date_of_birth for legacy records
    for b in beneficiaries:
        if "dob" in b and "date_of_birth" not in b:
            b["date_of_birth"] = b.pop("dob")
        # Initialize succession_order for legacy records that predate the feature
        if "succession_order" not in b:
            b["succession_order"] = b.get("sort_order", 0) if b.get("is_primary") else b.get("sort_order", 0)

    # Enrich photo_url: if the beneficiary has a linked user account with a profile
    # photo but no photo on the beneficiary record, use the user's photo as fallback
    user_ids = [b["user_id"] for b in beneficiaries if b.get("user_id") and not b.get("photo_url")]
    if user_ids:
        users_with_photos = {}
        async for u in db.users.find(
            {
                "id": {"$in": user_ids},
                "photo_url": {"$exists": True, "$nin": [None, ""]},
            },
            {"_id": 0, "id": 1, "photo_url": 1},
        ):
            users_with_photos[u["id"]] = u["photo_url"]
        for b in beneficiaries:
            if not b.get("photo_url") and b.get("user_id") in users_with_photos:
                b["photo_url"] = users_with_photos[b["user_id"]]

    # Sort by sort_order (fallback to created_at for records without sort_order)
    beneficiaries.sort(key=lambda b: (b.get("sort_order", 999), b.get("created_at", "")))
    # Resolve photo URLs for API response
    for b in beneficiaries:
        if b.get("photo_url"):
            b["photo_url"] = resolve_photo_url(b["photo_url"])
    # SOC 2 CC6.1: Audit sensitive data access
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", ""),
        action="beneficiary_list_view",
        category="data_access",
        resource_type="beneficiaries",
        resource_id=estate_id,
        ip_address=get_client_ip(request) if request else "",
        severity="info",
    )
    return beneficiaries


@router.post("/beneficiaries")
async def create_beneficiary(data: BeneficiaryCreate, current_user: dict = Depends(get_current_user)):
    """Add a new beneficiary to the estate."""
    require_benefactor_role(current_user, "add beneficiaries")

    from guards import get_subscription_access

    access = await get_subscription_access(current_user)
    if not access["has_access"]:
        raise HTTPException(status_code=403, detail="An active subscription is required to add beneficiaries.")

    # Build full name from parts
    name_parts = [data.first_name]
    if data.middle_name:
        name_parts.append(data.middle_name)
    name_parts.append(data.last_name)
    if data.suffix:
        name_parts.append(data.suffix)
    full_name = " ".join(name_parts)

    # Generate initials
    initials = (data.first_name[0] + data.last_name[0]).upper()

    # Generate invitation token
    invitation_token = str(uuid.uuid4())

    beneficiary = Beneficiary(
        estate_id=data.estate_id,
        first_name=data.first_name,
        middle_name=data.middle_name,
        last_name=data.last_name,
        suffix=data.suffix,
        name=full_name,
        relation=data.relation,
        email=data.email.lower().strip() if data.email else "",
        phone=data.phone,
        date_of_birth=data.date_of_birth,
        gender=data.gender,
        address_street=data.address_street,
        address_city=data.address_city,
        address_state=data.address_state,
        address_zip=data.address_zip,
        ssn_last_four=data.ssn_last_four,
        notes=data.notes,
        avatar_color=data.avatar_color,
        initials=initials,
        invitation_token=invitation_token,
        invitation_status="pending",
    )
    await db.beneficiaries.insert_one(beneficiary.model_dump())

    # If a user with this email already exists, pre-link user_id and mark accepted
    existing_user = await db.users.find_one({"email": data.email.lower().strip()}, {"_id": 0})
    if existing_user:
        await db.beneficiaries.update_one(
            {"id": beneficiary.id},
            {"$set": {"user_id": existing_user["id"], "invitation_status": "accepted"}},
        )
        beneficiary.user_id = existing_user["id"]
        # Add to estate's beneficiaries array
        await db.estates.update_one(
            {"id": data.estate_id},
            {"$addToSet": {"beneficiaries": existing_user["id"]}},
        )
        # Mark benefactor users as also being beneficiaries
        if existing_user.get("role") == "benefactor":
            await db.users.update_one(
                {"id": existing_user["id"]},
                {"$set": {"is_also_beneficiary": True}},
            )

    # Log activity
    await log_activity(
        estate_id=data.estate_id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="beneficiary_added",
        description=f"Added beneficiary: {full_name} ({data.relation})",
        metadata={"beneficiary_name": full_name, "relation": data.relation},
    )

    # Recalculate estate readiness (beneficiaries affect message score)
    await update_estate_readiness(data.estate_id)

    # Auto-send invitation email if beneficiary has an email
    auto_invited = False
    if data.email and beneficiary.invitation_token:
        from services.invitation_sender import send_invitation_email

        benefactor_info = {
            "name": current_user.get("name", ""),
            "first_name": current_user.get(
                "first_name", current_user.get("name", "").split()[0] if current_user.get("name") else ""
            ),
        }
        ben_dict = beneficiary.model_dump()
        asyncio.create_task(send_invitation_email(ben_dict, benefactor_info))
        auto_invited = True

    result = beneficiary.model_dump()
    result["auto_invited"] = auto_invited
    return result


@router.delete("/beneficiaries/{beneficiary_id}")
async def delete_beneficiary(
    beneficiary_id: str,
    delete_from_all: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """Hard-delete a beneficiary and all related data.

    - Benefactors can only delete from their own estate.
    - Admins can optionally delete from ALL estates (delete_from_all=true).
    """
    is_admin = current_user["role"] == "admin"
    if not is_admin:
        require_benefactor_role(current_user, "remove beneficiaries")

    ben = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0})
    if not ben:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    # Collect all beneficiary IDs to delete
    ids_to_delete = [beneficiary_id]
    # Collect affected estates BEFORE deletion for succession reorder
    affected_estates = set()
    affected_estates.add(ben.get("estate_id"))
    if is_admin and delete_from_all and ben.get("email"):
        all_bens = await db.beneficiaries.find(
            {"email": ben["email"], "id": {"$ne": beneficiary_id}},
            {"_id": 0, "id": 1, "estate_id": 1, "user_id": 1, "photo_url": 1},
        ).to_list(1000)
        ids_to_delete.extend([b["id"] for b in all_bens])
        for b in all_bens:
            if b.get("estate_id"):
                affected_estates.add(b["estate_id"])

    # Clean up each beneficiary record
    for bid in ids_to_delete:
        b = await db.beneficiaries.find_one({"id": bid}, {"_id": 0}) if bid != beneficiary_id else ben
        if not b:
            continue
        estate_id = b.get("estate_id")

        # 1. Delete beneficiary photo from S3
        if b.get("photo_url") and "beneficiaries/" in (b["photo_url"] or ""):
            try:
                from services.photo_storage import delete_photo

                photo_key = b["photo_url"]
                if "/" in photo_key:
                    photo_key = "/".join(photo_key.split("/")[-2:])
                await delete_photo(photo_key)
            except Exception as e:
                logger.warning(f"Failed to delete beneficiary photo: {e}")

        # 2. Remove from estate beneficiaries array
        if b.get("user_id") and estate_id:
            await db.estates.update_one(
                {"id": estate_id},
                {"$pull": {"beneficiaries": b["user_id"]}},
            )

        # 3. Unset primary_beneficiary_id if this was the primary
        if estate_id:
            await db.estates.update_one(
                {"id": estate_id, "primary_beneficiary_id": bid},
                {"$unset": {"primary_beneficiary_id": ""}},
            )

        # 4. Delete section permissions
        await db.section_permissions.delete_many({"beneficiary_id": bid})

        # 5. Remove from message recipients (don't delete messages — just pull this beneficiary)
        if estate_id:
            await db.messages.update_many(
                {"estate_id": estate_id, "recipients": bid},
                {"$pull": {"recipients": bid}},
            )
            # Also pull by user_id if the beneficiary had a linked user account
            if b.get("user_id"):
                await db.messages.update_many(
                    {"estate_id": estate_id, "recipients": b["user_id"]},
                    {"$pull": {"recipients": b["user_id"]}},
                )

        # 6. Unset digital wallet entries assigned to this beneficiary
        if estate_id:
            await db.digital_wallet.update_many(
                {"estate_id": estate_id, "assigned_beneficiary_id": bid},
                {"$set": {"assigned_beneficiary_id": None, "assigned_beneficiary_name": None}},
            )

        # 7. Clean up milestone deliveries for this beneficiary
        await db.milestone_deliveries.delete_many({"beneficiary_id": bid})

        # 8. Clean up beneficiary grace periods
        await db.beneficiary_grace_periods.delete_many({"beneficiary_id": bid})

        # 9. Clean up DTS tasks referencing this beneficiary
        if estate_id:
            ben_name = b.get("name", "")
            await db.dts_tasks.update_many(
                {"estate_id": estate_id, "beneficiary": ben_name},
                {"$set": {"beneficiary": None}},
            )
            await db.dts_tasks.update_many(
                {"estate_id": estate_id, "disclose_to": bid},
                {"$pull": {"disclose_to": bid}},
            )

        # 10. Clean up unread notifications for this beneficiary
        if b.get("user_id"):
            await db.notifications.delete_many({"user_id": b["user_id"], "read": False})

        # 11. Delete the beneficiary record
        await db.beneficiaries.delete_one({"id": bid})

        # 12. Log activity
        if estate_id:
            await log_activity(
                estate_id=estate_id,
                user_id=current_user["id"],
                user_name=current_user["name"],
                action="beneficiary_deleted",
                description=f"Permanently deleted beneficiary: {b.get('name', 'Unknown')}",
                metadata={"beneficiary_id": bid, "deleted_by": current_user["role"]},
            )

    # Re-order succession for affected estates
    for eid in affected_estates:
        if not eid:
            continue
        remaining = (
            await db.beneficiaries.find(
                {"estate_id": eid, "succession_order": {"$gte": 0}},
                {"_id": 0, "id": 1, "succession_order": 1},
            )
            .sort("succession_order", 1)
            .to_list(100)
        )
        for idx, r in enumerate(remaining):
            await db.beneficiaries.update_one({"id": r["id"]}, {"$set": {"succession_order": idx}})
        await update_estate_readiness(eid)

    return {
        "message": "Beneficiary permanently deleted",
        "deleted_count": len(ids_to_delete),
        "deleted_from_all": is_admin and delete_from_all,
    }


@router.put("/beneficiaries/{beneficiary_id}/set-primary")
async def set_primary_beneficiary(beneficiary_id: str, current_user: dict = Depends(get_current_user)):
    """Designate a beneficiary as the primary beneficiary (trustee) of the estate.
    Also sets them as succession_order=0 in the succession hierarchy."""
    require_benefactor_role(current_user, "designate a primary beneficiary")

    # Find the beneficiary to get their estate_id
    ben = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0, "id": 1, "estate_id": 1, "name": 1})
    if not ben:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    estate_id = ben["estate_id"]

    # Clear any existing primary designation for this estate
    await db.beneficiaries.update_many(
        {"estate_id": estate_id, "is_primary": True},
        {"$set": {"is_primary": False}},
    )

    # Set the new primary + succession_order = 0
    await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {"$set": {"is_primary": True, "succession_order": 0}},
    )

    # Ensure any other beneficiaries with succession_order 0 are bumped
    await db.beneficiaries.update_many(
        {"estate_id": estate_id, "id": {"$ne": beneficiary_id}, "succession_order": 0},
        {"$set": {"succession_order": None}},
    )

    return {
        "message": f"{ben.get('name', 'Beneficiary')} designated as primary beneficiary",
        "primary_beneficiary_id": beneficiary_id,
    }


@router.get("/beneficiaries/{estate_id}/primary")
async def get_primary_beneficiary(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get the primary beneficiary for an estate."""
    primary = await db.beneficiaries.find_one({"estate_id": estate_id, "is_primary": True}, {"_id": 0})
    return {"primary": primary}


# ===================== POST-TRANSITION BENEFICIARY ACCESS REQUESTS =====================


class BeneficiaryAccessRequest(BaseModel):
    estate_id: str
    message: str = ""


@router.post("/beneficiaries/request-access")
async def request_estate_access(data: BeneficiaryAccessRequest, current_user: dict = Depends(get_current_user)):
    """Request access to a transitioned estate. Requires primary beneficiary approval."""
    if current_user["role"] != "beneficiary":
        raise HTTPException(status_code=403, detail="Only beneficiaries can request access")

    estate = await db.estates.find_one({"id": data.estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Check if estate is transitioned
    if estate.get("status") != "transitioned":
        # If not transitioned, the request goes to the benefactor
        approver_id = estate["owner_id"]
        approver_type = "benefactor"
    else:
        # Post-transition: find the primary beneficiary
        primary = await db.beneficiaries.find_one(
            {"estate_id": data.estate_id, "is_primary": True},
            {"_id": 0, "id": 1, "user_id": 1, "name": 1},
        )
        if not primary or not primary.get("user_id"):
            raise HTTPException(
                status_code=400,
                detail="No primary beneficiary has been designated for this estate. Access cannot be granted.",
            )
        approver_id = primary["user_id"]
        approver_type = "primary_beneficiary"

    # Check for existing pending request
    existing = await db.access_requests.find_one(
        {
            "estate_id": data.estate_id,
            "requester_id": current_user["id"],
            "status": "pending",
        },
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending access request")

    request_doc = {
        "id": str(uuid.uuid4()),
        "estate_id": data.estate_id,
        "requester_id": current_user["id"],
        "requester_name": current_user.get("name", current_user.get("email", "")),
        "requester_email": current_user.get("email", ""),
        "approver_id": approver_id,
        "approver_type": approver_type,
        "message": data.message,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.access_requests.insert_one(request_doc)

    # Send notification to approver
    await send_push_notification(
        user_id=approver_id,
        title="New Beneficiary Access Request",
        body=f"{current_user.get('name', 'Someone')} is requesting access to the estate.",
        url="/beneficiaries",
    )

    return {
        "id": request_doc["id"],
        "status": "pending",
        "approver_type": approver_type,
        "message": "Your request has been submitted for approval.",
    }


@router.get("/beneficiaries/access-requests/{estate_id}")
async def get_access_requests(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get pending access requests for an estate. Only the approver can view these."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Check if user is authorized to view requests
    is_owner = estate.get("owner_id") == current_user["id"]
    is_primary = False
    if not is_owner:
        primary = await db.beneficiaries.find_one(
            {"estate_id": estate_id, "is_primary": True, "user_id": current_user["id"]},
            {"_id": 0},
        )
        is_primary = primary is not None

    if not is_owner and not is_primary and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view requests")

    requests = await db.access_requests.find({"estate_id": estate_id, "status": "pending"}, {"_id": 0}).to_list(100)
    return requests


class AccessRequestAction(BaseModel):
    action: str  # "approve" or "deny"


@router.put("/beneficiaries/access-requests/{request_id}")
async def handle_access_request(
    request_id: str,
    data: AccessRequestAction,
    current_user: dict = Depends(get_current_user),
):
    """Approve or deny a beneficiary access request."""
    if data.action not in ("approve", "deny"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'deny'")

    req = await db.access_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Verify current user is the approver
    if req["approver_id"] != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only the designated approver can act on this request",
        )

    await db.access_requests.update_one(
        {"id": request_id},
        {
            "$set": {
                "status": data.action + "d",  # "approved" or "denied"
                "acted_by": current_user["id"],
                "acted_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    if data.action == "approve":
        # Add requester as a beneficiary to the estate
        requester = await db.users.find_one({"id": req["requester_id"]}, {"_id": 0})
        if requester:
            # Add to estate beneficiaries array
            await db.estates.update_one(
                {"id": req["estate_id"]},
                {"$addToSet": {"beneficiaries": req["requester_id"]}},
            )

            # Create a beneficiary record if none exists
            existing_ben = await db.beneficiaries.find_one(
                {"estate_id": req["estate_id"], "user_id": req["requester_id"]},
                {"_id": 0},
            )
            if not existing_ben:
                name = requester.get("name", requester.get("email", ""))
                first_name = requester.get("first_name", name.split(" ")[0])
                last_name = requester.get("last_name", name.split(" ")[-1] if " " in name else "")
                from models import Beneficiary

                new_ben = Beneficiary(
                    estate_id=req["estate_id"],
                    user_id=req["requester_id"],
                    first_name=first_name,
                    last_name=last_name,
                    name=name,
                    relation="Other",
                    email=requester.get("email", ""),
                    invitation_status="accepted",
                    invitation_token=str(uuid.uuid4()),
                )
                await db.beneficiaries.insert_one(new_ben.model_dump())

            # Create 30-day grace period for the new beneficiary
            from datetime import timedelta

            grace_end = datetime.now(timezone.utc) + timedelta(days=30)
            await db.beneficiary_grace_periods.update_one(
                {"beneficiary_id": req["requester_id"]},
                {
                    "$set": {
                        "id": str(uuid.uuid4()),
                        "beneficiary_id": req["requester_id"],
                        "benefactor_id": (
                            await db.estates.find_one(
                                {"id": req["estate_id"]},
                                {"_id": 0, "id": 1, "owner_id": 1},
                            )
                        ).get("owner_id", ""),
                        "reason": "post_transition_approval",
                        "grace_starts_at": datetime.now(timezone.utc).isoformat(),
                        "grace_ends_at": grace_end.isoformat(),
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                },
                upsert=True,
            )

        # Notify requester
        await send_push_notification(
            user_id=req["requester_id"],
            title="Access Request Approved",
            body="Your request to access the estate has been approved. You have a 30-day grace period before subscription is required.",
            url="/dashboard",
        )
    else:
        # Notify requester of denial
        await send_push_notification(
            user_id=req["requester_id"],
            title="Access Request Denied",
            body="Your request to access the estate was not approved.",
            url="/dashboard",
        )

    return {
        "success": True,
        "action": data.action,
        "message": f"Request {data.action}d successfully",
    }


@router.put("/beneficiaries/{beneficiary_id}")
async def update_beneficiary(
    beneficiary_id: str,
    data: BeneficiaryCreate,
    current_user: dict = Depends(get_current_user),
):
    """Update an existing beneficiary"""
    require_benefactor_role(current_user, "update beneficiaries")

    beneficiary = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    # Build full name from parts
    name_parts = [data.first_name]
    if data.middle_name:
        name_parts.append(data.middle_name)
    name_parts.append(data.last_name)
    if data.suffix:
        name_parts.append(data.suffix)
    full_name = " ".join(name_parts)

    # Generate initials
    initials = (data.first_name[0] + data.last_name[0]).upper()

    update_data = {
        "first_name": data.first_name,
        "middle_name": data.middle_name,
        "last_name": data.last_name,
        "suffix": data.suffix,
        "name": full_name,
        "relation": data.relation,
        "email": data.email,
        "phone": data.phone,
        "date_of_birth": data.date_of_birth,
        "gender": data.gender,
        "address_street": data.address_street,
        "address_city": data.address_city,
        "address_state": data.address_state,
        "address_zip": data.address_zip,
        "ssn_last_four": data.ssn_last_four,
        "notes": data.notes,
        "avatar_color": data.avatar_color,
        "initials": initials,
        "is_stub": False,
        "mm_access": data.mm_access,
        "ega_access": data.ega_access,
        "sdv_access": data.sdv_access,
        "iac_access": data.iac_access,
        "ffn_access": data.ffn_access,
        "dav_access": data.dav_access,
        "dts_access": data.dts_access,
    }

    await db.beneficiaries.update_one({"id": beneficiary_id}, {"$set": update_data})

    # Detect email change — reset invitation to allow re-invite with new email
    old_email = (beneficiary.get("email") or "").lower().strip()
    new_email = (data.email or "").lower().strip()
    email_changed = old_email != new_email and new_email

    if email_changed and beneficiary.get("invitation_status") != "draft":
        new_token = str(uuid.uuid4())
        await db.beneficiaries.update_one(
            {"id": beneficiary_id},
            {
                "$set": {
                    "invitation_status": "pending",
                    "invitation_token": new_token,
                    "user_id": None,
                }
            },
        )
        # If a user with the new email already exists, pre-link
        existing_new_user = await db.users.find_one({"email": new_email}, {"_id": 0, "id": 1})
        if existing_new_user:
            await db.beneficiaries.update_one(
                {"id": beneficiary_id},
                {"$set": {"user_id": existing_new_user["id"]}},
            )

    # Detect which fields actually changed and log to edit_history
    changed_fields = [k for k in update_data if k not in ("initials",) and update_data[k] != beneficiary.get(k)]
    if changed_fields:
        await db.edit_history.insert_one(
            {
                "id": str(uuid.uuid4()),
                "item_type": "beneficiary",
                "item_id": beneficiary_id,
                "estate_id": beneficiary.get("estate_id", ""),
                "user_id": current_user["id"],
                "user_name": current_user.get("name", ""),
                "action": "edited",
                "changed_fields": changed_fields,
                "title": full_name,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    # Get updated beneficiary
    updated = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0})
    if updated and updated.get("photo_url"):
        updated["photo_url"] = resolve_photo_url(updated["photo_url"])
    # Signal to frontend that the email changed so it can prompt for re-invite
    if email_changed:
        updated["email_changed"] = True
    return updated


@router.post("/beneficiaries/{beneficiary_id}/photo")
async def upload_beneficiary_photo(
    beneficiary_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a profile photo for a beneficiary. Processes and stores in object storage."""
    from services.photo_storage import delete_photo, upload_photo

    if not is_benefactor_or_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    beneficiary = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    content_type = file.content_type or "image/jpeg"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        # Delete old photo from storage if it exists
        old_key = beneficiary.get("photo_url", "")
        if old_key and not old_key.startswith("data:"):
            await delete_photo(old_key)

        # Upload new photo (resized to 200x200 for beneficiary avatars)
        photo_url = await upload_photo(content, "beneficiaries", beneficiary_id, max_size=200)

        await db.beneficiaries.update_one(
            {"id": beneficiary_id},
            {
                "$set": {
                    "photo_url": photo_url,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

        return {"success": True, "photo_url": resolve_photo_url(photo_url)}

    except Exception as e:
        logger.error(f"Photo upload failed: {e}")
        raise HTTPException(
            status_code=400,
            detail="Could not process image. Please try a different file.",
        )


@router.delete("/beneficiaries/{beneficiary_id}/photo")
async def delete_beneficiary_photo(beneficiary_id: str, current_user: dict = Depends(get_current_user)):
    """Remove the profile photo for a beneficiary."""
    from services.photo_storage import delete_photo

    if not is_benefactor_or_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Delete from storage if it's a stored key
    ben = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0, "id": 1, "photo_url": 1})
    if ben:
        old_key = ben.get("photo_url", "")
        if old_key and not old_key.startswith("data:"):
            await delete_photo(old_key)

    await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {
            "$set": {
                "photo_url": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {"success": True}


@router.post("/beneficiaries/{beneficiary_id}/invite")
async def send_beneficiary_invitation(beneficiary_id: str, current_user: dict = Depends(get_current_user)):
    """Send invitation email to a beneficiary"""
    require_benefactor_role(current_user, "send invitations")

    beneficiary = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    if beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(status_code=400, detail="Beneficiary has already accepted the invitation")

    # Generate new token if needed
    invitation_token = beneficiary.get("invitation_token") or str(uuid.uuid4())

    # Get benefactor info for the email
    benefactor = current_user

    # Send invitation email
    try:
        if RESEND_API_KEY:
            # Get frontend URL for the invitation link
            frontend_url = os.environ.get("FRONTEND_URL", "https://carryon.us")
            invitation_link = f"{frontend_url}/accept-invitation/{invitation_token}"

            email_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #d4af37; margin: 0;">CarryOn™</h1>
                    <p style="color: #666;">Family Preparedness Platform</p>
                </div>

                <h2 style="color: #333;">Someone Special Is Thinking of You</h2>

                <p style="color: #555; line-height: 1.6;">
                    Dear {beneficiary["first_name"]},
                </p>

                <p style="color: #555; line-height: 1.6;">
                    {benefactor["name"]} has included you in their family preparedness plan on CarryOn™.
                    This means they've taken the time to make sure your family is ready for whatever life brings —
                    and they want you to be part of that plan.
                </p>

                <p style="color: #555; line-height: 1.6;">
                    <strong>What is CarryOn™?</strong><br>
                    CarryOn™ is a digital family preparedness platform that brings together important documents,
                    personal messages, action checklists, contingency protocols, and secure communication
                    channels — so families can stay organized, connected, and ready for life's transitions.
                </p>

                <p style="color: #555; line-height: 1.6;">
                    <strong>What should you do?</strong><br>
                    Click the button below to create your CarryOn™ account. This will allow you to:
                </p>

                <ul style="color: #555; line-height: 1.8;">
                    <li>View your connection to {benefactor["first_name"]}'s family plan</li>
                    <li>Receive important updates and notifications</li>
                    <li>Access documents, messages, and protocols when the time is right</li>
                </ul>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="{invitation_link}"
                       style="background: linear-gradient(135deg, #d4af37, #c5a028);
                              color: white;
                              padding: 14px 32px;
                              text-decoration: none;
                              border-radius: 8px;
                              font-weight: bold;
                              display: inline-block;">
                        Accept Invitation & Create Account
                    </a>
                </div>

                <p style="color: #888; font-size: 12px; line-height: 1.6;">
                    <strong>Note:</strong> There's nothing you need to do right now except create your account.
                    When the time comes, everything {benefactor["first_name"]} has prepared will be ready for you.
                </p>

                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

                <p style="color: #888; font-size: 12px; text-align: center;">
                    If you didn't expect this email or have questions, please contact {benefactor["name"]} directly.
                </p>
            </div>
            """

            resend.Emails.send(
                {
                    "from": SENDER_EMAIL,
                    "to": beneficiary["email"],
                    "subject": f"{benefactor['name']} has included you in their family plan on CarryOn™",
                    "html": email_html,
                }
            )
            logger.info(f"Invitation email sent to {beneficiary['email']}")
        else:
            logger.info(f"[DEV MODE] Invitation would be sent to {beneficiary['email']} with token {invitation_token}")
    except Exception as e:
        logger.error(f"Failed to send invitation email: {e}")
        # Don't fail the request, still update the status

    # Update beneficiary record
    await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {
            "$set": {
                "invitation_status": "sent",
                "invitation_token": invitation_token,
                "invitation_sent_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    # Log activity
    await log_activity(
        estate_id=beneficiary["estate_id"],
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="invitation_sent",
        description=f"Sent invitation to {beneficiary['name']} ({beneficiary['email']})",
        metadata={"beneficiary_id": beneficiary_id, "email": beneficiary["email"]},
    )

    return {"message": "Invitation sent successfully", "email": beneficiary["email"]}


@router.get("/invitations/{token}")
async def get_invitation_details(token: str):
    """Get invitation details for a beneficiary to accept"""
    beneficiary = await db.beneficiaries.find_one({"invitation_token": token}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")

    if beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(status_code=400, detail="This invitation has already been accepted")

    # Get estate info (limited)
    estate = await db.estates.find_one({"id": beneficiary["estate_id"]}, {"_id": 0})

    # Get benefactor info (limited)
    benefactor = None
    if estate:
        benefactor = await db.users.find_one({"id": estate.get("owner_id")}, {"_id": 0, "password": 0})

    return {
        "beneficiary": {
            "first_name": beneficiary["first_name"],
            "last_name": beneficiary["last_name"],
            "email": beneficiary["email"],
            "relation": beneficiary["relation"],
        },
        "benefactor_name": benefactor["name"] if benefactor else "Your benefactor",
    }


class AcceptInvitationRequest(BaseModel):
    token: str
    password: str
    phone: Optional[str] = None
    username: Optional[str] = None


@router.post("/invitations/accept")
async def accept_invitation(data: AcceptInvitationRequest):
    """Accept an invitation and create a beneficiary user account"""
    beneficiary = await db.beneficiaries.find_one({"invitation_token": data.token}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")

    if beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(status_code=400, detail="This invitation has already been accepted")

    # Check if email already has an account
    existing_user = await db.users.find_one({"email": beneficiary["email"].lower().strip()}, {"_id": 0})
    if existing_user:
        # Link existing account to this beneficiary record
        await db.beneficiaries.update_one(
            {"id": beneficiary["id"]},
            {"$set": {"user_id": existing_user["id"], "invitation_status": "accepted"}},
        )
        # Add to estate's beneficiary list
        await db.estates.update_one(
            {"id": beneficiary["estate_id"]},
            {"$addToSet": {"beneficiaries": existing_user["id"]}},
        )
        # Copy DOB and address from beneficiary record to user if not already set
        copy_fields = {}
        if beneficiary.get("date_of_birth") and not existing_user.get("date_of_birth"):
            copy_fields["date_of_birth"] = beneficiary["date_of_birth"]
        if beneficiary.get("address_street") and not existing_user.get("address_street"):
            copy_fields["address_street"] = beneficiary.get("address_street", "")
            copy_fields["address_city"] = beneficiary.get("address_city", "")
            copy_fields["address_state"] = beneficiary.get("address_state", "")
            copy_fields["address_zip"] = beneficiary.get("address_zip", "")
        if copy_fields:
            await db.users.update_one({"id": existing_user["id"]}, {"$set": copy_fields})

        # Sync beneficiary photo to user profile if user has no photo
        if beneficiary.get("photo_url") and not existing_user.get("photo_url"):
            await db.users.update_one(
                {"id": existing_user["id"]},
                {"$set": {"photo_url": beneficiary["photo_url"]}},
            )

        # Mark benefactor users as also being beneficiaries
        if existing_user.get("role") == "benefactor":
            await db.users.update_one(
                {"id": existing_user["id"]},
                {"$set": {"is_also_beneficiary": True}},
            )

        # If this estate has an active Founders Circle, grant free_access.
        await _grant_fc_free_access_if_applicable(beneficiary["estate_id"], existing_user["id"])

        # Generate token for auto-login
        token = create_token(existing_user["id"], existing_user["email"], existing_user["role"])
        return {
            "message": "Account linked successfully",
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": existing_user["id"],
                "email": existing_user["email"],
                "name": existing_user["name"],
                "role": existing_user["role"],
                "created_at": existing_user["created_at"],
            },
        }

    # Create new user account
    user_id = str(uuid.uuid4())
    full_name = " ".join(
        filter(
            None,
            [
                beneficiary["first_name"],
                beneficiary.get("middle_name"),
                beneficiary["last_name"],
                beneficiary.get("suffix"),
            ],
        )
    )

    # Generate or validate username
    if data.username:
        error = validate_username(data.username)
        if error:
            raise HTTPException(status_code=400, detail=error)
        username = data.username.strip()
        username_lower = username.lower()
        existing_username = await db.users.find_one({"username_lower": username_lower}, {"_id": 0, "id": 1})
        if existing_username:
            raise HTTPException(status_code=400, detail="That username is already taken. Please choose another.")
    else:
        username = await generate_unique_username(beneficiary["first_name"], beneficiary["last_name"])
        username_lower = username.lower()

    new_user = {
        "id": user_id,
        "email": beneficiary["email"].lower().strip(),
        "username": username,
        "username_lower": username_lower,
        "password": hash_password(data.password),
        "name": full_name,
        "first_name": beneficiary["first_name"],
        "middle_name": beneficiary.get("middle_name"),
        "last_name": beneficiary["last_name"],
        "suffix": beneficiary.get("suffix"),
        "gender": beneficiary.get("gender"),
        "date_of_birth": beneficiary.get("date_of_birth"),
        "phone": data.phone or beneficiary.get("phone"),
        "role": "beneficiary",
        "photo_url": beneficiary.get("photo_url", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(new_user)

    # Update beneficiary record
    await db.beneficiaries.update_one(
        {"id": beneficiary["id"]},
        {"$set": {"user_id": user_id, "invitation_status": "accepted"}},
    )

    # Add to estate's beneficiary list
    await db.estates.update_one({"id": beneficiary["estate_id"]}, {"$addToSet": {"beneficiaries": user_id}})

    # If this estate has an active Founders Circle, grant free_access.
    await _grant_fc_free_access_if_applicable(beneficiary["estate_id"], user_id)

    # Notify the benefactor that the invitation was accepted
    estate = await db.estates.find_one(
        {"id": beneficiary["estate_id"]},
        {"_id": 0, "id": 1, "user_id": 1, "owner_id": 1},
    )
    benefactor_id = (estate or {}).get("owner_id") or (estate or {}).get("user_id")
    if benefactor_id:
        asyncio.create_task(
            send_push_notification(
                benefactor_id,
                "Invitation Accepted",
                f"{full_name} has accepted your invitation and joined your family plan",
                "/beneficiaries",
                "invitation-accepted",
                "beneficiary",
            )
        )
        # In-app notification
        from services.notifications import notify

        asyncio.create_task(
            notify.benefactor(
                benefactor_id,
                "Beneficiary Joined Your Plan",
                f"{full_name} has accepted your invitation and is now part of your family plan.",
                url="/beneficiaries",
            )
        )

    # Generate token for auto-login
    token = create_token(user_id, beneficiary["email"], "beneficiary")

    return {
        "message": "Account created successfully",
        "access_token": token,
        "token_type": "bearer",
        "username": username,
        "user": {
            "id": user_id,
            "email": beneficiary["email"],
            "name": full_name,
            "role": "beneficiary",
            "created_at": new_user["created_at"],
        },
    }


class ReorderRequest(BaseModel):
    ordered_ids: list[str]


class LinkExistingAccountRequest(BaseModel):
    token: str
    username: str
    password: str


@router.post("/invitations/accept-existing")
async def accept_invitation_existing(data: LinkExistingAccountRequest):
    """Accept an invitation by linking to an existing CarryOn account via login."""
    beneficiary = await db.beneficiaries.find_one({"invitation_token": data.token}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")

    if beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(status_code=400, detail="This invitation has already been accepted")

    # Authenticate with existing credentials
    user = await db.users.find_one({"username_lower": data.username.lower().strip()}, {"_id": 0})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password. Please check your credentials.",
        )

    # Link the existing account to this beneficiary record
    await db.beneficiaries.update_one(
        {"id": beneficiary["id"]},
        {"$set": {"user_id": user["id"], "invitation_status": "accepted"}},
    )

    # Add to estate's beneficiary list
    await db.estates.update_one(
        {"id": beneficiary["estate_id"]},
        {"$addToSet": {"beneficiaries": user["id"]}},
    )

    # If this estate has an active Founders Circle, grant free_access.
    await _grant_fc_free_access_if_applicable(beneficiary["estate_id"], user["id"])

    # Copy DOB and address from beneficiary record to user if not already set
    copy_fields = {}
    if beneficiary.get("date_of_birth") and not user.get("date_of_birth"):
        copy_fields["date_of_birth"] = beneficiary["date_of_birth"]
    if beneficiary.get("address_street") and not user.get("address_street"):
        copy_fields["address_street"] = beneficiary.get("address_street", "")
        copy_fields["address_city"] = beneficiary.get("address_city", "")
        copy_fields["address_state"] = beneficiary.get("address_state", "")
        copy_fields["address_zip"] = beneficiary.get("address_zip", "")
    if copy_fields:
        await db.users.update_one({"id": user["id"]}, {"$set": copy_fields})

    # Sync beneficiary photo to user profile if user has no photo
    if beneficiary.get("photo_url") and not user.get("photo_url"):
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"photo_url": beneficiary["photo_url"]}},
        )

    # Mark benefactor users as also being beneficiaries
    if user.get("role") == "benefactor":
        await db.users.update_one({"id": user["id"]}, {"$set": {"is_also_beneficiary": True}})

    # Notify the benefactor
    full_name = user.get("name", "A family member")
    estate = await db.estates.find_one(
        {"id": beneficiary["estate_id"]},
        {"_id": 0, "id": 1, "user_id": 1, "owner_id": 1},
    )
    benefactor_id = (estate or {}).get("owner_id") or (estate or {}).get("user_id")
    if benefactor_id:
        asyncio.create_task(
            send_push_notification(
                benefactor_id,
                "Invitation Accepted",
                f"{full_name} has accepted your invitation and joined your family plan",
                "/beneficiaries",
                "invitation-accepted",
                "beneficiary",
            )
        )
        from services.notifications import notify

        asyncio.create_task(
            notify.benefactor(
                benefactor_id,
                "Beneficiary Joined Your Plan",
                f"{full_name} has accepted your invitation and is now part of your family plan.",
                url="/beneficiaries",
            )
        )

    # Generate token for auto-login
    auth_token = create_token(user["id"], user["email"], user["role"])
    return {
        "message": "Account linked successfully",
        "access_token": auth_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "created_at": user.get("created_at", ""),
        },
    }


@router.put("/beneficiaries/reorder/{estate_id}")
async def reorder_beneficiaries(
    estate_id: str,
    data: ReorderRequest,
    current_user: dict = Depends(get_current_user),
):
    """Persist drag-and-drop beneficiary sort order AND succession hierarchy.
    Only beneficiaries with succession_order != null participate in the chain.
    Position 0 = Primary, 1 = Secondary, 2 = Tertiary, etc."""
    if current_user["role"] not in ("benefactor", "admin") and not (
        current_user["role"] == "beneficiary"
        and (
            await db.users.find_one(
                {"id": current_user["id"]},
                {"_id": 0, "id": 1, "is_also_benefactor": 1},
            )
            or {}
        ).get("is_also_benefactor")
    ):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Fetch current succession participation status for each beneficiary
    all_bens = await db.beneficiaries.find(
        {"estate_id": estate_id, "id": {"$in": data.ordered_ids}, "deleted_at": None},
        {"_id": 0, "id": 1, "succession_order": 1},
    ).to_list(100)
    opted_out = {b["id"] for b in all_bens if b.get("succession_order") is None}

    succ_idx = 0
    for idx, ben_id in enumerate(data.ordered_ids):
        if ben_id in opted_out:
            # Opted out — keep sort_order for display but no succession
            await db.beneficiaries.update_one(
                {"id": ben_id, "estate_id": estate_id},
                {
                    "$set": {
                        "sort_order": idx,
                        "succession_order": None,
                        "is_primary": False,
                    }
                },
            )
        else:
            is_primary = succ_idx == 0
            await db.beneficiaries.update_one(
                {"id": ben_id, "estate_id": estate_id},
                {
                    "$set": {
                        "sort_order": idx,
                        "succession_order": succ_idx,
                        "is_primary": is_primary,
                    }
                },
            )
            succ_idx += 1
    return {"success": True}


@router.put("/beneficiaries/{beneficiary_id}/toggle-succession")
async def toggle_succession(beneficiary_id: str, current_user: dict = Depends(get_current_user)):
    """Toggle a beneficiary in/out of the succession hierarchy."""
    require_benefactor_role(current_user, "modify succession hierarchy")

    ben = await db.beneficiaries.find_one(
        {"id": beneficiary_id, "deleted_at": None},
        {
            "_id": 0,
            "id": 1,
            "estate_id": 1,
            "name": 1,
            "succession_order": 1,
            "is_primary": 1,
        },
    )
    if not ben:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    estate_id = ben["estate_id"]
    currently_in = ben.get("succession_order") is not None

    if currently_in:
        # Opt OUT — remove from succession chain
        was_primary = ben.get("is_primary", False)
        await db.beneficiaries.update_one(
            {"id": beneficiary_id},
            {"$set": {"succession_order": None, "is_primary": False}},
        )
        # Re-index remaining chain to close the gap
        remaining = await db.beneficiaries.find(
            {
                "estate_id": estate_id,
                "deleted_at": None,
                "succession_order": {"$ne": None},
                "id": {"$ne": beneficiary_id},
            },
            {"_id": 0, "id": 1, "succession_order": 1},
        ).to_list(100)
        remaining.sort(key=lambda b: b["succession_order"])
        for new_idx, b in enumerate(remaining):
            await db.beneficiaries.update_one(
                {"id": b["id"]},
                {"$set": {"succession_order": new_idx, "is_primary": new_idx == 0}},
            )
        return {"success": True, "in_succession": False, "was_primary": was_primary}
    else:
        # Opt IN — append to the end of the chain
        max_order = await db.beneficiaries.find(
            {
                "estate_id": estate_id,
                "deleted_at": None,
                "succession_order": {"$ne": None},
            },
            {"_id": 0, "id": 1, "succession_order": 1},
        ).to_list(100)
        next_order = max(b["succession_order"] for b in max_order) + 1 if max_order else 0
        is_primary = next_order == 0
        await db.beneficiaries.update_one(
            {"id": beneficiary_id},
            {"$set": {"succession_order": next_order, "is_primary": is_primary}},
        )
        return {"success": True, "in_succession": True, "is_primary": is_primary}


@router.get("/beneficiaries/{estate_id}/succession")
async def get_succession_order(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get the succession hierarchy for an estate, ordered by succession_order."""
    beneficiaries = await db.beneficiaries.find(
        {"estate_id": estate_id, "deleted_at": None},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "relation": 1,
            "succession_order": 1,
            "is_primary": 1,
        },
    ).to_list(100)
    # Sort: those with succession_order first (by order), then those without
    with_order = sorted(
        [b for b in beneficiaries if b.get("succession_order") is not None],
        key=lambda b: b["succession_order"],
    )
    without_order = [b for b in beneficiaries if b.get("succession_order") is None]
    return with_order + without_order


# ── Admin: Force-link a beneficiary to a user account ──────────────────────


class ForceLinkRequest(BaseModel):
    beneficiary_id: str
    username_or_email: str


@router.post("/beneficiaries/force-link")
async def force_link_beneficiary(data: ForceLinkRequest, current_user: dict = Depends(get_current_user)):
    """Admin-only: manually link a beneficiary record to a user account by username or email."""
    if current_user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Only admins can force-link beneficiaries.")

    # Find the beneficiary record
    ben = await db.beneficiaries.find_one({"id": data.beneficiary_id}, {"_id": 0})
    if not ben:
        raise HTTPException(status_code=404, detail="Beneficiary record not found.")

    # Find the user by username or email (case-insensitive)
    identifier = data.username_or_email.strip().lower()
    target_user = await db.users.find_one({"username_lower": identifier}, {"_id": 0})
    if not target_user:
        target_user = await db.users.find_one(
            {"email": {"$regex": f"^{identifier}$", "$options": "i"}},
            {"_id": 0},
        )
    if not target_user:
        raise HTTPException(status_code=404, detail=f"No user found with username or email '{data.username_or_email}'.")

    target_id = target_user["id"]

    # Link the beneficiary record
    await db.beneficiaries.update_one(
        {"id": data.beneficiary_id},
        {"$set": {"user_id": target_id, "invitation_status": "accepted"}},
    )

    # Add user to estate's beneficiaries array
    if ben.get("estate_id"):
        await db.estates.update_one(
            {"id": ben["estate_id"]},
            {"$addToSet": {"beneficiaries": target_id}},
        )

    # Set is_also_beneficiary if user is a benefactor
    if target_user.get("role") == "benefactor":
        await db.users.update_one(
            {"id": target_id},
            {"$set": {"is_also_beneficiary": True}},
        )

    logger.info(
        f"Admin {current_user['id']} force-linked beneficiary {data.beneficiary_id} "
        f"to user {target_id} ({target_user.get('username', target_user.get('email'))})"
    )

    return {
        "message": f"Successfully linked {ben.get('name', 'beneficiary')} to user {target_user.get('name', target_user.get('username'))}.",
        "beneficiary_id": data.beneficiary_id,
        "user_id": target_id,
        "user_name": target_user.get("name"),
        "user_email": target_user.get("email"),
    }
