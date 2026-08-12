"""CarryOn™ — Pro Client Setup (white-glove partner-rep provisioning)

Lets a B2B partner's designated REP (users.partner_rep_for = partner_id,
set by the founder via Admin → Finance → Partners → Link rep) create
client portals BEFORE the client's first login:

1. Rep creates the client (name + email) → a pending-claim benefactor
   account + estate are provisioned, attributed to the partner, and an
   ACTIVE trustee grant is minted for the rep (no separate credentials —
   the rep enters via a server-minted acting-as token).
2. Rep enters the client's portal in Trustee Mode and preloads documents
   into the Secure Document Vault (full trustee audit trail applies).
3. Rep sends the branded claim email. The client opens the link, picks a
   username + password, verifies a 6-digit email OTP, and takes ownership.
   Their first login lands on a portal already stocked with documents.

Endpoints
─────────
GET    /api/pro/clients                        — rep: list provisioned clients
POST   /api/pro/clients                        — rep: provision a client portal
POST   /api/pro/clients/{client_id}/send-invite — rep: send/resend claim email
POST   /api/pro/clients/{client_id}/enter      — rep: mint trustee-mode token

GET    /api/pro/claim/{token}                  — public: claim preview
POST   /api/pro/claim/{token}/start            — public: pick username+password → OTP
POST   /api/pro/claim/{token}/complete         — public: OTP → activate + auto-login
"""

import base64
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from config import db, logger
from routes.admin.trial_policy import get_trial_days
from routes.auth._core import validate_username
from services.email import send_email, send_email_ex
from services.encryption import generate_estate_salt
from services.readiness import ensure_default_checklist
from services.storage import storage
from utils import create_token, generate_otp, get_current_user, hash_password

router = APIRouter()

CLAIM_TOKEN_TTL_DAYS = 14
OTP_TTL_MINUTES = 10


class ProClientCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=60)
    last_name: str = Field(..., min_length=1, max_length=60)
    email: EmailStr


