"""CarryOn™ — WebAuthn/Passkey Routes for Face ID / Biometric Login (PWA)"""

import base64
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import webauthn
from webauthn.helpers import bytes_to_base64url, base64url_to_bytes
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    UserVerificationRequirement,
    AuthenticatorAttachment,
)

from config import db, logger
from utils import get_current_user

router = APIRouter()

RP_ID = "carryon.us"
RP_NAME = "CarryOn™"
ORIGIN = "https://carryon.us"


class RegisterOptionsRequest(BaseModel):
    pass


class RegisterCompleteRequest(BaseModel):
    credential: dict


class LoginOptionsRequest(BaseModel):
    email: str = ""


class LoginCompleteRequest(BaseModel):
    credential: dict
    email: str = ""


@router.post("/auth/webauthn/register-options")
async def webauthn_register_options(current_user: dict = Depends(get_current_user)):
    """Generate WebAuthn registration options for the current user."""
    user_id = current_user["id"].encode("utf-8")

    # Check for existing credentials
    existing = await db.webauthn_credentials.find(
        {"user_id": current_user["id"]}, {"_id": 0, "credential_id": 1}
    ).to_list(10)

    exclude_credentials = []
    for cred in existing:
        exclude_credentials.append(
            {"id": base64url_to_bytes(cred["credential_id"]), "type": "public-key"}
        )

    options = webauthn.generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_id=user_id,
        user_name=current_user["email"],
        user_display_name=current_user.get("name", current_user["email"]),
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=exclude_credentials,
    )

    # Store challenge for verification
    challenge_b64 = bytes_to_base64url(options.challenge)
    await db.webauthn_challenges.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "challenge": challenge_b64,
                "user_id": current_user["id"],
                "type": "registration",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )

    return json.loads(webauthn.options_to_json(options))


@router.post("/auth/webauthn/register")
async def webauthn_register_complete(
    data: RegisterCompleteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Complete WebAuthn registration — store the passkey credential."""
    challenge_doc = await db.webauthn_challenges.find_one(
        {"user_id": current_user["id"], "type": "registration"}, {"_id": 0}
    )
    if not challenge_doc:
        raise HTTPException(status_code=400, detail="No registration challenge found")

    try:
        verification = webauthn.verify_registration_response(
            credential=data.credential,
            expected_challenge=base64url_to_bytes(challenge_doc["challenge"]),
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
        )
    except Exception as e:
        logger.error(f"WebAuthn registration verification failed: {e}")
        raise HTTPException(status_code=400, detail="Registration verification failed")

    # Store credential
    await db.webauthn_credentials.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "user_email": current_user["email"],
            "credential_id": bytes_to_base64url(verification.credential_id),
            "public_key": bytes_to_base64url(verification.credential_public_key),
            "sign_count": verification.sign_count,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    # Clean up challenge
    await db.webauthn_challenges.delete_one({"user_id": current_user["id"]})

    # Mark biometric as enabled for this user
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"biometric_enabled": True}},
    )

    return {"success": True, "message": "Face ID registered successfully"}


@router.post("/auth/webauthn/login-options")
async def webauthn_login_options(data: LoginOptionsRequest):
    """Generate WebAuthn authentication options — no auth required."""
    # Find credentials for this user (by email if provided, or allow discoverable)
    allow_credentials = []
    if data.email:
        user = await db.users.find_one({"email": data.email}, {"_id": 0, "id": 1})
        if user:
            creds = await db.webauthn_credentials.find(
                {"user_id": user["id"]}, {"_id": 0, "credential_id": 1}
            ).to_list(10)
            for c in creds:
                allow_credentials.append(
                    {
                        "id": base64url_to_bytes(c["credential_id"]),
                        "type": "public-key",
                    }
                )

    options = webauthn.generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=allow_credentials if allow_credentials else None,
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    challenge_b64 = bytes_to_base64url(options.challenge)

    # Store challenge (keyed by challenge itself since user might not be known)
    await db.webauthn_challenges.insert_one(
        {
            "challenge": challenge_b64,
            "type": "authentication",
            "email": data.email,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    return json.loads(webauthn.options_to_json(options))


@router.post("/auth/webauthn/login")
async def webauthn_login_complete(data: LoginCompleteRequest):
    """Complete WebAuthn authentication — verify passkey and return JWT."""
    from utils import create_token

    # Find the credential in our DB
    cred_id_b64 = data.credential.get("id", "")
    stored_cred = await db.webauthn_credentials.find_one(
        {"credential_id": cred_id_b64}, {"_id": 0}
    )
    if not stored_cred:
        raise HTTPException(status_code=401, detail="Unknown credential")

    # Find the challenge
    challenge_doc = await db.webauthn_challenges.find_one(
        {"type": "authentication"}, {"_id": 0}, sort=[("created_at", -1)]
    )
    if not challenge_doc:
        raise HTTPException(status_code=400, detail="No authentication challenge found")

    try:
        verification = webauthn.verify_authentication_response(
            credential=data.credential,
            expected_challenge=base64url_to_bytes(challenge_doc["challenge"]),
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            credential_public_key=base64url_to_bytes(stored_cred["public_key"]),
            credential_current_sign_count=stored_cred.get("sign_count", 0),
        )
    except Exception as e:
        logger.error(f"WebAuthn authentication failed: {e}")
        raise HTTPException(status_code=401, detail="Biometric verification failed")

    # Update sign count
    await db.webauthn_credentials.update_one(
        {"credential_id": cred_id_b64},
        {"$set": {"sign_count": verification.new_sign_count}},
    )

    # Clean up challenge
    await db.webauthn_challenges.delete_one({"_id": challenge_doc.get("_id")})

    # Get user and create token
    user = await db.users.find_one(
        {"id": stored_cred["user_id"]}, {"_id": 0, "password": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    token = create_token(user["id"], user["email"], user.get("role", "benefactor"))

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name", ""),
            "role": user.get("role", "benefactor"),
        },
    }
