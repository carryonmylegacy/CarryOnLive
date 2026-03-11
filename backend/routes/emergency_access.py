"""CarryOn™ Backend — Emergency Access Protocol

Allows beneficiaries to request emergency vault access when a benefactor
is incapacitated. Requires multi-step verification and admin approval.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from services.audit import audit_log
from utils import get_current_user, send_push_notification

router = APIRouter()

# ===================== EMERGENCY ACCESS PROTOCOL =====================


class EmergencyAccessRequest(BaseModel):
    estate_id: str
    reason: str
    relationship_to_benefactor: str
    urgency: str = "high"  # high, critical
    contact_phone: Optional[str] = None
    supporting_details: Optional[str] = None


class EmergencyAccessReview(BaseModel):
    action: str  # approve, deny, request_more_info
    notes: Optional[str] = None
    access_level: str = "read_only"  # read_only, full
    access_duration_hours: int = 72  # default 72 hours


@router.post("/emergency-access/request")
async def request_emergency_access(
    data: EmergencyAccessRequest, current_user: dict = Depends(get_current_user)
):
    """Beneficiary requests emergency access to an estate vault."""
    # Verify the user is a beneficiary of this estate
    estate = await db.estates.find_one({"id": data.estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    if current_user["id"] not in estate.get("beneficiaries", []):
        raise HTTPException(
            status_code=403,
            detail="You must be a beneficiary of this estate to request emergency access",
        )

    # Check for existing pending request
    existing = await db.emergency_access.find_one(
        {
            "estate_id": data.estate_id,
            "requester_id": current_user["id"],
            "status": "pending",
        },
        {"_id": 0},
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="You already have a pending emergency access request for this estate",
        )

    # Get benefactor info
    benefactor = await db.users.find_one(
        {"id": estate.get("owner_id")}, {"_id": 0, "name": 1, "email": 1}
    )

    request_id = str(uuid.uuid4())
    request_doc = {
        "id": request_id,
        "estate_id": data.estate_id,
        "estate_name": estate.get("name", "Unknown"),
        "requester_id": current_user["id"],
        "requester_name": current_user.get("name", ""),
        "requester_email": current_user.get("email", ""),
        "benefactor_name": benefactor.get("name", "Unknown")
        if benefactor
        else "Unknown",
        "benefactor_email": benefactor.get("email", "") if benefactor else "",
        "reason": data.reason,
        "relationship": data.relationship_to_benefactor,
        "urgency": data.urgency,
        "contact_phone": data.contact_phone,
        "supporting_details": data.supporting_details,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_at": None,
        "reviewed_by": None,
        "review_notes": None,
        "access_level": None,
        "access_expires_at": None,
    }
    await db.emergency_access.insert_one(request_doc)

    # Audit log
    await audit_log(
        action="emergency_access.request",
        user_id=current_user["id"],
        resource_type="emergency_access",
        resource_id=request_id,
        estate_id=data.estate_id,
        details={
            "reason": data.reason,
            "urgency": data.urgency,
            "relationship": data.relationship_to_benefactor,
        },
    )

    # Notify all staff (Founder + Operators) of emergency access request
    import asyncio
    from services.notifications import notify

    asyncio.create_task(
        notify.p2_alert(
            "Emergency Access Request",
            f"{current_user.get('name', 'A beneficiary')} requests emergency access to estate '{estate.get('name', 'Unknown')}'.",
            url="/ops/escalations",
            metadata={
                "request_id": request_id,
                "estate_id": data.estate_id,
                "urgency": data.urgency,
            },
        )
    )

    return {
        "id": request_id,
        "status": "pending",
        "message": "Emergency access request submitted. Our Transition Verification Team will review this promptly.",
    }


@router.get("/emergency-access/my-requests")
async def get_my_emergency_requests(current_user: dict = Depends(get_current_user)):
    """Get all emergency access requests for the current user."""
    requests = (
        await db.emergency_access.find({"requester_id": current_user["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(50)
    )
    return requests


@router.get("/emergency-access/active")
async def get_active_emergency_access(current_user: dict = Depends(get_current_user)):
    """Check if user has any active emergency access grants."""
    now = datetime.now(timezone.utc).isoformat()
    active = await db.emergency_access.find(
        {
            "requester_id": current_user["id"],
            "status": "approved",
            "access_expires_at": {"$gt": now},
        },
        {"_id": 0},
    ).to_list(10)
    return active


# ===================== ADMIN MANAGEMENT =====================


@router.get("/admin/emergency-access")
async def get_all_emergency_requests(current_user: dict = Depends(get_current_user)):
    """Admin: Get all emergency access requests."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    requests = (
        await db.emergency_access.find({}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    return requests


@router.post("/admin/emergency-access/{request_id}/review")
async def review_emergency_access(
    request_id: str,
    data: EmergencyAccessReview,
    current_user: dict = Depends(get_current_user),
):
    """Admin: Approve, deny, or request more info on an emergency access request."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if data.action not in ("approve", "deny", "request_more_info"):
        raise HTTPException(
            status_code=400, detail="Action must be approve, deny, or request_more_info"
        )

    request_doc = await db.emergency_access.find_one({"id": request_id}, {"_id": 0})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Request not found")

    update = {
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "reviewed_by": current_user["id"],
        "review_notes": data.notes,
    }

    if data.action == "approve":
        from datetime import timedelta

        expires_at = (
            datetime.now(timezone.utc) + timedelta(hours=data.access_duration_hours)
        ).isoformat()
        update["status"] = "approved"
        update["access_level"] = data.access_level
        update["access_expires_at"] = expires_at
        update["access_duration_hours"] = data.access_duration_hours

    elif data.action == "deny":
        update["status"] = "denied"

    elif data.action == "request_more_info":
        update["status"] = "more_info_needed"

    await db.emergency_access.update_one({"id": request_id}, {"$set": update})

    # Notify the requester
    import asyncio

    status_msg = {
        "approve": "approved. You now have temporary access.",
        "deny": "denied. Please contact support for assistance.",
        "request_more_info": "needs more information. Please check your dashboard.",
    }

    asyncio.create_task(
        send_push_notification(
            request_doc["requester_id"],
            "Emergency Access Update",
            f"Your emergency access request has been {status_msg[data.action]}",
            "/beneficiary",
            "emergency-access-update",
            "emergency",
        )
    )

    await audit_log(
        action=f"emergency_access.{data.action}",
        user_id=current_user["id"],
        resource_type="emergency_access",
        resource_id=request_id,
        estate_id=request_doc.get("estate_id"),
        details={
            "action": data.action,
            "access_level": data.access_level if data.action == "approve" else None,
            "duration_hours": data.access_duration_hours
            if data.action == "approve"
            else None,
        },
    )

    action_label = {
        "approve": "approved",
        "deny": "denied",
        "request_more_info": "flagged for more info",
    }

    return {
        "success": True,
        "message": f"Emergency access request {action_label[data.action]}",
    }
