"""Auth — Password management (change, forgot, reset, verify, forgot-username)."""

import random
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from config import db
from services.audit import get_client_ip, log_audit_event
from services.email import send_email
from utils import get_current_user, hash_password, send_otp_email, verify_password
from services.token_blacklist import revoke_all_user_tokens

from ._core import resolve_user_by_identifier, router


class VerifyPasswordRequest(BaseModel):
    email: str
    password: str


@router.post(
    "/auth/verify-password"
)  # pre-push-invariants: allow-public-mutation (password is the auth gate; used for step-up before settings)
async def verify_password_endpoint(data: VerifyPasswordRequest):
    """Verify account password without logging in. Used for sensitive settings changes."""
    user = await resolve_user_by_identifier(data.email)
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"verified": True}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/change-password")
async def change_password(
    data: ChangePasswordRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Change the current user's password."""
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "password": 1})
    if not user_doc or not verify_password(data.current_password, user_doc["password"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    new_hash = hash_password(data.new_password)
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"password": new_hash}})

    await revoke_all_user_tokens(current_user["id"])
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {"active_session_id": "", "last_login_at": ""}},
    )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user["role"],
        action="password_change",
        category="auth",
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {"message": "Password changed successfully"}


class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    username: str
    otp: str
    new_password: str


@router.post(
    "/auth/forgot-password"
)  # pre-push-invariants: allow-public-mutation (account recovery; user is locked out by definition)
async def forgot_password(data: ForgotPasswordRequest):
    """Send a password reset OTP. User can enter their username OR email
    (auto-generated usernames like ``admin_5dfa64`` are easy to forget, so
    we resolve by either identifier)."""
    identifier = data.username.strip()
    user = await resolve_user_by_identifier(identifier)
    if not user:
        return {"message": "If that account exists, a reset code has been sent."}

    otp = f"{random.randint(0, 999999):06d}"
    await db.otp_codes.insert_one(
        {
            "user_id": user["id"],
            "code": otp,
            "purpose": "password_reset",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        }
    )
    first_name = (user.get("name") or "").split()[0] or "there"
    await send_otp_email(user["email"], otp, first_name)
    return {"message": "If that account exists, a reset code has been sent."}


@router.post("/auth/reset-password")  # pre-push-invariants: allow-public-mutation (reset OTP is the auth gate)
async def reset_password(data: ResetPasswordRequest):
    """Verify OTP and set new password. Accepts username OR email as the
    identifier so the request matches whatever the user entered in step 1."""
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = await resolve_user_by_identifier(data.username)
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    otp_doc = await db.otp_codes.find_one(
        {"user_id": user["id"], "code": data.otp, "purpose": "password_reset"},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not otp_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    try:
        expires = datetime.fromisoformat(otp_doc["expires_at"].replace("Z", "+00:00"))
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid reset code")

    await db.users.update_one({"id": user["id"]}, {"$set": {"password": hash_password(data.new_password)}})
    await db.otp_codes.delete_many({"user_id": user["id"], "purpose": "password_reset"})
    return {"message": "Password reset successfully. You can now log in with your new password."}


@router.post(
    "/auth/forgot-username"
)  # pre-push-invariants: allow-public-mutation (username recovery; user is locked out by definition)
async def forgot_username(data: dict):
    """Send the user their username(s) associated with an email address."""
    email = (data.get("email") or "").lower().strip()
    if not email:
        return {"message": "If that email exists, your username(s) have been sent."}

    users = await db.users.find({"email": email}, {"_id": 0, "username": 1, "name": 1, "id": 1}).to_list(10)
    if users:
        usernames = [u.get("username", "unknown") for u in users]
        names = [u.get("name", "") for u in users]
        username_list = "\n".join(f"  - {n}: {u}" for n, u in zip(names, usernames))
        await send_email(
            to=email,
            subject="Your CarryOn Username(s)",
            html=f"""
            <p>Hi,</p>
            <p>You requested your CarryOn username(s). Here they are:</p>
            <pre>{username_list}</pre>
            <p>Use your username to log in at carryon.us</p>
            <p>— The CarryOn Team</p>
            """,
        )
    return {"message": "If that email exists, your username(s) have been sent."}
