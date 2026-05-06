"""CarryOn™ Backend — Founder Page Access Routes

Two access methods for the private "About the Founder" page:
1. Invite Links: Reusable, revocable tokens (collection: founder_invites)
2. Access Requests: Visitors request access, admin approves with password (collection: founder_access_requests)
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db, logger
from guards import require_admin
from utils import hash_password, verify_password

router = APIRouter()


# ─── Invite Links (reusable tokens) ─────────────────────────────────────────


class CreateInviteRequest(BaseModel):
    note: str = ""


@router.post("/founder/invites")
async def create_invite(body: CreateInviteRequest, current_user: dict = Depends(require_admin)):
    """Generate a reusable invite token for the Founder page — admin only."""

    token = str(uuid4())
    invite = {
        "token": token,
        "note": body.note.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "views": 0,
        "last_viewed_at": None,
        "revoked": False,
    }
    await db.founder_invites.insert_one(invite)
    invite.pop("_id", None)
    return invite


@router.get("/founder/invites")
async def list_invites(current_user: dict = Depends(require_admin)):
    """List all founder page invites — admin only."""

    invites = await db.founder_invites.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return invites


@router.delete("/founder/invites/{token}")
async def revoke_invite(token: str, current_user: dict = Depends(require_admin)):
    """Revoke an invite token — admin only."""

    result = await db.founder_invites.update_one(
        {"token": token},
        {"$set": {"revoked": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invite not found")
    return {"status": "revoked"}


@router.get("/founder-about/verify/{token}")
async def verify_invite(token: str):
    """Public endpoint — verify if an invite token is valid. Tracks views."""
    invite = await db.founder_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        return {"valid": False, "reason": "not_found"}
    if invite.get("revoked"):
        return {"valid": False, "reason": "revoked"}

    await db.founder_invites.update_one(
        {"token": token},
        {
            "$inc": {"views": 1},
            "$set": {"last_viewed_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    return {"valid": True}


# ─── Access Requests (request → approve with password → login) ───────────────


class SubmitAccessRequest(BaseModel):
    name: str
    email: str
    message: str = ""


class ApproveRequestBody(BaseModel):
    password: str


class FounderLoginBody(BaseModel):
    email: str
    password: str


@router.post("/founder/requests")
async def submit_access_request(body: SubmitAccessRequest):
    """Public endpoint — submit a request to view the Founder page."""
    name = body.name.strip()
    email = body.email.strip().lower()
    if not name or not email:
        raise HTTPException(status_code=400, detail="Name and email are required")

    # Prevent duplicate pending requests from same email
    existing = await db.founder_access_requests.find_one({"email": email, "status": "pending"}, {"_id": 0})
    if existing:
        return {"status": "already_pending"}

    request_id = str(uuid4())
    doc = {
        "request_id": request_id,
        "name": name,
        "email": email,
        "message": body.message.strip(),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_at": None,
        "password_hash": None,
        "views": 0,
        "last_viewed_at": None,
    }
    await db.founder_access_requests.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)

    # Send email notification to admin
    try:
        from services.email import send_email

        admin = await db.users.find_one({"role": "admin"}, {"email": 1, "_id": 0})
        admin_email = admin["email"] if admin else None
        if admin_email:
            await send_email(
                to=admin_email,
                subject=f"Founder Page Access Request — {name}",
                html=f"""
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0d1b2a;color:#e2e8f0;border-radius:12px;">
                    <h2 style="color:#d4af37;margin-top:0;">New Access Request</h2>
                    <p>Someone has requested access to the <strong>About the Founder</strong> page.</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                        <tr><td style="padding:8px 0;color:#94a3b8;width:80px;">Name</td><td style="padding:8px 0;color:#fff;font-weight:600;">{name}</td></tr>
                        <tr><td style="padding:8px 0;color:#94a3b8;">Email</td><td style="padding:8px 0;color:#fff;">{email}</td></tr>
                        {"<tr><td style='padding:8px 0;color:#94a3b8;vertical-align:top;'>Message</td><td style='padding:8px 0;color:#cbd5e1;'>" + body.message.strip() + "</td></tr>" if body.message.strip() else ""}
                    </table>
                    <p style="color:#64748b;font-size:13px;">Review this request in your <strong>Founder Portal &rarr; Invites</strong> tab.</p>
                </div>
                """,
            )
    except Exception as e:
        logger.error(f"Failed to send founder access request notification: {e}")

    return {"status": "submitted", "request_id": request_id}


@router.get("/founder/requests")
async def list_access_requests(current_user: dict = Depends(require_admin)):
    """List all access requests — admin only."""

    requests = (
        await db.founder_access_requests.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    )
    return requests


@router.post("/founder/requests/{request_id}/approve")
async def approve_request(request_id: str, body: ApproveRequestBody, current_user: dict = Depends(require_admin)):
    """Approve an access request and set a password — admin only."""

    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    req = await db.founder_access_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    await db.founder_access_requests.update_one(
        {"request_id": request_id},
        {
            "$set": {
                "status": "approved",
                "password_hash": hash_password(body.password),
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    # Email the requester so they actually know they were approved and
    # how to log in. Without this the request just goes silent — the
    # requester has no idea they were approved or what their password is.
    try:
        import os
        from services.email import send_email

        frontend_url = os.environ.get("FRONTEND_URL", "https://app.carryon.us")
        login_link = f"{frontend_url}/founder-about?login=1"
        await send_email(
            to=req["email"],
            subject="You're approved — About the Founder of CarryOn™",
            html=f"""
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0d1b2a;color:#e2e8f0;border-radius:12px;">
                <h2 style="color:#d4af37;margin-top:0;">Access Approved</h2>
                <p>Hi {req.get("name", "there")},</p>
                <p>Your request to view the <strong>About the Founder</strong> page has been approved by Brian, the founder of CarryOn&trade;.</p>
                <p>Use the credentials below to sign in:</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;background:rgba(255,255,255,0.04);border-radius:8px;padding:8px;">
                    <tr><td style="padding:10px 14px;color:#94a3b8;width:90px;">Email</td><td style="padding:10px 14px;color:#fff;font-weight:600;">{req["email"]}</td></tr>
                    <tr><td style="padding:10px 14px;color:#94a3b8;">Password</td><td style="padding:10px 14px;color:#d4af37;font-family:monospace;font-weight:600;font-size:15px;">{body.password}</td></tr>
                </table>
                <p style="margin:20px 0;">
                    <a href="{login_link}" style="display:inline-block;background:#d4af37;color:#0d1b2a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Sign In to View &rarr;</a>
                </p>
                <p style="color:#64748b;font-size:13px;margin-top:24px;">If the button doesn't work, copy this link into your browser:<br/><span style="color:#94a3b8;">{login_link}</span></p>
                <p style="color:#64748b;font-size:13px;margin-top:18px;">This password is single-purpose — it only unlocks the founder page and is not tied to any other CarryOn&trade; account.</p>
            </div>
            """,
        )
    except Exception as e:
        logger.error(f"Failed to send founder approval email to {req.get('email')}: {e}")

    return {"status": "approved"}


@router.post("/founder/requests/{request_id}/deny")
async def deny_request(request_id: str, current_user: dict = Depends(require_admin)):
    """Deny an access request — admin only."""

    result = await db.founder_access_requests.update_one(
        {"request_id": request_id},
        {
            "$set": {
                "status": "denied",
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"status": "denied"}


@router.post("/founder/requests/{request_id}/revoke")
async def revoke_request_access(request_id: str, current_user: dict = Depends(require_admin)):
    """Revoke an approved request — admin only."""

    result = await db.founder_access_requests.update_one(
        {"request_id": request_id},
        {
            "$set": {
                "status": "revoked",
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"status": "revoked"}


@router.post("/founder-about/login")
async def founder_login(body: FounderLoginBody):
    """Public endpoint — verify email + password for Founder page access."""
    email = body.email.strip().lower()
    req = await db.founder_access_requests.find_one(
        {"email": email, "status": "approved"},
        {"_id": 0},
    )
    if not req:
        return {"valid": False, "reason": "no_access"}
    if not req.get("password_hash"):
        return {"valid": False, "reason": "no_password"}
    if not verify_password(body.password, req["password_hash"]):
        return {"valid": False, "reason": "wrong_password"}

    # Track view
    await db.founder_access_requests.update_one(
        {"request_id": req["request_id"]},
        {
            "$inc": {"views": 1},
            "$set": {"last_viewed_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    return {"valid": True}
