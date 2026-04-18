"""Auth — SMS OTP setup, verification, and management."""

import re
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from pydantic import BaseModel

from config import db
from services.audit import log_audit_event
from utils import generate_otp, get_current_user, send_otp_sms

from ._core import router


class SMSOTPSetupRequest(BaseModel):
    phone_number: str
    sms_consent: bool = False


@router.post("/auth/sms-otp-setup")
async def sms_otp_setup(data: SMSOTPSetupRequest, current_user: dict = Depends(get_current_user)):
    """Send a verification OTP to the user's phone number to set up SMS 2FA."""
    phone = re.sub(r"[^\d+]", "", data.phone_number.strip())
    if not phone.startswith("+"):
        phone = f"+1{phone}"
    if len(phone) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    if not data.sms_consent:
        raise HTTPException(status_code=400, detail="You must consent to receive SMS verification codes")

    otp_code = generate_otp()
    await db.sms_otp_verifications.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "phone_number": phone,
                "otp": otp_code,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "verified": False,
            }
        },
        upsert=True,
    )

    sms_sent = await send_otp_sms(phone, otp_code)
    if not sms_sent:
        raise HTTPException(status_code=500, detail="Failed to send SMS. Please check your phone number and try again.")

    masked = f"***-***-{phone[-4:]}" if len(phone) >= 4 else "***"
    return {"message": f"Verification code sent to {masked}", "masked_phone": masked}


class SMSOTPVerifyRequest(BaseModel):
    otp: str


@router.post("/auth/sms-otp-verify")
async def sms_otp_verify(data: SMSOTPVerifyRequest, current_user: dict = Depends(get_current_user)):
    """Verify the phone number OTP and enable SMS 2FA."""
    record = await db.sms_otp_verifications.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=400, detail="No pending phone verification. Please start setup again.")

    created = datetime.fromisoformat(record["created_at"])
    if datetime.now(timezone.utc) - created > timedelta(minutes=10):
        raise HTTPException(status_code=400, detail="Verification code expired. Please request a new one.")

    if record["otp"] != data.otp:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {
                "sms_otp_enabled": True,
                "sms_phone_number": record["phone_number"],
                "sms_otp_setup_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    await db.sms_otp_verifications.delete_one({"user_id": current_user["id"]})

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user["role"],
        action="sms_otp_enabled",
        category="auth",
        details={"phone_last4": record["phone_number"][-4:]},
    )
    return {"message": "SMS verification enabled successfully", "sms_otp_enabled": True}


@router.delete("/auth/sms-otp")
async def sms_otp_disable(current_user: dict = Depends(get_current_user)):
    """Disable SMS 2FA and remove phone number."""
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {"sms_otp_enabled": "", "sms_phone_number": "", "sms_otp_setup_at": ""}},
    )
    await db.sms_otp_verifications.delete_many({"user_id": current_user["id"]})

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user["role"],
        action="sms_otp_disabled",
        category="auth",
        details={},
    )
    return {"message": "SMS verification disabled", "sms_otp_enabled": False}


@router.get("/auth/sms-otp-status")
async def sms_otp_status(current_user: dict = Depends(get_current_user)):
    """Get the current SMS OTP status for the user."""
    user = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "id": 1, "sms_otp_enabled": 1, "sms_phone_number": 1}
    )
    enabled = user.get("sms_otp_enabled", False) if user else False
    phone = user.get("sms_phone_number", "") if user else ""
    masked = f"***-***-{phone[-4:]}" if phone and len(phone) >= 4 else None
    return {"sms_otp_enabled": enabled, "masked_phone": masked}
