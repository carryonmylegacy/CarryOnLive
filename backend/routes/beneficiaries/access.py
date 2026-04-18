"""Beneficiaries — primary designation and estate access request management."""

from ._core import router
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from config import db
from guards import require_benefactor_role
from utils import get_current_user, send_push_notification
from datetime import datetime, timezone
import uuid


@router.put("/beneficiaries/{beneficiary_id}/set-primary")
async def set_primary_beneficiary(beneficiary_id: str, current_user: dict = Depends(get_current_user)):
    """Designate a beneficiary as the primary beneficiary (trustee) of the estate.
    Also sets them as succession_order=0 in the succession hierarchy."""
    require_benefactor_role(current_user, "designate a primary beneficiary")

    # Find the beneficiary to get their estate_id
    ben = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0, "id": 1, "estate_id": 1, "name": 1})
    if not ben:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    estate_id = ben["estate_id"]

    # Clear any existing primary designation for this estate
    await db.beneficiaries.update_many(
        {"estate_id": estate_id, "is_primary": True},
        {"$set": {"is_primary": False}},
    )

    # Set the new primary + succession_order = 0
    await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {"$set": {"is_primary": True, "succession_order": 0}},
    )

    # Ensure any other beneficiaries with succession_order 0 are bumped
    await db.beneficiaries.update_many(
        {"estate_id": estate_id, "id": {"$ne": beneficiary_id}, "succession_order": 0},
        {"$set": {"succession_order": None}},
    )

    return {
        "message": f"{ben.get('name', 'Beneficiary')} designated as primary beneficiary",
        "primary_beneficiary_id": beneficiary_id,
    }


