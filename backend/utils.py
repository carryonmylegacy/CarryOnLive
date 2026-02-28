"""CarryOn™ Backend Utilities — encryption, auth, email, SMS helpers"""

import asyncio
import base64
import json as json_module
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import jwt
import resend
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from py_vapid import Vapid
from pywebpush import WebPushException, webpush

from config import (
    ENCRYPTION_KEY,
    ENCRYPTION_SALT,
    JWT_ALGORITHM,
    JWT_EXPIRATION_HOURS,
    JWT_SECRET,
    RESEND_API_KEY,
    SENDER_EMAIL,
    TWILIO_PHONE_NUMBER,
    VAPID_CLAIMS_EMAIL,
    VAPID_PRIVATE_KEY_INLINE,
    VAPID_PRIVATE_KEY_PATH,
    db,
    logger,
    security,
)

# ===================== ENCRYPTION =====================


def get_encryption_key() -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(), length=32, salt=ENCRYPTION_SALT, iterations=480000
    )
    return base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_KEY.encode()))


def encrypt_data(data: bytes) -> str:
    f = Fernet(get_encryption_key())
    return base64.b64encode(f.encrypt(data)).decode()


def decrypt_data(encrypted_data: str) -> bytes:
    f = Fernet(get_encryption_key())
    return f.decrypt(base64.b64decode(encrypted_data.encode()))


def generate_backup_code() -> str:
    """Generate a cryptographically secure backup code."""
    import secrets

    return "-".join(
        ["".join([str(secrets.randbelow(10)) for _ in range(4)]) for _ in range(3)]
    )


# ===================== AUTH =====================


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "iat": datetime.now(timezone.utc).isoformat(),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token_str = credentials.credentials
    payload = decode_token(token_str)

    # Check token blacklist (individual token revocation)
    from services.token_blacklist import is_token_blacklisted, is_user_tokens_revoked

    if await is_token_blacklisted(token_str):
        raise HTTPException(status_code=401, detail="Token has been revoked")

    # Check bulk user token revocation (e.g., password change)
    iat = payload.get("iat", "")
    if iat and await is_user_tokens_revoked(payload["user_id"], iat):
        raise HTTPException(status_code=401, detail="Session expired — please log in again")

    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def generate_otp() -> str:
    """Generate a cryptographically secure 6-digit OTP."""
    import secrets

    return "".join([str(secrets.randbelow(10)) for _ in range(6)])


# ===================== EMAIL =====================


async def send_otp_email(email: str, otp: str, name: str = "User"):
    if not RESEND_API_KEY:
        logger.info(
            f"Email not configured — OTP generated for {email} (check admin console)"
        )
        return False
    html_content = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0b1120;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1120;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="500" cellpadding="0" cellspacing="0" style="max-width:500px;background-color:#0f1d35;border-radius:16px;border:1px solid #1e293b;">
<tr><td style="padding:40px;">

<p style="text-align:center;margin:0 0 24px 0;"><span style="font-size:24px;font-weight:bold;color:#d4af37;">CarryOn</span></p>

<h1 style="color:#f8fafc;font-size:20px;margin:0 0 16px 0;">Hello {name},</h1>
<p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 8px 0;">Your verification code for CarryOn is:</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:24px 0;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="background-color:#d4af37;color:#0b1120;font-size:32px;font-weight:bold;letter-spacing:8px;padding:20px 40px;border-radius:12px;text-align:center;">{otp}</td></tr>
</table>
</td></tr>
</table>

<p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 8px 0;">This code will expire in 10 minutes. If you didn't request this code, please ignore this email.</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;padding-top:24px;border-top:1px solid #1e293b;">
<tr><td style="text-align:center;color:#64748b;font-size:12px;">
<p style="margin:0 0 4px 0;">AES-256 Encrypted - Zero-Knowledge - SOC 2 Compliant</p>
<p style="margin:0;">2025 CarryOn - Every American Family. Ready.</p>
</td></tr>
</table>

