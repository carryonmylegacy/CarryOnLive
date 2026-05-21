"""CarryOn™ — Trustee Audit middleware (Feb 2026).

A surgical, opt-in middleware that runs ONLY when the inbound JWT carries
the `acting_as` claim (i.e., a logged-in trustee is operating the
benefactor portal). It captures pre-mutation snapshots, lets the request
run untouched, then records an undoable audit event + a notification on
the benefactor's account.

DESIGN PRINCIPLES
─────────────────
1. **Zero risk to non-trustee traffic.** The middleware is an early-out
   for any request whose Authorization header doesn't carry an
   `acting_as` claim. Branch coverage for that case is a single
   `decode_token` → return.
2. **No coupling to handlers.** Snapshot/audit happen at the ASGI layer
   so no route handler needs to change.
3. **Best-effort granular undo.** For paths matched by `_ROUTE_MAP` we
   capture (collection, primary_key) → full document and store it as
   `snapshot_before`. The benefactor sees an "Undo" button. For
   unmatched paths we still record a visibility-only notification so
   the benefactor sees something happened.

The middleware never raises — any internal failure is logged and the
request proceeds normally. This is by design: the platform's existing
behavior MUST NEVER be blocked by an audit-layer bug.
"""

from __future__ import annotations

import re
from typing import Callable

import jwt
from fastapi import Request
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware

from config import JWT_ALGORITHM, JWT_SECRET, db, logger

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


# ─── Route map: URL pattern → (collection, primary_key, summary template) ──
# Each entry is matched in order. The first match wins. Regex named groups
# `id` capture the primary key value from the path.

_ROUTE_MAP: list[tuple[re.Pattern[str], str, str, str]] = [
    # entities
    (re.compile(r"^/api/entities/(?P<id>[a-f0-9-]+)/?$"), "entities", "id", "entity"),
    (re.compile(r"^/api/entities/(?P<id>[a-f0-9-]+)/(lock|unlock)/?$"), "entities", "id", "entity"),
    # estates
    (re.compile(r"^/api/estates/(?P<id>[a-f0-9-]+)/?$"), "estates", "id", "estate"),
    # MM messages
    (re.compile(r"^/api/messages/(?P<id>[a-f0-9-]+)/?$"), "messages", "id", "milestone message"),
    # SDV documents
    (re.compile(r"^/api/documents/(?P<id>[a-f0-9-]+)/?$"), "documents", "id", "vault document"),
    # FFN contacts
    (re.compile(r"^/api/ffn/contacts/(?P<id>[a-f0-9-]+)/?$"), "ffn_contacts", "id", "FFN contact"),
    # Beneficiaries
    (re.compile(r"^/api/beneficiaries/(?P<id>[a-f0-9-]+)/?$"), "beneficiaries", "id", "beneficiary"),
    # Wills
    (re.compile(r"^/api/wills/(?P<id>[a-f0-9-]+)/?$"), "wills", "id", "will"),
    # DAV (digital wallet)
    (
        re.compile(r"^/api/digital-wallet/items/(?P<id>[a-f0-9-]+)/?$"),
        "digital_wallet_items",
        "id",
        "digital wallet item",
    ),
    # CCP protocols
    (re.compile(r"^/api/ccp/(?P<id>[a-f0-9-]+)/?$"), "ccp_protocols", "id", "contingency protocol"),
    # IAC checklist tasks
    (re.compile(r"^/api/checklist/(?P<id>[a-f0-9-]+)/?$"), "checklist_tasks", "id", "checklist task"),
    # CFP — bills, debts, accounts, property (May 21 2026 expansion so
    # trustee Undo works for every Financial Picture mutation).
    (re.compile(r"^/api/financial/bills/(?P<id>[a-f0-9-]+)/?$"), "bills", "id", "bill"),
    (re.compile(r"^/api/financial/payments/(?P<id>[a-f0-9-]+)/?$"), "bill_payments", "id", "bill payment"),
    (re.compile(r"^/api/financial/debts/(?P<id>[a-f0-9-]+)/?$"), "debts", "id", "debt"),
    (re.compile(r"^/api/financial/accounts/(?P<id>[a-f0-9-]+)/?$"), "financial_accounts", "id", "financial account"),
    (re.compile(r"^/api/financial/property/(?P<id>[a-f0-9-]+)/?$"), "property_assets", "id", "property asset"),
    (re.compile(r"^/api/financial/categories/(?P<id>[a-f0-9-]+)/?$"), "bill_categories", "id", "bill category"),
    # CFP — entities and supporting graph nodes
    (re.compile(r"^/api/financial/entities/(?P<id>[a-f0-9-]+)/?$"), "cfp_entities", "id", "entity"),
    (
        re.compile(r"^/api/financial/external-people/(?P<id>[a-f0-9-]+)/?$"),
        "cfp_external_people",
        "id",
        "external person",
    ),
    (
        re.compile(r"^/api/financial/entity-relationships/(?P<id>[a-f0-9-]+)/?$"),
        "cfp_entity_relationships",
        "id",
        "entity relationship",
    ),
    (
        re.compile(r"^/api/financial/beneficiary-blocks/(?P<id>[a-f0-9-]+)/?$"),
        "cfp_beneficiary_blocks",
        "id",
        "beneficiary block",
    ),
]


