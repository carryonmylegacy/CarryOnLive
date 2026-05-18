"""CarryOn™ — Shareable Estate Binder links

Lets a benefactor generate a public, short-lived URL that hands an
external recipient (estate attorney, CPA, family member) a download
of their Estate Binder WITHOUT requiring the recipient to have a
CarryOn account.

────────────────────────────────────────────────────────────────────
Architecture
────────────────────────────────────────────────────────────────────
1. Creator (authenticated benefactor) POSTs /api/share/binder with
   optional TTL hours, max_opens, and a passphrase. Server:
     • validates the user has a non-trivial cached `estate_binder` PDF
       in `latest_pdfs`,
     • enforces per-user caps (max 5 active shares, configurable),
     • mints a 32-byte URL-safe token,
     • stores a row in `binder_shares` Mongo collection,
     • writes a `share.binder.created` audit_trail entry.

2. Recipient opens https://app.carryon.us/s/<token>. The frontend
   /share page calls GET /api/share/<token>. Server:
     • checks not revoked, not expired, opens < max_opens,
     • optionally validates the passphrase via header,
     • increments opens + writes `share.binder.opened` audit entry,
     • returns 302 redirect to a 5-minute presigned S3 URL — the
       PDF streams to the recipient DIRECTLY from S3. The CarryOn
       backend pod is touched once per open (cheap) and never sees
       the binder bytes themselves.

3. Creator can GET /api/share/my for a list of their active shares
   (with open counts) or DELETE /api/share/<token> to revoke.

────────────────────────────────────────────────────────────────────
Guardrails (DEFAULTS — hardcoded for the pitch demo)
────────────────────────────────────────────────────────────────────
   MAX_ACTIVE_SHARES_PER_USER = 5
   MAX_OPENS_PER_SHARE        = 50  (hard ceiling)
   DEFAULT_OPENS_PER_SHARE    = 10
   MIN_TTL_HOURS              = 1
   MAX_TTL_HOURS              = 168 (7 days)
   DEFAULT_TTL_HOURS          = 24
   SHARE_CREATE_RATE_LIMIT    = 10 per hour per user
   SHARE_OPEN_RATE_LIMIT      = 30 per minute per (token, ip)
   TOKEN_BYTES                = 32 (URL-safe; ~256 bits of entropy)
   PASSPHRASE_MIN_LEN         = 6
   PRESIGN_EXPIRY_SECONDS     = 300 (5 min)

Indexes (idempotent, created on first request):
   token (unique), user_id (lookup), expires_at (TTL auto-cleanup).
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field

from config import db, logger
from services.audit import get_client_ip, log_audit_event
from services.rate_limiter import check_and_increment
from services.storage import storage
from utils import get_current_user

router = APIRouter()

# ─── Guardrail constants ──────────────────────────────────────────
MAX_ACTIVE_SHARES_PER_USER = 5
MAX_OPENS_PER_SHARE = 50
DEFAULT_OPENS_PER_SHARE = 10
MIN_TTL_HOURS = 1
MAX_TTL_HOURS = 168  # 7 days
DEFAULT_TTL_HOURS = 24
SHARE_CREATE_RATE_LIMIT = 10  # per hour per user
SHARE_CREATE_WINDOW_S = 3600
SHARE_OPEN_RATE_LIMIT = 30  # per minute per (token, ip)
SHARE_OPEN_WINDOW_S = 60
TOKEN_BYTES = 32
PASSPHRASE_MIN_LEN = 6
PRESIGN_EXPIRY_SECONDS = 300
MIN_BINDER_BYTES = 500  # smaller than this = probably corrupt; refuse to share

_indexes_ready = False


async def _ensure_indexes() -> None:
    global _indexes_ready
    if _indexes_ready:
        return
    try:
        await db.binder_shares.create_index("token", unique=True)
        await db.binder_shares.create_index([("user_id", 1), ("revoked", 1), ("expires_at", 1)])
        # MongoDB auto-deletes documents once `expires_at` (a datetime, NOT iso str)
        # is past — but we ALSO store an `expires_at_iso` string for API responses.
        await db.binder_shares.create_index("expires_at", expireAfterSeconds=0)
        _indexes_ready = True
    except Exception as exc:  # noqa: BLE001
        logger.debug(f"binder_shares index setup deferred: {exc}")


def _hash_passphrase(plain: str) -> str:
    """One-way hash for the passphrase. We never reversibly store it."""
    # Cheap PBKDF2 — passphrases are short-lived and rate-limited at open time,
    # so we don't need bcrypt-level resistance. 100k iterations is plenty.
    salt = b"carryon-share-v1"  # deterministic salt is fine since the token is the secret
    digest = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, 100_000)
    return digest.hex()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _public_share_view(row: dict) -> dict:
    """Strip internal fields before returning to the share owner."""
    return {
        "token": row["token"],
        "share_url": row.get("share_url", ""),
        "title": row.get("title", "Estate Binder"),
        "created_at": row.get("created_at"),
        "expires_at": row.get("expires_at_iso"),
        "max_opens": row.get("max_opens"),
        "opens": row.get("opens", 0),
        "last_opened_at": row.get("last_opened_at"),
        "requires_passphrase": bool(row.get("passphrase_hash")),
        "revoked": bool(row.get("revoked")),
    }


# ─── Request models ────────────────────────────────────────────────


class CreateShareRequest(BaseModel):
    ttl_hours: int = Field(default=DEFAULT_TTL_HOURS, ge=MIN_TTL_HOURS, le=MAX_TTL_HOURS)
    max_opens: int = Field(default=DEFAULT_OPENS_PER_SHARE, ge=1, le=MAX_OPENS_PER_SHARE)
    passphrase: str | None = None  # optional; min length enforced if present


# ─── Create ────────────────────────────────────────────────────────


@router.post("/share/binder")
async def create_binder_share(
    body: CreateShareRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Mint a shareable link for the user's most-recently-cached Estate Binder."""
    await _ensure_indexes()
    user_id = current_user["id"]

    # ── Rate-limit creation per user ──
    ok = await check_and_increment(
        key=f"share:create:{user_id}",
        limit=SHARE_CREATE_RATE_LIMIT,
        window_seconds=SHARE_CREATE_WINDOW_S,
    )
    if not ok:
        raise HTTPException(
            status_code=429,
            detail=f"Too many share links in the last hour. Limit: {SHARE_CREATE_RATE_LIMIT}/hr.",
        )

    # ── Validate passphrase if provided ──
    passphrase_hash = None
    if body.passphrase is not None:
        if len(body.passphrase) < PASSPHRASE_MIN_LEN:
            raise HTTPException(
                status_code=400,
                detail=f"Passphrase must be at least {PASSPHRASE_MIN_LEN} characters.",
            )
        passphrase_hash = _hash_passphrase(body.passphrase)

    # ── Verify the user actually has a cached binder ──
    binder = await db.latest_pdfs.find_one(
        {"user_id": user_id, "pdf_type": "estate_binder"},
        {"_id": 0, "id": 1, "s3_key": 1, "size_bytes": 1, "title": 1, "subtitle": 1, "filename": 1},
    )
    if not binder:
        raise HTTPException(
            status_code=404,
            detail="No Estate Binder has been generated yet. Tap 'Open Binder' first.",
        )
    if (binder.get("size_bytes") or 0) < MIN_BINDER_BYTES:
        raise HTTPException(
            status_code=409,
            detail="Cached binder looks corrupt — please regenerate it before sharing.",
        )

    # ── Cap active shares per user ──
    active_count = await db.binder_shares.count_documents(
        {
            "user_id": user_id,
            "revoked": False,
            "expires_at": {"$gt": _now()},
        }
    )
    if active_count >= MAX_ACTIVE_SHARES_PER_USER:
        raise HTTPException(
            status_code=409,
            detail=(
                f"You already have {active_count} active share links. "
                f"Revoke one before creating another (limit {MAX_ACTIVE_SHARES_PER_USER})."
            ),
        )

    # ── Mint token + row ──
    token = secrets.token_urlsafe(TOKEN_BYTES)
    now = _now()
    expires_at = now + timedelta(hours=body.ttl_hours)
    estate_id_lookup = await db.estates.find_one(
        {"owner_id": user_id, "deleted_at": None},
        {"_id": 0, "id": 1, "name": 1},
    )
    estate_id = (estate_id_lookup or {}).get("id", "")
    estate_name = (estate_id_lookup or {}).get("name", "")

    # Build the public share URL. Prefer the canonical FRONTEND_URL env
    # (set on production + preview) so we never accidentally hand the
    # recipient an internal cluster hostname. Fall back to a Origin/x-share
    # header pair, then synthesise from the request as a last resort.
    import os

    origin = (
        os.environ.get("FRONTEND_URL")
        or request.headers.get("x-share-origin")
        or request.headers.get("origin")
        or f"{request.url.scheme}://{request.url.netloc}"
    ).rstrip("/")
    share_url = f"{origin}/s/{token}"

    row = {
        "id": secrets.token_urlsafe(16),
        "token": token,
        "user_id": user_id,
        "estate_id": estate_id,
        "estate_name": estate_name,
        "pdf_type": "estate_binder",
        "s3_key": binder["s3_key"],
        "title": binder.get("title") or "Estate Binder",
        "filename": binder.get("filename") or "estate_binder.pdf",
        "share_url": share_url,
        "expires_at": expires_at,  # datetime → TTL index
        "expires_at_iso": expires_at.isoformat(),
        "max_opens": body.max_opens,
        "opens": 0,
        "passphrase_hash": passphrase_hash,
        "revoked": False,
        "created_at": now.isoformat(),
        "last_opened_at": None,
        "creator_ip": get_client_ip(request),
    }
    await db.binder_shares.insert_one(row)

    # ── Audit ──
    await log_audit_event(
        actor_id=user_id,
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", ""),
        action="share.binder.created",
        category="data_share",
        resource_type="binder_share",
        resource_id=row["id"],
        details={
            "expires_at": expires_at.isoformat(),
            "max_opens": body.max_opens,
            "passphrase_required": passphrase_hash is not None,
            "estate_id": estate_id,
        },
        ip_address=get_client_ip(request),
        severity="info",
    )

    return _public_share_view(row)


