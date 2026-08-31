"""CarryOn™ — Data-export step-up authentication (B2 protections).

The GDPR data export is the most sensitive artifact the platform produces,
so downloading it requires proof beyond a bearer token:

  1. POST /compliance/export/step-up  {password}
     Verifies the account password, then issues the second factor:
       - passkey enrolled → WebAuthn assertion REQUIRED (no downgrade)
       - otherwise        → single-use purpose-bound email OTP (10 min)
       - SMS only when it is the sole enrolled factor (no email on file)
  2. POST /compliance/data-export  {otp | credential}
     Verifies + consumes the proof, streams the export with no-store
     headers. Never cached, never persisted server-side.

Both endpoints are limited to 5 per rolling 24h per user and audit-logged
(hash-chained audit trail + user-visible activity log + a "your data was
exported" notification email for tamper-evidence).
"""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone

import webauthn as webauthn_lib
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import PublicKeyCredentialDescriptor, UserVerificationRequirement

from config import db, logger
from routes.compliance import build_user_export
from routes.webauthn import ALLOWED_ORIGINS, RP_ID
from services.audit import get_client_ip, log_audit_event
from services.email import send_email
from services.rate_limiter import check_and_increment
from utils import generate_otp, get_current_user, send_otp_sms, verify_password

router = APIRouter()

EXPORTS_PER_DAY = 5
WINDOW_SECONDS = 86400
OTP_TTL_MINUTES = 10
MAX_OTP_ATTEMPTS = 5

NO_STORE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
}


class StepUpRequest(BaseModel):
    password: str


class ExportRequest(BaseModel):
    otp: str = ""
    credential: dict | None = None


def _hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _mask_email(email: str) -> str:
    local, _, domain = (email or "").partition("@")
    return f"{local[:2]}***@{domain}" if domain else "***"


def _mask_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    return f"***-***-{digits[-4:]}" if len(digits) >= 4 else "***"


def _as_utc(dt):
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


async def _audit(current_user: dict, request: Request, action: str, details: dict, severity: str = "info"):
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", ""),
        action=action,
        category="compliance",
        resource_type="data_export",
        resource_id=current_user["id"],
        details=details,
        ip_address=get_client_ip(request),
        severity=severity,
    )


