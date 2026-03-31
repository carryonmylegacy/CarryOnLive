"""CarryOn™ — Milestone Delivery Review Workflow

Workers review automated milestone message matches before delivery.
Flow: Beneficiary reports milestone → System finds matches → Worker reviews → Approves/Rejects/Schedules → Delivers
"""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from config import db
from services.notifications import notify
from utils import get_current_user

router = APIRouter()


def require_staff(user: dict):
    if user.get("role") not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Staff access required")


@router.get("/milestones/deliveries")
async def get_pending_deliveries(
    status: str = Query("pending_review"),
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user),
):
    """Get milestone deliveries for review. Staff only."""
    require_staff(current_user)

    query = {}
    if status:
        query["status"] = status

    deliveries = (
        await db.milestone_deliveries.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    )

    # Enrich with estate name
    for d in deliveries:
        estate = await db.estates.find_one({"id": d.get("estate_id")}, {"_id": 0, "id": 1, "name": 1})
        d["estate_name"] = (estate or {}).get("name", "")

    return deliveries


@router.get("/milestones/deliveries/stats")
async def get_delivery_stats(current_user: dict = Depends(get_current_user)):
    """Get milestone delivery stats for the dashboard."""
    require_staff(current_user)

    pending = await db.milestone_deliveries.count_documents({"status": "pending_review"})
    approved = await db.milestone_deliveries.count_documents({"status": "approved"})
    scheduled = await db.milestone_deliveries.count_documents({"status": "scheduled"})
    rejected = await db.milestone_deliveries.count_documents({"status": "rejected"})

    return {
        "pending": pending,
        "approved": approved,
        "scheduled": scheduled,
        "rejected": rejected,
        "total": pending + approved + scheduled + rejected,
    }


@router.get("/milestones/deliveries/{delivery_id}")
async def get_delivery_detail(
    delivery_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get full delivery detail including the message content for review."""
    require_staff(current_user)

    delivery = await db.milestone_deliveries.find_one({"id": delivery_id}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    # Get the message (decrypted title for review)
    message = await db.messages.find_one({"id": delivery["message_id"]}, {"_id": 0, "file_data": 0})

    # Get estate info
    estate = await db.estates.find_one({"id": delivery["estate_id"]}, {"_id": 0, "id": 1, "name": 1, "owner_id": 1})

    # Get all messages in the estate for context
    all_messages = await db.messages.find(
        {"estate_id": delivery["estate_id"]},
        {
            "_id": 0,
            "id": 1,
            "title": 1,
            "trigger_type": 1,
            "trigger_value": 1,
            "trigger_age": 1,
            "recipients": 1,
            "is_delivered": 1,
            "message_type": 1,
        },
    ).to_list(100)

    # Get milestone report
    report = await db.milestone_reports.find_one({"id": delivery["milestone_report_id"]}, {"_id": 0})

    return {
        "delivery": delivery,
        "matched_message": message,
        "estate_name": (estate or {}).get("name", ""),
        "all_estate_messages": all_messages,
        "milestone_report": report,
    }


class DeliveryReviewRequest(BaseModel):
    action: str  # "approve", "reject", or "schedule"
    notes: Optional[str] = None
    scheduled_date: Optional[str] = None  # ISO date for scheduled delivery


@router.post("/milestones/deliveries/{delivery_id}/review")
async def review_delivery(
    delivery_id: str,
    data: DeliveryReviewRequest,
    current_user: dict = Depends(get_current_user),
):
    """Approve (send now), schedule (send on date), or reject a pending milestone delivery."""
    require_staff(current_user)

    if data.action not in ("approve", "reject", "schedule"):
        raise HTTPException(status_code=400, detail="Action must be 'approve', 'reject', or 'schedule'")

    delivery = await db.milestone_deliveries.find_one({"id": delivery_id, "status": "pending_review"}, {"_id": 0})
    if not delivery:
        raise HTTPException(status_code=404, detail="Pending delivery not found")

    now = datetime.now(timezone.utc)

    if data.action == "schedule":
        if not data.scheduled_date:
            raise HTTPException(status_code=400, detail="scheduled_date is required for schedule action")

        await db.milestone_deliveries.update_one(
            {"id": delivery_id},
            {
                "$set": {
                    "status": "scheduled",
                    "scheduled_date": data.scheduled_date,
                    "reviewed_by": current_user["id"],
                    "reviewed_by_name": current_user.get("name", ""),
                    "reviewed_at": now.isoformat(),
                    "review_notes": data.notes,
                }
            },
        )

        return {
            "status": "scheduled",
            "scheduled_date": data.scheduled_date,
            "message": f"Message scheduled for delivery on {data.scheduled_date}",
        }

    new_status = "approved" if data.action == "approve" else "rejected"

    await db.milestone_deliveries.update_one(
        {"id": delivery_id},
        {
            "$set": {
                "status": new_status,
                "reviewed_by": current_user["id"],
                "reviewed_by_name": current_user.get("name", ""),
                "reviewed_at": now.isoformat(),
                "review_notes": data.notes,
            }
        },
    )

    if data.action == "approve":
        # Deliver the message immediately
        await db.messages.update_one(
            {"id": delivery["message_id"]},
            {
                "$set": {
                    "is_delivered": True,
                    "delivered_at": now.isoformat(),
                    "delivered_via": "milestone_review",
                    "milestone_report_id": delivery["milestone_report_id"],
                    "delivered_by": current_user["id"],
                }
            },
        )

        # Notify the beneficiary
        asyncio.create_task(
            notify.beneficiary(
                delivery["beneficiary_id"],
                "New Milestone Message Unlocked",
                f"A milestone message '{delivery.get('message_title', 'Message')}' has been delivered to you.",
                url="/beneficiary/messages",
                priority="high",
                metadata={"message_id": delivery["message_id"]},
            )
        )

        return {"status": "approved", "message": "Message delivered to beneficiary"}
    else:
        return {
            "status": "rejected",
            "message": "Delivery rejected — message will not be delivered",
        }


@router.post("/milestones/process-scheduled")
async def process_scheduled_deliveries(current_user: dict = Depends(get_current_user)):
    """Process all scheduled deliveries whose date has arrived. Staff only.
    This can be called daily via cron, or manually from the admin panel."""
    require_staff(current_user)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    scheduled = await db.milestone_deliveries.find(
        {"status": "scheduled", "scheduled_date": {"$lte": today}},
        {"_id": 0},
    ).to_list(500)

    delivered_count = 0
    now = datetime.now(timezone.utc)

    for delivery in scheduled:
        # Deliver the message
        await db.messages.update_one(
            {"id": delivery["message_id"]},
            {
                "$set": {
                    "is_delivered": True,
                    "delivered_at": now.isoformat(),
                    "delivered_via": "scheduled_milestone",
                    "milestone_report_id": delivery["milestone_report_id"],
                    "delivered_by": delivery.get("reviewed_by", "system"),
                }
            },
        )

        # Update delivery status
        await db.milestone_deliveries.update_one(
            {"id": delivery["id"]},
            {"$set": {"status": "approved", "delivered_at": now.isoformat()}},
        )

        # Notify the beneficiary
        asyncio.create_task(
            notify.beneficiary(
                delivery["beneficiary_id"],
                "New Milestone Message Unlocked",
                f"A milestone message '{delivery.get('message_title', 'Message')}' has been delivered to you.",
                url="/beneficiary/messages",
                priority="high",
                metadata={"message_id": delivery["message_id"]},
            )
        )

        delivered_count += 1

    return {
        "processed": delivered_count,
        "message": f"{delivered_count} scheduled delivery(ies) processed.",
    }
