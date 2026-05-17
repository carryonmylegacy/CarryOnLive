"""Route policy registry — single source of truth for authorization.

Added Feb 12, 2026 after a P0 IDOR audit found 13 endpoints leaking PII
because authorization was scattered ad-hoc per-handler. From here on, every
route in /app/backend/routes/* MUST register its policy below (or carry the
@public_route decorator if it's intentionally open).

A CI gate in housekeeping.sh fails the push if a route handler exists without
a corresponding policy entry, preventing the next IDOR from sneaking in.

POLICY GRAMMAR
==============

  {
    "POST /api/messages/{message_id}/upload-video": {
        "auth": "required",              # required | optional | public
        "roles": ["benefactor", "admin"],   # roles that can call this route
        "estate_access": "owner",         # owner | member | none — gate against
                                          # estate_id taken from path/body
        "estate_id_source": "body.estate_id",  # path.<name> | body.<key> | path.<name>(<collection>)
        "notes": "Stripe checkout for paid plans",
    },
    ...
  }

`estate_id_source` patterns:
  - "path.<name>"                   → estate_id IS the path param <name>
  - "body.<key>"                    → estate_id is data[<key>] in the JSON body
  - "path.<name>(<collection>)"     → path param is an item id; estate_id comes
                                      from db.<collection>.find_one({"id": ...}).estate_id

The CI gate (housekeeping.sh `--strict`) parses all @router.<verb> decorators
under /app/backend/routes/ and fails if any are missing here.
"""

# ── Policies ────────────────────────────────────────────────────────────────