</td></tr>
</table>
</td></tr>
</table>
</body></html>"""
    try:
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": SENDER_EMAIL,
                "to": [email],
                "subject": f"Your CarryOn™ Verification Code: {otp[:2]}****",
                "html": html_content,
            },
        )
        logger.info(f"OTP email sent to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP email: {e}")
        logger.info(f"OTP delivery failed for {email} — user must retry")
        return False


async def send_otp_sms(phone: str, otp: str):
    from config import twilio_client

    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.info(f"SMS not configured. OTP for {phone}: {otp}")
        return False
    try:
        message = await asyncio.to_thread(
            twilio_client.messages.create,
            body=f"Your CarryOn™ verification code is: {otp}. This code expires in 10 minutes.",
            from_=TWILIO_PHONE_NUMBER,
            to=phone,
        )
        logger.info(f"OTP SMS sent to {phone}, SID: {message.sid}")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP SMS: {e}")
        return False


# ===================== ACTIVITY LOGGING =====================


async def log_activity(
    estate_id: str,
    user_id: str,
    user_name: str,
    action: str,
    description: str,
    metadata: dict = None,
):
    import uuid

    activity = {
        "id": str(uuid.uuid4()),
        "estate_id": estate_id,
        "user_id": user_id,
        "user_name": user_name,
        "action": action,
        "description": description,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.activity_log.insert_one(activity)


# ===================== PUSH NOTIFICATIONS =====================

vapid = None
vapid_private_key_for_webpush = None
try:
    if VAPID_PRIVATE_KEY_INLINE:
        import tempfile

        tmp_key = tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False)
        tmp_key.write(VAPID_PRIVATE_KEY_INLINE)
        tmp_key.close()
        _vapid_path = tmp_key.name
        vapid = Vapid.from_file(_vapid_path)
        vapid_private_key_for_webpush = _vapid_path
        logger.info("VAPID keys loaded from inline env var")
    elif Path(VAPID_PRIVATE_KEY_PATH).exists():
        vapid = Vapid.from_file(VAPID_PRIVATE_KEY_PATH)
        vapid_private_key_for_webpush = VAPID_PRIVATE_KEY_PATH
        logger.info("VAPID keys loaded from file")
    else:
        logger.warning("VAPID private key not found - push notifications disabled")
except Exception as e:
    logger.error(f"Failed to load VAPID keys: {e}")


async def send_push_notification(
    user_id: str,
    title: str,
    body: str,
    url: str = "/",
    tag: str = "carryon-notification",
    notification_type: str = "general",
):
    if not vapid:
        return False
    subscriptions = await db.push_subscriptions.find(
        {"user_id": user_id, "active": True}, {"_id": 0}
    ).to_list(100)
    if not subscriptions:
        return False
    payload = json_module.dumps(
        {
            "title": title,
            "body": body,
            "url": url,
            "tag": tag,
            "type": notification_type,
            "icon": "/logo192.png",
        }
    )
    success_count = 0
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
                data=payload,
                vapid_private_key=vapid_private_key_for_webpush,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
            )
            success_count += 1
        except WebPushException as e:
            if e.response and e.response.status_code == 410:
                await db.push_subscriptions.update_one(
                    {"endpoint": sub["endpoint"]}, {"$set": {"active": False}}
                )
        except Exception:
            pass
    return success_count > 0


async def send_push_to_all_admins(
    title: str, body: str, url: str = "/admin", tag: str = "admin-notification"
):
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(100)
    for admin in admins:
        await send_push_notification(admin["id"], title, body, url, tag, "admin")


# ===================== ESTATE READINESS =====================


async def update_estate_readiness(estate_id: str):
    """Calculate and update estate readiness score using the detailed algorithm"""
    from services.readiness import calculate_estate_readiness

    result = await calculate_estate_readiness(estate_id)

    await db.estates.update_one(
        {"id": estate_id},
        {
            "$set": {
                "readiness_score": result["overall_score"],
                "readiness_breakdown": {
                    "documents": result["documents"],
                    "messages": result["messages"],
                    "checklist": result["checklist"],
                },
            }
        },
    )
