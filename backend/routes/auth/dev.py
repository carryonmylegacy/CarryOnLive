"""Auth — Dev/admin endpoints (gated by ALLOW_DEV_ENDPOINTS env var)
and admin utility endpoints (username migration notification).
"""

import os

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from config import db, logger
from models import TokenResponse, UserLogin
from services.email import send_email
from utils import decode_token, get_current_user, verify_password

from ._core import (
    _user_response,
    create_dev_session_token,
    resolve_user_by_identifier,
    router,
)


class DevSwitchRequest(BaseModel):
    email: str


@router.post(
    "/auth/dev-login"
)  # pre-push-invariants: allow-public-mutation (gated by ALLOW_DEV_ENDPOINTS + admin-token check inside)
async def dev_login(data: UserLogin, request: Request):
    """Admin impersonation — only available when ALLOW_DEV_ENDPOINTS=true."""
    if not os.environ.get("ALLOW_DEV_ENDPOINTS", "").lower() == "true":
        raise HTTPException(status_code=404, detail="Not found")

    user = await resolve_user_by_identifier(data.email)
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.get("role") != "admin":
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=403, detail="Admin authorization required for impersonation")
        try:
            token_str = auth_header.split(" ")[1]
            payload = decode_token(token_str)
            caller = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
            if not caller or caller.get("role") != "admin":
                raise HTTPException(status_code=403, detail="Only admins can impersonate users")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=403, detail="Invalid admin token for impersonation")

    token = await create_dev_session_token(user["id"], user["email"], user["role"])
    _owns = bool(await db.estates.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1}))
    return TokenResponse(
        access_token=token,
        user=_user_response(user, owns_estate=_owns),
    )


@router.post("/auth/dev-switch")  # pre-push-invariants: allow-public-mutation (admin/founder token decoded inside)
async def dev_switch(data: DevSwitchRequest, request: Request):
    """Portal switcher — founder production feature for switching between configured portals.
    Does NOT require ALLOW_DEV_ENDPOINTS (unlike dev-login impersonation).
    Only admin/founder or pre-configured accounts can call this."""

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=403, detail="Authentication required")
    try:
        token_str = auth_header.split(" ")[1]
        payload = decode_token(token_str)
        caller = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0, "id": 1, "email": 1, "role": 1})
        if not caller:
            raise HTTPException(status_code=401, detail="User not found")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    config = await db.dev_config.find_one({"id": "dev_switcher"}, {"_id": 0})
    if not config or not config.get("enabled", True):
        raise HTTPException(status_code=404, detail="Dev switcher not configured")

    configured_emails = {config.get("benefactor_email", ""), config.get("beneficiary_email", "")}
    configured_emails.discard("")

    is_admin = caller.get("role") == "admin"
    is_configured_account = caller.get("email") in configured_emails
    if not is_admin and not is_configured_account:
        raise HTTPException(status_code=403, detail="Only admins or configured dev accounts can use portal switcher")

    stored_password = None
    if config.get("benefactor_email") == data.email:
        stored_password = config.get("benefactor_password")
    if not stored_password and config.get("beneficiary_email") == data.email:
        stored_password = config.get("beneficiary_password")

    if not stored_password:
        raise HTTPException(status_code=400, detail="Email not configured in dev switcher")

    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(stored_password, user["password"]):
        raise HTTPException(status_code=401, detail="Stored password is incorrect. Update it in Admin → Dev Switcher.")

    token = await create_dev_session_token(user["id"], user["email"], user["role"])
    _owns = bool(await db.estates.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1}))
    return TokenResponse(
        access_token=token,
        user=_user_response(user, owns_estate=_owns),
    )


@router.post("/auth/notify-username-migration")
async def notify_username_migration(current_user: dict = Depends(get_current_user)):
    """Admin-only: Send username migration notification emails."""
    if current_user.get("role") not in ("admin",) and current_user.get("operator_role") != "founder":
        raise HTTPException(status_code=403, detail="Admin access required")

    users = await db.users.find(
        {"needs_username_review": True},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "username": 1},
    ).to_list(10000)

    sent_count = 0
    for u in users:
        try:
            first_name = (u.get("name") or "there").split()[0]
            await send_email(
                to=u["email"],
                subject="CarryOn Update: Your New Username",
                html=f"""
                <p>Hi {first_name},</p>
                <p>CarryOn now uses <strong>usernames</strong> for signing in instead of email addresses.
                This means family members can share an email while each having their own secure account.</p>
                <p>Your username is: <strong>{u.get("username", "unknown")}</strong></p>
                <p>Next time you sign in, use your username instead of your email.
                You can change your username anytime after logging in.</p>
                <p>If you have any questions, reach out to us anytime.</p>
                <p>— The CarryOn Team</p>
                """,
            )
            sent_count += 1
        except Exception as e:
            logger.warning(f"Failed to send username notification to {u['email']}: {e}")

    return {"message": f"Sent username notification to {sent_count} users", "total": len(users), "sent": sent_count}