@router.post("/compliance/export/step-up")
async def export_step_up(data: StepUpRequest, request: Request, current_user: dict = Depends(get_current_user)):
    """Step 1: verify the account password, then issue the second factor."""
    if not await check_and_increment(f"export_stepup:{current_user['id']}", EXPORTS_PER_DAY, WINDOW_SECONDS):
        await _audit(current_user, request, "export_step_up_rate_limited", {"result": "rate_limited"}, "warning")
        raise HTTPException(
            status_code=429,
            detail="Export limit reached — you can request up to 5 exports per 24 hours.",
        )

    user = await db.users.find_one(
        {"id": current_user["id"]},
        {"_id": 0, "password": 1, "email": 1, "sms_otp_enabled": 1, "sms_phone_number": 1},
    )
    if not user or not verify_password(data.password, user.get("password", "")):
        await _audit(current_user, request, "export_step_up_denied", {"result": "wrong_password"}, "warning")
        raise HTTPException(status_code=401, detail="Incorrect password")

    # Passkey enrolled → WebAuthn is REQUIRED (phishing- and SIM-swap-resistant;
    # never offer a weaker channel as an alternative).
    creds = await db.webauthn_credentials.find(
        {"user_id": current_user["id"]}, {"_id": 0, "id": 1, "credential_id": 1}
    ).to_list(10)
    if creds:
        allow = [PublicKeyCredentialDescriptor(id=base64url_to_bytes(c["credential_id"])) for c in creds]
        options = webauthn_lib.generate_authentication_options(
            rp_id=RP_ID,
            allow_credentials=allow,
            user_verification=UserVerificationRequirement.REQUIRED,
        )
        await db.webauthn_challenges.update_one(
            {"user_id": current_user["id"], "type": "export_stepup"},
            {
                "$set": {
                    "user_id": current_user["id"],
                    "type": "export_stepup",
                    "challenge": bytes_to_base64url(options.challenge),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )
        await _audit(current_user, request, "export_step_up_issued", {"method": "passkey"})
        return {"method": "passkey", "options": json.loads(webauthn_lib.options_to_json(options))}

    # No passkey → email OTP. SMS only when email is somehow the missing factor.
    channel = "email" if user.get("email") else None
    if channel is None and user.get("sms_otp_enabled") and user.get("sms_phone_number"):
        channel = "sms"
    if channel is None:
        raise HTTPException(status_code=400, detail="No delivery channel available for the verification code")

    code = generate_otp()
    now = datetime.now(timezone.utc)
    await db.export_stepup.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "user_id": current_user["id"],
                "purpose": "data_export",
                "otp_hash": _hash_otp(code),
                "attempts": 0,
                "expires_at": now + timedelta(minutes=OTP_TTL_MINUTES),
                "created_at": now,
            }
        },
        upsert=True,
    )

    if channel == "sms":
        sent = await send_otp_sms(user["sms_phone_number"], code)
        sent_to = _mask_phone(user["sms_phone_number"])
    else:
        html = f"""
        <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; background: #0F1629; border-radius: 16px; overflow: hidden; border: 1px solid rgba(212,175,55,0.25);">
          <div style="padding: 28px 32px 8px;">
            <p style="color: #d4af37; font-weight: bold; font-size: 16px; margin: 0;">CarryOn™ data export verification</p>
          </div>
          <div style="padding: 8px 32px 28px;">
            <p style="color: #A0AABF; font-size: 14px; line-height: 1.6;">You asked to download a complete export of your CarryOn data. Enter this code to continue:</p>
            <p style="color: #FFFFFF; font-size: 32px; letter-spacing: 8px; font-weight: bold; text-align: center; margin: 20px 0;">{code}</p>
            <p style="color: #A0AABF; font-size: 12px; line-height: 1.6;">This code expires in {OTP_TTL_MINUTES} minutes and can be used once. If you didn't request an export, change your password immediately.</p>
          </div>
        </div>
        """
        sent = await send_email(user["email"], "Your CarryOn™ data export code", html)
        sent_to = _mask_email(user["email"])

    if not sent:
        raise HTTPException(status_code=502, detail="Could not send the verification code — please try again.")

    await _audit(current_user, request, "export_step_up_issued", {"method": f"{channel}_otp"})
    return {"method": f"{channel}_otp", "sent_to": sent_to, "expires_in_minutes": OTP_TTL_MINUTES}


async def _verify_passkey_proof(data: ExportRequest, request: Request, current_user: dict):
    if not data.credential:
        await _audit(current_user, request, "data_export_denied", {"result": "missing_passkey_proof"}, "warning")
        raise HTTPException(status_code=401, detail="Passkey verification required")
    stored_cred = await db.webauthn_credentials.find_one(
        {"credential_id": data.credential.get("id", ""), "user_id": current_user["id"]}, {"_id": 0}
    )
    challenge_doc = await db.webauthn_challenges.find_one(
        {"user_id": current_user["id"], "type": "export_stepup"}, {"_id": 0}
    )
    fresh = False
    if challenge_doc:
        try:
            issued = datetime.fromisoformat(challenge_doc["created_at"])
            fresh = (datetime.now(timezone.utc) - _as_utc(issued)) < timedelta(minutes=OTP_TTL_MINUTES)
        except Exception:
            fresh = False
    if not stored_cred or not challenge_doc or not fresh:
        await _audit(current_user, request, "data_export_denied", {"result": "no_valid_challenge"}, "warning")
        raise HTTPException(status_code=401, detail="Passkey verification failed — restart the export")
    # Single-use: consume the challenge whether verification succeeds or fails.
    await db.webauthn_challenges.delete_one({"user_id": current_user["id"], "type": "export_stepup"})
    try:
        verification = webauthn_lib.verify_authentication_response(
            credential=data.credential,
            expected_challenge=base64url_to_bytes(challenge_doc["challenge"]),
            expected_rp_id=RP_ID,
            expected_origin=ALLOWED_ORIGINS,
            credential_public_key=base64url_to_bytes(stored_cred["public_key"]),
            credential_current_sign_count=stored_cred.get("sign_count", 0),
        )
    except Exception as e:
        logger.warning(f"Export passkey verification failed for {current_user['id']}: {e}")
        await _audit(current_user, request, "data_export_denied", {"result": "passkey_failed"}, "warning")
        raise HTTPException(status_code=401, detail="Passkey verification failed")
    await db.webauthn_credentials.update_one(
        {"credential_id": data.credential.get("id", "")},
        {"$set": {"sign_count": verification.new_sign_count}},
    )


