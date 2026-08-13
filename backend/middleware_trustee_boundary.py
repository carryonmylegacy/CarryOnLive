"""CarryOn™ — Trustee Boundary middleware (Aug 2026).

Fail-CLOSED companion to `middleware_trustee_audit.py`. When the inbound
JWT carries an `acting_as` claim (a DTS trustee OR a partner manager is
operating a client's benefactor portal), certain surfaces are personal
to the account owner and are refused outright with a 403:

  • Milestone Messages — ALL methods (view included; founder rule
    Aug 13 2026: "fully off-limits, they're personal letters").
  • Account security writes — password / email / username changes,
    passkey registration, SMS-OTP / 2FA preference changes.
  • Billing writes — any non-GET under /api/subscriptions.
  • Estate deletion — DELETE /api/estates/{id}.

Everything else (SDV uploads, entities, beneficiary profiles,
checklists, financial picture — all concierge work) passes through
untouched and is still audited by TrusteeAuditMiddleware.
"""

from __future__ import annotations

import re
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from middleware_trustee_audit import _extract_trustee_payload

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Fully off-limits in trustee mode — every method, view included.
_BLOCKED_ALL_PREFIXES = ("/api/messages", "/api/milestones")

# Blocked for write methods only (reads like GET /auth/2fa-preference
# stay available so the settings UI can still render).
_BLOCKED_WRITE_PREFIXES = (
    "/api/auth/change-password",
    "/api/auth/email",
    "/api/auth/username",
    "/api/auth/webauthn/register",
    "/api/auth/sms-otp",
    "/api/auth/2fa-preference",
    "/api/subscriptions",
)

_ESTATE_DELETE_RE = re.compile(r"^/api/estates/[^/]+/?$")

_MM_DETAIL = "Milestone Messages are personal to the account owner and are not available in trustee access."
_SECURITY_DETAIL = "Account security and billing can only be changed by the account owner."
_DELETE_DETAIL = "Only the account owner can delete their estate."


def _blocked_reason(method: str, path: str) -> str | None:
    if any(path.startswith(p) for p in _BLOCKED_ALL_PREFIXES):
        return _MM_DETAIL
    if method in WRITE_METHODS:
        if any(path.startswith(p) for p in _BLOCKED_WRITE_PREFIXES):
            return _SECURITY_DETAIL
        if method == "DELETE" and _ESTATE_DELETE_RE.match(path):
            return _DELETE_DETAIL
    return None


class TrusteeBoundaryMiddleware(BaseHTTPMiddleware):
    """403 personal-to-owner surfaces for any acting-as (trustee) session."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)
        reason = _blocked_reason(request.method, path)
        if reason is None:
            return await call_next(request)
        payload = _extract_trustee_payload(request.headers.get("authorization"))
        if not payload:
            return await call_next(request)
        return JSONResponse(status_code=403, content={"detail": reason})
