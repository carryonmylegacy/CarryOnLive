"""CarryOn™ — Milestone Delivery Review Workflow

Workers review automated milestone message matches before delivery.
Flow: Beneficiary reports milestone → System finds matches → Worker reviews → Approves/Rejects/Schedules → Delivers
"""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional

from config import db
from guards import check_staff_role as require_staff
from services.access_control import build_message_delivery_update, resolve_beneficiary_delivery_ids
from services.audit import get_client_ip, log_audit_event
from services.notifications import notify
from utils import get_current_user

router = APIRouter()


async def _broadcast_recipient_ids(message: dict) -> set[str] | None:
    """For a broadcast ('all') message, return the authoritative set of current
    beneficiary record ids so delivery is only marked complete once every
    beneficiary has been delivered (audit 512bd5c F-18-07). None for non-broadcast."""
    if "all" not in (message.get("recipients") or []):
        return None
    recs = await db.beneficiaries.find(
        {"estate_id": message.get("estate_id"), "deleted_at": None},
        {"_id": 0, "id": 1},
    ).to_list(500)
    return {r["id"] for r in recs if r.get("id")}


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
    request: Request,
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
    ip = get_client_ip(request)

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

        # Audit log
        await log_audit_event(
            actor_id=current_user["id"],
            actor_email=current_user.get("email", ""),
            actor_role=current_user.get("role", ""),
            action="milestone_delivery_scheduled",
            category="milestone",
            resource_type="milestone_delivery",
            resource_id=delivery_id,
            details={
                "message_id": delivery["message_id"],
                "message_title": delivery.get("message_title", ""),
                "beneficiary_id": delivery["beneficiary_id"],
                "beneficiary_name": delivery.get("beneficiary_name", ""),
                "event_type": delivery.get("event_type", ""),
                "scheduled_date": data.scheduled_date,
            },
            ip_address=ip,
            severity="info",
        )

        # Notify all staff
        asyncio.create_task(
            notify.p4_alert(
                "Milestone Delivery Scheduled",
                f"{current_user.get('name', 'Staff')} scheduled milestone message "
                f"'{delivery.get('message_title', 'Message')}' for {delivery.get('beneficiary_name', 'beneficiary')} "
                f"— delivery on {data.scheduled_date}.",
                url="/ops/milestones",
                metadata={"delivery_id": delivery_id, "scheduled_date": data.scheduled_date},
            )
        )

        return {
            "status": "scheduled",
            "scheduled_date": data.scheduled_date,
            "message": f"Message scheduled for delivery on {data.scheduled_date}",
        }

    new_status = "approved" if data.action == "approve" else "rejected"

    # Guard against "approving" a no-match placeholder (no message_id to deliver)
    if data.action == "approve" and not delivery.get("message_id"):
        raise HTTPException(
            status_code=400,
            detail="This milestone has no matching message. Either reject it or send a follow-up message to the beneficiary manually before approving.",
        )

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
        message = await db.messages.find_one({"id": delivery["message_id"]}, {"_id": 0})
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
        delivery_ids = await resolve_beneficiary_delivery_ids(delivery["estate_id"], delivery.get("beneficiary_id"))

        # Deliver the message to this beneficiary only. Multi-recipient
        # milestone messages become globally delivered only after every
        # intended recipient has their own approved delivery.
        await db.messages.update_one(
            {"id": delivery["message_id"]},
            build_message_delivery_update(
                message,
                delivery_ids,
                delivered_at=now.isoformat(),
                delivered_via="milestone_review",
                milestone_report_id=delivery["milestone_report_id"],
                delivered_by=current_user["id"],
                all_recipient_ids=await _broadcast_recipient_ids(message),
            ),
        )

        # Audit log — delivery confirmed
        await log_audit_event(
            actor_id=current_user["id"],
            actor_email=current_user.get("email", ""),
            actor_role=current_user.get("role", ""),
            action="milestone_message_delivered",
            category="milestone",
            resource_type="milestone_delivery",
            resource_id=delivery_id,
            details={
                "message_id": delivery["message_id"],
                "message_title": delivery.get("message_title", ""),
                "beneficiary_id": delivery["beneficiary_id"],
                "beneficiary_name": delivery.get("beneficiary_name", ""),
                "event_type": delivery.get("event_type", ""),
                "delivery_method": "immediate",
            },
            ip_address=ip,
            severity="info",
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

        # Notify all staff — confirmation of delivery
        asyncio.create_task(
            notify.p3_alert(
                "Milestone Message Delivered",
                f"{current_user.get('name', 'Staff')} approved and delivered milestone message "
                f"'{delivery.get('message_title', 'Message')}' to {delivery.get('beneficiary_name', 'beneficiary')}.",
                url="/ops/milestones",
                metadata={"delivery_id": delivery_id, "message_id": delivery["message_id"]},
            )
        )

        return {"status": "approved", "message": "Message delivered to beneficiary"}
    else:
        # Audit log — rejection
        await log_audit_event(
            actor_id=current_user["id"],
            actor_email=current_user.get("email", ""),
            actor_role=current_user.get("role", ""),
            action="milestone_delivery_rejected",
            category="milestone",
            resource_type="milestone_delivery",
            resource_id=delivery_id,
            details={
                "message_id": delivery["message_id"],
                "message_title": delivery.get("message_title", ""),
                "beneficiary_id": delivery["beneficiary_id"],
                "beneficiary_name": delivery.get("beneficiary_name", ""),
                "event_type": delivery.get("event_type", ""),
                "rejection_notes": data.notes,
            },
            ip_address=ip,
            severity="info",
        )

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
        message = await db.messages.find_one({"id": delivery["message_id"]}, {"_id": 0})
        if not message:
            continue
        delivery_ids = await resolve_beneficiary_delivery_ids(delivery["estate_id"], delivery.get("beneficiary_id"))

        # Deliver the message to this beneficiary only.
        await db.messages.update_one(
            {"id": delivery["message_id"]},
            build_message_delivery_update(
                message,
                delivery_ids,
                delivered_at=now.isoformat(),
                delivered_via="scheduled_milestone",
                milestone_report_id=delivery["milestone_report_id"],
                delivered_by=delivery.get("reviewed_by", "system"),
                all_recipient_ids=await _broadcast_recipient_ids(message),
            ),
        )

        # Update delivery status
        await db.milestone_deliveries.update_one(
            {"id": delivery["id"]},
            {"$set": {"status": "approved", "delivered_at": now.isoformat()}},
        )

        # Audit log — scheduled delivery executed
        await log_audit_event(
            actor_id="system",
            actor_email="system@carryon.us",
            actor_role="system",
            action="milestone_message_delivered",
            category="milestone",
            resource_type="milestone_delivery",
            resource_id=delivery["id"],
            details={
                "message_id": delivery["message_id"],
                "message_title": delivery.get("message_title", ""),
                "beneficiary_id": delivery["beneficiary_id"],
                "beneficiary_name": delivery.get("beneficiary_name", ""),
                "event_type": delivery.get("event_type", ""),
                "delivery_method": "scheduled",
                "scheduled_date": delivery.get("scheduled_date", ""),
                "originally_approved_by": delivery.get("reviewed_by", ""),
            },
            ip_address="",
            severity="info",
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

        # Notify staff — scheduled delivery completed
        asyncio.create_task(
            notify.p4_alert(
                "Scheduled Milestone Delivered",
                f"Scheduled milestone message '{delivery.get('message_title', 'Message')}' "
                f"has been automatically delivered to {delivery.get('beneficiary_name', 'beneficiary')}.",
                url="/ops/milestones",
                metadata={"delivery_id": delivery["id"], "message_id": delivery["message_id"]},
            )
        )

        delivered_count += 1

    return {
        "processed": delivered_count,
        "message": f"{delivered_count} scheduled delivery(ies) processed.",
    }