class ProClaimStart(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    password: str = Field(..., min_length=8, max_length=200)


class ProClaimComplete(BaseModel):
    otp_code: str = Field(..., min_length=4, max_length=10)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _frontend_base() -> str:
    base = (
        os.environ.get("FRONTEND_URL")
        or os.environ.get("FRONTEND_BASE_URL")
        or os.environ.get("PUBLIC_FRONTEND_URL")
        or "https://app.carryon.us"
    )
    return base.rstrip("/")


def _claim_url(token: str) -> str:
    return f"{_frontend_base()}/claim/{token}"


async def _require_rep(current_user: dict) -> dict:
    """Resolve the caller's partner record or 403. Trustee sessions
    cannot provision (the rep must be in their OWN account)."""
    if current_user.get("_trustee_mode"):
        raise HTTPException(
            status_code=403, detail="Exit the client portal first, then manage clients from your own account."
        )
    partner_id = current_user.get("partner_rep_for")
    if not partner_id:
        raise HTTPException(status_code=403, detail="This account is not a partner representative.")
    partner = await db.b2b_partners.find_one({"id": partner_id, "active": True}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=403, detail="Your partnership is inactive. Contact CarryOn.")
    return partner


def _client_public(u: dict, docs_count: int = 0, estate_id: str = "") -> dict:
    pending = u.get("account_status") == "pending_claim"
    return {
        "id": u["id"],
        "name": u.get("name", ""),
        "email": u.get("email", ""),
        "status": "pending_claim" if pending else "active",
        "created_at": u.get("created_at", ""),
        "claimed_at": u.get("claimed_at"),
        "invite_sent_at": u.get("invite_sent_at"),
        "claim_token_expires_at": u.get("claim_token_expires_at") if pending else None,
        "claim_url": _claim_url(u["claim_token"]) if pending and u.get("claim_token") else None,
        "documents_count": docs_count,
        "estate_id": estate_id,
    }


# ─── Rep endpoints ──────────────────────────────────────────────────────


@router.get("/pro/clients")
async def list_pro_clients(current_user: dict = Depends(get_current_user)):
    partner = await _require_rep(current_user)
    clients = (
        await db.users.find(
            {"created_by_rep_id": current_user["id"]},
            {"_id": 0, "password": 0},
        )
        .sort("created_at", -1)
        .to_list(1000)
    )
    client_ids = [c["id"] for c in clients]
    estates_by_owner: dict = {}
    docs_by_estate: dict = {}
    if client_ids:
        estates = await db.estates.find({"owner_id": {"$in": client_ids}}, {"_id": 0, "id": 1, "owner_id": 1}).to_list(
            2000
        )
        estates_by_owner = {e["owner_id"]: e["id"] for e in estates}
        estate_ids = list(estates_by_owner.values())
        if estate_ids:
            pipeline = [
                {"$match": {"estate_id": {"$in": estate_ids}}},
                {"$group": {"_id": "$estate_id", "n": {"$sum": 1}}},
            ]
            docs_by_estate = {row["_id"]: row["n"] async for row in db.documents.aggregate(pipeline)}
    out = []
    for c in clients:
        estate_id = estates_by_owner.get(c["id"], "")
        out.append(_client_public(c, docs_count=int(docs_by_estate.get(estate_id, 0)), estate_id=estate_id))
    return {
        "partner": {
            "id": partner["id"],
            "company_name": partner["company_name"],
            "slug": partner["slug"],
            "max_uses": partner.get("max_uses", 0),
            "times_used": partner.get("times_used", 0),
            "tma_enabled": bool((partner.get("feature_gates") or {}).get("tma")),
        },
        "clients": out,
    }


@router.post("/pro/clients")
async def create_pro_client(
    data: ProClientCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    partner = await _require_rep(current_user)

    email_lower = str(data.email).lower().strip()
    if await db.users.find_one(
        {"$or": [{"email_lower": email_lower}, {"email": email_lower}, {"username_lower": email_lower}]},
        {"_id": 0, "id": 1},
    ):
        raise HTTPException(status_code=409, detail="A CarryOn account already exists for that email.")

    max_uses = int(partner.get("max_uses", 0) or 0)
    if max_uses > 0 and int(partner.get("times_used", 0) or 0) >= max_uses:
        raise HTTPException(status_code=400, detail="Your partnership has used all of its authorized user slots.")

    now = datetime.now(timezone.utc)
    client_id = str(uuid.uuid4())
    claim_token = secrets.token_urlsafe(32)
    claim_expires = (now + timedelta(days=CLAIM_TOKEN_TTL_DAYS)).isoformat()
    first = data.first_name.strip()
    last = data.last_name.strip()

    client = {
        "id": client_id,
        "email": str(data.email).strip(),
        "email_lower": email_lower,
        "email_verified": False,
        "username": "",
        "username_lower": "",
        # Unusable placeholder — login is additionally blocked while
        # account_status == pending_claim (see routes/auth/login.py).
        "password": hash_password(secrets.token_urlsafe(32)),
        "name": f"{first} {last}".strip(),
        "first_name": first,
        "last_name": last,
        "role": "benefactor",
        "account_status": "pending_claim",
        "claim_token": claim_token,
        "claim_token_expires_at": claim_expires,
        "created_by_rep_id": current_user["id"],
        "partner_id": partner["id"],
        "partner_slug": partner["slug"],
        "partner_company": partner["company_name"],
        "b2b_code": partner.get("code", ""),
        "b2b_partner": partner["company_name"],
        "b2b_discount_percent": int(partner.get("discount_percent", 0) or 0),
        "subscription_status": "pending_claim",
        "created_at": now.isoformat(),
    }
    await db.users.insert_one(client)

    estate_id = str(uuid.uuid4())
    estate = {
        "id": estate_id,
        "owner_id": client_id,
        "name": f"{last} Family Estate",
        "status": "pre-transition",
        "beneficiaries": [],
        "encryption_salt": generate_estate_salt().hex(),
        "created_at": now.isoformat(),
    }
    await db.estates.insert_one(estate)
    await ensure_default_checklist(estate_id)

    grant = {
        "id": str(uuid.uuid4()),
        "benefactor_id": client_id,
        "email": current_user.get("email", ""),
        "email_lower": (current_user.get("email", "") or "").lower(),
        "trustee_username": "",
        "trustee_username_lower": "",
        "trustee_display_name": f"{current_user.get('name', 'Your advisor')} ({partner['company_name']})",
        # No credential login for this grant — access is ONLY via the
        # rep's server-minted acting-as token (POST .../enter).
        "password_hash": "",
        "rep_user_id": current_user["id"],
        "via_pro_setup": True,
        "include_beneficiaries": True,
        "duration": "indefinite",
        "custom_days": None,
        "expires_at": None,
        "status": "active",
        "claim_token": None,
        "claim_token_expires_at": None,
        "claimed_at": now.isoformat(),
        "revoked_at": None,
        "last_used_at": None,
        "otp": None,
        "otp_expires_at": None,
        "created_at": now.isoformat(),
    }
    await db.trustee_grants.insert_one(grant)

    await db.b2b_partners.update_one({"id": partner["id"]}, {"$inc": {"times_used": 1}})
    logger.info(
        "[PRO] Client portal provisioned client=%s rep=%s partner=%s", client_id, current_user["id"], partner["id"]
    )

    return _client_public({k: v for k, v in client.items() if k != "password"}, docs_count=0, estate_id=estate_id)


def _claim_email_html(client_name: str, rep_name: str, company: str, claim_url: str) -> str:
    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#0F1629;">
      <h1 style="font-size:20px;margin:0 0 16px 0;">Your personal CarryOn portal is ready</h1>
      <p style="font-size:15px;line-height:1.55;">Hello {client_name},</p>
      <p style="font-size:15px;line-height:1.55;">
        <strong>{rep_name}</strong> of <strong>{company}</strong> has prepared a secure CarryOn
        family-continuity portal for you. Your important documents are already waiting inside your
        Secure Document Vault.
      </p>
      <p style="font-size:15px;line-height:1.55;">
        Click the secure link below to choose your own username and password. You'll verify your
        email with a one-time code, and then everything is yours.
      </p>
      <p style="text-align:center;margin:28px 0;">
        <a href="{claim_url}"
           style="display:inline-block;background:#D4AF37;color:#0F1629;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;">
          Claim My Portal
        </a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#475569;">
        This personal link expires in {CLAIM_TOKEN_TTL_DAYS} days and can only be used once.
        If you weren't expecting this email, you can safely ignore it.
      </p>
      <p style="font-size:13px;line-height:1.5;color:#475569;">Powered by CarryOn Enterprises Inc.</p>
    </div>
    """


@router.post("/pro/clients/{client_id}/send-invite")
async def send_pro_client_invite(
    client_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    partner = await _require_rep(current_user)
    client = await db.users.find_one(
        {"id": client_id, "created_by_rep_id": current_user["id"]},
        {"_id": 0, "password": 0},
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found.")
    if client.get("account_status") != "pending_claim":
        raise HTTPException(status_code=409, detail="This client already claimed their portal.")

    now = datetime.now(timezone.utc)
    token = client.get("claim_token")
    expires = client.get("claim_token_expires_at")
    expired = True
    if token and expires:
        try:
            expired = datetime.fromisoformat(expires) <= now
        except (ValueError, TypeError):
            expired = True
    if expired:
        token = secrets.token_urlsafe(32)
        expires = (now + timedelta(days=CLAIM_TOKEN_TTL_DAYS)).isoformat()
        await db.users.update_one(
            {"id": client_id},
            {"$set": {"claim_token": token, "claim_token_expires_at": expires}},
        )

    claim_url = _claim_url(token)
    background_tasks.add_task(
        send_email_ex,
        client["email"],
        f"{partner['company_name']} has prepared your CarryOn portal",
        _claim_email_html(
            client_name=client.get("first_name") or client.get("name", ""),
            rep_name=current_user.get("name", "Your advisor"),
            company=partner["company_name"],
            claim_url=claim_url,
        ),
    )
    await db.users.update_one(
        {"id": client_id},
        {"$set": {"invite_sent_at": now.isoformat()}, "$inc": {"invite_count": 1}},
    )
    return {"sent": True, "claim_url": claim_url, "claim_token_expires_at": expires}


@router.post("/pro/clients/{client_id}/enter")
async def enter_pro_client_portal(client_id: str, current_user: dict = Depends(get_current_user)):
    """Mint a Trustee-Mode acting-as token so the rep can work inside
    the client's portal. Identical claim shape to a trustee login, so
    the trustee banner, audit middleware, and live grant checks in
    utils.get_current_user all apply unchanged."""
    partner = await _require_rep(current_user)
    client = await db.users.find_one({"id": client_id}, {"_id": 0, "password": 0})
    if not client or client.get("created_by_rep_id") != current_user["id"]:
        raise HTTPException(status_code=404, detail="Client not found.")
    grant = await db.trustee_grants.find_one(
        {"benefactor_id": client_id, "rep_user_id": current_user["id"], "status": "active", "revoked_at": None},
        {"_id": 0},
    )
    if not grant:
        raise HTTPException(status_code=403, detail="Your trustee access to this client was revoked.")

    try:
        from routes.feature_gates import is_feature_enabled_for_user

        if not await is_feature_enabled_for_user(client, "tma"):
            raise HTTPException(
                status_code=403,
                detail=f"Trustee Mode Access is not enabled for {partner['company_name']}. Ask CarryOn to switch on the TMA gate for your partnership.",
            )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Trustee access is temporarily unavailable. Try again shortly.")

    session_id = str(uuid.uuid4())
    token = create_token(
        user_id=client["id"],
        email=client["email"],
        role=client.get("role", "benefactor"),
        session_id=session_id,
        extra_claims={
            "acting_as": client["id"],
            "trustee_grant_id": grant["id"],
            "trustee_display_name": grant.get("trustee_display_name", "Trustee"),
        },
    )
    await db.trustee_grants.update_one({"id": grant["id"]}, {"$set": {"last_used_at": _now_iso()}})
    return {
        "access_token": token,
        "token_type": "bearer",
        "client": {"id": client["id"], "name": client.get("name", ""), "email": client.get("email", "")},
    }


# ─── Public claim flow (token-gated) ───────────────────────────────────


async def _resolve_claim_or_raise(token: str) -> dict:
    if not token or len(token) < 16:
        raise HTTPException(status_code=404, detail="Invalid claim link.")
    user = await db.users.find_one(
        {"claim_token": token, "account_status": "pending_claim"},
        {"_id": 0, "password": 0},
    )
    if not user:
        raise HTTPException(status_code=404, detail="This claim link is invalid or was already used.")
    expires = user.get("claim_token_expires_at")
    try:
        if expires and datetime.fromisoformat(expires) <= datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="This claim link has expired. Ask your advisor to resend it.")
    except HTTPException:
        raise
    except (ValueError, TypeError):
        pass
    return user


def _suggest_username(first: str, last: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "", f"{first}{last}")[:24].lower()
    return cleaned if len(cleaned) >= 3 else f"client{secrets.token_hex(3)}"


@router.get("/pro/claim/{token}")
async def pro_claim_preview(token: str):
    user = await _resolve_claim_or_raise(token)

    partner = None
    logo_data_url = None
    if user.get("partner_id"):
        partner = await db.b2b_partners.find_one(
            {"id": user["partner_id"]},
            {"_id": 0, "company_name": 1, "logo_key": 1, "logo_content_type": 1},
        )
        if partner and partner.get("logo_key"):
            try:
                blob = await storage.download(partner["logo_key"])
                ctype = partner.get("logo_content_type") or "image/png"
                logo_data_url = f"data:{ctype};base64,{base64.b64encode(blob).decode('ascii')}"
            except Exception:  # noqa: BLE001
                logger.exception("Claim-preview logo encode failed")

    rep = await db.users.find_one({"id": user.get("created_by_rep_id", "")}, {"_id": 0, "name": 1})
    estate = await db.estates.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1})
    docs = await db.documents.count_documents({"estate_id": estate["id"]}) if estate else 0

    return {
        "client_name": user.get("first_name") or user.get("name", ""),
        "client_email": user.get("email", ""),
        "partner_company": (partner or {}).get("company_name", user.get("partner_company", "")),
        "logo_data_url": logo_data_url,
        "rep_name": (rep or {}).get("name", "Your advisor"),
        "documents_count": docs,
        "suggested_username": _suggest_username(user.get("first_name", ""), user.get("last_name", "")),
        "claim_token_expires_at": user.get("claim_token_expires_at"),
        "otp_pending": bool(user.get("claim_otp")),
    }


@router.post("/pro/claim/{token}/start")  # pre-push-invariants: allow-public-mutation (claim token is the auth gate)
async def pro_claim_start(token: str, data: ProClaimStart):
    user = await _resolve_claim_or_raise(token)

    uname = data.username.strip()
    error = validate_username(uname)
    if error:
        raise HTTPException(status_code=400, detail=error)
    uname_lower = uname.lower()
    if await db.users.find_one(
        {"$or": [{"username_lower": uname_lower}, {"email_lower": uname_lower}], "id": {"$ne": user["id"]}},
        {"_id": 0, "id": 1},
    ):
        raise HTTPException(status_code=409, detail="That username is already taken. Choose a different one.")
    other_grant = await db.trustee_grants.find_one(
        {"trustee_username_lower": uname_lower, "revoked_at": None, "status": {"$in": ["active", "otp_pending"]}},
        {"_id": 0, "id": 1},
    )
    if other_grant:
        raise HTTPException(status_code=409, detail="That username is already in use. Choose a different one.")

    otp_code = generate_otp()
    otp_expires = (datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "pending_username": uname,
                "pending_username_lower": uname_lower,
                "pending_password_hash": hash_password(data.password),
                "claim_otp": otp_code,
                "claim_otp_expires_at": otp_expires,
            }
        },
    )
    await send_email(
        to=user["email"],
        subject="Your CarryOn verification code",
        html=f"""
        <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#0F1629;">
          <h1 style="font-size:18px;margin:0 0 12px 0;">Your verification code</h1>
          <p style="font-size:15px;line-height:1.55;">Enter this code to verify your email and take ownership of your CarryOn portal:</p>
          <p style="font-size:32px;letter-spacing:6px;text-align:center;font-weight:700;color:#D4AF37;margin:24px 0;">{otp_code}</p>
          <p style="font-size:13px;color:#475569;">This code expires in {OTP_TTL_MINUTES} minutes. If you didn't request it, you can ignore this email.</p>
        </div>
        """,
    )
    return {"otp_sent": True, "ttl_minutes": OTP_TTL_MINUTES}


@router.post(
    "/pro/claim/{token}/complete"
)  # pre-push-invariants: allow-public-mutation (claim token + OTP are the auth gate)
async def pro_claim_complete(token: str, data: ProClaimComplete):
    user = await _resolve_claim_or_raise(token)
    if not user.get("claim_otp"):
        raise HTTPException(status_code=400, detail="No verification code pending. Start the claim first.")
    try:
        if datetime.fromisoformat(user.get("claim_otp_expires_at", "")) <= datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Verification code expired. Restart the claim.")
    except HTTPException:
        raise
    except (ValueError, TypeError):
        pass
    if (data.otp_code or "").strip() != user["claim_otp"]:
        raise HTTPException(status_code=401, detail="Incorrect verification code.")

    now = datetime.now(timezone.utc)
    trial_days = await get_trial_days()
    session_id = str(uuid.uuid4())
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "username": user["pending_username"],
                "username_lower": user["pending_username_lower"],
                "password": user["pending_password_hash"],
                "account_status": "active",
                "email_verified": True,
                "claimed_at": now.isoformat(),
                "subscription_status": "trialing",
                "trial_ends_at": (now + timedelta(days=trial_days)).isoformat(),
                "active_session_id": session_id,
                "last_login_at": now.isoformat(),
            },
            "$unset": {
                "claim_token": "",
                "claim_token_expires_at": "",
                "pending_username": "",
                "pending_username_lower": "",
                "pending_password_hash": "",
                "claim_otp": "",
                "claim_otp_expires_at": "",
            },
        },
    )

    rep_id = user.get("created_by_rep_id")
    if rep_id:
        await db.notifications.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": rep_id,
                "type": "pro_client_claimed",
                "title": "Client portal claimed",
                "body": f"{user.get('name', 'Your client')} just took ownership of their CarryOn portal.",
                "supports_undo": False,
                "read": False,
                "created_at": now.isoformat(),
            }
        )

    access_token = create_token(
        user_id=user["id"],
        email=user["email"],
        role=user.get("role", "benefactor"),
        session_id=session_id,
    )
    return {
        "claimed": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name", ""),
            "role": user.get("role", "benefactor"),
            "username": user["pending_username"],
        },
    }
