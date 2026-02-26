"""CarryOn™ Backend — Beneficiary Routes"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status, Response, Form
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from config import db, logger
from utils import get_current_user, encrypt_data, decrypt_data, hash_password, verify_password, create_token, generate_otp, generate_backup_code, send_otp_email, send_otp_sms, log_activity, send_push_notification, send_push_to_all_admins
import uuid
import os
import asyncio
import base64
import json as json_module
import random

router = APIRouter()

import resend
from config import RESEND_API_KEY, SENDER_EMAIL
# ===================== BENEFICIARY ROUTES =====================

@router.get("/beneficiaries/{estate_id}")
async def get_beneficiaries(estate_id: str, current_user: dict = Depends(get_current_user)):
    beneficiaries = await db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
    return beneficiaries

@router.post("/beneficiaries")
async def create_beneficiary(data: BeneficiaryCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can add beneficiaries")
    
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
        invitation_status="pending"
    )
    await db.beneficiaries.insert_one(beneficiary.model_dump())
    
    # Add to estate's beneficiary list if user exists
    existing_user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing_user:
        await db.estates.update_one(
            {"id": data.estate_id},
            {"$addToSet": {"beneficiaries": existing_user["id"]}}
        )
        # Mark as accepted if they already have an account
        await db.beneficiaries.update_one(
            {"id": beneficiary.id},
            {"$set": {"user_id": existing_user["id"], "invitation_status": "accepted"}}
        )
        beneficiary.user_id = existing_user["id"]
        beneficiary.invitation_status = "accepted"
    
    # Log activity
    await log_activity(
        estate_id=data.estate_id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="beneficiary_added",
        description=f"Added beneficiary: {full_name} ({data.relation})",
        metadata={"beneficiary_name": full_name, "relation": data.relation}
    )
    
    # Recalculate estate readiness (beneficiaries affect message score)
    await update_estate_readiness(data.estate_id)
    
    return beneficiary

@router.delete("/beneficiaries/{beneficiary_id}")
async def delete_beneficiary(beneficiary_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can remove beneficiaries")
    
    result = await db.beneficiaries.delete_one({"id": beneficiary_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Beneficiary not found")
    
    return {"message": "Beneficiary removed"}

@router.put("/beneficiaries/{beneficiary_id}")
async def update_beneficiary(beneficiary_id: str, data: BeneficiaryCreate, current_user: dict = Depends(get_current_user)):
    """Update an existing beneficiary"""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can update beneficiaries")
    
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
    }
    
    await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {"$set": update_data}
    )
    
    # Get updated beneficiary
    updated = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0})
    return updated

@router.post("/beneficiaries/{beneficiary_id}/invite")
async def send_beneficiary_invitation(beneficiary_id: str, current_user: dict = Depends(get_current_user)):
    """Send invitation email to a beneficiary"""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can send invitations")
    
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
            frontend_url = os.environ.get('FRONTEND_URL', 'https://estate-vault-3.preview.emergentagent.com')
            invitation_link = f"{frontend_url}/accept-invitation/{invitation_token}"
            
            email_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #d4af37; margin: 0;">CarryOn™</h1>
                    <p style="color: #666;">Secure Estate Planning</p>
                </div>
                
                <h2 style="color: #333;">You've Been Added to {benefactor['name']}'s Estate</h2>
                
                <p style="color: #555; line-height: 1.6;">
                    Dear {beneficiary['first_name']},
                </p>
                
                <p style="color: #555; line-height: 1.6;">
                    {benefactor['name']} has added you as a beneficiary on CarryOn™, a secure estate planning platform. 
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
                    <li>View your connection to {benefactor['first_name']}'s estate</li>
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
                    This invitation simply connects you to {benefactor['first_name']}'s CarryOn™ account for future reference.
                </p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                
                <p style="color: #888; font-size: 12px; text-align: center;">
                    If you didn't expect this email or have questions, please contact {benefactor['name']} directly.
                </p>
            </div>
            """
            
            resend.Emails.send({
                "from": SENDER_EMAIL,
                "to": beneficiary["email"],
                "subject": f"{benefactor['name']} has added you to their CarryOn™ Estate",
                "html": email_html
            })
            logger.info(f"Invitation email sent to {beneficiary['email']}")
        else:
            logger.info(f"[DEV MODE] Invitation would be sent to {beneficiary['email']} with token {invitation_token}")
    except Exception as e:
        logger.error(f"Failed to send invitation email: {e}")
        # Don't fail the request, still update the status
    
    # Update beneficiary record
    await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {"$set": {
            "invitation_status": "sent",
            "invitation_token": invitation_token,
            "invitation_sent_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Log activity
    estate = await db.estates.find_one({"id": beneficiary["estate_id"]}, {"_id": 0})
    await log_activity(
        estate_id=beneficiary["estate_id"],
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="invitation_sent",
        description=f"Sent invitation to {beneficiary['name']} ({beneficiary['email']})",
        metadata={"beneficiary_id": beneficiary_id, "email": beneficiary["email"]}
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
            "relation": beneficiary["relation"]
        },
        "benefactor_name": benefactor["name"] if benefactor else "Your benefactor"
    }

class AcceptInvitationRequest(BaseModel):
    token: str
    password: str
    phone: Optional[str] = None

@router.post("/invitations/accept")
async def accept_invitation(data: AcceptInvitationRequest):
    """Accept an invitation and create a beneficiary user account"""
    beneficiary = await db.beneficiaries.find_one({"invitation_token": data.token}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")
    
    if beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(status_code=400, detail="This invitation has already been accepted")
    
    # Check if email already has an account
    existing_user = await db.users.find_one({"email": beneficiary["email"]}, {"_id": 0})
    if existing_user:
        # Link existing account to this beneficiary record
        await db.beneficiaries.update_one(
            {"id": beneficiary["id"]},
            {"$set": {
                "user_id": existing_user["id"],
                "invitation_status": "accepted"
            }}
        )
        # Add to estate's beneficiary list
        await db.estates.update_one(
            {"id": beneficiary["estate_id"]},
            {"$addToSet": {"beneficiaries": existing_user["id"]}}
        )
        
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
                "created_at": existing_user["created_at"]
            }
        }
    
    # Create new user account
    user_id = str(uuid.uuid4())
    full_name = " ".join(filter(None, [
        beneficiary["first_name"],
        beneficiary.get("middle_name"),
        beneficiary["last_name"],
        beneficiary.get("suffix")
    ]))
    
    new_user = {
        "id": user_id,
        "email": beneficiary["email"],
        "password": hash_password(data.password),
        "name": full_name,
        "first_name": beneficiary["first_name"],
        "middle_name": beneficiary.get("middle_name"),
        "last_name": beneficiary["last_name"],
        "suffix": beneficiary.get("suffix"),
        "gender": beneficiary.get("gender"),
        "phone": data.phone or beneficiary.get("phone"),
        "role": "beneficiary",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(new_user)
    
    # Update beneficiary record
    await db.beneficiaries.update_one(
        {"id": beneficiary["id"]},
        {"$set": {
            "user_id": user_id,
            "invitation_status": "accepted"
        }}
    )
    
    # Add to estate's beneficiary list
    await db.estates.update_one(
        {"id": beneficiary["estate_id"]},
        {"$addToSet": {"beneficiaries": user_id}}
    )
    
    # Notify the benefactor that the invitation was accepted
    estate = await db.estates.find_one({"id": beneficiary["estate_id"]}, {"_id": 0, "user_id": 1})
    if estate:
        asyncio.create_task(send_push_notification(
            estate["user_id"],
            "Invitation Accepted",
            f"{full_name} has accepted your invitation and joined your estate plan",
            "/beneficiaries",
            "invitation-accepted",
            "beneficiary"
        ))
    
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
            "created_at": new_user["created_at"]
        }
    }


