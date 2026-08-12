"""CarryOn™ — Partner Manager Portal (B2B sub-manager accounts)

A partner MANAGER is a founder-created credential (own collection —
`partner_managers`, NOT a `users` account) scoped to exactly one B2B
partner. Managers get a dedicated, brand-themed portal at /manager
where they can, for THEIR partner's clients only:

  • see the whole roster at a glance (claimed / awaiting-claim, docs
    prepared, last login, seats used)
  • create new client portals (same white-glove provisioning core as
    the rep flow — shared helpers in routes/pro_clients.py)
  • enter a provisioned client's portal in Trustee Mode (server-minted
    acting-as token; full trustee audit trail applies)
  • send / resend / copy claim invitations
  • reset a claimed client's password (email reset code OR one-time
    temporary password with full session revocation)

Managers can NOT see billing/revenue, delete accounts, touch feature
gates, or see any other partner's clients.

Founder-side management (Admin → Finance → Partners → Managers):
create manager logins (password shown ONCE, bcrypt at rest),
regenerate passwords, deactivate/delete.
"""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

from config import db, logger
from routes.admin.partners import _ensure_founder
from routes.pro_clients import (
    _claim_email_html,
    _claim_url,
    provision_client_portal,
    refresh_claim_token,
)
from services.audit import get_client_ip, log_audit_event
from services.email import send_email_ex
from services.token_blacklist import revoke_all_user_tokens
from utils import create_token, decode_token, get_current_user, hash_password, send_otp_email, verify_password

router = APIRouter()

_security = HTTPBearer()

MANAGER_LOCKOUT_MAX_FAILURES = 10
MANAGER_LOCKOUT_WINDOW_MINUTES = 5


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_password() -> str:
    return secrets.token_urlsafe(12)


def _manager_public(m: dict) -> dict:
    return {
        "id": m["id"],
        "name": m.get("name", ""),
        "username": m.get("username", ""),
        "active": bool(m.get("active", True)),
        "created_at": m.get("created_at", ""),
        "last_login_at": m.get("last_login_at"),
        "password_rotated_at": m.get("password_rotated_at"),
    }


# ─── Founder-side manager CRUD ──────────────────────────────────────────


class ManagerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    username: str = Field("", max_length=40)


@router.get("/admin/partners/{partner_id}/managers")
async def list_partner_managers(partner_id: str, current_user: dict = Depends(get_current_user)):
    _ensure_founder(current_user)
    managers = await db.partner_managers.find({"partner_id": partner_id}, {"_id": 0, "password": 0}).to_list(100)
    return {"managers": [_manager_public(m) for m in managers]}


@router.post("/admin/partners/{partner_id}/managers")
async def create_partner_manager(
    partner_id: str,
    body: ManagerCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a manager login for a partner. The generated password is
    returned ONCE in this response and stored only as a bcrypt hash —
    use Regenerate later if it's lost."""
    _ensure_founder(current_user)
    partner = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0, "id": 1, "company_name": 1, "slug": 1})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found.")

    username = (body.username or "").strip().lower()
    if not username:
        base = "".join(ch for ch in body.name.lower() if ch.isalnum())[:16] or "manager"
        username = f"{base}-{secrets.token_hex(2)}"
    if not username.replace("-", "").replace("_", "").replace(".", "").isalnum() or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters (letters, numbers, - _ .)")
    if await db.partner_managers.find_one({"username_lower": username}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail="That manager username is already taken.")

    password = _generate_password()
    manager = {
        "id": str(uuid.uuid4()),
        "partner_id": partner_id,
        "name": body.name.strip(),
        "username": username,
        "username_lower": username,
        "password": hash_password(password),
        "active": True,
        "created_at": _now_iso(),
        "created_by": current_user["id"],
        "last_login_at": None,
        "password_rotated_at": None,
    }
    await db.partner_managers.insert_one(manager)
    return {
        "manager": _manager_public(manager),
        "credentials": {"username": username, "password": password, "portal_path": "/manager"},
    }


@router.post("/admin/partners/{partner_id}/managers/{manager_id}/reset-password")
async def reset_partner_manager_password(
    partner_id: str,
    manager_id: str,
    current_user: dict = Depends(get_current_user),
):
    _ensure_founder(current_user)
    manager = await db.partner_managers.find_one(
        {"id": manager_id, "partner_id": partner_id}, {"_id": 0, "password": 0}
    )
    if not manager:
        raise HTTPException(status_code=404, detail="Manager not found.")
    password = _generate_password()
    await db.partner_managers.update_one(
        {"id": manager_id},
        {"$set": {"password": hash_password(password), "password_rotated_at": _now_iso()}},
    )
    return {"credentials": {"username": manager["username"], "password": password, "portal_path": "/manager"}}


