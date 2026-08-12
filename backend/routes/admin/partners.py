"""CarryOn™ Backend — B2B White-Label Partners

Persistent home for B2B/Enterprise partnerships. Each partner gets:
- A unique URL slug (`/p/{slug}`) for their co-branded landing page
- A unique enterprise code that users enter post-onboarding to unlock
  the partner's custom feature tier
- A 13-column boolean matrix of per-feature toggles (the pillars they
  negotiated with CarryOn to offer their clients)
- An optional S3-stored logo + free-form tagline shown on the landing
  page

Supersedes the legacy `b2b_codes` collection used in SubscriptionsTab
(kept alive for backwards-compat; new admin UI writes here).

Endpoints
─────────
GET    /api/admin/partners                — list (founder only)
POST   /api/admin/partners                — create
PUT    /api/admin/partners/{id}           — update fields / gates
POST   /api/admin/partners/{id}/logo      — upload partner logo (PNG/JPG ≤ 1MB)
DELETE /api/admin/partners/{id}           — delete

GET    /api/public/partners/{slug}        — public partner info for /p/:slug
GET    /api/public/partners/{slug}/logo   — stream the partner's logo bytes
GET    /api/partners/lookup/{code}        — auth-required code-to-partner lookup
POST   /api/partners/redeem-code          — auth-required, apply partner tier+gates
"""

import io
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import db, logger
from services.storage import storage
from utils import get_current_user

router = APIRouter()

# Public + end-user endpoints (partner landing page, code lookup/redeem).
# Mounted in routes/admin/__init__.py WITHOUT the router-level
# `require_scope("marketing")` dependency — that scope gate is for the
# founder-only CRUD above. Mounting these four under it (SOC2 CC6.1
# hardening) broke `/p/:slug` for anonymous visitors (401) and code
# redemption for regular users (403).
public_router = APIRouter()

# ─── Feature pillars (mirrors feature_gates.PLATFORM_FEATURES) ─────
# Kept locally so this module has no hard dependency on the tier
# gating system — partner gates are a separate, partner-scoped
# override that wins over the user's tier gates at runtime.
PARTNER_FEATURE_PILLARS = [
    {"key": "mm", "label": "Milestone Messages"},
    {"key": "sdv", "label": "Secure Document Vault"},
    {"key": "iac", "label": "Immediate Action Checklist"},
    {"key": "ega", "label": "Estate Guardian AI"},
    {"key": "ffn", "label": "Friends & Family Notification"},
    {"key": "dav", "label": "Digital Access Vault"},
    {"key": "dts", "label": "Designated Trustee Services"},
    {"key": "timeline", "label": "Estate Plan Timeline"},
    {"key": "ect", "label": "Estate Comms"},
    {"key": "ccp", "label": "Contingency Protocols"},
    {"key": "cfp", "label": "Financial Picture"},
    {"key": "bec", "label": "Beneficiary Estate Concierge"},
    {"key": "beneficiaries", "label": "Beneficiaries"},
    # CarryOn Entities & Structures defaults OFF — partners must
    # explicitly opt in. Broken out of CFP on May 22, 2026.
    {"key": "ces", "label": "CarryOn Entities & Structures", "default_off": True},
    # Trustee Mode Access defaults OFF — partners must explicitly opt in.
    {"key": "tma", "label": "Trustee Mode Access", "default_off": True},
]
PARTNER_FEATURE_KEYS = [f["key"] for f in PARTNER_FEATURE_PILLARS]

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$")
CODE_RE = re.compile(r"^[A-Z0-9_-]{3,50}$")


