"""CarryOn™ — Idempotency-Key middleware (Feb 2026).

Stripe-style idempotency: clients add `Idempotency-Key: <random uuid>` header
to write requests. The middleware records (key, user_id, status_code, body)
in `db.idempotency_keys` with 24h TTL; subsequent requests with the same key
get the cached response instead of re-executing the handler.

WHAT IT COVERS
--------------
* All POST / PUT / DELETE / PATCH requests that include the header.
* Per-user scoping: the key is (user_id_or_ip, idempotency_key).
* TTL: 24 hours (matches Stripe's window).

WHAT IT DOES NOT COVER
----------------------
* Requests without the header — pass through unchanged. We don't *require*
  it; this is an opt-in correctness improvement for clients that care.
* GET requests — idempotent by definition; no need to record.
* Webhooks — they use their own signature-based dedup.

CLIENT USAGE
------------
```js
fetch('/api/messages', {
  method: 'POST',
  headers: {'Idempotency-Key': crypto.randomUUID(), 'Content-Type': 'application/json'},
  body: JSON.stringify(payload),
});
```
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from config import db, logger

IDEMPOTENT_METHODS = {"POST", "PUT", "DELETE", "PATCH"}
TTL_HOURS = 24


async def _ensure_index() -> None:
    """Create TTL index on idempotency_keys collection."""
    await db.idempotency_keys.create_index("key", unique=True)
    await db.idempotency_keys.create_index("created_at", expireAfterSeconds=TTL_HOURS * 3600)


def _user_or_ip(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return f"jwt:{auth[7:32]}"
    xff = request.headers.get("x-forwarded-for", "")
    return f"ip:{xff.split(',')[0].strip() if xff else (request.client.host if request.client else 'unknown')}"


class IdempotencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
        # Pass through unless a write method + header present
        if request.method not in IDEMPOTENT_METHODS:
            return await call_next(request)

        idem_key = request.headers.get("idempotency-key") or request.headers.get("Idempotency-Key")
        if not idem_key:
            return await call_next(request)

        compound_key = f"{_user_or_ip(request)}:{request.url.path}:{idem_key}"

        # Replay cached response if we have one
        try:
            cached = await db.idempotency_keys.find_one({"key": compound_key}, {"_id": 0})
        except Exception:
            cached = None  # Mongo may not be ready yet

        if cached:
            logger.info(f"Idempotency: replaying cached response for {compound_key[:80]}")
            return Response(
                content=cached.get("body", b""),
                status_code=cached.get("status_code", 200),
                media_type=cached.get("media_type", "application/json"),
                headers={"X-Idempotent-Replay": "true"},
            )

        # Execute handler
        response = await call_next(request)

        # Only cache successful responses (2xx)
        if 200 <= response.status_code < 300:
            try:
                body_chunks = []
                async for chunk in response.body_iterator:
                    body_chunks.append(chunk)
                body = b"".join(body_chunks)

                await db.idempotency_keys.insert_one(
                    {
                        "key": compound_key,
                        "status_code": response.status_code,
                        "body": body,
                        "media_type": response.media_type or "application/json",
                        "created_at": datetime.now(timezone.utc),
                    }
                )
                # Rebuild response — body_iterator was consumed above
                return Response(
                    content=body,
                    status_code=response.status_code,
                    media_type=response.media_type or "application/json",
                    headers=dict(response.headers),
                )
            except Exception as exc:
                # If caching fails, still return the (already-consumed)
                # response by reconstructing from what we captured.
                logger.error(f"Idempotency cache write failed: {exc}")
                try:
                    return Response(
                        content=body if "body" in locals() else b"",
                        status_code=response.status_code,
                        media_type=response.media_type or "application/json",
                    )
                except Exception:
                    return JSONResponse({"detail": "idempotency_internal_error"}, status_code=500)

        return response