def _match_route(path: str) -> tuple[str, str, str, str] | None:
    """Return (collection, primary_key, label, doc_id) if path is mapped."""
    for pattern, collection, pk, label in _ROUTE_MAP:
        m = pattern.match(path)
        if m:
            return collection, pk, label, m.group("id")
    return None


def _extract_trustee_payload(auth_header: str | None) -> dict | None:
    """Return JWT payload IF the token carries an `acting_as` claim, else None."""
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None
    if not payload.get("acting_as"):
        return None
    return payload


class TrusteeAuditMiddleware(BaseHTTPMiddleware):
    """Snapshot + log every successful trustee mutation."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Fast-path early-outs — keep cost near-zero for non-trustee traffic.
        if request.method not in WRITE_METHODS:
            return await call_next(request)
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)
        # Never audit the trustee-management endpoints themselves; they are
        # already guarded server-side to refuse trustee callers.
        if path.startswith("/api/trustee/"):
            return await call_next(request)

        auth_header = request.headers.get("authorization")
        payload = _extract_trustee_payload(auth_header)
        if not payload:
            return await call_next(request)

        benefactor_id = payload.get("acting_as")
        grant_id = payload.get("trustee_grant_id", "")
        trustee_name = payload.get("trustee_display_name", "Trustee")

        # Snapshot before the mutation. Best-effort only.
        snapshot_before: dict | None = None
        collection: str | None = None
        primary_key = "id"
        primary_key_value: str | None = None
        operation = "update"
        label = "record"

        try:
            matched = _match_route(path)
            if matched:
                collection, primary_key, label, primary_key_value = matched
                if request.method == "DELETE":
                    operation = "delete"
                elif request.method == "POST":
                    operation = "create"
                else:
                    operation = "update"
                if collection and primary_key_value:
                    doc = await db[collection].find_one({primary_key: primary_key_value}, {"_id": 0})
                    if doc:
                        snapshot_before = doc
        except Exception as e:  # pragma: no cover — never block the request
            logger.warning(f"[TMA-audit] pre-snapshot failed for {path}: {e}")

        # Let the actual request run.
        response = await call_next(request)

        # Only record on successful 2xx mutations.
        if response.status_code < 200 or response.status_code >= 300:
            return response

        try:
            # Snapshot after (best-effort).
            snapshot_after = None
            if collection and primary_key_value and operation != "delete":
                snapshot_after = await db[collection].find_one({primary_key: primary_key_value}, {"_id": 0})

            method_verb = {
                "POST": "created",
                "PUT": "updated",
                "PATCH": "updated",
                "DELETE": "deleted",
            }.get(request.method, "changed")
            if operation == "delete":
                summary = f"{trustee_name} deleted a {label}."
            elif operation == "create":
                summary = f"{trustee_name} created a new {label}."
            else:
                summary = f"{trustee_name} {method_verb} a {label}."

            # Defer the import to here so the middleware module stays light.
            from routes.trustee_access import record_trustee_mutation

            await record_trustee_mutation(
                benefactor_id=benefactor_id,
                grant_id=grant_id,
                trustee_display_name=trustee_name,
                method=request.method,
                path=path,
                collection=collection,
                primary_key=primary_key,
                primary_key_value=primary_key_value,
                operation=operation,
                snapshot_before=snapshot_before,
                snapshot_after=snapshot_after,
                summary=summary,
                supports_undo=bool(collection and primary_key_value),
            )
        except Exception as e:  # pragma: no cover
            logger.warning(f"[TMA-audit] post-record failed for {path}: {e}")

        return response