# Format: "METHOD /path" -> {auth, roles, estate_access, estate_id_source, notes}
ROUTE_POLICIES: dict = {
    # ── Auth (public flows + authenticated user-self) ──────────────────────
    "POST /api/auth/register": {"auth": "public"},
    "POST /api/auth/login": {"auth": "public"},
    "POST /api/auth/logout": {"auth": "required"},
    "POST /api/auth/refresh": {"auth": "public"},
    "GET /api/auth/me": {"auth": "required"},
    "POST /api/auth/forgot-password": {"auth": "public"},
    "POST /api/auth/reset-password": {"auth": "public"},
    "POST /api/auth/change-password": {"auth": "required"},
    # ── Health / status ────────────────────────────────────────────────────
    "GET /api/health/live": {"auth": "public"},
    "GET /api/health/ready": {"auth": "public"},
    # ── Subscriptions (covered by Monolith Reduction 3 + Stripe webhook) ──
    "GET /api/subscriptions/plans": {"auth": "public", "notes": "Public plan-catalog read"},
    "GET /api/subscriptions/status": {"auth": "required", "roles": "self"},
    "POST /api/subscriptions/checkout": {"auth": "required", "roles": ["benefactor", "beneficiary", "admin"]},
    "POST /api/subscriptions/change-plan": {"auth": "required", "roles": "self"},
    "POST /api/subscriptions/change-billing": {"auth": "required", "roles": "self"},
    "POST /api/subscriptions/cancel": {"auth": "required", "roles": "self"},
    "POST /api/webhook/stripe": {"auth": "public", "notes": "Stripe-signed; HMAC verified in handler"},
    "POST /api/subscriptions/validate-apple-receipt": {"auth": "required", "roles": "self"},
    "POST /api/subscriptions/sync-apple": {"auth": "required", "roles": "self"},
    "GET /api/admin/subscription-settings": {"auth": "required", "roles": ["admin", "operator"]},
    "PUT /api/admin/subscription-settings": {"auth": "required", "roles": ["admin"]},
    "GET /api/admin/user-subscriptions": {"auth": "required", "roles": ["admin", "operator"]},
    "PUT /api/admin/user-subscription/{user_id}": {"auth": "required", "roles": ["admin"]},
    "POST /api/admin/reset-subscription/{user_id}": {"auth": "required", "roles": ["admin"]},
    "PUT /api/admin/plans/{plan_id}/price": {"auth": "required", "roles": ["admin"]},
    "PUT /api/admin/beneficiary-plans/{plan_id}/price": {"auth": "required", "roles": ["admin"]},
    "GET /api/admin/family-discount-settings": {"auth": "required", "roles": ["admin"]},
    "PUT /api/admin/family-discount-settings": {"auth": "required", "roles": ["admin"]},
    "PUT /api/admin/plans/{plan_id}/paired-price": {"auth": "required", "roles": ["admin"]},
    # ── Estates (covered by ownership/admin checks inside handlers) ─────────
    "GET /api/estates": {"auth": "required", "roles": "self"},
    "POST /api/estates": {"auth": "required", "roles": ["benefactor", "admin"]},
    "GET /api/estates/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
    },
    "PUT /api/estates/{estate_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
    },
    # ── Beneficiaries — the HOT IDOR surface I just patched ─────────────────
    "GET /api/beneficiaries/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
    },
    "POST /api/beneficiaries": {
        "auth": "required",
        "roles": ["benefactor", "admin"],
        "estate_access": "owner",
        "estate_id_source": "body.estate_id",
    },
    "PUT /api/beneficiaries/{beneficiary_id}": {
        "auth": "required",
        "roles": ["benefactor", "admin"],
        "estate_access": "owner",
        "estate_id_source": "path.beneficiary_id(beneficiaries)",
    },
    "DELETE /api/beneficiaries/{beneficiary_id}": {
        "auth": "required",
        "roles": ["benefactor", "admin"],
        "estate_access": "owner",
        "estate_id_source": "path.beneficiary_id(beneficiaries)",
    },
    "POST /api/beneficiaries/{beneficiary_id}/photo": {
        "auth": "required",
        "roles": ["benefactor", "admin"],
        "estate_access": "owner",
        "estate_id_source": "path.beneficiary_id(beneficiaries)",
    },
    "DELETE /api/beneficiaries/{beneficiary_id}/photo": {
        "auth": "required",
        "roles": ["benefactor", "admin"],
        "estate_access": "owner",
        "estate_id_source": "path.beneficiary_id(beneficiaries)",
    },
    # ── Checklists — the HOT IDOR surface I just patched ───────────────────
    "GET /api/checklists/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
    },
    "POST /api/checklists": {
        "auth": "required",
        "roles": ["benefactor", "admin"],
        "estate_access": "owner",
        "estate_id_source": "body.estate_id",
    },
    "PUT /api/checklists/{item_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.item_id(checklists)",
    },
    "DELETE /api/checklists/{item_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.item_id(checklists)",
    },
    "PATCH /api/checklists/{item_id}/toggle": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.item_id(checklists)",
    },
    "POST /api/checklists/reorder": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "body.item_ids(checklists)",
    },
    "POST /api/checklists/{item_id}/accept": {
        "auth": "required",
        "roles": ["benefactor", "admin"],
        "estate_access": "owner",
        "estate_id_source": "path.item_id(checklists)",
    },
    "POST /api/checklists/{item_id}/reject": {
        "auth": "required",
        "roles": ["benefactor", "admin"],
        "estate_access": "owner",
        "estate_id_source": "path.item_id(checklists)",
    },
    "POST /api/checklists/{item_id}/reject-with-feedback": {
        "auth": "required",
        "roles": ["benefactor", "admin"],
        "estate_access": "owner",
        "estate_id_source": "path.item_id(checklists)",
    },
    # ── Messages — IDOR surface I just patched ─────────────────────────────
    "GET /api/messages/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
    },
    "POST /api/messages": {
        "auth": "required",
        "roles": ["benefactor", "admin"],
        "estate_access": "owner",
        "estate_id_source": "body.estate_id",
    },
    "PUT /api/messages/{message_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.message_id(messages)",
    },
    "DELETE /api/messages/{message_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.message_id(messages)",
    },
    "POST /api/messages/{message_id}/upload-video": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.message_id(messages)",
    },
    "POST /api/messages/{message_id}/upload-attachment": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.message_id(messages)",
    },
    "GET /api/messages/{message_id}/attachment": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.message_id(messages)",
    },
    "GET /api/messages/{message_id}/download": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.message_id(messages)",
    },
    "POST /api/messages/{message_id}/download-token": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.message_id(messages)",
    },
    # ── Documents (vault) ──────────────────────────────────────────────────
    "GET /api/documents/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
    },
    "POST /api/documents/upload": {"auth": "required", "estate_access": "owner", "estate_id_source": "body.estate_id"},
    "POST /api/documents/{document_id}/voice/setup": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.document_id(documents)",
    },
    "POST /api/documents/{document_id}/voice/verify": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.document_id(documents)",
    },
    "GET /api/documents/{document_id}/voice/hint": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.document_id(documents)",
    },
    # ── Guardian (EGA) ─────────────────────────────────────────────────────
    "POST /api/guardian/chat": {"auth": "required", "estate_access": "member", "estate_id_source": "body.estate_id"},
    "POST /api/guardian/export-todo": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "body.estate_id",
    },
    "POST /api/guardian/export-iac-report": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "body.estate_id",
    },
    "GET /api/guardian/iac-task-stream": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "query.estate_id",
    },
    # ── Beneficiary Concierge (BEC) ────────────────────────────────────────
    "POST /api/beneficiary/concierge/ask": {"auth": "required", "roles": ["beneficiary", "admin"]},
    # ── Admin tools (founder + operators only) ─────────────────────────────
    "GET /api/admin/users": {"auth": "required", "roles": ["admin", "operator"]},
    "POST /api/admin/announcements": {"auth": "required", "roles": ["admin"]},
    "GET /api/admin/email-health": {"auth": "required", "roles": ["admin"]},
    "GET /api/admin/support/conversations": {"auth": "required", "roles": ["admin", "operator"]},
    "GET /api/admin/llm-cost-summary": {"auth": "required", "roles": ["admin"]},
    "GET /api/admin/db-status": {"auth": "required", "roles": ["admin"]},
    # ── Estate Binder (combined PDF assembly) ──────────────────────────────
    "POST /api/estate-binder/generate": {"auth": "required"},
    "GET /api/estate-binder/manifest": {"auth": "required"},
    # ── Stripe / payments (public webhooks + authenticated) ─────────────────
    "POST /api/stripe/create-payment-intent": {"auth": "required"},
    "POST /api/stripe/create-setup-intent": {"auth": "required"},
}


