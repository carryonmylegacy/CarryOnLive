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
create manager logins (auto-generated OR founder-assigned password,
shown ONCE, bcrypt at rest), regenerate passwords, deactivate/delete.
Every founder-issued password (assigned or generated) is temporary:
the manager must set their own password at first sign-in before a
full portal session is issued.
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
    _frontend_base,
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


def _validate_password_policy(pw: str) -> None:
    if len(pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not (any(c.isupper() for c in pw) and any(c.islower() for c in pw) and any(c.isdigit() for c in pw)):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one uppercase letter, one lowercase letter, and one number",
        )


def _manager_public(m: dict) -> dict:
    return {
        "id": m["id"],
        "name": m.get("name", ""),
        "username": m.get("username", ""),
        "active": bool(m.get("active", True)),
        "created_at": m.get("created_at", ""),
        "last_login_at": m.get("last_login_at"),
        "password_rotated_at": m.get("password_rotated_at"),
        "must_change_password": bool(m.get("must_change_password")),
        "email": m.get("email"),
    }


# ─── Founder-side manager CRUD ──────────────────────────────────────────


class ManagerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    username: str = Field("", max_length=40)
    password: str = Field("", max_length=200)
    email: str = Field("", max_length=200)


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
    """Create a manager login for a partner. The password (founder-assigned
    or auto-generated) is returned ONCE in this response and stored only as
    a bcrypt hash — use Regenerate later if it's lost. Either way it is
    temporary: the manager must set their own at first sign-in."""
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
        raise HTTPException(status_code=409, detail="That partner username is already taken.")

    assigned = body.password.strip()
    if assigned:
        _validate_password_policy(assigned)
    password = assigned or _generate_password()
    manager = {
        "id": str(uuid.uuid4()),
        "partner_id": partner_id,
        "name": body.name.strip(),
        "username": username,
        "username_lower": username,
        "password": hash_password(password),
        "must_change_password": True,
        "active": True,
        "created_at": _now_iso(),
        "created_by": current_user["id"],
        "last_login_at": None,
        "password_rotated_at": None,
        "email": (body.email or "").strip().lower() or None,
    }
    await db.partner_managers.insert_one(manager)
    guide_sent = False
    if manager["email"] and "@" in manager["email"]:
        try:
            await _send_partner_guide(manager["email"], manager, partner)
            guide_sent = True
        except HTTPException as e:
            logger.warning(f"Onboarding guide auto-send failed for {manager['email']}: {e.detail}")
    return {
        "manager": _manager_public(manager),
        "guide_sent": guide_sent,
        "credentials": {
            "username": username,
            "password": password,  # shown once to founder; bcrypt at rest (hk-14 reviewed)
            "portal_path": "/partner",
            "must_change_password": True,
        },
    }


class ManagerPasswordAssign(BaseModel):
    password: str = Field("", max_length=200)


@router.post("/admin/partners/{partner_id}/managers/{manager_id}/reset-password")
async def reset_partner_manager_password(
    partner_id: str,
    manager_id: str,
    body: ManagerPasswordAssign | None = None,
    current_user: dict = Depends(get_current_user),
):
    _ensure_founder(current_user)
    manager = await db.partner_managers.find_one(
        {"id": manager_id, "partner_id": partner_id}, {"_id": 0, "password": 0}
    )
    if not manager:
        raise HTTPException(status_code=404, detail="Partner login not found.")
    assigned = (body.password.strip() if body else "") or ""
    if assigned:
        _validate_password_policy(assigned)
    password = assigned or _generate_password()
    await db.partner_managers.update_one(
        {"id": manager_id},
        {
            "$set": {
                "password": hash_password(password),
                "must_change_password": True,
                "password_rotated_at": _now_iso(),
            }
        },
    )
    return {
        "credentials": {
            "username": manager["username"],
            "password": password,  # shown once to founder; bcrypt at rest (hk-14 reviewed)
            "portal_path": "/partner",
            "must_change_password": True,
        }
    }


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
        raise HTTPException(status_code=404, detail="Partner login not found.")
    return {"updated": True, "active": bool(body.active)}


@router.delete("/admin/partners/{partner_id}/managers/{manager_id}")
async def delete_partner_manager(
    partner_id: str,
    manager_id: str,
    current_user: dict = Depends(get_current_user),
):
    _ensure_founder(current_user)
    result = await db.partner_managers.delete_one({"id": manager_id, "partner_id": partner_id})  # hk-25: reviewed
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Partner login not found.")
    return {"deleted": True}


