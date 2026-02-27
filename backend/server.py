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
from routes.auth import router as auth_router
from routes.beneficiaries import router as beneficiaries_router
from routes.checklist import router as checklist_router
from routes.digest import router as digest_router
from routes.digital_wallet import router as digital_wallet_router
from routes.documents import router as documents_router
from routes.dts import router as dts_router
from routes.estates import router as estates_router
from routes.family_plan import router as family_plan_router
from routes.guardian import router as guardian_router
from routes.messages import router as messages_router
from routes.pdf_export import router as pdf_export_router
from routes.push import router as push_router
from routes.security import router as security_router
from routes.subscriptions import router as subscriptions_router
from routes.support import router as support_router
from routes.transition import router as transition_router
from routes.admin_digest import router as admin_digest_router

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
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
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
        rate_limited_paths = ["/api/auth/login", "/api/auth/register", "/api/auth/dev-login", "/api/auth/verify-otp"]

        if path in rate_limited_paths:
            client_ip = request.client.host if request.client else "unknown"
            now = time.time()

            # Clean old entries
            self.requests[client_ip] = [
                t for t in self.requests[client_ip] if now - t < self.window
            ]

            if len(self.requests[client_ip]) >= self.max_requests:
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
    "CORS_ORIGINS",
    "https://app.carryon.us,https://carryon.us,https://www.carryon.us"
).split(",")

# In preview/dev, also allow the preview URL
frontend_url = os.environ.get("FRONTEND_URL", "")
if frontend_url and frontend_url not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(frontend_url)

# Allow localhost for development
ALLOWED_ORIGINS.extend(["http://localhost:3000", "http://localhost:3001"])

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)
