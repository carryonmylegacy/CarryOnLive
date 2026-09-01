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
from pymongo import ReadPreference as _ReadPreference

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Opt-in: LOG_FORMAT=json flips every log line to structured JSON for
# Datadog/Honeycomb/CloudWatch/Loki/Sentry auto-ingest. Default stays
# human-readable so the live pitch console output is unchanged.
try:
    from logging_json import install as _install_json_logging

    _install_json_logging()
except Exception:  # pragma: no cover — never crash boot on logging setup
    pass

# MongoDB
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=5000,
    # Pool sized for ~1,000-user concurrency. The bottleneck on heavy
    # IAC paths is the long-lived xAI call holding the connection for
    # up to 9 minutes (per-call timeout). Atlas M30+ handles 500
    # comfortably; we cap conservatively at 200 to leave headroom for
    # the background schedulers. minPoolSize stays low so an idle dev
    # pod doesn't keep 200 sockets open.
    maxPoolSize=200,
    minPoolSize=5,
    maxIdleTimeMS=60000,
    waitQueueTimeoutMS=10000,
    # DoS-hardening (Feb 2026): any single MongoDB socket operation MUST
    # complete within 30s or we abandon it. This catches runaway queries
    # (missing index, table scan on a huge collection) before they exhaust
    # the connection pool. Combined with DoSHardeningMiddleware's 60s
    # wall-clock cap, the worst-case request budget is 30s Mongo + 30s
    # application code. Override per-query with `.max_time_ms(N)` when needed.
    socketTimeoutMS=30000,
    connectTimeoutMS=5000,
)
db = client[os.environ["DB_NAME"]]

# Optional read-replica view of `db` for heavy read-only endpoints (admin
# dashboards, analytics, search aggregations). Set MONGO_READ_PREFERENCE to
# one of: primary | primaryPreferred | secondary | secondaryPreferred | nearest
# When unset (or set to "primary"), `db_read` is the same object as `db`, so
# behavior is byte-identical to the previous build.
#
# Usage at call site:
#     from config import db_read
#     docs = await db_read.users.find({...}).to_list(100)
#
# Atlas auto-replicates within ~10ms in-region; only use db_read for queries
# where 10–500ms eventual-consistency lag is acceptable (NEVER for writes,
# auth, billing, or just-after-write reads).
_MONGO_READ_PREF_RAW = os.environ.get("MONGO_READ_PREFERENCE", "").strip().lower()
_READ_PREF_MAP = {
    "primary": _ReadPreference.PRIMARY,
    "primarypreferred": _ReadPreference.PRIMARY_PREFERRED,
    "secondary": _ReadPreference.SECONDARY,
    "secondarypreferred": _ReadPreference.SECONDARY_PREFERRED,
    "nearest": _ReadPreference.NEAREST,
}
if _MONGO_READ_PREF_RAW and _MONGO_READ_PREF_RAW != "primary":
    _read_pref = _READ_PREF_MAP.get(_MONGO_READ_PREF_RAW)
    if _read_pref is None:
        logger.warning(
            f"MONGO_READ_PREFERENCE={_MONGO_READ_PREF_RAW!r} is invalid — falling "
            f"back to primary. Valid values: {sorted(_READ_PREF_MAP)}"
        )
        db_read = db
    else:
        db_read = db.with_options(read_preference=_read_pref)
        logger.info(f"Mongo db_read using read_preference={_MONGO_READ_PREF_RAW}")
else:
    db_read = db

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
# Jun 2026: grok-4/grok-3/grok-3-mini are RETIRED — xAI silently redirects
# them all to grok-4.3 (verified via response.model). Name real models
# explicitly. Light path uses the non-reasoning variant: same per-token price
# as grok-4.3 but no reasoning-token burn on simple calls.
XAI_MODEL = os.environ.get("XAI_MODEL", "grok-4.3")
XAI_MODEL_LIGHT = os.environ.get("XAI_MODEL_LIGHT", "grok-4.20-0309-non-reasoning")
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
# Prefer inline PEM contents via VAPID_PRIVATE_KEY env (survives container restarts).
# Legacy path-based config still supported for local dev, but /tmp fallback removed.
VAPID_PRIVATE_KEY_INLINE = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_PRIVATE_KEY_PATH = os.environ.get("VAPID_PRIVATE_KEY_PATH")
VAPID_PUBLIC_KEY_PATH = os.environ.get("VAPID_PUBLIC_KEY_PATH")
VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "mailto:support@carryon.us")
if not VAPID_PRIVATE_KEY_INLINE and not VAPID_PRIVATE_KEY_PATH:
    logger.warning(
        "VAPID keys not configured (set VAPID_PRIVATE_KEY env with PEM contents). "
        "Web push notifications will be disabled."
    )

# ── Sentry (error monitoring) ──
# Activates only if SENTRY_DSN is set; otherwise no-op.
SENTRY_DSN = os.environ.get("SENTRY_DSN")
SENTRY_ENVIRONMENT = os.environ.get("SENTRY_ENVIRONMENT", "production")
if SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        def _scrub_export_events(event, hint):
            # The data-export flow must never leak payloads/codes into Sentry:
            # drop request bodies/headers/cookies for those endpoints entirely.
            try:
                req = event.get("request") or {}
                url = req.get("url", "") or ""
                if "/compliance/data-export" in url or "/compliance/export/step-up" in url:
                    req.pop("data", None)
                    req.pop("cookies", None)
                    req.pop("headers", None)
                    event["request"] = req
            except Exception:
                pass
            return event

        sentry_sdk.init(
            dsn=SENTRY_DSN,
            environment=SENTRY_ENVIRONMENT,
            before_send=_scrub_export_events,
            traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
            profiles_sample_rate=float(os.environ.get("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
            send_default_pii=False,
            integrations=[
                FastApiIntegration(),
                StarletteIntegration(),
            ],
            release=os.environ.get("SENTRY_RELEASE"),
        )
        logger.info(f"Sentry enabled (environment={SENTRY_ENVIRONMENT})")
    except Exception as e:
        logger.warning(f"Sentry init failed: {e}")