@router.get("/beneficiaries/{estate_id}/primary")
async def get_primary_beneficiary(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get the primary beneficiary for an estate."""
    primary = await db.beneficiaries.find_one({"estate_id": estate_id, "is_primary": True}, {"_id": 0})
    return {"primary": primary}


# ===================== POST-TRANSITION BENEFICIARY ACCESS REQUESTS =====================


class BeneficiaryAccessRequest(BaseModel):
    estate_id: str
    message: str = ""


@router.post("/beneficiaries/request-access")
async def request_estate_access(data: BeneficiaryAccessRequest, current_user: dict = Depends(get_current_user)):
    """Request access to a transitioned estate. Requires primary beneficiary approval."""
    if current_user["role"] != "beneficiary":
        raise HTTPException(status_code=403, detail="Only beneficiaries can request access")

    estate = await db.estates.find_one({"id": data.estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Check if estate is transitioned
    if estate.get("status") != "transitioned":
        # If not transitioned, the request goes to the benefactor
        approver_id = estate["owner_id"]
        approver_type = "benefactor"
    else:
        # Post-transition: find the primary beneficiary
        primary = await db.beneficiaries.find_one(
            {"estate_id": data.estate_id, "is_primary": True},
            {"_id": 0, "id": 1, "user_id": 1, "name": 1},
        )
        if not primary or not primary.get("user_id"):
            raise HTTPException(
                status_code=400,
                detail="No primary beneficiary has been designated for this estate. Access cannot be granted.",
            )
        approver_id = primary["user_id"]
        approver_type = "primary_beneficiary"

    # Check for existing pending request
    existing = await db.access_requests.find_one(
        {
            "estate_id": data.estate_id,
            "requester_id": current_user["id"],
            "status": "pending",
        },
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending access request")

    request_doc = {
        "id": str(uuid.uuid4()),
        "estate_id": data.estate_id,
        "requester_id": current_user["id"],
        "requester_name": current_user.get("name", current_user.get("email", "")),
        "requester_email": current_user.get("email", ""),
        "approver_id": approver_id,
        "approver_type": approver_type,
        "message": data.message,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.access_requests.insert_one(request_doc)

    # Send notification to approver
    await send_push_notification(
        user_id=approver_id,
        title="New Beneficiary Access Request",
        body=f"{current_user.get('name', 'Someone')} is requesting access to the estate.",
        url="/beneficiaries",
    )

    return {
        "id": request_doc["id"],
        "status": "pending",
        "approver_type": approver_type,
        "message": "Your request has been submitted for approval.",
    }


@router.get("/beneficiaries/access-requests/{estate_id}")
async def get_access_requests(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get pending access requests for an estate. Only the approver can view these."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Check if user is authorized to view requests
    is_owner = estate.get("owner_id") == current_user["id"]
    is_primary = False
    if not is_owner:
        primary = await db.beneficiaries.find_one(
            {"estate_id": estate_id, "is_primary": True, "user_id": current_user["id"]},
            {"_id": 0},
        )
        is_primary = primary is not None

    if not is_owner and not is_primary and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view requests")

    requests = await db.access_requests.find({"estate_id": estate_id, "status": "pending"}, {"_id": 0}).to_list(100)
    return requests


class AccessRequestAction(BaseModel):
    action: str  # "approve" or "deny"


@router.put("/beneficiaries/access-requests/{request_id}")
async def handle_access_request(
    request_id: str,
    data: AccessRequestAction,
    current_user: dict = Depends(get_current_user),
):
    """Approve or deny a beneficiary access request."""
    if data.action not in ("approve", "deny"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'deny'")

    req = await db.access_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Verify current user is the approver
    if req["approver_id"] != current_user["id"] and current_user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only the designated approver can act on this request",
        )

    await db.access_requests.update_one(
        {"id": request_id},
        {
            "$set": {
                "status": data.action + "d",  # "approved" or "denied"
                "acted_by": current_user["id"],
                "acted_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    if data.action == "approve":
        # Add requester as a beneficiary to the estate
        requester = await db.users.find_one({"id": req["requester_id"]}, {"_id": 0})
        if requester:
            # Add to estate beneficiaries array
            await db.estates.update_one(
                {"id": req["estate_id"]},
                {"$addToSet": {"beneficiaries": req["requester_id"]}},
            )

            # Create a beneficiary record if none exists
            existing_ben = await db.beneficiaries.find_one(
                {"estate_id": req["estate_id"], "user_id": req["requester_id"]},
                {"_id": 0},
            )
            if not existing_ben:
                name = requester.get("name", requester.get("email", ""))
                first_name = requester.get("first_name", name.split(" ")[0])
                last_name = requester.get("last_name", name.split(" ")[-1] if " " in name else "")
                from models import Beneficiary

                new_ben = Beneficiary(
                    estate_id=req["estate_id"],
                    user_id=req["requester_id"],
                    first_name=first_name,
                    last_name=last_name,
                    name=name,
                    relation="Other",
                    email=requester.get("email", ""),
                    invitation_status="accepted",
                    invitation_token=str(uuid.uuid4()),
                )
                await db.beneficiaries.insert_one(new_ben.model_dump())

            # Create 30-day grace period for the new beneficiary
            from datetime import timedelta

            grace_end = datetime.now(timezone.utc) + timedelta(days=30)
            await db.beneficiary_grace_periods.update_one(
                {"beneficiary_id": req["requester_id"]},
                {
                    "$set": {
                        "id": str(uuid.uuid4()),
                        "beneficiary_id": req["requester_id"],
                        "benefactor_id": (
                            await db.estates.find_one(
                                {"id": req["estate_id"]},
                                {"_id": 0, "id": 1, "owner_id": 1},
                            )
                        ).get("owner_id", ""),
                        "reason": "post_transition_approval",
                        "grace_starts_at": datetime.now(timezone.utc).isoformat(),
                        "grace_ends_at": grace_end.isoformat(),
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                },
                upsert=True,
            )

        # Notify requester
        await send_push_notification(
            user_id=req["requester_id"],
            title="Access Request Approved",
            body="Your request to access the estate has been approved. You have a 30-day grace period before subscription is required.",
            url="/dashboard",
        )
    else:
        # Notify requester of denial
        await send_push_notification(
            user_id=req["requester_id"],
            title="Access Request Denied",
            body="Your request to access the estate was not approved.",
            url="/dashboard",
        )

    return {
        "success": True,
        "action": data.action,
        "message": f"Request {data.action}d successfully",
    }
