"""CarryOn™ Backend Utilities — encryption, auth, email, SMS helpers"""
from fastapi import HTTPException, Depends
from fastapi.security import HTTPAuthorizationCredentials
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from datetime import datetime, timezone, timedelta
from config import db, logger, security, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS, ENCRYPTION_KEY, ENCRYPTION_SALT, RESEND_API_KEY, SENDER_EMAIL, TWILIO_PHONE_NUMBER
import base64
import bcrypt
import jwt
import random
import asyncio
import resend

# ===================== ENCRYPTION =====================

def get_encryption_key() -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=ENCRYPTION_SALT, iterations=480000)
    return base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_KEY.encode()))

def encrypt_data(data: bytes) -> str:
    f = Fernet(get_encryption_key())
    return base64.b64encode(f.encrypt(data)).decode()

def decrypt_data(encrypted_data: str) -> bytes:
    f = Fernet(get_encryption_key())
    return f.decrypt(base64.b64decode(encrypted_data.encode()))

def generate_backup_code() -> str:
    return '-'.join([''.join([str(random.randint(0, 9)) for _ in range(4)]) for _ in range(3)])

# ===================== AUTH =====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {"user_id": user_id, "email": email, "role": role, "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    payload = decode_token(credentials.credentials)
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def generate_otp() -> str:
    return ''.join([str(random.randint(0, 9)) for _ in range(6)])

# ===================== EMAIL =====================

async def send_otp_email(email: str, otp: str, name: str = "User"):
    if not RESEND_API_KEY:
        logger.info(f"Email not configured. OTP for {email}: {otp}")
        return False
    html_content = f"""<!DOCTYPE html><html><head><style>
    body {{ font-family: Arial, sans-serif; background-color: #0b1120; color: #f8fafc; padding: 40px; }}
    .container {{ max-width: 500px; margin: 0 auto; background: #0f1d35; border-radius: 16px; padding: 40px; border: 1px solid rgba(255,255,255,0.1); }}
    .logo {{ text-align: center; margin-bottom: 24px; }}
    .logo-text {{ font-size: 24px; font-weight: bold; color: #d4af37; }}
    h1 {{ color: #f8fafc; font-size: 20px; margin-bottom: 16px; }}
    .otp-code {{ background: linear-gradient(135deg, #d4af37, #fcd34d); color: #0b1120; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px 40px; border-radius: 12px; text-align: center; margin: 24px 0; }}
    p {{ color: #94a3b8; line-height: 1.6; }}
    .footer {{ margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; color: #64748b; font-size: 12px; }}
    </style></head><body><div class="container">
    <div class="logo"><span class="logo-text">CarryOn™</span></div>
    <h1>Hello {name},</h1><p>Your verification code for CarryOn™ is:</p>
    <div class="otp-code">{otp}</div>
    <p>This code will expire in 10 minutes. If you didn't request this code, please ignore this email.</p>
    <div class="footer"><p>AES-256 Encrypted · Zero-Knowledge · SOC 2 Compliant</p>
    <p>© 2024 CarryOn™ - Every American Family. Ready.</p></div></div></body></html>"""
    try:
        await asyncio.to_thread(resend.Emails.send, {"from": SENDER_EMAIL, "to": [email], "subject": f"Your CarryOn™ Verification Code: {otp[:2]}****", "html": html_content})
        logger.info(f"OTP email sent to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP email: {e}")
        logger.info(f"Fallback - OTP for {email}: {otp}")
        return False

async def send_otp_sms(phone: str, otp: str):
    from config import twilio_client
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.info(f"SMS not configured. OTP for {phone}: {otp}")
        return False
    try:
        message = await asyncio.to_thread(twilio_client.messages.create, body=f"Your CarryOn™ verification code is: {otp}. This code expires in 10 minutes.", from_=TWILIO_PHONE_NUMBER, to=phone)
        logger.info(f"OTP SMS sent to {phone}, SID: {message.sid}")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP SMS: {e}")
        return False

# ===================== ACTIVITY LOGGING =====================

async def log_activity(estate_id: str, user_id: str, user_name: str, action: str, description: str, metadata: dict = None):
    import uuid
    activity = {"id": str(uuid.uuid4()), "estate_id": estate_id, "user_id": user_id, "user_name": user_name, "action": action, "description": description, "metadata": metadata or {}, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.activity_log.insert_one(activity)

# ===================== PUSH NOTIFICATIONS =====================

from pywebpush import webpush, WebPushException
from py_vapid import Vapid
from config import VAPID_PRIVATE_KEY_PATH, VAPID_PRIVATE_KEY_INLINE, VAPID_CLAIMS_EMAIL
import os, json as json_module

vapid = None
vapid_private_key_for_webpush = None
try:
    if VAPID_PRIVATE_KEY_INLINE:
        import tempfile
        tmp_key = tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False)
        tmp_key.write(VAPID_PRIVATE_KEY_INLINE)
        tmp_key.close()
        _vapid_path = tmp_key.name
        vapid = Vapid.from_file(_vapid_path)
        vapid_private_key_for_webpush = _vapid_path
        logger.info("VAPID keys loaded from inline env var")
    elif os.path.exists(VAPID_PRIVATE_KEY_PATH):
        vapid = Vapid.from_file(VAPID_PRIVATE_KEY_PATH)
        vapid_private_key_for_webpush = VAPID_PRIVATE_KEY_PATH
        logger.info("VAPID keys loaded from file")
    else:
        logger.warning("VAPID private key not found - push notifications disabled")
except Exception as e:
    logger.error(f"Failed to load VAPID keys: {e}")

async def send_push_notification(user_id: str, title: str, body: str, url: str = "/", tag: str = "carryon-notification", notification_type: str = "general"):
    if not vapid:
        return False
    subscriptions = await db.push_subscriptions.find({"user_id": user_id, "active": True}, {"_id": 0}).to_list(100)
    if not subscriptions:
        return False
    payload = json_module.dumps({"title": title, "body": body, "url": url, "tag": tag, "type": notification_type, "icon": "/logo192.png"})
    success_count = 0
    for sub in subscriptions:
        try:
            webpush(subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]}, data=payload, vapid_private_key=vapid_private_key_for_webpush, vapid_claims={"sub": VAPID_CLAIMS_EMAIL})
            success_count += 1
        except WebPushException as e:
            if e.response and e.response.status_code == 410:
                await db.push_subscriptions.update_one({"endpoint": sub["endpoint"]}, {"$set": {"active": False}})
        except Exception:
            pass
    return success_count > 0

async def send_push_to_all_admins(title: str, body: str, url: str = "/admin", tag: str = "admin-notification"):
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(100)
    for admin in admins:
        await send_push_notification(admin["id"], title, body, url, tag, "admin")

# ===================== ESTATE READINESS =====================

async def update_estate_readiness(estate_id: str):
    """Calculate and update estate readiness score using the detailed algorithm"""
    from models import calculate_estate_readiness
    result = await calculate_estate_readiness(estate_id)

    await db.estates.update_one(
        {"id": estate_id},
        {"$set": {
            "readiness_score": result["overall_score"],
            "readiness_breakdown": {
                "documents": result["documents"],
                "messages": result["messages"],
                "checklist": result["checklist"]
            }
        }}
    )
