"""CarryOn™ — Trustee Mode Access (TMA)

A benefactor-provisioned delegate identity. The benefactor INVITES a
non-beneficiary (estate attorney, fiduciary, family steward) by email.
The trustee receives a single-use, time-limited claim link, picks their
own username + password on a CarryOn-served page, verifies their email
with a 6-digit OTP (REQUIRED), and is then activated.

Every completed mutation by the trustee while signed in is captured as
an audit event with a pre-mutation snapshot and surfaced as an "Undo"
notification on the benefactor's account (see
`middleware_trustee_audit.py`).

Collections
───────────
- `trustee_grants`        — one row per grant; `status` in
  {pending, otp_pending, active, expired, revoked}.
- `trustee_audit_events`  — one row per completed trustee mutation.

Endpoints
─────────
GET    /api/trustee/grants                — benefactor list
POST   /api/trustee/grants                — benefactor invite (email-based)
PATCH  /api/trustee/grants/{id}           — toggle beneficiary inclusion / extend expiry
POST   /api/trustee/grants/{id}/resend    — benefactor re-sends claim link
DELETE /api/trustee/grants/{id}           — revoke

GET    /api/trustee/claim/{token}             — public: invite preview
POST   /api/trustee/claim/{token}/start       — public: trustee picks username + password → OTP sent
POST   /api/trustee/claim/{token}/complete    — public: trustee enters OTP → grant activated

POST   /api/trustee/audit/{event_id}/undo — benefactor restores a snapshot

Hard guarantees
───────────────
- The benefactor NEVER sets the trustee password. The trustee picks it
  on the CarryOn claim page; the plaintext never crosses email or the
  benefactor's UI.
- The claim token is single-use, 48h TTL, base64url 32-byte random.
- Email verification (6-digit OTP) is REQUIRED before activation.
- An invite email that collides with an existing CarryOn user account
  is refused at create time with a clear 409.
- The grant's expiry duration starts ticking from `claimed_at`, not
  from `created_at`, so a "3 day" grant always delivers 3 days of
  usable access.
"""

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from config import db, logger
from services.email import send_email, send_email_ex
from utils import generate_otp, get_current_user, hash_password

router = APIRouter()


# ─── Models ────────────────────────────────────────────────────────────


class TrusteeGrantInvite(BaseModel):
    """Benefactor-provided fields for inviting a trustee.

    The trustee picks their own username + password on the claim page;
    the benefactor only supplies email + display name + scope choices.
    """

    email: EmailStr
    trustee_display_name: str = Field(..., min_length=1, max_length=80)
    include_beneficiaries: bool = False
    duration: str = Field(..., description="indefinite | 1d | 3d | 5d | 1w | custom")
    custom_days: int | None = Field(default=None, ge=1, le=3650)


class TrusteeGrantUpdate(BaseModel):
    """Partial-update payload — every field optional."""

    include_beneficiaries: bool | None = None
    duration: str | None = None
    custom_days: int | None = Field(default=None, ge=1, le=3650)


class TrusteeClaimStart(BaseModel):
    """Submitted by the trustee on the claim page."""

    username: str = Field(..., min_length=3, max_length=40)
    password: str = Field(..., min_length=8, max_length=200)


class TrusteeClaimComplete(BaseModel):
    """Submitted by the trustee after the email OTP arrives."""

    otp_code: str = Field(..., min_length=4, max_length=10)


# ─── Helpers ───────────────────────────────────────────────────────────

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]+$")
VALID_DURATIONS = {"indefinite", "1d", "3d", "5d", "1w", "custom"}
CLAIM_TOKEN_TTL_HOURS = 48
OTP_TTL_MINUTES = 10


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_claim_token() -> str:
    """32-byte URL-safe random token used in the email claim link."""
    return secrets.token_urlsafe(32)


def _validate_username(name: str) -> None:
    if not name or len(name.strip()) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if not USERNAME_RE.match(name.strip()):
        raise HTTPException(
            status_code=400,
            detail="Username can only contain letters, numbers, dots, hyphens, and underscores.",
        )