# ── Auto-imported bulk policies (Feb 12, 2026) ──────────────────────────────
# 563 routes classified via heuristic in scripts/check_route_policies.py
# helper. ALL entries carry "auto-classified — review" in their notes; expect
# to manually audit each one in the post-pitch sweep. Stored in a separate
# file (route_policies_auto.py) so the curated set above stays readable, and
# merged at import time below.
from route_policies_auto import AUTO_IMPORTED_POLICIES  # noqa: E402

# Don't override the curated entries above.
for _k, _v in AUTO_IMPORTED_POLICIES.items():
    ROUTE_POLICIES.setdefault(_k, _v)


def is_route_registered(method: str, path: str) -> bool:
    """CI helper: returns True if a given route has a policy entry."""
    return f"{method.upper()} {path}" in ROUTE_POLICIES


def get_route_policy(method: str, path: str) -> dict | None:
    return ROUTE_POLICIES.get(f"{method.upper()} {path}")


# ── Routes intentionally excluded from the CI gate ──────────────────────────
# These are public-by-design endpoints documented as such elsewhere, OR
# transitional routes we haven't migrated yet. New entries here require a
# 1-line justification comment.
WAIVED_ROUTES: set = {
    # OPTIONS preflight is handled by FastAPI/Starlette CORS middleware
    "OPTIONS /*",
}
