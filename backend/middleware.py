"""CarryOn™ Backend — Security Middleware
Rate limiting, security headers, and CORS configuration.
"""

import os
import time
from collections import defaultdict

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
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
        path = request.url.path
        strict_paths = [
            "/api/auth/login",
            "/api/auth/verify-otp",
            "/api/auth/resend-otp",
            "/api/auth/verify-password",
            "/api/compliance/deletion-request",
        ]
        moderate_paths = [
            "/api/auth/register",
            "/api/compliance/data-export",
        ]
        exempt_paths = [
            "/api/auth/dev-login",
            "/api/auth/dev-switch",
            "/api/health",
        ]

        # Determine rate limit tier
        if path in exempt_paths:
            limit = None  # Admin-only endpoints, already auth-gated
        elif path in strict_paths:
            limit = 10  # Strict: 10/min for auth
        elif path in moderate_paths:
            limit = self.max_requests  # Moderate: 20/min
        elif path.startswith("/api/") and path != "/api/health":
            limit = 120  # General: 120/min for all API endpoints
        else:
            limit = None  # No limit for non-API paths
        if limit:
            forwarded = request.headers.get("x-forwarded-for", "")
            client_ip = (
                forwarded.split(",")[0].strip()
                if forwarded
                else (request.client.host if request.client else "unknown")
            )
            now = time.time()
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


def configure_cors(app):
    """Configure CORS middleware with allowed origins."""
    ALLOWED_ORIGINS = os.environ.get(
        "CORS_ORIGINS",
        "https://app.carryon.us,https://carryon.us,https://www.carryon.us",
    ).split(",")

    frontend_url = os.environ.get("FRONTEND_URL", "")
    if frontend_url and frontend_url not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(frontend_url)

    backend_env = os.environ.get(
        "RAILWAY_ENVIRONMENT", os.environ.get("NODE_ENV", "")
    )
    if not backend_env or backend_env in ("development", "preview"):
        ALLOWED_ORIGINS.extend(["http://localhost:3000", "http://localhost:3001"])

    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    )
