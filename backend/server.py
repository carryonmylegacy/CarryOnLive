"""
CarryOn™ Backend — Main Entry Point
Security-hardened with rate limiting, security headers, and CORS.
Routes organized in /routes/*.py
"""

import asyncio
import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware

from config import client, db, logger
from routes.admin import router as admin_router
from routes.admin_digest import router as admin_digest_router
from routes.auth import router as auth_router
from routes.beneficiaries import router as beneficiaries_router
from routes.checklist import router as checklist_router
from routes.compliance import router as compliance_router
from routes.digest import router as digest_router
from routes.digital_wallet import router as digital_wallet_router
from routes.documents import router as documents_router
from routes.dts import router as dts_router
from routes.emergency_access import router as emergency_access_router
from routes.estates import router as estates_router
from routes.family_plan import router as family_plan_router
from routes.guardian import router as guardian_router
from routes.messages import router as messages_router
from routes.onboarding import router as onboarding_router
from routes.pdf_export import router as pdf_export_router
from routes.push import router as push_router
from routes.security import router as security_router
from routes.subscriptions import router as subscriptions_router
from routes.support import router as support_router
from routes.timeline import router as timeline_router
from routes.transition import router as transition_router


# Background scheduler
async def weekly_digest_scheduler():
    """Background task: sends weekly digest every Monday at 8 AM EST."""
    from routes.digest import run_weekly_digest
    from routes.admin_digest import send_admin_analytics_digest

    while True:
        now = datetime.now(timezone.utc)
        days_ahead = (7 - now.weekday()) % 7
        if days_ahead == 0 and now.hour >= 13:
            days_ahead = 7
        next_monday = (now + timedelta(days=days_ahead)).replace(
            hour=13, minute=0, second=0, microsecond=0
        )
        wait_seconds = (next_monday - now).total_seconds()
        logger.info(
            f"Weekly digest scheduled for {next_monday.isoformat()} ({wait_seconds / 3600:.1f}h away)"
        )
        await asyncio.sleep(wait_seconds)
        try:
            result = await run_weekly_digest("https://carryon.us/dashboard")
            logger.info(f"Weekly digest sent: {result}")
        except Exception as e:
            logger.error(f"Weekly digest failed: {e}")
        try:
            admin_result = await send_admin_analytics_digest()
            logger.info(f"Admin analytics digest sent: {admin_result}")
        except Exception as e:
            logger.error(f"Admin analytics digest failed: {e}")


# Lifespan (replaces deprecated on_event)
@asynccontextmanager
async def lifespan(app):
    from routes.trial_reminders import trial_reminder_scheduler

    logger.info("CarryOn™ API started - ready for real accounts")

    # Create security-critical database indexes
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
        await db.estates.create_index("id", unique=True)
        await db.estates.create_index("owner_id")
        await db.documents.create_index("id", unique=True)
        await db.documents.create_index("estate_id")
        await db.messages.create_index("estate_id")
        await db.beneficiaries.create_index("estate_id")
        await db.security_audit_log.create_index("timestamp")
        await db.security_audit_log.create_index("user_id")
        await db.security_audit_log.create_index("estate_id")
        # TTL index: auto-delete failed login records after 1 hour
        await db.failed_logins.create_index("timestamp", expireAfterSeconds=3600)
        # TTL index: auto-delete expired OTPs after 15 minutes
        await db.otps.create_index("created_at", expireAfterSeconds=900)
        # TTL index: auto-delete blacklisted tokens after 9 hours (slightly > JWT expiry)
        await db.token_blacklist.create_index(
            "blacklisted_at", expireAfterSeconds=32400
        )
        await db.token_blacklist.create_index("token")
        await db.token_revocations.create_index("user_id", unique=True)
        # Edit history index for timeline queries
        await db.edit_history.create_index("estate_id")
        # OTP trust: auto-cleanup after 24 hours
        await db.otp_trust.create_index("expires_at", expireAfterSeconds=0)
        await db.otp_trust.create_index([("user_id", 1), ("ip_address", 1)])
        # Compliance indexes
        await db.phi_access_log.create_index("user_id")
        await db.phi_access_log.create_index("timestamp")
        await db.consent_audit_log.create_index("user_id")
        await db.deletion_requests.create_index("user_id")
        await db.security_incidents.create_index("created_at")
        await db.user_consent.create_index("user_id", unique=True)
        logger.info("Database indexes created/verified")
    except Exception as e:
        logger.warning(f"Index creation warning (may already exist): {e}")

    digest_task = asyncio.create_task(weekly_digest_scheduler())
    reminder_task = asyncio.create_task(trial_reminder_scheduler())
    yield
    digest_task.cancel()
    reminder_task.cancel()
    client.close()
    logger.info("CarryOn™ API shutting down")


