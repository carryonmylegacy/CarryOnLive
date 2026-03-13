"""CarryOn™ Backend — Beneficiary Routes"""

import asyncio
import base64
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import resend
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from config import RESEND_API_KEY, SENDER_EMAIL, db, logger
from guards import is_benefactor_or_admin, require_benefactor_role
from models import Beneficiary, BeneficiaryCreate
from utils import (
    create_token,
    get_current_user,
    hash_password,
    log_activity,
    send_push_notification,
    update_estate_readiness,
)

router = APIRouter()

# ===================== BENEFICIARY ROUTES =====================


@router.get("/beneficiaries/{estate_id}")
async def get_beneficiaries(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
    """List all beneficiaries for an estate, sorted by sort_order."""
    beneficiaries = await db.beneficiaries.find(
        {"estate_id": estate_id, "deleted_at": None}, {"_id": 0}
    ).to_list(100)
    # Normalize dob → date_of_birth for legacy records
    for b in beneficiaries:
        if "dob" in b and "date_of_birth" not in b:
            b["date_of_birth"] = b.pop("dob")

    # Enrich photo_url: if the beneficiary has a linked user account with a profile
    # photo but no photo on the beneficiary record, use the user's photo as fallback
    user_ids = [b["user_id"] for b in beneficiaries if b.get("user_id") and not b.get("photo_url")]
    if user_ids:
        users_with_photos = {}
        async for u in db.users.find(
            {"id": {"$in": user_ids}, "photo_url": {"$exists": True, "$nin": [None, ""]}},
            {"_id": 0, "id": 1, "photo_url": 1},
        ):
            users_with_photos[u["id"]] = u["photo_url"]
        for b in beneficiaries:
            if not b.get("photo_url") and b.get("user_id") in users_with_photos:
                b["photo_url"] = users_with_photos[b["user_id"]]

    # Sort by sort_order (fallback to created_at for records without sort_order)
    beneficiaries.sort(
        key=lambda b: (b.get("sort_order", 999), b.get("created_at", ""))
    )
    return beneficiaries


@router.post("/beneficiaries")
async def create_beneficiary(
    data: BeneficiaryCreate, current_user: dict = Depends(get_current_user)
):
    """Add a new beneficiary to the estate."""
    require_benefactor_role(current_user, "add beneficiaries")

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
        email=data.email,
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

    # If a user with this email already exists, pre-link user_id
    # but do NOT auto-accept the invitation — let the benefactor manage it normally
    existing_user = await db.users.find_one(
        {"email": data.email.lower().strip()}, {"_id": 0}
    )
    if existing_user:
        await db.beneficiaries.update_one(
            {"id": beneficiary.id},
            {"$set": {"user_id": existing_user["id"]}},
        )
        beneficiary.user_id = existing_user["id"]

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

    return beneficiary


@router.delete("/beneficiaries/{beneficiary_id}")
async def delete_beneficiary(
    beneficiary_id: str, current_user: dict = Depends(get_current_user)
):
    """Remove a beneficiary from the estate."""
    require_benefactor_role(current_user, "remove beneficiaries")

    result = await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )  # soft_delete
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    return {"message": "Beneficiary removed"}


@router.put("/beneficiaries/{beneficiary_id}/set-primary")
async def set_primary_beneficiary(
    beneficiary_id: str, current_user: dict = Depends(get_current_user)
):
    """Designate a beneficiary as the primary beneficiary (trustee) of the estate."""
    require_benefactor_role(current_user, "designate a primary beneficiary")

    # Find the beneficiary to get their estate_id
    ben = await db.beneficiaries.find_one(
        {"id": beneficiary_id}, {"_id": 0, "estate_id": 1, "name": 1}
    )
    if not ben:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    estate_id = ben["estate_id"]

    # Clear any existing primary designation for this estate
    await db.beneficiaries.update_many(
        {"estate_id": estate_id, "is_primary": True},
        {"$set": {"is_primary": False}},
    )

    # Set the new primary
    await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {"$set": {"is_primary": True}},
    )

    return {
        "message": f"{ben.get('name', 'Beneficiary')} designated as primary beneficiary",
        "primary_beneficiary_id": beneficiary_id,
    }