def _validate_duration(duration: str, custom_days: int | None) -> None:
    if duration not in VALID_DURATIONS:
        raise HTTPException(status_code=400, detail="Invalid duration choice.")
    if duration == "custom" and (not custom_days or custom_days < 1):
        raise HTTPException(status_code=400, detail="Custom duration requires a positive number of days.")


def _duration_delta(duration: str, custom_days: int | None) -> timedelta | None:
    """Translate a duration choice into a timedelta; None = indefinite."""
    if duration == "indefinite":
        return None
    if duration == "1d":
        return timedelta(days=1)
    if duration == "3d":
        return timedelta(days=3)
    if duration == "5d":
        return timedelta(days=5)
    if duration == "1w":
        return timedelta(weeks=1)
    if duration == "custom":
        return timedelta(days=int(custom_days or 0))
    return None


def _suggest_username(email: str) -> str:
    """Derive a sensible default username from the email local-part."""
    local = (email.split("@", 1)[0] or "trustee").lower()
    local = re.sub(r"[^a-z0-9._-]", "", local)[:24] or "trustee"
    return f"trustee_{local}_{secrets.token_hex(2)}"


def _grant_public(grant: dict) -> dict:
    """Shape a grant document for benefactor-facing API responses.

    Never leaks the password hash, claim token, or OTP code.
    """
    status = grant.get("status", "active")
    expires_at = grant.get("expires_at")
    claim_expires_at = grant.get("claim_token_expires_at")
    now = datetime.now(timezone.utc)
    is_expired = False
    if expires_at:
        try:
            is_expired = datetime.fromisoformat(expires_at) <= now
        except (ValueError, TypeError):
            is_expired = False
    return {
        "id": grant["id"],
        "status": status,
        "email": grant.get("email", ""),
        "trustee_username": grant.get("trustee_username", ""),
        "trustee_display_name": grant.get("trustee_display_name", ""),
        "include_beneficiaries": bool(grant.get("include_beneficiaries", False)),
        "duration": grant.get("duration", "indefinite"),
        "custom_days": grant.get("custom_days"),
        "expires_at": expires_at,
        "is_expired": is_expired,
        "claim_token_expires_at": claim_expires_at if status in ("pending", "otp_pending") else None,
        "claimed_at": grant.get("claimed_at"),
        "revoked_at": grant.get("revoked_at"),
        "last_used_at": grant.get("last_used_at"),
        "created_at": grant.get("created_at", ""),
    }


def _require_benefactor(user: dict) -> None:
    """Only a real benefactor (not a trustee acting-as) can manage grants."""
    if user.get("_trustee_mode"):
        raise HTTPException(
            status_code=403,
            detail="Trustee accounts cannot manage trustee grants. Sign in as the benefactor.",
        )
    if user.get("role") not in ("benefactor", "admin"):
        raise HTTPException(status_code=403, detail="Only benefactors can manage trustee grants.")


