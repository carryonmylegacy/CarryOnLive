"""CarryOn™ — Post-trial SDV-only lockdown (Aug 2026 founder rule).

When a benefactor's full-access period is over (trial expired, no
active subscription, no beta / free-mode / founder overrides), the ONLY
feature that stays usable is the Secure Document Vault. This middleware
is the fail-closed API twin of the `sdv_only_lockdown` flag returned by
GET /api/subscriptions/status (which drives the persistent banner and
greyed feature buttons in the UI).

Scope — deliberately narrow:
  • Write methods only (POST/PUT/PATCH/DELETE). Reads stay open so the
    dashboard shell, counts and existing data still render behind the
    greyed buttons ("your data is safe, nothing has been deleted").
  • Benefactor principals only (role claim == benefactor, or any
    acting-as trustee/manager session — the lock follows the CLIENT's
    subscription, so a manager clicked into an expired client is locked
    too). Beneficiary / admin / operator traffic is never touched.
  • Reuses guards.get_subscription_access (30s in-process cache, admin
    and beta/free overrides all honored) so beta mode ON keeps this
    middleware fully dormant until the founder flips it off.
"""

from __future__ import annotations

from typing import Callable

import jwt
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from config import JWT_ALGORITHM, JWT_SECRET, logger

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Feature API prefixes disabled during lockdown. SDV (/api/documents)
# is intentionally absent — it stays fully usable. Auth, subscriptions
# (so the user can BUY a plan) and estates reads also stay open.
_LOCKED_FEATURE_PREFIXES = (
    "/api/messages",
    "/api/milestones",
    "/api/beneficiaries",
    "/api/checklist",
    "/api/chat/guardian",
    "/api/ffn",
    "/api/digital-wallet",
    "/api/financial",
    "/api/estate-chat",
    "/api/ccp",
    "/api/wills",
    "/api/entities",
    "/api/timeline",
    "/api/trustee",
)

_LOCK_DETAIL = (
    "This account's full-access period has ended. Only the Secure Document Vault "
    "is available until a subscription is active. Existing data is preserved."
)


class SubscriptionLockMiddleware(BaseHTTPMiddleware):
    """403 feature writes for expired benefactor accounts (SDV exempt)."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method not in WRITE_METHODS:
            return await call_next(request)
        path = request.url.path
        if not any(path.startswith(p) for p in _LOCKED_FEATURE_PREFIXES):
            return await call_next(request)

        auth_header = request.headers.get("authorization") or ""
        if not auth_header.lower().startswith("bearer "):
            return await call_next(request)
        try:
            payload = jwt.decode(auth_header.split(" ", 1)[1].strip(), JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except Exception:
            return await call_next(request)

        acting_as = payload.get("acting_as")
        if payload.get("role") != "benefactor" and not acting_as:
            return await call_next(request)
        effective_id = acting_as or payload.get("user_id")
        if not effective_id:
            return await call_next(request)

        try:
            from guards import get_subscription_access

            access = await get_subscription_access({"id": effective_id})
        except HTTPException:
            # Unknown user etc. — the auth layer will reject downstream.
            return await call_next(request)
        except Exception as e:  # pragma: no cover — infra hiccup: let the handler fail loudly instead
            logger.warning(f"[sdv-lock] access check failed for {path}: {e}")
            return await call_next(request)

        if access.get("has_access"):
            return await call_next(request)
        return JSONResponse(status_code=403, content={"detail": _LOCK_DETAIL})