async def _verify_otp_proof(data: ExportRequest, request: Request, current_user: dict):
    doc = await db.export_stepup.find_one({"user_id": current_user["id"], "purpose": "data_export"})
    if not doc or datetime.now(timezone.utc) > _as_utc(doc.get("expires_at", datetime.min)):
        await _audit(current_user, request, "data_export_denied", {"result": "otp_expired_or_missing"}, "warning")
        raise HTTPException(status_code=401, detail="Verification code expired — restart the export")
    if doc.get("attempts", 0) >= MAX_OTP_ATTEMPTS:
        await db.export_stepup.delete_one({"_id": doc["_id"]})
        await _audit(current_user, request, "data_export_denied", {"result": "otp_attempts_exhausted"}, "warning")
        raise HTTPException(status_code=401, detail="Too many incorrect codes — restart the export")
    if not data.otp or not hmac.compare_digest(_hash_otp(data.otp.strip()), doc.get("otp_hash", "")):
        await db.export_stepup.update_one({"_id": doc["_id"]}, {"$inc": {"attempts": 1}})
        await _audit(current_user, request, "data_export_denied", {"result": "wrong_otp"}, "warning")
        raise HTTPException(status_code=401, detail="Incorrect verification code")
    await db.export_stepup.delete_one({"_id": doc["_id"]})  # single-use


@router.post("/compliance/data-export")
async def export_user_data(data: ExportRequest, request: Request, current_user: dict = Depends(get_current_user)):
    """GDPR Article 15/20 export — requires a fresh step-up proof (see module docstring)."""
    if not await check_and_increment(f"export:{current_user['id']}", EXPORTS_PER_DAY, WINDOW_SECONDS):
        await _audit(current_user, request, "data_export_rate_limited", {"result": "rate_limited"}, "warning")
        raise HTTPException(
            status_code=429,
            detail="Export limit reached — you can download up to 5 exports per 24 hours.",
        )

    passkeys = await db.webauthn_credentials.count_documents({"user_id": current_user["id"]})
    if passkeys:
        await _verify_passkey_proof(data, request, current_user)
        step_up_method = "password+passkey"
    else:
        await _verify_otp_proof(data, request, current_user)
        step_up_method = "password+otp"

    export_data = await build_user_export(current_user)
    export_data["sensitivity"] = "PERSONAL DATA — anyone with this file can read it. Store it encrypted."

    counts: dict = {}
    for k, v in export_data.items():
        if isinstance(v, list):
            counts[k] = len(v)
        elif isinstance(v, dict):
            sub = {sk: len(sv) for sk, sv in v.items() if isinstance(sv, list)}
            if sub:
                counts[k] = sub
    now_iso = datetime.now(timezone.utc).isoformat()
    ip = get_client_ip(request)
    await _audit(
        current_user,
        request,
        "data_export",
        {
            "result": "issued",
            "step_up_method": step_up_method,
            "counts": counts,
            "user_agent": request.headers.get("user-agent", "")[:200],
        },
    )
    await db.activity_log.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "actor_id": current_user["id"],
            "actor_name": current_user.get("name", ""),
            "action": "data_export",
            "details": "Full data export downloaded",
            "timestamp": now_iso,
        }
    )
    try:
        await send_email(
            current_user["email"],
            "Your CarryOn™ data was exported",
            f"""
            <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; background: #0F1629; border-radius: 16px; overflow: hidden; border: 1px solid rgba(212,175,55,0.25);">
              <div style="padding: 28px 32px;">
                <p style="color: #d4af37; font-weight: bold; font-size: 16px; margin: 0 0 12px;">Your CarryOn™ data was exported</p>
                <p style="color: #A0AABF; font-size: 14px; line-height: 1.6;">A complete export of your account data was downloaded at {now_iso} from IP {ip}.</p>
                <p style="color: #A0AABF; font-size: 12px; line-height: 1.6;">If this wasn't you, change your password immediately and contact support.</p>
              </div>
            </div>
            """,
        )
    except Exception:
        logger.warning(f"Export notification email failed for {current_user['id']}")

    return JSONResponse(
        content=export_data,
        headers={**NO_STORE_HEADERS, "Content-Disposition": 'attachment; filename="carryon-data-export.json"'},
    )
