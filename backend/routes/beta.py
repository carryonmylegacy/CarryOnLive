"""CarryOn™ Backend — Beta Testing Routes

Per-user beta toggle, feedback ticket submission, and admin management.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional

from config import db, logger
from utils import get_current_user

router = APIRouter()


# ===================== BETA TESTER MANAGEMENT (ADMIN) =====================


class BetaToggleRequest(BaseModel):
    is_beta: bool


@router.put("/admin/user/{user_id}/beta")
async def toggle_user_beta(user_id: str, data: BetaToggleRequest, current_user: dict = Depends(get_current_user)):
    """Toggle beta tester status for a specific user — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc).isoformat()

    if data.is_beta:
        # Activate beta for this user
        await db.users.update_one(
            {"id": user_id},
            {
                "$set": {
                    "is_beta_tester": True,
                    "beta_activated_at": now,
                    "beta_accepted_at": None,  # Reset so they see the welcome popup
                },
                "$unset": {"beta_deactivated_at": ""},
            },
        )
        logger.info(f"Beta activated for user {user.get('name')} ({user_id})")
    else:
        # Deactivate beta — start 30-day grace period
        grace_end = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        await db.users.update_one(
            {"id": user_id},
            {
                "$set": {
                    "is_beta_tester": False,
                    "beta_deactivated_at": now,
                    "trial_ends_at": grace_end,
                }
            },
        )
        logger.info(f"Beta deactivated for user {user.get('name')} ({user_id}), grace period until {grace_end}")

    return {"success": True, "is_beta": data.is_beta, "user_id": user_id}


@router.get("/admin/beta-users")
async def get_beta_users(current_user: dict = Depends(get_current_user)):
    """Get all users with beta tester status — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    beta_users = await db.users.find(
        {"is_beta_tester": True},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "beta_activated_at": 1, "beta_accepted_at": 1},
    ).to_list(1000)
    return beta_users


# ===================== BETA ACCEPTANCE (USER) =====================


@router.post("/beta/accept")
async def accept_beta_terms(current_user: dict = Depends(get_current_user)):
    """User accepts beta testing terms — marks popup as seen."""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "is_beta_tester": 1})
    if not user or not user.get("is_beta_tester"):
        raise HTTPException(status_code=400, detail="You are not a beta tester")

    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"beta_accepted_at": now}},
    )
    return {"success": True, "accepted_at": now}


# ===================== FEEDBACK TICKETS =====================


@router.post("/beta/feedback")
async def submit_beta_feedback(
    page: str = Form(...),
    description: str = Form(...),
    attachment: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user),
):
    """Submit a beta feedback/bug report ticket."""
    user = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "id": 1, "is_beta_tester": 1, "name": 1, "email": 1}
    )
    if not user or not user.get("is_beta_tester"):
        raise HTTPException(status_code=403, detail="Only beta testers can submit feedback")

    # Get next ticket number
    last_ticket = await db.beta_tickets.find_one(sort=[("ticket_number", -1)])
    next_number = (last_ticket["ticket_number"] + 1) if last_ticket else 1

    now = datetime.now(timezone.utc).isoformat()

    ticket = {
        "id": str(uuid4()),
        "ticket_number": next_number,
        "user_id": current_user["id"],
        "user_name": user.get("name", "Unknown"),
        "user_email": user.get("email", ""),
        "page": page,
        "description": description,
        "status": "open",  # open, accepted, complete, rejected
        "created_at": now,
        "updated_at": now,
        "attachment_name": None,
        "attachment_data": None,
    }

    # Handle attachment
    if attachment:
        try:
            file_data = await attachment.read()
            import base64

            ticket["attachment_name"] = attachment.filename
            ticket["attachment_data"] = base64.b64encode(file_data).decode("utf-8")
            ticket["attachment_content_type"] = attachment.content_type
        except Exception as e:
            logger.error(f"Failed to process attachment: {e}")

    await db.beta_tickets.insert_one(ticket)
    # Remove _id before returning
    ticket.pop("_id", None)

    logger.info(f"Beta ticket #{next_number} submitted by {user.get('name')} for page: {page}")
    return {"success": True, "ticket_number": next_number}


@router.get("/admin/beta-tickets")
async def get_beta_tickets(current_user: dict = Depends(get_current_user)):
    """Get all beta feedback tickets — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    tickets = (
        await db.beta_tickets.find(
            {},
            {"_id": 0},
        )
        .sort("created_at", -1)
        .to_list(10000)
    )
    return tickets


class TicketStatusUpdate(BaseModel):
    status: str  # "open", "accepted", "complete", "rejected"


@router.put("/admin/beta-tickets/{ticket_id}/status")
async def update_ticket_status(
    ticket_id: str, data: TicketStatusUpdate, current_user: dict = Depends(get_current_user)
):
    """Update beta ticket status — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if data.status not in ("open", "accepted", "complete", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")

    result = await db.beta_tickets.update_one(
        {"id": ticket_id},
        {"$set": {"status": data.status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ticket not found")

    return {"success": True, "status": data.status}