# ─── List ──────────────────────────────────────────────────────────


@router.get("/share/my")
async def list_my_shares(current_user: dict = Depends(get_current_user)):
    """Return the caller's active + recently-expired shares (last 30)."""
    await _ensure_indexes()
    user_id = current_user["id"]
    cursor = db.binder_shares.find({"user_id": user_id}, {"_id": 0, "passphrase_hash": 0}).sort("created_at", -1)
    items = await cursor.to_list(30)
    # Normalise datetimes for JSON safety.
    for it in items:
        if isinstance(it.get("expires_at"), datetime):
            it["expires_at"] = it["expires_at"].isoformat()
        # Strip internal-only fields explicitly.
        it.pop("creator_ip", None)
        it.pop("s3_key", None)
    return {
        "shares": items,
        "limits": {
            "max_active": MAX_ACTIVE_SHARES_PER_USER,
            "max_opens_per_share": MAX_OPENS_PER_SHARE,
            "max_ttl_hours": MAX_TTL_HOURS,
        },
    }


# ─── Revoke ────────────────────────────────────────────────────────


@router.delete("/share/binder/{token}")
async def revoke_share(
    token: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    await _ensure_indexes()
    user_id = current_user["id"]
    row = await db.binder_shares.find_one({"token": token, "user_id": user_id}, {"_id": 0, "id": 1, "revoked": 1})
    if not row:
        raise HTTPException(status_code=404, detail="Share link not found.")
    if row.get("revoked"):
        return {"revoked": True, "already_revoked": True}
    await db.binder_shares.update_one(
        {"token": token, "user_id": user_id},
        {"$set": {"revoked": True, "revoked_at": _now().isoformat()}},
    )
    await log_audit_event(
        actor_id=user_id,
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", ""),
        action="share.binder.revoked",
        category="data_share",
        resource_type="binder_share",
        resource_id=row["id"],
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {"revoked": True}


# ─── Public open ───────────────────────────────────────────────────


@router.get("/share/binder/{token}")
async def open_share(
    token: str,
    request: Request,
    passphrase: str | None = None,
):
    """Public endpoint — no auth. Validates the token then either:
      • redirects (302) to a 5-min presigned S3 URL (production), or
      • streams the bytes through the backend (LocalStorage/dev only).

    The frontend /s/<token> page first hits HEAD-style GET WITHOUT a
    passphrase to discover whether one is required, then re-issues
    with `?passphrase=...` once the user types it. Wrong passphrase
    returns 401 — opens counter is NOT incremented in that case.
    """
    await _ensure_indexes()

    # ── Rate-limit (per token + ip) ──
    client_ip = get_client_ip(request)
    ok = await check_and_increment(
        key=f"share:open:{token}:{client_ip}",
        limit=SHARE_OPEN_RATE_LIMIT,
        window_seconds=SHARE_OPEN_WINDOW_S,
    )
    if not ok:
        raise HTTPException(status_code=429, detail="Too many requests. Slow down.")

    row = await db.binder_shares.find_one({"token": token})
    if not row:
        raise HTTPException(status_code=404, detail="This share link is invalid or has been revoked.")

    if row.get("revoked"):
        raise HTTPException(status_code=410, detail="This share link has been revoked by the owner.")

    expires_at = row.get("expires_at")
    if isinstance(expires_at, datetime):
        # MongoDB strips tzinfo on round-trip; normalise to UTC for comparison.
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < _now():
            raise HTTPException(status_code=410, detail="This share link has expired.")

    if (row.get("opens", 0) or 0) >= (row.get("max_opens", 0) or 0):
        raise HTTPException(status_code=410, detail="This share link has reached its download limit.")

    # ── Passphrase check ──
    if row.get("passphrase_hash"):
        if not passphrase:
            # Discoverable hint — frontend uses this to render the input.
            return JSONResponse(
                status_code=401,
                content={
                    "passphrase_required": True,
                    "title": row.get("title", "Estate Binder"),
                    "estate_name": row.get("estate_name", ""),
                },
            )
        if _hash_passphrase(passphrase) != row["passphrase_hash"]:
            # NOTE: we don't audit-log every wrong attempt (would let
            # an attacker DOS the audit trail). The rate-limit above
            # makes brute-force impractical anyway (30/min/ip).
            raise HTTPException(status_code=401, detail="Incorrect passphrase.")

    # ── Increment open counter atomically, then audit ──
    upd = await db.binder_shares.find_one_and_update(
        {"token": token, "opens": {"$lt": row.get("max_opens", DEFAULT_OPENS_PER_SHARE)}},
        {
            "$inc": {"opens": 1},
            "$set": {"last_opened_at": _now().isoformat()},
            "$push": {
                "open_log": {
                    "$each": [
                        {
                            "at": _now().isoformat(),
                            "ip": client_ip,
                            "ua": (request.headers.get("user-agent") or "")[:200],
                        }
                    ],
                    "$slice": -50,  # keep last 50 only
                }
            },
        },
        return_document=True,
    )
    if not upd:
        # Race lost — someone else just exhausted the limit.
        raise HTTPException(status_code=410, detail="This share link has reached its download limit.")

    await log_audit_event(
        actor_id="anonymous",
        actor_email="",
        actor_role="public",
        action="share.binder.opened",
        category="data_share",
        resource_type="binder_share",
        resource_id=upd.get("id", ""),
        details={
            "token_prefix": token[:8],
            "opens": upd.get("opens", 0),
            "user_id_owner": upd.get("user_id"),
        },
        ip_address=client_ip,
        severity="info",
    )

    # ── Stream the PDF ──
    download_name = (upd.get("filename") or "estate_binder.pdf")[:200]
    presigned = None
    if hasattr(storage, "presign_get_url"):
        try:
            presigned = storage.presign_get_url(
                upd["s3_key"],
                expires_in=PRESIGN_EXPIRY_SECONDS,
                download_filename=download_name,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"share: presign failed for token={token[:8]}…: {exc}")

    if presigned:
        return RedirectResponse(url=presigned, status_code=302)

    # Fallback (LocalStorage / dev) — stream from backend.
    try:
        blob = await storage.download(upd["s3_key"])
    except Exception as exc:  # noqa: BLE001
        logger.exception(f"share: storage download failed for token={token[:8]}…: {exc}")
        raise HTTPException(status_code=502, detail="Storage backend unavailable.") from exc
    import io

    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{download_name}"',
            "Cache-Control": "private, no-store",
        },
    )
