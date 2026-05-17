"""CarryOn™ — DoS hardening middleware (Feb 2026).

Three layers of defense-in-depth against malicious or runaway requests:

1. **Body-size limit** — 10MB hard cap on the request body. Anything larger
   gets `413 Payload Too Large` before the handler ever sees it. Exceptions
   for `/api/uploads/*` (chunked upload endpoints which legitimately accept
   100MB+ chunks) and `/api/voice/*` (audio uploads) which use their own
   internal limits.

2. **Request timeout** — 60-second wall-clock cap on each request. After
   that we cancel the handler (which propagates to the Mongo query and any
   outbound httpx calls via asyncio.CancelledError) and return `504 Gateway
   Timeout`. Override per route via `request.scope["timeout_s"] = N`.

3. **In-flight cap** — at most 200 concurrent in-flight requests per pod.
   Beyond that we return `503 Service Unavailable`. This protects Mongo
   from sudden traffic spikes that would exhaust the connection pool.

Not in this file (handled elsewhere):
- IP/user rate limiting (`middleware.py` RateLimitMiddleware — Mongo-backed)
- Auth (`utils.py` get_current_user)
- Idempotency (`middleware_idempotency.py`)
"""

from __future__ import annotations

import asyncio
import os
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from config import logger

MAX_BODY_BYTES = int(os.environ.get("MAX_REQUEST_BODY_BYTES", str(10 * 1024 * 1024)))  # 10MB
DEFAULT_REQUEST_TIMEOUT_S = int(os.environ.get("REQUEST_TIMEOUT_S", "60"))
MAX_INFLIGHT = int(os.environ.get("MAX_INFLIGHT_REQUESTS", "200"))

# Paths exempted from body-size cap (legitimately large)
LARGE_BODY_PATHS = (
    "/api/uploads/",
    "/api/upload/",
    "/api/voice/",
    "/api/documents/upload",
    "/api/photos/upload",
)

# Paths with their own custom timeouts
LONG_RUNNING_PATHS = {
    "/api/chat/guardian": 90,  # LLM responses can be slow
    "/api/beneficiary/concierge/ask": 90,
    "/api/guardian/export-todo": 120,  # PDF gen + LLM
    "/api/guardian/export-iac-report": 120,
}

_inflight_semaphore = asyncio.Semaphore(MAX_INFLIGHT)


class DoSHardeningMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
        path = request.url.path

        # ── Body-size cap ────────────────────────────────────────────────
        if request.method in ("POST", "PUT", "PATCH"):
            if not any(path.startswith(p) for p in LARGE_BODY_PATHS):
                content_length = request.headers.get("content-length")
                if content_length and content_length.isdigit() and int(content_length) > MAX_BODY_BYTES:
                    logger.warning(f"DoS: body too large ({content_length} bytes) for {path}")
                    return JSONResponse(
                        status_code=413,
                        content={"detail": f"Request body exceeds {MAX_BODY_BYTES // 1024 // 1024}MB limit"},
                    )

        # ── In-flight cap ────────────────────────────────────────────────
        if _inflight_semaphore.locked():
            # Try to acquire with a tiny timeout so we don't hold the connection
            try:
                await asyncio.wait_for(_inflight_semaphore.acquire(), timeout=0.5)
            except asyncio.TimeoutError:
                logger.warning(f"DoS: in-flight cap hit ({MAX_INFLIGHT}) — rejecting {path}")
                return JSONResponse(
                    status_code=503,
                    content={"detail": "Server is at capacity. Please retry in a few seconds."},
                    headers={"Retry-After": "5"},
                )
        else:
            await _inflight_semaphore.acquire()

        # ── Wall-clock timeout ───────────────────────────────────────────
        timeout_s = LONG_RUNNING_PATHS.get(path, DEFAULT_REQUEST_TIMEOUT_S)
        try:
            return await asyncio.wait_for(call_next(request), timeout=timeout_s)
        except asyncio.TimeoutError:
            logger.error(f"DoS: request timeout after {timeout_s}s on {path}")
            return JSONResponse(
                status_code=504,
                content={"detail": f"Request exceeded {timeout_s}s timeout"},
            )
        finally:
            _inflight_semaphore.release()
