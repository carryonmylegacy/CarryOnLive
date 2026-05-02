"""CarryOn™ Auth — Offline-capable credential enrollment.

Lets a user opt-in to offline access on a specific PWA-installed device.
Three endpoints:

  POST /auth/offline/enroll   — issue an offline credential for this device
  POST /auth/offline/revoke   — revoke offline credential for this device
  GET  /auth/offline/status   — is this device currently enrolled?

Server stores a list of enrolled offline_credential_ids on the user
document. The client receives a long-lived (90-day) JWT it can use to
authenticate API calls; the client also receives a `salt` it stores
alongside the password-encrypted version of the JWT in IndexedDB. The
plaintext JWT is NEVER stored in IndexedDB — only an AES-GCM
ciphertext that's only decryptable with a key derived from the
user's password (PBKDF2). So a stolen-but-locked device with a strong
password is not at risk.

Revocation: when the user toggles the Settings switch off, or when an
admin force-logs them out, the offline_credential_id gets removed
from the user document. The next time the device tries to use the
offline JWT online (warmup, online API call), the token is rejected
because session_id no longer matches.

Security posture:
  - Trusted-device enrollment requires a valid online auth context.
  - Offline tokens carry a unique session_id ("offline_<short_uuid>")
    so the regular session_id check in get_current_user works for
    online use too.
  - 90-day expiry hard-stops a forgotten enrollment.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends
from pydantic import BaseModel

from config import JWT_ALGORITHM, JWT_SECRET, db
from utils import get_current_user

from ._core import router

OFFLINE_TOKEN_DAYS = 90


class OfflineEnrollResponse(BaseModel):
    credential_id: str
    token: str
    salt: str  # base64 — used by client to derive the password-encrypts-token AES key
    expires_at: str


class OfflineStatusResponse(BaseModel):
    enrolled: bool
    device_count: int


def _create_offline_token(user_id: str, email: str, role: str, credential_id: str) -> str:
    """Mint a 90-day JWT carrying offline_credential_id as session_id."""
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "session_id": f"offline_{credential_id}",
        "issued_at": now.isoformat(),
        "exp": now + timedelta(days=OFFLINE_TOKEN_DAYS),
        "offline": True,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@router.post("/auth/offline/enroll", response_model=OfflineEnrollResponse)
async def enroll_offline_credential(current_user=Depends(get_current_user)) -> OfflineEnrollResponse:
    """Enroll the calling device for offline access. Returns a long-lived JWT
    + a salt the client uses to encrypt that JWT with the user's password."""
    credential_id = uuid.uuid4().hex
    salt = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)

    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$push": {
                "offline_credentials": {
                    "credential_id": credential_id,
                    "enrolled_at": now.isoformat(),
                    "salt": salt,
                }
            }
        },
    )

    token = _create_offline_token(
        current_user["id"],
        current_user.get("email", ""),
        current_user.get("role", "benefactor"),
        credential_id,
    )

    expires_at = (now + timedelta(days=OFFLINE_TOKEN_DAYS)).isoformat()
    return OfflineEnrollResponse(
        credential_id=credential_id,
        token=token,
        salt=salt,
        expires_at=expires_at,
    )


@router.post("/auth/offline/revoke")
async def revoke_offline_credential(payload: dict, current_user=Depends(get_current_user)) -> dict:
    """Revoke a specific offline credential, or ALL of them if no id passed."""
    credential_id = (payload or {}).get("credential_id")
    if credential_id:
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$pull": {"offline_credentials": {"credential_id": credential_id}}},
        )
    else:
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"offline_credentials": []}},
        )
    return {"success": True}


@router.get("/auth/offline/status", response_model=OfflineStatusResponse)
async def offline_credential_status(current_user=Depends(get_current_user)) -> OfflineStatusResponse:
    """How many devices does this user have offline credentials on?"""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "offline_credentials": 1})
    creds = (user or {}).get("offline_credentials") or []
    return OfflineStatusResponse(enrolled=len(creds) > 0, device_count=len(creds))


# Override the active_session_id check for offline tokens. Implemented as a
# user-document read inside get_current_user; we only need to make sure the
# DB document carries the offline credential_id in a list the auth helper can
# match against. The validation is wired in /app/backend/utils.py so any caller
# of get_current_user can use either an active_session_id token OR an
# offline_<credential_id> token.
#
# (See utils.py active_session matching block — looks up offline_credentials.)