def _ensure_founder(current_user: dict) -> None:
    """B2B partner config is founder-only. Scoped admins (finance,
    marketing, etc.) cannot create or modify partnerships."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    scopes = current_user.get("admin_scope") or []
    if isinstance(scopes, str):
        scopes = [scopes]
    if scopes and "founder" not in scopes:
        raise HTTPException(status_code=403, detail="Founder only")


def _default_gates() -> dict:
    """Default new partners to ALL pillars enabled — the founder will
    toggle individual ones OFF based on what was negotiated. This is
    the inverse of the per-tier default-off convention because partner
    contracts almost always start as "everything in, then trim".

    Exception: any pillar carrying `default_off: True` (e.g. Trustee
    Mode Access) defaults to False — the founder must explicitly opt
    a partner in to that capability."""
    return {f["key"]: (not f.get("default_off", False)) for f in PARTNER_FEATURE_PILLARS}


def _coerce_gates(gates: Optional[dict]) -> dict:
    """Normalise an incoming gates dict — drops unknown keys, respects
    per-pillar defaults for missing values, coerces each value to bool."""
    out = _default_gates()
    if not isinstance(gates, dict):
        return out
    for k in PARTNER_FEATURE_KEYS:
        if k in gates:
            out[k] = bool(gates[k])
    return out


def _strip_oid(doc: dict | None) -> dict | None:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


def _slug_or_400(value: str) -> str:
    value = (value or "").strip().lower()
    if not SLUG_RE.match(value):
        raise HTTPException(
            status_code=400,
            detail="Slug must be 3–50 lowercase letters/numbers/hyphens (no leading/trailing hyphen).",
        )
    return value


def _code_or_400(value: str) -> str:
    value = (value or "").strip().upper()
    if not CODE_RE.match(value):
        raise HTTPException(
            status_code=400,
            detail="Code must be 3–50 chars (A-Z, 0-9, hyphen, underscore).",
        )
    return value


# ─── Admin CRUD ──────────────────────────────────────────────────


@router.get("/admin/partners")
async def list_partners(current_user: dict = Depends(get_current_user)):
    _ensure_founder(current_user)
    cursor = db.b2b_partners.find({}, {"_id": 0}).sort("created_at", -1)
    partners = await cursor.to_list(500)

    # Decorate each partner with the LIVE count of users currently
    # linked via `partner_id` so the founder sees "5 of 10 seats
    # active" at a glance. We count real `users` documents — not the
    # `times_used` counter — so deletions/refunds reflect immediately.
    if partners:
        ids = [p["id"] for p in partners]
        pipeline = [
            {"$match": {"partner_id": {"$in": ids}}},
            {"$group": {"_id": "$partner_id", "n": {"$sum": 1}}},
        ]
        counts = {row["_id"]: row["n"] async for row in db.users.aggregate(pipeline)}
        for p in partners:
            p["active_users_count"] = int(counts.get(p["id"], 0))
            # Backfill a display default for partners created before the
            # free-tier field existed (not persisted until the founder
            # actually toggles it — keeps the UI consistent).
            if not isinstance(p.get("free_feature_gates"), dict):
                p["free_feature_gates"] = _default_gates()

    # Inline-encode logo bytes as a data URL so the admin UI renders
    # the brand mark without a separate image fetch (which has been
    # racing with browser cache + CDN intermediaries in production
    # and showing a broken-image icon). Logos are tiny (capped at
    # 1 MB), so the bandwidth cost is acceptable for an admin list
    # called once per tab load.
    import base64

    for p in partners:
        key = p.get("logo_key")
        if not key:
            continue
        try:
            blob = await storage.download(key)
            ctype = p.get("logo_content_type") or "image/png"
            p["logo_data_url"] = f"data:{ctype};base64,{base64.b64encode(blob).decode('ascii')}"
        except Exception:  # noqa: BLE001
            logger.exception("Inline logo encode failed for partner %s", p.get("id"))

    return {
        "partners": partners,
        "feature_columns": PARTNER_FEATURE_PILLARS,
    }


class PartnerCreate(BaseModel):
    company_name: str
    slug: str
    code: str
    discount_percent: int = 100
    revshare_percent: int = 0
    max_uses: int = 0
    tagline: str = ""
    partner_email: str = ""
    feature_gates: Optional[dict] = None
    free_feature_gates: Optional[dict] = None
    active: bool = True


@router.post("/admin/partners")
async def create_partner(body: PartnerCreate, current_user: dict = Depends(get_current_user)):
    _ensure_founder(current_user)
    company_name = (body.company_name or "").strip()
    if not company_name or len(company_name) > 120:
        raise HTTPException(status_code=400, detail="Company name required (1–120 chars).")
    slug = _slug_or_400(body.slug)
    code = _code_or_400(body.code)

    if await db.b2b_partners.find_one({"slug": slug}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Slug already in use.")
    if await db.b2b_partners.find_one({"code": code}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Code already in use.")
    # Also guard against collisions with the legacy b2b_codes pool so
    # an old code in Subs doesn't shadow a new partner code.
    if await db.b2b_codes.find_one({"code": code}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Code already exists in legacy B2B codes.")

    doc = {
        "id": str(uuid.uuid4()),
        "company_name": company_name,
        "slug": slug,
        "code": code,
        "discount_percent": max(0, min(100, int(body.discount_percent))),
        "revshare_percent": max(0, min(100, int(body.revshare_percent))),
        "max_uses": max(0, int(body.max_uses)),
        "times_used": 0,
        "tagline": (body.tagline or "").strip()[:280],
        "partner_email": (body.partner_email or "").strip()[:120],
        "feature_gates": _coerce_gates(body.feature_gates),
        "free_feature_gates": _coerce_gates(body.free_feature_gates),
        "logo_key": None,
        "active": bool(body.active),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.b2b_partners.insert_one(doc)
    return _strip_oid(doc)


class PartnerUpdate(BaseModel):
    company_name: Optional[str] = None
    slug: Optional[str] = None
    code: Optional[str] = None
    discount_percent: Optional[int] = None
    revshare_percent: Optional[int] = None
    max_uses: Optional[int] = None
    tagline: Optional[str] = None
    partner_email: Optional[str] = None
    feature_gates: Optional[dict] = None
    free_feature_gates: Optional[dict] = None
    active: Optional[bool] = None


@router.put("/admin/partners/{partner_id}")
async def update_partner(
    partner_id: str,
    body: PartnerUpdate,
    current_user: dict = Depends(get_current_user),
):
    _ensure_founder(current_user)
    existing = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Partner not found.")

    update: dict = {}
    if body.company_name is not None:
        name = body.company_name.strip()
        if not name or len(name) > 120:
            raise HTTPException(status_code=400, detail="Company name 1–120 chars.")
        update["company_name"] = name
    if body.slug is not None and body.slug != existing.get("slug"):
        slug = _slug_or_400(body.slug)
        if await db.b2b_partners.find_one({"slug": slug, "id": {"$ne": partner_id}}, {"_id": 1}):
            raise HTTPException(status_code=400, detail="Slug already in use.")
        update["slug"] = slug
    if body.code is not None and body.code != existing.get("code"):
        code = _code_or_400(body.code)
        if await db.b2b_partners.find_one({"code": code, "id": {"$ne": partner_id}}, {"_id": 1}):
            raise HTTPException(status_code=400, detail="Code already in use.")
        if await db.b2b_codes.find_one({"code": code}, {"_id": 1}):
            raise HTTPException(status_code=400, detail="Code conflicts with legacy code.")
        update["code"] = code
    if body.discount_percent is not None:
        update["discount_percent"] = max(0, min(100, int(body.discount_percent)))
    if body.revshare_percent is not None:
        update["revshare_percent"] = max(0, min(100, int(body.revshare_percent)))
    if body.max_uses is not None:
        update["max_uses"] = max(0, int(body.max_uses))
    if body.tagline is not None:
        update["tagline"] = body.tagline.strip()[:280]
    if body.partner_email is not None:
        update["partner_email"] = body.partner_email.strip()[:120]
    if body.feature_gates is not None:
        update["feature_gates"] = _coerce_gates(body.feature_gates)
    if body.free_feature_gates is not None:
        update["free_feature_gates"] = _coerce_gates(body.free_feature_gates)
    if body.active is not None:
        update["active"] = bool(body.active)

    if update:
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.b2b_partners.update_one({"id": partner_id}, {"$set": update})

    updated = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0})
    return updated


@router.delete("/admin/partners/{partner_id}")
async def delete_partner(partner_id: str, current_user: dict = Depends(get_current_user)):
    _ensure_founder(current_user)
    existing = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Partner not found.")
    # Best-effort logo cleanup; failures are non-fatal.
    logo_key = existing.get("logo_key")
    if logo_key:
        try:
            await storage.delete(logo_key)
        except Exception:
            logger.exception("Partner logo delete failed for %s", logo_key)
    await db.b2b_partners.delete_one({"id": partner_id})
    return {"deleted": True}


# ─── Email partner welcome via Resend ─────────────────────────────


def _build_welcome_email(partner: dict, base_url: str) -> tuple[str, str]:
    """Returns (subject, html_body) for the partner welcome email.
    HTML mirrors the plain-text version used by the Partners tab's
    'Copy welcome email' button, but rendered for inbox display
    with branded headings, the unique landing URL as a button, the
    enterprise code as a monospace token, and the negotiated
    pillar list as a styled <ul>. Disabled pillars are filtered
    out so the recipient sees exactly what their members will."""
    company = partner.get("company_name") or "your team"
    code = partner.get("code") or ""
    slug = partner.get("slug") or ""
    landing = f"{base_url.rstrip('/')}/p/{slug}"
    enabled = [f for f in PARTNER_FEATURE_PILLARS if (partner.get("feature_gates") or {}).get(f["key"])]
    pillar_items = (
        "".join(f'<li style="margin:6px 0;color:#1f2937;">{f["label"]}</li>' for f in enabled)
        or '<li style="margin:6px 0;color:#1f2937;">Your custom CarryOn feature set</li>'
    )

    subject = f"Welcome to CarryOn — your {company} portal is live"
    html = f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fb;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.06);">
      <tr><td style="padding:32px 36px 8px;border-bottom:3px solid #d4af37;">
        <div style="color:#d4af37;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;">CarryOn Enterprises</div>
        <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#0f172a;font-weight:600;">Your {company} portal is live.</h1>
      </td></tr>
      <tr><td style="padding:24px 36px 8px;font-size:15px;line-height:1.6;color:#334155;">
        <p style="margin:0 0 14px;">Hi {company} team,</p>
        <p style="margin:0 0 14px;">Your co-branded CarryOn partner portal is ready. Share the link and access code below with your members — anyone who signs up through it will land in the custom experience we built for you.</p>
      </td></tr>
      <tr><td style="padding:8px 36px 8px;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;">
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:6px;">Your partner portal</div>
          <a href="{landing}" style="color:#1e40af;font-weight:600;text-decoration:none;word-break:break-all;">{landing}</a>
        </div>
      </td></tr>
      <tr><td style="padding:12px 36px 8px;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;">
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:6px;">Member access code</div>
          <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:0.08em;">{code}</div>
        </div>
      </td></tr>
      <tr><td style="padding:16px 36px 8px;">
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:8px;">Included for your members</div>
        <ul style="margin:0;padding:0 0 0 22px;font-size:15px;">{pillar_items}</ul>
      </td></tr>
      <tr><td style="padding:24px 36px;font-size:15px;line-height:1.6;color:#334155;">
        <p style="margin:0 0 14px;">When a member creates their account, the final signup step will ask for your access code. Once entered, they'll see only the pillars listed above — exactly the package we negotiated.</p>
        <p style="margin:0 0 6px;">Let me know when you'd like the first batch invited.</p>
      </td></tr>
      <tr><td style="padding:8px 36px 28px;font-size:14px;color:#475569;">
        — The CarryOn team
      </td></tr>
      <tr><td style="padding:14px 36px;background:#0f172a;color:#cbd5e1;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;text-align:center;font-weight:700;">
        Powered by CarryOn Enterprises Inc.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""
    return subject, html


@router.post("/admin/partners/{partner_id}/send-welcome")
async def send_partner_welcome(
    partner_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Send the welcome email to the partner via Resend. Body may
    optionally include `to` to override the partner's stored
    `partner_email` (handy for re-sending to a different stakeholder
    without mutating the partner record)."""
    _ensure_founder(current_user)
    partner = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found.")

    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    to_email = (body.get("to") or partner.get("partner_email") or "").strip()
    if not to_email or "@" not in to_email:
        raise HTTPException(
            status_code=400,
            detail="No partner email on file — add one to the row first.",
        )

    # Build the public-facing base URL for the landing-page link.
    # Use the `FRONTEND_URL` env var (the canonical public app URL
    # — same one every other email-sending service in this codebase
    # uses) rather than `request.url.netloc`, because the latter
    # resolves to the INTERNAL backend host when the request comes
    # through the Kubernetes ingress / reverse-proxy. That mismatch
    # was what made the email link 404 — it was pointing at the
    # backend API host where `/p/<slug>` is a frontend-only route.
    import os as _os

    base_url = (_os.environ.get("FRONTEND_URL") or f"{request.url.scheme}://{request.url.netloc}").rstrip("/")
    subject, html = _build_welcome_email(partner, base_url)

    from services.email import send_email

    ok = await send_email(to_email, subject, html)
    if not ok:
        raise HTTPException(
            status_code=502,
            detail="Email service did not accept the send — check Resend status.",
        )

    await db.b2b_partners.update_one(
        {"id": partner_id},
        {"$set": {"welcome_email_last_sent_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"sent": True, "to": to_email}


@router.post("/admin/partners/{partner_id}/logo")
async def upload_partner_logo(
    partner_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    _ensure_founder(current_user)
    existing = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Partner not found.")

    content_type = (file.content_type or "").lower()
    if content_type not in ("image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"):
        raise HTTPException(status_code=400, detail="Logo must be PNG, JPG, WebP, or SVG.")

    blob = await file.read()
    if not blob:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(blob) > 1024 * 1024:  # 1 MB cap — logos shouldn't need more
        raise HTTPException(status_code=400, detail="Logo too large (max 1 MB).")

    ext_map = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
        "image/svg+xml": "svg",
    }
    ext = ext_map[content_type]
    key = f"partner-logos/{partner_id}.{ext}"
    await storage.upload_raw(blob, key, content_type=content_type)

    await db.b2b_partners.update_one(
        {"id": partner_id},
        {
            "$set": {
                "logo_key": key,
                "logo_content_type": content_type,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {"logo_key": key, "content_type": content_type}


# ─── Public partner endpoints (drive /p/:slug) ────────────────────


@public_router.get("/public/partners/{slug}")
async def public_partner(slug: str):
    """Public partner info used to render `/p/:slug`. Returns ONLY the
    fields the unauthenticated landing page needs — no usage counts,
    no discount percent (those are negotiation details)."""
    slug = (slug or "").strip().lower()
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=404, detail="Partner not found.")
    doc = await db.b2b_partners.find_one({"slug": slug, "active": True}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Partner not found.")

    enabled_pillars = [f for f in PARTNER_FEATURE_PILLARS if doc.get("feature_gates", {}).get(f["key"], False)]

    # Inline-encode the logo bytes as a data URL so the landing page
    # renders the brand mark directly from the JSON response — no
    # separate image fetch that could be intercepted/cached/broken
    # by CDNs, browser caches, or stale 404s.
    logo_data_url = None
    if doc.get("logo_key"):
        try:
            import base64

            blob = await storage.download(doc["logo_key"])
            ctype = doc.get("logo_content_type") or "image/png"
            logo_data_url = f"data:{ctype};base64,{base64.b64encode(blob).decode('ascii')}"
        except Exception:  # noqa: BLE001
            logger.exception("Inline logo encode failed for partner %s", doc.get("id"))

    return {
        "slug": doc["slug"],
        "company_name": doc["company_name"],
        "tagline": doc.get("tagline", ""),
        "has_logo": bool(doc.get("logo_key")),
        "logo_data_url": logo_data_url,
        "updated_at": doc.get("updated_at"),
        "enabled_pillars": enabled_pillars,
    }


@public_router.get("/public/partners/{slug}/logo")
async def public_partner_logo(slug: str):
    """Streams the logo bytes. Public so the unauth landing page can
    render the partner's brand mark without leaking a presigned S3 URL.

    Successful responses are cached for 24h; failures are explicitly
    NOT cached so a transient S3 hiccup doesn't poison browsers for a
    full day. Clients should append `?v={updated_at}` to the URL to
    bust cache when an admin re-uploads."""
    slug = (slug or "").strip().lower()
    no_cache_headers = {"Cache-Control": "no-store", "Pragma": "no-cache"}
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=404, detail="Logo not found.", headers=no_cache_headers)
    doc = await db.b2b_partners.find_one(
        {"slug": slug, "active": True},
        {"_id": 0, "logo_key": 1, "logo_content_type": 1},
    )
    if not doc or not doc.get("logo_key"):
        raise HTTPException(status_code=404, detail="Logo not found.", headers=no_cache_headers)
    try:
        blob = await storage.download(doc["logo_key"])
    except Exception as exc:  # noqa: BLE001
        logger.exception("Partner logo fetch failed")
        raise HTTPException(status_code=404, detail="Logo not available.", headers=no_cache_headers) from exc
    return StreamingResponse(
        io.BytesIO(blob),
        media_type=doc.get("logo_content_type") or "image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ─── Code lookup & redeem (used by onboarding) ────────────────────


@public_router.get("/partners/lookup/{code}")
async def lookup_partner_code(code: str, current_user: dict = Depends(get_current_user)):
    """Look up a partner code without redeeming. Returns the partner's
    company name + slug so the onboarding page can render the polite
    "we couldn't find that code — please confirm with {company}" tile
    using the slug stashed in localStorage from `/p/:slug`."""
    code_str = (code or "").strip().upper()
    if not code_str:
        raise HTTPException(status_code=400, detail="Code required.")
    doc = await db.b2b_partners.find_one({"code": code_str, "active": True}, {"_id": 0, "company_name": 1, "slug": 1})
    if not doc:
        return {"found": False}
    return {"found": True, "company_name": doc["company_name"], "slug": doc["slug"]}


@public_router.post("/partners/redeem-code")
async def redeem_partner_code(request: Request, current_user: dict = Depends(get_current_user)):
    """End-of-onboarding code redemption. Marks the user as enterprise,
    binds them to the partner, copies the partner's feature gates onto
    the user as runtime overrides, and applies the partner's discount."""
    body = await request.json()
    code_str = (body.get("code") or "").strip().upper()
    if not code_str:
        raise HTTPException(status_code=400, detail="Code required.")

    partner = await db.b2b_partners.find_one({"code": code_str, "active": True}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Invalid or inactive code.")

    if partner.get("max_uses", 0) > 0 and partner.get("times_used", 0) >= partner["max_uses"]:
        raise HTTPException(status_code=400, detail="This code has reached its usage limit.")

    discount = int(partner.get("discount_percent", 100))
    gates = _coerce_gates(partner.get("feature_gates"))

    update_set = {
        # Link to the partner record — feature gates are
        # read LIVE from `b2b_partners` on every gate check,
        # so admin toggles propagate instantly.
        "partner_id": partner["id"],
        "partner_slug": partner["slug"],
        "partner_company": partner["company_name"],
        "b2b_code": code_str,
        "b2b_partner": partner["company_name"],
        "b2b_discount_percent": discount,
    }
    # Enterprise ($0) tier assignment applies ONLY when the partner
    # covers the bill (100% discount). Revenue-share partners
    # (discount 0) keep their members on RETAIL plans — the code adds
    # attribution + the partner's white-label feature set, and members
    # pay full retail through the normal Stripe paywall.
    if discount >= 100:
        update_set.update(
            {
                "eligible_tier": "enterprise",
                "special_status": ["enterprise"],
                "verified_tier": "enterprise",
            }
        )

    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": update_set,
            # Wipe any stale snapshot from a pre-live-read redemption.
            # The live read in feature_gates.py ignores this field
            # entirely, but keeping it around invites confusion.
            "$unset": {"partner_feature_gates": ""},
        },
    )

    # Auto-approve enterprise verification so the user lands inside
    # the platform with their entitlements live (no manual review
    # queue — the code IS the proof). Skipped for revenue-share
    # partners: those members are retail subscribers, not enterprise.
    if discount >= 100:
        verification = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "user_email": current_user.get("email", ""),
            "user_name": current_user.get("name", ""),
            "tier_requested": "enterprise",
            "status": "approved",
            "doc_type": "B2B Partner Code (Whitelabel)",
            "notes": (f"Partner: {partner['company_name']} | Code: {code_str} | Discount: {discount}%"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.tier_verifications.insert_one(verification)

    if discount >= 100:
        await db.subscription_overrides.update_one(
            {"user_id": current_user["id"]},
            {
                "$set": {
                    "user_id": current_user["id"],
                    "free_access": True,
                    "b2b_partner": partner["company_name"],
                }
            },
            upsert=True,
        )
    elif discount > 0:
        await db.subscription_overrides.update_one(
            {"user_id": current_user["id"]},
            {
                "$set": {
                    "user_id": current_user["id"],
                    "custom_discount": discount,
                    "b2b_partner": partner["company_name"],
                }
            },
            upsert=True,
        )

    await db.b2b_partners.update_one({"id": partner["id"]}, {"$inc": {"times_used": 1}})

    return {
        "applied": True,
        "company_name": partner["company_name"],
        "slug": partner["slug"],
        "discount_percent": discount,
        "feature_gates": gates,
    }


# ─── Rev-share reporting & partner rep management ─────────────────


def _monthly_equivalent(amount: float, billing_cycle: str) -> float:
    """Normalize a billing-period amount to its monthly equivalent."""
    if billing_cycle == "annual":
        return round(amount / 12.0, 2)
    if billing_cycle == "quarterly":
        return round(amount / 3.0, 2)
    return round(amount, 2)


@router.get("/admin/partners/{partner_id}/revshare-report")
async def partner_revshare_report(partner_id: str, current_user: dict = Depends(get_current_user)):
    """Monthly rev-share payout report for a partner.

    "Steady / non-churn" (founder definition, Jun 2026): the member's
    subscription is ACTIVE and in good standing right now, with a real
    paid amount (> $0, not a beta or free plan). Payout = the sum of
    monthly-equivalent revenue x the partner's revshare_percent."""
    _ensure_founder(current_user)
    partner = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found.")

    members = await db.users.find(
        {"partner_id": partner_id},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "created_at": 1, "account_status": 1},
    ).to_list(5000)
    member_ids = [m["id"] for m in members]
    subs_by_user: dict = {}
    if member_ids:
        subs = await db.user_subscriptions.find({"user_id": {"$in": member_ids}}, {"_id": 0}).to_list(5000)
        subs_by_user = {s["user_id"]: s for s in subs}

    pct = int(partner.get("revshare_percent", 0) or 0)
    qualifying = []
    non_qualifying = 0
    mrr = 0.0
    for m in members:
        sub = subs_by_user.get(m["id"])
        amount = float((sub or {}).get("amount") or 0)
        qualifies = (
            bool(sub)
            and sub.get("status") == "active"
            and amount > 0
            and not sub.get("beta_plan")
            and not sub.get("free_plan")
        )
        if not qualifies:
            non_qualifying += 1
            continue
        monthly = _monthly_equivalent(amount, sub.get("billing_cycle", "monthly"))
        mrr += monthly
        qualifying.append(
            {
                "user_id": m["id"],
                "name": m.get("name", ""),
                "email": m.get("email", ""),
                "plan_name": sub.get("plan_name", ""),
                "billing_cycle": sub.get("billing_cycle", "monthly"),
                "amount": amount,
                "monthly_equivalent": monthly,
                "activated_at": sub.get("activated_at"),
            }
        )
    mrr = round(mrr, 2)
    return {
        "partner_id": partner_id,
        "company_name": partner["company_name"],
        "revshare_percent": pct,
        "total_members": len(members),
        "paying_subscribers": len(qualifying),
        "non_qualifying_members": non_qualifying,
        "monthly_recurring_revenue": mrr,
        "monthly_payout": round(mrr * pct / 100.0, 2),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "subscribers": qualifying,
    }


class RepLinkRequest(BaseModel):
    email: str


@router.post("/admin/partners/{partner_id}/link-rep")
async def link_partner_rep(
    partner_id: str,
    body: RepLinkRequest,
    current_user: dict = Depends(get_current_user),
):
    """Designate an existing CarryOn user as this partner's REP — the
    person authorized to white-glove-provision client portals via the
    Pro Client Setup surface (/pro/clients). One rep per partner."""
    _ensure_founder(current_user)
    partner = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0, "id": 1, "company_name": 1})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found.")
    email_lower = (body.email or "").strip().lower()
    if not email_lower or "@" not in email_lower:
        raise HTTPException(status_code=400, detail="Valid email required.")
    rep = await db.users.find_one(
        {"$or": [{"email_lower": email_lower}, {"email": email_lower}]},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1},
    )
    if not rep:
        raise HTTPException(
            status_code=404,
            detail="No CarryOn account with that email. The rep must create their own account first (their partner landing page works).",
        )
    # One rep per partner — clear any previous holder, then assign.
    await db.users.update_many({"partner_rep_for": partner_id}, {"$unset": {"partner_rep_for": ""}})
    await db.users.update_one({"id": rep["id"]}, {"$set": {"partner_rep_for": partner_id}})
    await db.b2b_partners.update_one(
        {"id": partner_id},
        {
            "$set": {
                "rep_user_id": rep["id"],
                "rep_user_email": rep["email"],
                "rep_user_name": rep.get("name", ""),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {
        "linked": True,
        "rep_user_id": rep["id"],
        "rep_user_name": rep.get("name", ""),
        "rep_user_email": rep["email"],
    }


@router.delete("/admin/partners/{partner_id}/link-rep")
async def unlink_partner_rep(partner_id: str, current_user: dict = Depends(get_current_user)):
    _ensure_founder(current_user)
    await db.users.update_many({"partner_rep_for": partner_id}, {"$unset": {"partner_rep_for": ""}})
    await db.b2b_partners.update_one(
        {"id": partner_id},
        {
            "$unset": {"rep_user_id": "", "rep_user_email": "", "rep_user_name": ""},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    return {"unlinked": True}