# Create the main app
app = FastAPI(title="CarryOn™ API", version="1.0.0", lifespan=lifespan)

# Create the /api prefix router
api_router = APIRouter(prefix="/api")

# Include all routers
api_router.include_router(auth_router)
api_router.include_router(admin_router)
api_router.include_router(estates_router)
api_router.include_router(beneficiaries_router)
api_router.include_router(documents_router)
api_router.include_router(messages_router)
api_router.include_router(checklist_router)
api_router.include_router(transition_router)
api_router.include_router(dts_router)
api_router.include_router(guardian_router)
api_router.include_router(subscriptions_router)
api_router.include_router(support_router)
api_router.include_router(family_plan_router)
api_router.include_router(digital_wallet_router)
api_router.include_router(pdf_export_router)
api_router.include_router(security_router)
api_router.include_router(push_router)
api_router.include_router(digest_router)
api_router.include_router(admin_digest_router)
api_router.include_router(onboarding_router)
api_router.include_router(emergency_access_router)
api_router.include_router(timeline_router)
api_router.include_router(compliance_router)


# Health check
@api_router.get("/health")
async def health_check():
    """Check API and database health."""
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "disconnected"
    return {"status": "healthy", "database": db_status, "version": "1.0.0"}


# Include the main router
app.include_router(api_router)


# ===================== SECURITY MIDDLEWARE =====================


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        # Reject oversized request bodies (50MB max, prevents resource exhaustion)
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > 52_428_800:
            return Response(
                content='{"detail":"Request body too large"}',
                status_code=413,
                media_type="application/json",
            )

        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(self), geolocation=(), payment=(self)"
        )
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' https://*.carryon.us https://*.stripe.com https://*.emergentagent.com wss:; "
            "frame-src 'self' https://js.stripe.com https://hooks.stripe.com; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        # Prevent caching of sensitive API responses
        path = request.url.path
        if path.startswith("/api/") and path not in ("/api/health",):
            response.headers["Cache-Control"] = (
                "no-store, no-cache, must-revalidate, private"
            )
            response.headers["Pragma"] = "no-cache"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting for auth endpoints to prevent brute force attacks."""

    def __init__(self, app, max_requests: int = 20, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window_seconds
        self.requests = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        # Only rate-limit auth endpoints
        path = request.url.path
        # Stricter limits for login/auth (10/min), moderate for other sensitive endpoints
        strict_paths = [
            "/api/auth/login",
            "/api/auth/dev-login",
            "/api/auth/dev-switch",
            "/api/auth/verify-otp",
        ]
        moderate_paths = ["/api/auth/register"]

        limit = None
        if path in strict_paths:
            limit = 10
        elif path in moderate_paths:
            limit = self.max_requests
        if limit:
            forwarded = request.headers.get("x-forwarded-for", "")
            client_ip = (
                forwarded.split(",")[0].strip()
                if forwarded
                else (request.client.host if request.client else "unknown")
            )
            now = time.time()

            # Clean old entries
            self.requests[client_ip] = [
                t for t in self.requests[client_ip] if now - t < self.window
            ]

            if len(self.requests[client_ip]) >= limit:
                return Response(
                    content='{"detail":"Too many requests. Please wait before trying again."}',
                    status_code=429,
                    media_type="application/json",
                )

            self.requests[client_ip].append(now)

        return await call_next(request)


# Apply middleware (order matters: last added = first executed)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, max_requests=20, window_seconds=60)


# CORS Middleware
ALLOWED_ORIGINS = os.environ.get(
    "CORS_ORIGINS", "https://app.carryon.us,https://carryon.us,https://www.carryon.us"
).split(",")

# In preview/dev, also allow the preview URL
frontend_url = os.environ.get("FRONTEND_URL", "")
if frontend_url and frontend_url not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(frontend_url)

# Allow localhost only for local development (non-production)
backend_env = os.environ.get("RAILWAY_ENVIRONMENT", os.environ.get("NODE_ENV", ""))
if not backend_env or backend_env in ("development", "preview"):
    ALLOWED_ORIGINS.extend(["http://localhost:3000", "http://localhost:3001"])

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)
