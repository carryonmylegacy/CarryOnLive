"""CarryOn™ Backend Configuration — shared state, DB, external services"""

import logging
import os
from pathlib import Path

import httpx
import resend
import stripe
from dotenv import load_dotenv
from fastapi.security import HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from openai import OpenAI as XAIClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# MongoDB
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
db = client[os.environ["DB_NAME"]]

# JWT — NO FALLBACK: missing secret MUST fail fast
JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 8

# Encryption — NO FALLBACK: missing key MUST fail fast
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    raise RuntimeError("FATAL: ENCRYPTION_KEY environment variable is not set. Server cannot start without it.")
ENCRYPTION_SALT = b"carryon_salt_2024"  # Legacy V1 only; new encryption uses per-estate salts

# Security
security = HTTPBearer()

# Resend (Email)
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# xAI Grok (Estate Guardian AI)
XAI_API_KEY = os.environ.get("XAI_API_KEY")
XAI_BASE_URL = "https://api.x.ai/v1"
XAI_MODEL = os.environ.get("XAI_MODEL", "grok-4")
XAI_MODEL_LIGHT = os.environ.get("XAI_MODEL_LIGHT", "grok-3-mini")
xai_client = None
if XAI_API_KEY:
    xai_client = XAIClient(
        api_key=XAI_API_KEY,
        base_url=XAI_BASE_URL,
        timeout=httpx.Timeout(120.0, connect=15.0),
        max_retries=2,
    )
    logger.info(f"xAI Grok configured (model: {XAI_MODEL})")
else:
    logger.warning("XAI_API_KEY not set - Estate Guardian AI disabled")

# Twilio (SMS)
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER")
twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    try:
        from twilio.rest import Client as TwilioClient

        twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        logger.info("Twilio SMS configured successfully")
    except ImportError:
        logger.warning("Twilio library not installed - SMS OTP disabled")

# Stripe
stripe.api_key = os.environ.get("STRIPE_API_KEY")

# VAPID (Push Notifications)
VAPID_PRIVATE_KEY_PATH = os.environ.get("VAPID_PRIVATE_KEY_PATH", "/tmp/vapid_private.pem")
VAPID_PRIVATE_KEY_INLINE = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY_PATH = os.environ.get("VAPID_PUBLIC_KEY_PATH", "/tmp/vapid_public.pem")
VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "mailto:support@carryon.us")