async def find_active_trustee_grant_by_username(login_identifier: str) -> dict | None:
    """Resolve a login identifier to an ACTIVE (claimed) grant.

    Returns None for pending / otp_pending / revoked / expired grants —
    those cannot be used to sign in. Legacy grants written before the
    `status` field existed are treated as active as long as they have
    a password hash.
    """
    ident = (login_identifier or "").strip().lower()
    if not ident:
        return None
    grant = await db.trustee_grants.find_one(
        {
            "trustee_username_lower": ident,
            "revoked_at": None,
            "password_hash": {"$exists": True, "$ne": ""},
            "$or": [{"status": "active"}, {"status": {"$exists": False}}],
        },
        {"_id": 0},
    )
    if not grant:
        return None
    expires_at = grant.get("expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc):
                return None
        except (ValueError, TypeError):
            return None
    return grant


def _claim_url(token: str) -> str:
    """Build the absolute claim URL from configured frontend origin."""
    import os

    base = (
        os.environ.get("FRONTEND_URL")
        or os.environ.get("FRONTEND_BASE_URL")
        or os.environ.get("PUBLIC_FRONTEND_URL")
        or "https://app.carryon.us"
    )
    base = base.rstrip("/")
    return f"{base}/trustee/claim/{token}"


def _invite_html(benefactor_name: str, trustee_name: str, claim_url: str, expires_hours: int) -> str:
    """Inline HTML for the Resend invitation email."""
    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#0F1629;">
      <h1 style="font-size:20px;margin:0 0 16px 0;">You've been invited as a CarryOn™ Trustee</h1>
      <p style="font-size:15px;line-height:1.55;">Hello {trustee_name},</p>
      <p style="font-size:15px;line-height:1.55;">
        <strong>{benefactor_name}</strong> has invited you to act as a trustee on their
        CarryOn family-preparedness account. Trustees can review and edit the estate
        on the benefactor's behalf. Every change you save will be visible to {benefactor_name}.
      </p>
      <p style="font-size:15px;line-height:1.55;">
        To accept, click the secure link below and choose your own username and password.
        You'll also need to verify your email with a one-time code before access is granted.
      </p>
      <p style="text-align:center;margin:28px 0;">
        <a href="{claim_url}"
           style="display:inline-block;background:#D4AF37;color:#0F1629;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;">
          Claim Trustee Access
        </a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#475569;">
        This invitation expires in <strong>{expires_hours} hours</strong> and can only be used once.
        If you weren't expecting this email, you can ignore it safely — no account will be created.
      </p>
      <p style="font-size:13px;line-height:1.5;color:#475569;">
        Need help? Reply to this email and someone from CarryOn will get back to you.
      </p>
    </div>
    """


# ─── Endpoints — Benefactor management ────────────────────────────────


@router.get("/trustee/grants")
async def list_grants(current_user: dict = Depends(get_current_user)):
    """Benefactor lists every grant they have ever created (any status)."""
    _require_benefactor(current_user)
    rows = (
        await db.trustee_grants.find(
            {"benefactor_id": current_user["id"]},
            {"_id": 0},
        )
        .sort("created_at", -1)
        .to_list(50)
    )
    grants = []
    for r in rows:
        g = _grant_public(r)
        # Surface the claim URL on pending grants so the benefactor can
        # copy and share the link manually if Resend rejected the send
        # (test sandbox, unverified domain, rate-limit, bounce, etc.).
        token = r.get("claim_token")
        if token and g["status"] in ("pending", "otp_pending"):
            g["claim_url"] = _claim_url(token)
        grants.append(g)
    return {"grants": grants}


@router.post("/trustee/grants")
async def invite_trustee(data: TrusteeGrantInvite, current_user: dict = Depends(get_current_user)):
    """Benefactor sends an email invite. No password is set here."""
    _require_benefactor(current_user)
    _validate_duration(data.duration, data.custom_days)

    email_lower = data.email.lower().strip()

    # Refuse collisions with an existing CarryOn user account (user choice 3a).
    existing_user = await db.users.find_one(
        {"$or": [{"email": email_lower}, {"username_lower": email_lower}]},
        {"_id": 0, "id": 1},
    )
    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="That email is already a CarryOn account. Use a different email for the trustee.",
        )

    # Refuse if a non-revoked grant already exists for the same email + benefactor.
    existing_grant = await db.trustee_grants.find_one(
        {"benefactor_id": current_user["id"], "email_lower": email_lower, "revoked_at": None},
        {"_id": 0, "id": 1, "status": 1},
    )
    if existing_grant and existing_grant.get("status") != "expired":
        raise HTTPException(
            status_code=409,
            detail="A trustee invite or active grant already exists for that email. Revoke it first or use the resend button.",
        )

    grant_id = str(uuid.uuid4())
    claim_token = _gen_claim_token()
    claim_expires = (datetime.now(timezone.utc) + timedelta(hours=CLAIM_TOKEN_TTL_HOURS)).isoformat()
    grant = {
        "id": grant_id,
        "benefactor_id": current_user["id"],
        "email": data.email.strip(),
        "email_lower": email_lower,
        "trustee_username": "",  # set at claim
        "trustee_username_lower": "",
        "trustee_display_name": data.trustee_display_name.strip(),
        "password_hash": "",  # set at claim
        "include_beneficiaries": bool(data.include_beneficiaries),
        "duration": data.duration,
        "custom_days": data.custom_days if data.duration == "custom" else None,
        "expires_at": None,  # computed at claim
        "status": "pending",
        "claim_token": claim_token,
        "claim_token_expires_at": claim_expires,
        "claimed_at": None,
        "revoked_at": None,
        "last_used_at": None,
        "otp": None,
        "otp_expires_at": None,
        "created_at": _now_iso(),
    }
    await db.trustee_grants.insert_one(grant)
    logger.info(f"[TMA] Invite created by benefactor={current_user['id']} email={email_lower}")

    # Fire the invitation email. Best-effort — if Resend rejects the send
    # (test sandbox, unverified domain, rate-limit, recipient bounce, etc.)
    # we still return the grant + claim URL so the benefactor can copy
    # and share the link manually. The error reason is surfaced inline.
    claim_url = _claim_url(claim_token)
    email_result = await send_email_ex(
        to=data.email.strip(),
        subject=f"{current_user.get('name', 'A CarryOn user')} has invited you as a trustee",
        html=_invite_html(
            benefactor_name=current_user.get("name", "A CarryOn user"),
            trustee_name=data.trustee_display_name.strip(),
            claim_url=claim_url,
            expires_hours=CLAIM_TOKEN_TTL_HOURS,
        ),
    )
    out = _grant_public(grant)
    out["email_sent"] = bool(email_result["ok"])
    out["email_error"] = email_result.get("error")
    out["claim_url"] = claim_url
    return out


@router.patch("/trustee/grants/{grant_id}")
async def update_grant(
    grant_id: str,
    data: TrusteeGrantUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Benefactor toggles beneficiary inclusion or extends expiry.

    If the grant is already `active`, an updated `duration` recomputes
    `expires_at` from the existing `claimed_at`. If still `pending`,
    the new `duration` is recorded and will be used at claim time.
    """
    _require_benefactor(current_user)
    grant = await db.trustee_grants.find_one(
        {"id": grant_id, "benefactor_id": current_user["id"]},
        {"_id": 0},
    )
    if not grant:
        raise HTTPException(status_code=404, detail="Trustee grant not found.")

    updates: dict = {}
    if data.include_beneficiaries is not None:
        updates["include_beneficiaries"] = bool(data.include_beneficiaries)
    if data.duration is not None:
        _validate_duration(data.duration, data.custom_days)
        updates["duration"] = data.duration
        updates["custom_days"] = data.custom_days if data.duration == "custom" else None
        if grant.get("status") == "active" and grant.get("claimed_at"):
            try:
                base = datetime.fromisoformat(grant["claimed_at"])
            except (ValueError, TypeError):
                base = datetime.now(timezone.utc)
            delta = _duration_delta(data.duration, data.custom_days)
            updates["expires_at"] = (base + delta).isoformat() if delta else None

    if not updates:
        return _grant_public(grant)

    await db.trustee_grants.update_one({"id": grant_id}, {"$set": updates})
    grant.update(updates)
    return _grant_public(grant)


@router.post("/trustee/grants/{grant_id}/resend")
async def resend_invite(grant_id: str, current_user: dict = Depends(get_current_user)):
    """Benefactor re-sends a claim link for a still-pending grant.

    Generates a fresh single-use token (invalidating the old one) and
    re-fires the invitation email. Only valid for grants currently in
    `pending` or `otp_pending` status.
    """
    _require_benefactor(current_user)
    grant = await db.trustee_grants.find_one(
        {"id": grant_id, "benefactor_id": current_user["id"]},
        {"_id": 0},
    )
    if not grant:
        raise HTTPException(status_code=404, detail="Trustee grant not found.")
    if grant.get("status") not in ("pending", "otp_pending"):
        raise HTTPException(
            status_code=400,
            detail="Only pending invites can be resent. This grant has already been claimed or revoked.",
        )

    claim_token = _gen_claim_token()
    claim_expires = (datetime.now(timezone.utc) + timedelta(hours=CLAIM_TOKEN_TTL_HOURS)).isoformat()
    await db.trustee_grants.update_one(
        {"id": grant_id},
        {
            "$set": {
                "claim_token": claim_token,
                "claim_token_expires_at": claim_expires,
                "status": "pending",
                "otp": None,
                "otp_expires_at": None,
                "trustee_username": "",
                "trustee_username_lower": "",
                "password_hash": "",
            }
        },
    )
    claim_url = _claim_url(claim_token)
    email_result = await send_email_ex(
        to=grant["email"],
        subject=f"{current_user.get('name', 'A CarryOn user')} has invited you as a trustee (resent)",
        html=_invite_html(
            benefactor_name=current_user.get("name", "A CarryOn user"),
            trustee_name=grant.get("trustee_display_name", "Trustee"),
            claim_url=claim_url,
            expires_hours=CLAIM_TOKEN_TTL_HOURS,
        ),
    )
    return {
        "resent": True,
        "email_sent": bool(email_result["ok"]),
        "email_error": email_result.get("error"),
        "claim_url": claim_url,
        "claim_token_expires_at": claim_expires,
    }


@router.delete("/trustee/grants/{grant_id}")
async def revoke_grant(grant_id: str, current_user: dict = Depends(get_current_user)):
    """Benefactor revokes (soft-deletes) a grant at any status."""
    _require_benefactor(current_user)
    result = await db.trustee_grants.update_one(
        {"id": grant_id, "benefactor_id": current_user["id"], "revoked_at": None},
        {"$set": {"revoked_at": _now_iso(), "status": "revoked"}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Trustee grant not found or already revoked.")
    logger.info(f"[TMA] Grant {grant_id} revoked by benefactor={current_user['id']}")
    return {"revoked": True}


# ─── Public endpoints — Trustee claims ────────────────────────────────


async def _resolve_claim_or_raise(token: str) -> dict:
    """Common loader for claim endpoints. Validates the token is live."""
    if not token or len(token) < 16:
        raise HTTPException(status_code=404, detail="Invalid claim link.")
    grant = await db.trustee_grants.find_one(
        {"claim_token": token, "revoked_at": None},
        {"_id": 0},
    )
    if not grant:
        raise HTTPException(status_code=404, detail="This claim link is invalid or has already been used.")
    expires = grant.get("claim_token_expires_at")
    if expires:
        try:
            if datetime.fromisoformat(expires) <= datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=410, detail="This claim link has expired. Ask the benefactor to resend it."
                )
        except HTTPException:
            raise
        except (ValueError, TypeError):
            pass
    return grant


@router.get("/trustee/claim/{token}")
async def get_claim_preview(token: str):
    """Public — returns the invite metadata so the claim page can render."""
    grant = await _resolve_claim_or_raise(token)
    benefactor = await db.users.find_one({"id": grant["benefactor_id"]}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    return {
        "grant_id": grant["id"],
        "benefactor_name": (benefactor or {}).get("name", "A CarryOn user"),
        "trustee_email": grant["email"],
        "trustee_display_name": grant.get("trustee_display_name", ""),
        "suggested_username": grant.get("trustee_username") or _suggest_username(grant["email"]),
        "duration": grant.get("duration", "indefinite"),
        "claim_token_expires_at": grant.get("claim_token_expires_at"),
        "status": grant.get("status", "pending"),
        "include_beneficiaries": bool(grant.get("include_beneficiaries", False)),
    }


@router.post("/trustee/claim/{token}/start")
async def start_claim(token: str, data: TrusteeClaimStart, request: Request):
    """Public — trustee picks username + password. Fires a 6-digit OTP email."""
    grant = await _resolve_claim_or_raise(token)
    if grant.get("status") not in ("pending", "otp_pending"):
        raise HTTPException(status_code=409, detail="This invite has already been claimed.")
    _validate_username(data.username)

    uname = data.username.strip()
    uname_lower = uname.lower()
    # Username must not collide with an existing user or another active grant.
    if await db.users.find_one(
        {"$or": [{"username_lower": uname_lower}, {"email": uname_lower}]},
        {"_id": 0, "id": 1},
    ):
        raise HTTPException(
            status_code=409,
            detail="That username is already taken by a CarryOn user. Choose a different one.",
        )
    other = await db.trustee_grants.find_one(
        {"trustee_username_lower": uname_lower, "revoked_at": None, "id": {"$ne": grant["id"]}},
        {"_id": 0, "id": 1, "status": 1},
    )
    if other and other.get("status") in ("active", "otp_pending"):
        raise HTTPException(status_code=409, detail="That username is already in use. Choose a different one.")

    otp_code = generate_otp()
    otp_expires = (datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()
    await db.trustee_grants.update_one(
        {"id": grant["id"]},
        {
            "$set": {
                "trustee_username": uname,
                "trustee_username_lower": uname_lower,
                "password_hash": hash_password(data.password),
                "status": "otp_pending",
                "otp": otp_code,
                "otp_expires_at": otp_expires,
            }
        },
    )

    # Email the OTP. Reuses the shared transactional email service.
    await send_email(
        to=grant["email"],
        subject="Your CarryOn trustee verification code",
        html=f"""
        <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#0F1629;">
          <h1 style="font-size:18px;margin:0 0 12px 0;">Your trustee verification code</h1>
          <p style="font-size:15px;line-height:1.55;">
            Enter this code on the CarryOn claim page to verify your email and finish setting up trustee access:
          </p>
          <p style="font-size:32px;letter-spacing:6px;text-align:center;font-weight:700;color:#D4AF37;margin:24px 0;">{otp_code}</p>
          <p style="font-size:13px;color:#475569;">This code expires in {OTP_TTL_MINUTES} minutes. If you didn't request it, you can ignore this email.</p>
        </div>
        """,
    )
    return {"otp_sent": True, "ttl_minutes": OTP_TTL_MINUTES}


@router.post("/trustee/claim/{token}/complete")
async def complete_claim(token: str, data: TrusteeClaimComplete):
    """Public — trustee enters the OTP. Activates the grant on success."""
    grant = await _resolve_claim_or_raise(token)
    if grant.get("status") != "otp_pending":
        raise HTTPException(status_code=409, detail="Start the claim first.")
    otp_expected = grant.get("otp") or ""
    otp_expires = grant.get("otp_expires_at")
    if not otp_expected or not otp_expires:
        raise HTTPException(status_code=400, detail="No verification code pending. Restart the claim.")
    try:
        if datetime.fromisoformat(otp_expires) <= datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Verification code expired. Restart the claim.")
    except HTTPException:
        raise
    except (ValueError, TypeError):
        pass
    if (data.otp_code or "").strip() != otp_expected:
        raise HTTPException(status_code=401, detail="Incorrect verification code.")

    now = datetime.now(timezone.utc)
    delta = _duration_delta(grant.get("duration", "indefinite"), grant.get("custom_days"))
    expires_at = (now + delta).isoformat() if delta else None

    await db.trustee_grants.update_one(
        {"id": grant["id"]},
        {
            "$set": {
                "status": "active",
                "claimed_at": now.isoformat(),
                "expires_at": expires_at,
                "otp": None,
                "otp_expires_at": None,
                # Burn the claim token — it cannot be re-used.
                "claim_token": None,
                "claim_token_expires_at": None,
            }
        },
    )

    # Fire an in-app notification on the benefactor's account.
    benefactor_id = grant["benefactor_id"]
    await db.notifications.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": benefactor_id,
            "type": "trustee_claimed",
            "title": "Trustee access claimed",
            "body": f"{grant.get('trustee_display_name', 'A trustee')} ({grant.get('email', '')}) just claimed trustee access to your account.",
            "supports_undo": False,
            "read": False,
            "created_at": now.isoformat(),
        }
    )

    return {
        "claimed": True,
        "trustee_username": grant.get("trustee_username", ""),
        "expires_at": expires_at,
        "message": "Trustee access activated. You can now sign in with your chosen credentials.",
    }


# ─── Undo endpoint (unchanged from prior iteration) ───────────────────


@router.post("/trustee/audit/{event_id}/undo")
async def undo_trustee_event(event_id: str, current_user: dict = Depends(get_current_user)):
    """Restore the pre-mutation snapshot for a trustee-audit event."""
    _require_benefactor(current_user)
    event = await db.trustee_audit_events.find_one(
        {"id": event_id, "benefactor_id": current_user["id"]},
        {"_id": 0},
    )
    if not event:
        raise HTTPException(status_code=404, detail="Audit event not found.")
    if event.get("undone_at"):
        raise HTTPException(status_code=409, detail="This change has already been undone.")
    if not event.get("supports_undo"):
        raise HTTPException(
            status_code=400,
            detail="Automatic undo is unavailable for this change. Manual restore may be required.",
        )

    snapshot = event.get("snapshot_before") or {}
    collection = event.get("collection")
    primary_key = event.get("primary_key", "id")
    pk_value = event.get("primary_key_value")
    if not collection or not pk_value:
        raise HTTPException(
            status_code=400,
            detail="Audit event is incomplete — cannot undo automatically.",
        )

    mongo_collection = db[collection]
    if event.get("operation") == "delete":
        existing = await mongo_collection.find_one({primary_key: pk_value}, {"_id": 0, primary_key: 1})
        if existing:
            await mongo_collection.replace_one({primary_key: pk_value}, snapshot)
        else:
            await mongo_collection.insert_one(snapshot)
    else:
        await mongo_collection.replace_one(
            {primary_key: pk_value},
            snapshot,
            upsert=True,
        )

    await db.trustee_audit_events.update_one(
        {"id": event_id},
        {"$set": {"undone_at": _now_iso(), "undone_by": current_user["id"]}},
    )
    notif_id = event.get("notification_id")
    if notif_id:
        await db.notifications.update_one(
            {"id": notif_id, "user_id": current_user["id"]},
            {"$set": {"read": True, "read_at": _now_iso(), "undone": True}},
        )
    return {"undone": True}


# ─── Audit recorder (called by middleware_trustee_audit) ──────────────


async def record_trustee_mutation(
    *,
    benefactor_id: str,
    grant_id: str,
    trustee_display_name: str,
    method: str,
    path: str,
    collection: str | None,
    primary_key: str,
    primary_key_value: str | None,
    operation: str,
    snapshot_before: dict | None,
    snapshot_after: dict | None,
    summary: str,
    supports_undo: bool,
) -> None:
    """Persist a trustee audit event + create a benefactor notification."""
    event_id = str(uuid.uuid4())
    notif_id = str(uuid.uuid4())
    now = _now_iso()
    await db.trustee_audit_events.insert_one(
        {
            "id": event_id,
            "benefactor_id": benefactor_id,
            "grant_id": grant_id,
            "trustee_display_name": trustee_display_name,
            "method": method,
            "path": path,
            "collection": collection,
            "primary_key": primary_key,
            "primary_key_value": primary_key_value,
            "operation": operation,
            "snapshot_before": snapshot_before,
            "snapshot_after": snapshot_after,
            "summary": summary,
            "supports_undo": bool(supports_undo and snapshot_before is not None and collection is not None),
            "undone_at": None,
            "undone_by": None,
            "notification_id": notif_id,
            "created_at": now,
        }
    )
    await db.notifications.insert_one(
        {
            "id": notif_id,
            "user_id": benefactor_id,
            "type": "trustee_audit",
            "title": f"Trustee {trustee_display_name} made a change",
            "body": summary,
            "audit_event_id": event_id,
            "supports_undo": bool(supports_undo and snapshot_before is not None and collection is not None),
            "read": False,
            "created_at": now,
        }
    )


# Keep this exported symbol — auth login imports it as before. The new
# definition above is fully backward-compatible with the old behavior
# (still returns an active grant; just enforces stricter status checks).
__all__ = [
    "router",
    "find_active_trustee_grant_by_username",
    "record_trustee_mutation",
]
