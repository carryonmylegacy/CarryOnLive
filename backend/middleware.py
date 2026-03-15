"""CarryOn™ Backend — Security Middleware
Rate limiting, security headers, request tracing, and CORS configuration.
"""

import os
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware

from config import logger


# ── API Metrics Tracker ──────────────────────────────────────────────
class APIMetrics:
    """In-memory API performance metrics tracker."""

    def __init__(self, window_size=1000):
        self.start_time = datetime.now(timezone.utc)
        self.total_requests = 0
        self.error_4xx = 0
        self.error_5xx = 0
        self.response_times = deque(maxlen=window_size)  # last N response times
        self.endpoint_times = defaultdict(lambda: deque(maxlen=100))  # per-endpoint

    def record(self, path, status_code, elapsed_ms):
        self.total_requests += 1
        self.response_times.append(elapsed_ms)
        if 400 <= status_code < 500:
            self.error_4xx += 1
        elif status_code >= 500:
            self.error_5xx += 1
        # Track top endpoints
        clean_path = path.split("?")[0]
        self.endpoint_times[clean_path].append(elapsed_ms)

    def get_summary(self):
        times = list(self.response_times)
        uptime_seconds = (datetime.now(timezone.utc) - self.start_time).total_seconds()
        avg_ms = round(sum(times) / len(times), 1) if times else 0
        p95_ms = round(
            sorted(times)[int(len(times) * 0.95)] if len(times) >= 20 else max(times, default=0),
            1,
        )
        p99_ms = round(
            sorted(times)[int(len(times) * 0.99)] if len(times) >= 100 else max(times, default=0),
            1,
        )

        # Top 5 slowest endpoints
        slowest = []
        for path, etimes in self.endpoint_times.items():
            if len(etimes) >= 3:
                avg = round(sum(etimes) / len(etimes), 1)
                slowest.append({"path": path, "avg_ms": avg, "calls": len(etimes)})
        slowest.sort(key=lambda x: x["avg_ms"], reverse=True)

        return {
            "uptime_seconds": int(uptime_seconds),
            "uptime_formatted": self._format_uptime(uptime_seconds),
            "total_requests": self.total_requests,
            "error_4xx": self.error_4xx,
            "error_5xx": self.error_5xx,
            "error_rate_pct": round((self.error_5xx / max(self.total_requests, 1)) * 100, 2),
            "avg_response_ms": avg_ms,
            "p95_response_ms": p95_ms,
            "p99_response_ms": p99_ms,
            "sample_size": len(times),
            "slowest_endpoints": slowest[:5],
            "started_at": self.start_time.isoformat(),
        }

    @staticmethod
    def _format_uptime(seconds):
        days = int(seconds // 86400)
        hours = int((seconds % 86400) // 3600)
        minutes = int((seconds % 3600) // 60)
        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        parts.append(f"{minutes}m")
        return " ".join(parts)


# Global metrics instance
api_metrics = APIMetrics()


class RequestTraceMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID, log structured info, and track API metrics."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid.uuid4())[:8])
        request.state.request_id = request_id

        start = time.monotonic()
        response = await call_next(request)
        elapsed_ms = round((time.monotonic() - start) * 1000)

        path = request.url.path
        status = response.status_code

        # Skip logging for: health checks, and expected 401s from frontend
        # polling endpoints before user is authenticated
        skip_log = path == "/api/health" or (
            status == 401
            and path
            in (
                "/api/notifications",
                "/api/notifications/unread-count",
                "/api/support/messages",
            )
        )

        if path.startswith("/api/") and not skip_log:
            logger.info(
                "req=%s method=%s path=%s status=%d ms=%d",
                request_id,
                request.method,
                path,
                response.status_code,
                elapsed_ms,
            )
            # Track metrics
            api_metrics.record(path, response.status_code, elapsed_ms)

        response.headers["X-Request-Id"] = request_id
        return response


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
        response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=(), payment=(self)"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://unpkg.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' https://*.carryon.us https://*.stripe.com https://*.emergentagent.com https://unpkg.com wss:; "
            "worker-src 'self' blob: https://unpkg.com; "
            "frame-src 'self' https://js.stripe.com https://hooks.stripe.com; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        path = request.url.path
        if path.startswith("/api/") and path not in ("/api/health",):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
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
            "/api/auth/check-email",
            "/api/auth/check-benefactor-email",
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
            limit = 30  # Auth endpoints: limit to prevent brute force
        elif path in moderate_paths:
            limit = self.max_requests  # Moderate: 20/min
        elif path.startswith("/api/") and path != "/api/health":
            limit = 120  # General: 120/min for all API endpoints
        else:
            limit = None  # No limit for non-API paths
        if limit:
            forwarded = request.headers.get("x-forwarded-for", "")
            client_ip = (
                forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
            )
            now = time.time()
            self.requests[client_ip] = [t for t in self.requests[client_ip] if now - t < self.window]
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
