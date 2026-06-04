"""Beneficiaries — invitation flow (send, accept new account, accept existing, force-link)."""

from ._core import router, _grant_fc_free_access_if_applicable
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from config import RESEND_API_KEY, SENDER_EMAIL, db, logger
from guards import require_benefactor_role
from routes.auth import generate_unique_username, validate_username
from utils import (
    create_token,
    get_current_user,
    hash_password,
    verify_password,
    log_activity,
    send_push_notification,
)
import asyncio
import resend
import uuid
import os
from datetime import datetime, timezone
from typing import Optional


@router.post("/beneficiaries/{beneficiary_id}/invite")
async def send_beneficiary_invitation(beneficiary_id: str, current_user: dict = Depends(get_current_user)):
    """Send invitation email to a beneficiary"""
    await require_benefactor_role(current_user, "send invitations")

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


@router.post("/invitations/accept")  # pre-push-invariants: allow-public-mutation (invitation token is the auth gate)
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


@router.post(
    "/invitations/accept-existing"
)  # pre-push-invariants: allow-public-mutation (invitation token + existing-account login are the auth gate)
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