class ManagerToggle(BaseModel):
    active: bool


@router.put("/admin/partners/{partner_id}/managers/{manager_id}")
async def toggle_partner_manager(
    partner_id: str,
    manager_id: str,
    body: ManagerToggle,
    current_user: dict = Depends(get_current_user),
):
    _ensure_founder(current_user)
    result = await db.partner_managers.update_one(
        {"id": manager_id, "partner_id": partner_id}, {"$set": {"active": bool(body.active)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Manager not found.")
    return {"updated": True, "active": bool(body.active)}


@router.delete("/admin/partners/{partner_id}/managers/{manager_id}")
async def delete_partner_manager(
    partner_id: str,
    manager_id: str,
    current_user: dict = Depends(get_current_user),
):
    _ensure_founder(current_user)
    result = await db.partner_managers.delete_one({"id": manager_id, "partner_id": partner_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Manager not found.")
    return {"deleted": True}


# ─── Manager authentication ─────────────────────────────────────────────


class ManagerLogin(BaseModel):
    username: str = Field(..., min_length=1, max_length=60)
    password: str = Field(..., min_length=1, max_length=200)


async def get_current_manager(credentials: HTTPAuthorizationCredentials = Depends(_security)) -> dict:
    """Resolve + live-validate a partner-manager token. Managers are a
    separate principal type — their tokens never pass get_current_user
    and user tokens never pass this."""
    payload = decode_token(credentials.credentials)
    if payload.get("role") != "partner_manager" or not payload.get("manager_id"):
        raise HTTPException(status_code=401, detail="Manager session required.")
    manager = await db.partner_managers.find_one({"id": payload["manager_id"]}, {"_id": 0, "password": 0})
    if not manager or not manager.get("active", True):
        raise HTTPException(status_code=401, detail="This manager account is no longer active.")
    partner = await db.b2b_partners.find_one({"id": manager["partner_id"], "active": True}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=403, detail="This partnership is inactive. Contact CarryOn.")
    manager["_partner"] = partner
    return manager


@router.post("/manager/login")  # pre-push-invariants: allow-public-mutation (credential login endpoint)
async def manager_login(data: ManagerLogin, request: Request):
    username_lower = data.username.strip().lower()
    lockout_key = f"mgr:{username_lower}"
    window_start = (datetime.now(timezone.utc) - timedelta(minutes=MANAGER_LOCKOUT_WINDOW_MINUTES)).isoformat()
    recent_failures = await db.failed_logins.count_documents(
        {"email": lockout_key, "timestamp": {"$gte": window_start}}
    )
    if recent_failures >= MANAGER_LOCKOUT_MAX_FAILURES:
        raise HTTPException(
            status_code=429,
            detail="Too many failed sign-in attempts. Please wait a few minutes and try again.",
        )

    manager = await db.partner_managers.find_one({"username_lower": username_lower}, {"_id": 0})
    if not manager or not verify_password(data.password, manager["password"]):
        await db.failed_logins.insert_one(
            {"id": str(uuid.uuid4()), "email": lockout_key, "timestamp": _now_iso(), "ip": get_client_ip(request)}
        )
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    if not manager.get("active", True):
        raise HTTPException(status_code=403, detail="This manager account has been deactivated.")
    partner = await db.b2b_partners.find_one({"id": manager["partner_id"], "active": True}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=403, detail="This partnership is inactive. Contact CarryOn.")

    await db.failed_logins.delete_many({"email": lockout_key})
    await db.partner_managers.update_one({"id": manager["id"]}, {"$set": {"last_login_at": _now_iso()}})
    token = create_token(
        user_id=manager["id"],
        email=f"{manager['username']}@manager.{partner['slug']}",
        role="partner_manager",
        session_id=str(uuid.uuid4()),
        extra_claims={"manager_id": manager["id"], "manager_partner_id": partner["id"]},
    )
    await log_audit_event(
        actor_id=manager["id"],
        actor_email=manager["username"],
        actor_role="partner_manager",
        action="manager_login",
        category="auth",
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "manager": {
            "id": manager["id"],
            "name": manager.get("name", ""),
            "username": manager["username"],
            "partner": {
                "id": partner["id"],
                "company_name": partner["company_name"],
                "slug": partner["slug"],
                "tma_enabled": bool((partner.get("feature_gates") or {}).get("tma")),
            },
        },
    }


@router.get("/manager/me")
async def manager_me(manager: dict = Depends(get_current_manager)):
    partner = manager["_partner"]
    return {
        "id": manager["id"],
        "name": manager.get("name", ""),
        "username": manager["username"],
        "partner": {
            "id": partner["id"],
            "company_name": partner["company_name"],
            "slug": partner["slug"],
            "max_uses": partner.get("max_uses", 0),
            "times_used": partner.get("times_used", 0),
            "tma_enabled": bool((partner.get("feature_gates") or {}).get("tma")),
        },
    }


# ─── Manager operations (partner-scoped) ────────────────────────────────


@router.get("/manager/clients")
async def manager_list_clients(manager: dict = Depends(get_current_manager)):
    """Full at-a-glance roster: EVERY member attributed to the manager's
    partner (self-signups via /p/{slug} AND white-glove-provisioned
    portals), with per-row capability flags."""
    partner = manager["_partner"]
    members = (
        await db.users.find(
            {"partner_id": partner["id"]},
            {
                "_id": 0,
                "id": 1,
                "name": 1,
                "email": 1,
                "account_status": 1,
                "created_at": 1,
                "claimed_at": 1,
                "invite_sent_at": 1,
                "last_login_at": 1,
                "claim_token": 1,
                "claim_token_expires_at": 1,
                "created_by_rep_id": 1,
                "created_by_manager_id": 1,
            },
        )
        .sort("created_at", -1)
        .to_list(2000)
    )
    member_ids = [m["id"] for m in members]
    grants_by_client: dict = {}
    estates_by_owner: dict = {}
    docs_by_estate: dict = {}
    if member_ids:
        grants = await db.trustee_grants.find(
            {"benefactor_id": {"$in": member_ids}, "via_pro_setup": True, "status": "active", "revoked_at": None},
            {"_id": 0, "id": 1, "benefactor_id": 1},
        ).to_list(4000)
        grants_by_client = {g["benefactor_id"]: g["id"] for g in grants}
        estates = await db.estates.find({"owner_id": {"$in": member_ids}}, {"_id": 0, "id": 1, "owner_id": 1}).to_list(
            4000
        )
        estates_by_owner = {e["owner_id"]: e["id"] for e in estates}
        estate_ids = list(estates_by_owner.values())
        if estate_ids:
            pipeline = [
                {"$match": {"estate_id": {"$in": estate_ids}}},
                {"$group": {"_id": "$estate_id", "n": {"$sum": 1}}},
            ]
            docs_by_estate = {row["_id"]: row["n"] async for row in db.documents.aggregate(pipeline)}

    clients = []
    for m in members:
        pending = m.get("account_status") == "pending_claim"
        provisioned = bool(m.get("created_by_rep_id") or m.get("created_by_manager_id"))
        estate_id = estates_by_owner.get(m["id"], "")
        clients.append(
            {
                "id": m["id"],
                "name": m.get("name", ""),
                "email": m.get("email", ""),
                "status": "pending_claim" if pending else "active",
                "provisioned": provisioned,
                "can_enter": m["id"] in grants_by_client,
                "documents_count": int(docs_by_estate.get(estate_id, 0)),
                "created_at": m.get("created_at", ""),
                "claimed_at": m.get("claimed_at"),
                "invite_sent_at": m.get("invite_sent_at"),
                "last_login_at": m.get("last_login_at"),
                "claim_url": _claim_url(m["claim_token"]) if pending and m.get("claim_token") else None,
            }
        )
    claimed = sum(1 for c in clients if c["status"] == "active")
    return {
        "partner": {
            "company_name": partner["company_name"],
            "slug": partner["slug"],
            "max_uses": partner.get("max_uses", 0),
            "times_used": partner.get("times_used", 0),
            "tma_enabled": bool((partner.get("feature_gates") or {}).get("tma")),
        },
        "stats": {
            "total": len(clients),
            "claimed": claimed,
            "awaiting_claim": len(clients) - claimed,
            "seats_remaining": max(0, int(partner.get("max_uses", 0) or 0) - int(partner.get("times_used", 0) or 0))
            if int(partner.get("max_uses", 0) or 0) > 0
            else None,
        },
        "clients": clients,
    }


class ManagerClientCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=60)
    last_name: str = Field(..., min_length=1, max_length=60)
    email: EmailStr


@router.post("/manager/clients")
async def manager_create_client(data: ManagerClientCreate, manager: dict = Depends(get_current_manager)):
    partner = manager["_partner"]
    client, estate_id = await provision_client_portal(
        partner,
        data.first_name,
        data.last_name,
        str(data.email),
        trustee_display_name=f"{manager.get('name', 'Your advisor')} ({partner['company_name']})",
        trustee_email="",
        manager_id=manager["id"],
    )
    return {
        "id": client["id"],
        "name": client.get("name", ""),
        "email": client.get("email", ""),
        "status": "pending_claim",
        "estate_id": estate_id,
        "claim_url": _claim_url(client["claim_token"]),
    }


async def _manager_client_or_404(manager: dict, client_id: str) -> dict:
    client = await db.users.find_one({"id": client_id}, {"_id": 0, "password": 0})
    if not client or client.get("partner_id") != manager["partner_id"]:
        raise HTTPException(status_code=404, detail="Client not found.")
    return client


@router.post("/manager/clients/{client_id}/send-invite")
async def manager_send_invite(
    client_id: str,
    background_tasks: BackgroundTasks,
    manager: dict = Depends(get_current_manager),
):
    partner = manager["_partner"]
    client = await _manager_client_or_404(manager, client_id)
    if client.get("account_status") != "pending_claim":
        raise HTTPException(status_code=409, detail="This client already claimed their portal.")
    token, expires = await refresh_claim_token(client)
    claim_url = _claim_url(token)
    background_tasks.add_task(
        send_email_ex,
        client["email"],
        f"{partner['company_name']} has prepared your CarryOn portal",
        _claim_email_html(
            client_name=client.get("first_name") or client.get("name", ""),
            rep_name=manager.get("name", "Your advisor"),
            company=partner["company_name"],
            claim_url=claim_url,
        ),
    )
    await db.users.update_one(
        {"id": client_id},
        {"$set": {"invite_sent_at": _now_iso()}, "$inc": {"invite_count": 1}},
    )
    return {"sent": True, "claim_url": claim_url, "claim_token_expires_at": expires}


@router.post("/manager/clients/{client_id}/enter")
async def manager_enter_client_portal(client_id: str, manager: dict = Depends(get_current_manager)):
    """Mint a Trustee-Mode acting-as token so the manager can work inside
    a provisioned client's portal — same claim shape as a trustee login,
    so the banner, audit middleware, and live grant checks apply."""
    partner = manager["_partner"]
    client = await _manager_client_or_404(manager, client_id)
    grant = await db.trustee_grants.find_one(
        {"benefactor_id": client_id, "via_pro_setup": True, "status": "active", "revoked_at": None},
        {"_id": 0},
    )
    if not grant:
        raise HTTPException(
            status_code=403,
            detail="No trustee access to this client. Only portals set up by your team can be entered.",
        )

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

    token = create_token(
        user_id=client["id"],
        email=client["email"],
        role=client.get("role", "benefactor"),
        session_id=str(uuid.uuid4()),
        extra_claims={
            "acting_as": client["id"],
            "trustee_grant_id": grant["id"],
            "trustee_display_name": f"{manager.get('name', 'Manager')} ({partner['company_name']})",
        },
    )
    await db.trustee_grants.update_one({"id": grant["id"]}, {"$set": {"last_used_at": _now_iso()}})
    return {
        "access_token": token,
        "token_type": "bearer",
        "client": {"id": client["id"], "name": client.get("name", ""), "email": client.get("email", "")},
    }


class ManagerPasswordReset(BaseModel):
    mode: str = Field(..., pattern="^(email|temp)$")


@router.post("/manager/clients/{client_id}/reset-password")
async def manager_reset_client_password(
    client_id: str,
    body: ManagerPasswordReset,
    request: Request,
    manager: dict = Depends(get_current_manager),
):
    """Two founder-approved modes:
    • email — sends the client the standard password-reset code (they
      finish via 'Forgot password' on the sign-in page; manager never
      sees anything).
    • temp — one-time temporary password shown ONCE to the manager to
      hand to the client; all of the client's existing sessions are
      revoked immediately."""
    client = await _manager_client_or_404(manager, client_id)
    if client.get("account_status") == "pending_claim":
        raise HTTPException(
            status_code=409,
            detail="This client hasn't claimed their portal yet — resend their invitation instead.",
        )

    if body.mode == "email":
        otp = f"{secrets.randbelow(1000000):06d}"
        await db.otp_codes.insert_one(
            {
                "user_id": client["id"],
                "code": otp,
                "purpose": "password_reset",
                "created_at": _now_iso(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            }
        )
        first_name = (client.get("name") or "").split()[0] or "there"
        await send_otp_email(client["email"], otp, first_name)
        result = {"sent": True, "method": "email"}
    else:
        temp_password = _generate_password()
        await db.users.update_one({"id": client["id"]}, {"$set": {"password": hash_password(temp_password)}})
        await revoke_all_user_tokens(client["id"])
        await db.users.update_one({"id": client["id"]}, {"$unset": {"active_session_id": "", "last_login_at": ""}})
        result = {"method": "temp", "temp_password": temp_password}

    await log_audit_event(
        actor_id=manager["id"],
        actor_email=manager["username"],
        actor_role="partner_manager",
        action="manager_client_password_reset",
        category="auth",
        resource_type="user",
        resource_id=client["id"],
        details={"mode": body.mode, "partner_id": manager["partner_id"]},
        ip_address=get_client_ip(request),
        severity="warning",
    )
    logger.info("[MANAGER] Password reset (%s) client=%s manager=%s", body.mode, client_id, manager["id"])
    return result
