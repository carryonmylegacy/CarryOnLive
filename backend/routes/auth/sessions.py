"""Auth — Session management (logout) and 2FA preferences."""

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from config import db
from utils import get_current_user

from ._core import router


@router.post("/auth/logout")
async def logout(request: Request, current_user: dict = Depends(get_current_user)):
    """Logout — blacklists the current token and clears active session."""
    from services.token_blacklist import blacklist_token

    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token_str = auth_header.split(" ")[1]
        await blacklist_token(token_str, current_user["id"], reason="logout")
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {"active_session_id": ""}},
    )
    return {"message": "Logged out successfully"}


class TwoFAPreferenceRequest(BaseModel):
    otp_enabled: bool


@router.put("/auth/2fa-preference")
async def update_2fa_preference(
    data: TwoFAPreferenceRequest,
    current_user: dict = Depends(get_current_user),
):
    """Toggle the current user's personal 2FA preference."""
    platform_settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    if platform_settings and platform_settings.get("otp_disabled") and data.otp_enabled:
        raise HTTPException(
            status_code=400,
            detail="2FA is currently disabled platform-wide. Contact your administrator.",
        )
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"otp_enabled": data.otp_enabled}})
    return {"otp_enabled": data.otp_enabled}


@router.get("/auth/2fa-preference")
async def get_2fa_preference(current_user: dict = Depends(get_current_user)):
    """Get the current user's 2FA preference and global status."""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "otp_enabled": 1})
    platform_settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    global_disabled = (platform_settings or {}).get("otp_disabled", False)
    return {
        "otp_enabled": user.get("otp_enabled", True),
        "global_disabled": global_disabled,
    }
