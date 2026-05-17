"""Beneficiaries — core CRUD management (get, create, delete, update, photos)."""

from ._core import router
from fastapi import Depends, File, HTTPException, Request, UploadFile
from config import db, logger
from guards import is_benefactor_or_admin, require_benefactor_role, require_estate_member, require_estate_owner
from models import Beneficiary, BeneficiaryCreate
from utils import (
    get_current_user,
    log_activity,
    update_estate_readiness,
)
from services.photo_urls import resolve_photo_url
from services.audit import log_audit_event, get_client_ip
import asyncio
import uuid
from datetime import datetime, timezone


@router.get("/beneficiaries/{estate_id}")
async def get_beneficiaries(estate_id: str, request: Request = None, current_user: dict = Depends(get_current_user)):
    """List all beneficiaries for an estate, sorted by sort_order."""
    # IDOR guard — reject any caller who isn't the owner/beneficiary/admin
    await require_estate_member(estate_id, current_user)
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
    # Generate initials — slice-safe (defense-in-depth alongside Pydantic min_length=1).
    initials = ((data.first_name[:1] or "?") + (data.last_name[:1] or "?")).upper()

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
        # CCP emergency-readiness fields (carry through on create as well as update)
        medical_conditions=data.medical_conditions,
        allergies=data.allergies,
        prescriptions=data.prescriptions,
        blood_type=data.blood_type,
        primary_doctor=data.primary_doctor,
        school_or_employer=data.school_or_employer,
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

    # IDOR guard — only the estate owner (or admin) can delete a beneficiary
    if not is_admin:
        await require_estate_owner(ben.get("estate_id"), current_user)

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

    # IDOR guard — only the estate owner (or admin) can edit a beneficiary
    await require_estate_owner(beneficiary.get("estate_id"), current_user)

    # Build full name from parts
    name_parts = [data.first_name]
    if data.middle_name:
        name_parts.append(data.middle_name)
    name_parts.append(data.last_name)
    if data.suffix:
        name_parts.append(data.suffix)
    full_name = " ".join(name_parts)

    # Generate initials
    # Generate initials — slice-safe (defense-in-depth alongside Pydantic min_length=1).
    initials = ((data.first_name[:1] or "?") + (data.last_name[:1] or "?")).upper()

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
        # CCP / emergency-readiness fields (so the Household Roster picker can
        # pull these straight off the beneficiary record).
        "medical_conditions": data.medical_conditions,
        "allergies": data.allergies,
        "prescriptions": data.prescriptions,
        "blood_type": data.blood_type,
        "primary_doctor": data.primary_doctor,
        "school_or_employer": data.school_or_employer,
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

    # IDOR guard — only the estate owner (or admin) can change a beneficiary photo
    await require_estate_owner(beneficiary.get("estate_id"), current_user)

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
    ben = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0, "id": 1, "estate_id": 1, "photo_url": 1})
    if not ben:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    # IDOR guard — only the estate owner (or admin) can delete a beneficiary photo
    await require_estate_owner(ben.get("estate_id"), current_user)

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