# ─── One-page partner onboarding guide email ────────────────────────────


class SendGuidePayload(BaseModel):
    email: EmailStr


def _partner_guide_email_html(manager_name: str, company_name: str, portal_url: str) -> str:
    first = (manager_name or "there").split(" ")[0]
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #d4af37; margin: 0;">CarryOn&trade;</h1>
            <p style="color: #666; margin: 4px 0 0;">{company_name} &mdash; Partner Onboarding Guide</p>
        </div>

        <p style="color: #555; line-height: 1.6;">Hi {first},</p>
        <p style="color: #555; line-height: 1.6;">
            Welcome to your CarryOn&trade; Partner Portal. Here is everything you need to start
            serving your clients &mdash; on one page.
        </p>

        <h2 style="color: #333; font-size: 17px; margin: 24px 0 8px;">1. Working in a client's account</h2>
        <ul style="color: #555; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li><strong>You are already authorized for every client on your roster.</strong>
                Open your Partner Portal and tap <strong>Enter Portal</strong> on any client to work
                inside their account &mdash; upload documents, complete their CarryOn sections, and
                add beneficiaries on their behalf.</li>
            <li>Your clients never need to grant or approve anything &mdash; this access is built
                into your partnership.</li>
            <li>The <strong>Trustee Access</strong> card clients see in their own Settings is a
                separate feature for inviting a family member or personal trustee. Nothing there
                is required for you.</li>
        </ul>

        <div style="background-color: #fdf3f3; border: 1px solid #f0caca; border-radius: 8px; padding: 12px 16px; margin: 14px 0;">
            <p style="color: #a94442; font-size: 13px; line-height: 1.6; margin: 0;">
                <strong>Always off-limits in a client's account:</strong> Milestone Messages
                (personal letters &mdash; not even viewable), password / email / 2FA changes,
                billing &amp; subscription changes, and estate deletion. Every action you take
                is recorded in the client's audit trail.
            </p>
        </div>

        <h2 style="color: #333; font-size: 17px; margin: 24px 0 8px;">2. Beneficiary accounts &amp; communications</h2>
        <ol style="color: #555; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Enter the client's portal and open their <strong>Beneficiaries</strong> section.
                Add each beneficiary with their email address.</li>
            <li>Tap <strong>Invite</strong> &mdash; the beneficiary receives an email with a button
                to create their own CarryOn account.</li>
            <li>Once they accept, their account links automatically (the card shows
                <strong>Account Linked</strong>), unlocking <strong>Estate Chat</strong> &mdash;
                CarryOn's secure communication tool &mdash; plus in-app and email notifications.</li>
        </ol>

        <div style="background-color: #f0faf5; border: 1px solid #c3e6d4; border-radius: 8px; padding: 12px 16px; margin: 14px 0;">
            <p style="color: #2d6a4f; font-size: 13px; line-height: 1.6; margin: 0;">
                <strong>Text &amp; email without an account:</strong> add trusted contacts under
                <strong>Friends &amp; Family Notification (FFN)</strong> in the client's portal
                with a mobile number and email &mdash; every Estate Chat message they are included
                in is relayed to them by text and email automatically.
            </p>
        </div>

        <div style="text-align: center; margin: 28px 0;">
            <a href="{portal_url}"
               style="background-color: #d4af37;
                      color: #0B1221;
                      padding: 14px 32px;
                      text-decoration: none;
                      border-radius: 8px;
                      border: 1px solid #b8962e;
                      font-weight: bold;
                      display: inline-block;">
                Open Your Partner Portal
            </a>
        </div>

        <p style="color: #888; font-size: 12px; text-align: center; line-height: 1.6; word-break: break-all;">
            Button not working? Copy and paste this link into your browser:<br>
            <a href="{portal_url}" style="color: #b8962e;">{portal_url}</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #888; font-size: 12px; text-align: center;">
            Questions? Just reply to this email &mdash; we're happy to help.
        </p>
    </div>
    """


async def _send_partner_guide(email: str, manager: dict, partner: dict) -> dict:
    portal_url = f"{_frontend_base()}/partner"
    company = partner.get("company_name", "CarryOn")
    html = _partner_guide_email_html(manager.get("name", ""), company, portal_url)
    result = await send_email_ex(email, f"Your {company} \u00b7 CarryOn Partner Guide", html)
    if not result["ok"]:
        raise HTTPException(status_code=502, detail=result["error"] or "Email delivery failed")
    return {"sent": True, "to": email}


@router.post("/admin/partners/{partner_id}/managers/{manager_id}/send-guide")
async def send_partner_manager_guide(
    partner_id: str,
    manager_id: str,
    body: SendGuidePayload,
    current_user: dict = Depends(get_current_user),
):
    _ensure_founder(current_user)
    partner = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0, "id": 1, "company_name": 1})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found.")
    manager = await db.partner_managers.find_one(
        {"id": manager_id, "partner_id": partner_id}, {"_id": 0, "password": 0}
    )
    if not manager:
        raise HTTPException(status_code=404, detail="Partner login not found.")
    if not manager.get("email"):
        await db.partner_managers.update_one({"id": manager_id}, {"$set": {"email": str(body.email).lower()}})
    return await _send_partner_guide(str(body.email), manager, partner)


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
        raise HTTPException(status_code=401, detail="Partner session required.")
    manager = await db.partner_managers.find_one({"id": payload["manager_id"]}, {"_id": 0, "password": 0})
    if not manager or not manager.get("active", True):
        raise HTTPException(status_code=401, detail="This partner account is no longer active.")
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
        raise HTTPException(status_code=403, detail="This partner account has been deactivated.")
    partner = await db.b2b_partners.find_one({"id": manager["partner_id"], "active": True}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=403, detail="This partnership is inactive. Contact CarryOn.")

    await db.failed_logins.delete_many({"email": lockout_key})

    if manager.get("must_change_password"):
        # Founder-issued password: no portal session yet. Hand back a
        # limited-scope change token (rejected by get_current_manager —
        # different role claim) that ONLY works on /manager/set-password.
        change_token = create_token(
            user_id=manager["id"],
            email=f"{manager['username']}@manager.{partner['slug']}",
            role="partner_manager_pwchange",
            session_id=str(uuid.uuid4()),
            extra_claims={"manager_id": manager["id"], "manager_partner_id": partner["id"]},
        )
        await log_audit_event(
            actor_id=manager["id"],
            actor_email=manager["username"],
            actor_role="partner_manager",
            action="manager_login_password_change_required",
            category="auth",
            ip_address=get_client_ip(request),
            severity="info",
        )
        return {
            "password_change_required": True,
            "change_token": change_token,
            "manager": {"name": manager.get("name", ""), "username": manager["username"]},
        }

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


class ManagerSetPassword(BaseModel):
    change_token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=1, max_length=200)


@router.post(
    "/manager/set-password"
)  # pre-push-invariants: allow-public-mutation (change-token-gated first-login password set)
async def manager_set_password(data: ManagerSetPassword, request: Request):
    """First-login password change: exchanges the limited-scope change
    token (issued by /manager/login while must_change_password is set)
    for a full manager session once the manager picks a password only
    they know. Fail-closed: single-purpose role claim, server-side flag
    re-check (token is useless after success), founder-issued password
    may not be reused."""
    payload = decode_token(data.change_token)
    if payload.get("role") != "partner_manager_pwchange" or not payload.get("manager_id"):
        raise HTTPException(status_code=401, detail="Invalid or expired password-change session. Please sign in again.")
    manager = await db.partner_managers.find_one({"id": payload["manager_id"]}, {"_id": 0})
    if not manager or not manager.get("active", True):
        raise HTTPException(status_code=401, detail="This partner account is no longer active.")
    if not manager.get("must_change_password"):
        raise HTTPException(status_code=409, detail="Your password was already set — sign in with your new password.")
    partner = await db.b2b_partners.find_one({"id": manager["partner_id"], "active": True}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=403, detail="This partnership is inactive. Contact CarryOn.")

    candidate = data.new_password.strip()
    _validate_password_policy(candidate)
    if verify_password(candidate, manager["password"]):
        raise HTTPException(status_code=400, detail="Your new password must be different from the one you were issued.")

    now = _now_iso()
    await db.partner_managers.update_one(
        {"id": manager["id"]},
        {
            "$set": {
                "password": hash_password(candidate),
                "must_change_password": False,
                "password_rotated_at": now,
                "last_login_at": now,
            }
        },
    )
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
        action="manager_first_password_set",
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


@router.post("/manager/send-guide")
async def manager_send_guide(body: SendGuidePayload, manager: dict = Depends(get_current_manager)):
    """Manager self-service — email the one-page onboarding guide anywhere."""
    return await _send_partner_guide(str(body.email), manager, manager["_partner"])


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
    active_sub_ids: set = set()
    estates_by_owner: dict = {}
    docs_by_estate: dict = {}
    bens_by_estate: dict = {}
    if member_ids:
        grants = await db.trustee_grants.find(
            {"benefactor_id": {"$in": member_ids}, "via_pro_setup": True, "status": "active", "revoked_at": None},
            {"_id": 0, "id": 1, "benefactor_id": 1},
        ).to_list(4000)
        grants_by_client = {g["benefactor_id"]: g["id"] for g in grants}
        subs = await db.user_subscriptions.find(
            {"user_id": {"$in": member_ids}, "status": "active"},
            {"_id": 0, "id": 1, "user_id": 1},
        ).to_list(4000)
        active_sub_ids = {s["user_id"] for s in subs}
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
            ben_pipeline = [
                {"$match": {"estate_id": {"$in": estate_ids}, "deleted_at": None}},
                {
                    "$group": {
                        "_id": "$estate_id",
                        "total": {"$sum": 1},
                        "linked": {
                            "$sum": {
                                "$cond": [
                                    {
                                        "$or": [
                                            {"$ne": [{"$ifNull": ["$user_id", None]}, None]},
                                            {"$eq": ["$invitation_status", "accepted"]},
                                        ]
                                    },
                                    1,
                                    0,
                                ]
                            }
                        },
                        "invited": {"$sum": {"$cond": [{"$eq": ["$invitation_status", "sent"]}, 1, 0]}},
                    }
                },
            ]
            bens_by_estate = {row["_id"]: row async for row in db.beneficiaries.aggregate(ben_pipeline)}

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
                "subscribed": m["id"] in active_sub_ids,
                "provisioned": provisioned,
                "can_enter": m["id"] in grants_by_client,
                "documents_count": int(docs_by_estate.get(estate_id, 0)),
                "beneficiaries_total": int((bens_by_estate.get(estate_id) or {}).get("total", 0)),
                "beneficiaries_linked": int((bens_by_estate.get(estate_id) or {}).get("linked", 0)),
                "beneficiaries_invited": int((bens_by_estate.get(estate_id) or {}).get("invited", 0)),
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


# ─── Roster beneficiary nudge ────────────────────────────────────────────


@router.get("/manager/clients/{client_id}/beneficiaries")
async def manager_client_beneficiaries(client_id: str, manager: dict = Depends(get_current_manager)):
    """Beneficiary invite statuses for one roster client."""
    client = await _manager_client_or_404(manager, client_id)
    estate = await db.estates.find_one({"owner_id": client["id"]}, {"_id": 0, "id": 1})
    if not estate:
        return {"beneficiaries": []}
    bens = await db.beneficiaries.find(
        {"estate_id": estate["id"], "deleted_at": None},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "invitation_status": 1, "invitation_sent_at": 1, "user_id": 1},
    ).to_list(200)
    out = []
    for b in bens:
        linked = bool(b.get("user_id")) or b.get("invitation_status") == "accepted"
        out.append(
            {
                "id": b["id"],
                "name": b.get("name", ""),
                "email": b.get("email", ""),
                "status": "linked" if linked else ("sent" if b.get("invitation_status") == "sent" else "not_invited"),
                "invitation_sent_at": b.get("invitation_sent_at"),
            }
        )
    return {"beneficiaries": out}


@router.post("/manager/clients/{client_id}/beneficiaries/{beneficiary_id}/invite")
async def manager_invite_beneficiary(
    client_id: str,
    beneficiary_id: str,
    request: Request,
    manager: dict = Depends(get_current_manager),
):
    """Send or re-send a beneficiary invitation on the client's behalf."""
    client = await _manager_client_or_404(manager, client_id)
    estate = await db.estates.find_one({"owner_id": client["id"]}, {"_id": 0, "id": 1})
    beneficiary = None
    if estate:
        beneficiary = await db.beneficiaries.find_one(
            {"id": beneficiary_id, "estate_id": estate["id"], "deleted_at": None}, {"_id": 0}
        )
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Beneficiary not found for this client.")
    if beneficiary.get("user_id") or beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(status_code=400, detail="This beneficiary has already linked their account.")

    from routes.beneficiaries.invitations import deliver_invitation

    await deliver_invitation(
        beneficiary, client, actor_id=manager["id"], actor_name=f"{manager.get('name', 'Partner')} (partner)"
    )
    await log_audit_event(
        actor_id=manager["id"],
        actor_email=manager["username"],
        actor_role="partner_manager",
        action="manager_beneficiary_invite",
        category="data_access",
        resource_type="beneficiary",
        resource_id=beneficiary_id,
        details={"client_id": client_id, "partner_id": manager["partner_id"]},
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {"sent": True, "email": beneficiary["email"]}