@router.get("/beneficiaries/{estate_id}/primary")
async def get_primary_beneficiary(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
    """Get the primary beneficiary for an estate."""
    primary = await db.beneficiaries.find_one(
        {"estate_id": estate_id, "is_primary": True}, {"_id": 0}
    )
    return {"primary": primary}


# ===================== POST-TRANSITION BENEFICIARY ACCESS REQUESTS =====================


class BeneficiaryAccessRequest(BaseModel):
    estate_id: str
    message: str = ""


@router.post("/beneficiaries/request-access")
async def request_estate_access(
    data: BeneficiaryAccessRequest, current_user: dict = Depends(get_current_user)
):
    """Request access to a transitioned estate. Requires primary beneficiary approval."""
    if current_user["role"] != "beneficiary":
        raise HTTPException(
            status_code=403, detail="Only beneficiaries can request access"
        )

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
            {"_id": 0, "user_id": 1, "name": 1},
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
        raise HTTPException(
            status_code=400, detail="You already have a pending access request"
        )

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
async def get_access_requests(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
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

    requests = await db.access_requests.find(
        {"estate_id": estate_id, "status": "pending"}, {"_id": 0}
    ).to_list(100)
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
        raise HTTPException(
            status_code=400, detail="Action must be 'approve' or 'deny'"
        )

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
                last_name = requester.get(
                    "last_name", name.split(" ")[-1] if " " in name else ""
                )
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
                                {"id": req["estate_id"]}, {"_id": 0, "owner_id": 1}
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
    }

    await db.beneficiaries.update_one({"id": beneficiary_id}, {"$set": update_data})

    # Detect which fields actually changed and log to edit_history
    changed_fields = [
        k
        for k in update_data
        if k not in ("initials",) and update_data[k] != beneficiary.get(k)
    ]
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
    return updated


@router.post("/beneficiaries/{beneficiary_id}/photo")
async def upload_beneficiary_photo(
    beneficiary_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a profile photo for a beneficiary. Resizes to 200x200 and stores as base64."""
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
        import io

        from PIL import Image

        img = Image.open(io.BytesIO(content))

        # Convert to RGB if necessary (handles RGBA, P mode, etc.)
        if img.mode in ("RGBA", "P", "LA"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Crop to square (center crop)
        w, h = img.size
        size = min(w, h)
        left = (w - size) // 2
        top = (h - size) // 2
        img = img.crop((left, top, left + size, top + size))

        # Resize to 200x200
        img = img.resize((200, 200), Image.LANCZOS)

        # Save as JPEG base64
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        photo_url = f"data:image/jpeg;base64,{b64}"

        await db.beneficiaries.update_one(
            {"id": beneficiary_id},
            {
                "$set": {
                    "photo_url": photo_url,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

        return {"success": True, "photo_url": photo_url}

    except Exception as e:
        logger.error(f"Photo upload failed: {e}")
        raise HTTPException(
            status_code=400,
            detail="Could not process image. Please try a different file.",
        )


@router.delete("/beneficiaries/{beneficiary_id}/photo")
async def delete_beneficiary_photo(
    beneficiary_id: str, current_user: dict = Depends(get_current_user)
):
    """Remove the profile photo for a beneficiary."""
    if not is_benefactor_or_admin(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

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
async def send_beneficiary_invitation(
    beneficiary_id: str, current_user: dict = Depends(get_current_user)
):
    """Send invitation email to a beneficiary"""
    require_benefactor_role(current_user, "send invitations")

    beneficiary = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    if beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(
            status_code=400, detail="Beneficiary has already accepted the invitation"
        )

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
                    <p style="color: #666;">Secure Estate Planning</p>
                </div>

                <h2 style="color: #333;">You've Been Added to {benefactor["name"]}'s Estate</h2>

                <p style="color: #555; line-height: 1.6;">
                    Dear {beneficiary["first_name"]},
                </p>

                <p style="color: #555; line-height: 1.6;">
                    {benefactor["name"]} has added you as a beneficiary on CarryOn™, a secure estate planning platform.
                    This means they've chosen you to be part of their legacy planning.
                </p>

                <p style="color: #555; line-height: 1.6;">
                    <strong>What is CarryOn™?</strong><br>
                    CarryOn™ helps families prepare for life's transitions by securely storing important documents,
                    messages, and instructions that can be shared with loved ones at the appropriate time.
                </p>

                <p style="color: #555; line-height: 1.6;">
                    <strong>What should you do?</strong><br>
                    Click the button below to create your CarryOn™ account. This will allow you to:
                </p>

                <ul style="color: #555; line-height: 1.8;">
                    <li>View your connection to {benefactor["first_name"]}'s estate</li>
                    <li>Receive important updates and notifications</li>
                    <li>Access documents and messages when the time is right</li>
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
                    <strong>Note:</strong> At this time, you will not have access to any specific details about the estate.
                    This invitation simply connects you to {benefactor["first_name"]}'s CarryOn™ account for future reference.
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
                    "subject": f"{benefactor['name']} has added you to their CarryOn™ Estate",
                    "html": email_html,
                }
            )
            logger.info(f"Invitation email sent to {beneficiary['email']}")
        else:
            logger.info(
                f"[DEV MODE] Invitation would be sent to {beneficiary['email']} with token {invitation_token}"
            )
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
    beneficiary = await db.beneficiaries.find_one(
        {"invitation_token": token}, {"_id": 0}
    )
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")

    if beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(
            status_code=400, detail="This invitation has already been accepted"
        )

    # Get estate info (limited)
    estate = await db.estates.find_one({"id": beneficiary["estate_id"]}, {"_id": 0})

    # Get benefactor info (limited)
    benefactor = None
    if estate:
        benefactor = await db.users.find_one(
            {"id": estate.get("owner_id")}, {"_id": 0, "password": 0}
        )

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


@router.post("/invitations/accept")
async def accept_invitation(data: AcceptInvitationRequest):
    """Accept an invitation and create a beneficiary user account"""
    beneficiary = await db.beneficiaries.find_one(
        {"invitation_token": data.token}, {"_id": 0}
    )
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")

    if beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(
            status_code=400, detail="This invitation has already been accepted"
        )

    # Check if email already has an account
    existing_user = await db.users.find_one(
        {"email": beneficiary["email"].lower().strip()}, {"_id": 0}
    )
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
        if beneficiary.get("address_street") and not existing_user.get(
            "address_street"
        ):
            copy_fields["address_street"] = beneficiary.get("address_street", "")
            copy_fields["address_city"] = beneficiary.get("address_city", "")
            copy_fields["address_state"] = beneficiary.get("address_state", "")
            copy_fields["address_zip"] = beneficiary.get("address_zip", "")
        if copy_fields:
            await db.users.update_one(
                {"id": existing_user["id"]}, {"$set": copy_fields}
            )

        # Sync beneficiary photo to user profile if user has no photo
        if beneficiary.get("photo_url") and not existing_user.get("photo_url"):
            await db.users.update_one(
                {"id": existing_user["id"]},
                {"$set": {"photo_url": beneficiary["photo_url"]}},
            )

        # Generate token for auto-login
        token = create_token(
            existing_user["id"], existing_user["email"], existing_user["role"]
        )
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

    new_user = {
        "id": user_id,
        "email": beneficiary["email"].lower().strip(),
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
    await db.estates.update_one(
        {"id": beneficiary["estate_id"]}, {"$addToSet": {"beneficiaries": user_id}}
    )

    # Notify the benefactor that the invitation was accepted
    estate = await db.estates.find_one(
        {"id": beneficiary["estate_id"]}, {"_id": 0, "user_id": 1, "owner_id": 1}
    )
    benefactor_id = (estate or {}).get("owner_id") or (estate or {}).get("user_id")
    if benefactor_id:
        asyncio.create_task(
            send_push_notification(
                benefactor_id,
                "Invitation Accepted",
                f"{full_name} has accepted your invitation and joined your estate plan",
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
                "Beneficiary Joined Your Estate",
                f"{full_name} has accepted your invitation and is now part of your estate plan.",
                url="/beneficiaries",
            )
        )

    # Generate token for auto-login
    token = create_token(user_id, beneficiary["email"], "beneficiary")

    return {
        "message": "Account created successfully",
        "access_token": token,
        "token_type": "bearer",
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


@router.put("/beneficiaries/reorder/{estate_id}")
async def reorder_beneficiaries(
    estate_id: str,
    data: ReorderRequest,
    current_user: dict = Depends(get_current_user),
):
    """Persist drag-and-drop beneficiary sort order."""
    if current_user["role"] not in ("benefactor", "admin") and not (
        current_user["role"] == "beneficiary"
        and (
            await db.users.find_one(
                {"id": current_user["id"]}, {"_id": 0, "is_also_benefactor": 1}
            )
            or {}
        ).get("is_also_benefactor")
    ):
        raise HTTPException(status_code=403, detail="Not authorized")

    for idx, ben_id in enumerate(data.ordered_ids):
        await db.beneficiaries.update_one(
            {"id": ben_id, "estate_id": estate_id},
            {"$set": {"sort_order": idx}},
        )
    return {"success": True}
