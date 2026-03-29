"""CarryOn™ Backend — Founder Page Invite Routes

Reusable, revocable invite tokens for the private "About the Founder" page.
Each link works for unlimited visits until explicitly revoked by the admin.
Managed by the admin (Founder) via the Admin portal.
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from config import db
from utils import get_current_user

router = APIRouter()


class CreateInviteRequest(BaseModel):
    note: str = ""


@router.post("/founder/invites")
async def create_invite(body: CreateInviteRequest, current_user: dict = Depends(get_current_user)):
    """Generate a reusable invite token for the Founder page — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

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
async def list_invites(current_user: dict = Depends(get_current_user)):
    """List all founder page invites — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    invites = await db.founder_invites.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return invites


@router.delete("/founder/invites/{token}")
async def revoke_invite(token: str, current_user: dict = Depends(get_current_user)):
    """Revoke an invite token — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.founder_invites.update_one(
        {"token": token},
        {"$set": {"revoked": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invite not found")
    return {"status": "revoked"}


@router.get("/founder-about/verify/{token}")
async def verify_invite(token: str, request: Request):
    """Public endpoint — verify if an invite token is valid. Tracks views."""
    invite = await db.founder_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        return {"valid": False, "reason": "not_found"}
    if invite.get("revoked"):
        return {"valid": False, "reason": "revoked"}

    # Track view count (non-blocking analytics)
    await db.founder_invites.update_one(
        {"token": token},
        {
            "$inc": {"views": 1},
            "$set": {"last_viewed_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    return {"valid": True}
