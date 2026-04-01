"""CarryOn™ — CarryOn Connected Protocol (CCP)

Family disaster planning tool. Features:
  - Emergency Plans: CRUD for pre-built disaster response plans
  - Plan Activation: One-tap activation triggers alerts to all estate members
  - Member Check-In: Status reporting (Safe, Evacuating, Need Help, etc.)
  - Drill Mode: Practice runs without real emergency alerts
  - Links to SDV documents, FFN contacts, and DAV entries
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import db
from utils import get_current_user

router = APIRouter()

PLAN_TYPES = ["natural_disaster", "national_emergency", "medical_emergency", "infrastructure_failure", "custom"]
CHECKIN_STATUSES = ["safe", "evacuating", "at_rendezvous", "need_help", "sheltering", "other"]


async def _notify_if_allowed(user_id: str, title: str, body: str, url: str):
    """Send push notification only if user has emergency_alerts enabled."""
    from routes.notification_prefs import should_notify
    from utils import send_push_notification

    if await should_notify(user_id, "emergency_alerts"):
        await send_push_notification(user_id, title, body, url, "ccp-alert", "emergency")


class PlanCreate(BaseModel):
    estate_id: str
    name: str
    plan_type: str = "custom"
    rendezvous_points: list[dict] = []  # [{name, address, notes}]
    communication_plan: str = ""
    resource_locations: list[dict] = []  # [{name, location, notes}]
    instructions: str = ""
    linked_document_ids: list[str] = []
    linked_ffn_contact_ids: list[str] = []
    linked_dav_entry_ids: list[str] = []


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    plan_type: Optional[str] = None
    rendezvous_points: Optional[list[dict]] = None
    communication_plan: Optional[str] = None
    resource_locations: Optional[list[dict]] = None
    instructions: Optional[str] = None
    linked_document_ids: Optional[list[str]] = None
    linked_ffn_contact_ids: Optional[list[str]] = None
    linked_dav_entry_ids: Optional[list[str]] = None


class ActivatePlanRequest(BaseModel):
    plan_id: str
    is_drill: bool = False
    notes: Optional[str] = None


class CheckInRequest(BaseModel):
    activation_id: str
    status: str  # safe, evacuating, at_rendezvous, need_help, sheltering, other
    status_note: Optional[str] = None
    location_description: Optional[str] = None
    location_address: Optional[str] = None


class DeactivateRequest(BaseModel):
    notes: Optional[str] = None


async def _is_estate_owner(user_id: str, estate_id: str) -> bool:
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "owner_id": 1})
    return estate is not None and estate["owner_id"] == user_id


async def _is_estate_member(user_id: str, estate_id: str) -> bool:
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "owner_id": 1, "beneficiaries": 1})
    if not estate:
        return False
    return estate["owner_id"] == user_id or user_id in estate.get("beneficiaries", [])


async def _get_estate_members(estate_id: str) -> list[dict]:
    """Get all members of an estate with their info."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "owner_id": 1, "beneficiaries": 1, "name": 1})
    if not estate:
        return []
    all_ids = list({estate["owner_id"]} | set(estate.get("beneficiaries", [])))
    users = await db.users.find(
        {"id": {"$in": all_ids}},
        {"_id": 0, "id": 1, "name": 1, "photo_url": 1, "role": 1},
    ).to_list(100)
    ben_records = await db.beneficiaries.find(
        {"estate_id": estate_id, "user_id": {"$in": all_ids}, "deleted_at": None},
        {"_id": 0, "user_id": 1, "relation": 1},
    ).to_list(100)
    relation_map = {b["user_id"]: b.get("relation", "") for b in ben_records}
    members = []
    for u in users:
        is_owner = u["id"] == estate["owner_id"]
        members.append(
            {
                "id": u["id"],
                "name": u.get("name", "Unknown"),
                "photo_url": u.get("photo_url", ""),
                "role_in_estate": "benefactor" if is_owner else "beneficiary",
                "relation": relation_map.get(u["id"], "benefactor" if is_owner else ""),
            }
        )
    return members


# ===================== PLANS CRUD =====================


@router.get("/ccp/plans/{estate_id}")
async def get_plans(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all emergency plans for an estate."""
    if not await _is_estate_member(current_user["id"], estate_id):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    plans = (
        await db.emergency_plans.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(50)
    )
    return plans


@router.post("/ccp/plans")
async def create_plan(data: PlanCreate, current_user: dict = Depends(get_current_user)):
    """Create a new emergency plan. Benefactor only."""
    if not await _is_estate_owner(current_user["id"], data.estate_id):
        raise HTTPException(status_code=403, detail="Only the benefactor can create plans")
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Plan name is required")
    if data.plan_type not in PLAN_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid plan type. Must be one of: {PLAN_TYPES}")
    now = datetime.now(timezone.utc).isoformat()
    plan = {
        "id": str(uuid4()),
        "estate_id": data.estate_id,
        "name": data.name.strip(),
        "plan_type": data.plan_type,
        "rendezvous_points": data.rendezvous_points,
        "communication_plan": data.communication_plan.strip(),
        "resource_locations": data.resource_locations,
        "instructions": data.instructions.strip(),
        "linked_document_ids": data.linked_document_ids,
        "linked_ffn_contact_ids": data.linked_ffn_contact_ids,
        "linked_dav_entry_ids": data.linked_dav_entry_ids,
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
    }
    await db.emergency_plans.insert_one({k: v for k, v in plan.items()})
    return plan


@router.put("/ccp/plans/{plan_id}")
async def update_plan(plan_id: str, data: PlanUpdate, current_user: dict = Depends(get_current_user)):
    """Update an emergency plan. Benefactor only."""
    plan = await db.emergency_plans.find_one({"id": plan_id, "deleted_at": None}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not await _is_estate_owner(current_user["id"], plan["estate_id"]):
        raise HTTPException(status_code=403, detail="Only the benefactor can update plans")
    updates = {}
    for field in [
        "name",
        "plan_type",
        "rendezvous_points",
        "communication_plan",
        "resource_locations",
        "instructions",
        "linked_document_ids",
        "linked_ffn_contact_ids",
        "linked_dav_entry_ids",
    ]:
        val = getattr(data, field)
        if val is not None:
            updates[field] = val.strip() if isinstance(val, str) else val
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.emergency_plans.update_one({"id": plan_id}, {"$set": updates})
    updated = await db.emergency_plans.find_one({"id": plan_id}, {"_id": 0})
    return updated


@router.delete("/ccp/plans/{plan_id}")
async def delete_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete an emergency plan. Benefactor only."""
    plan = await db.emergency_plans.find_one({"id": plan_id, "deleted_at": None}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not await _is_estate_owner(current_user["id"], plan["estate_id"]):
        raise HTTPException(status_code=403, detail="Only the benefactor can delete plans")
    await db.emergency_plans.update_one(
        {"id": plan_id}, {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True}


# ===================== ACTIVATION / DEACTIVATION =====================


@router.post("/ccp/activate")
async def activate_plan(data: ActivatePlanRequest, current_user: dict = Depends(get_current_user)):
    """Activate an emergency plan (or start a drill). Benefactor only."""
    plan = await db.emergency_plans.find_one({"id": data.plan_id, "deleted_at": None}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not await _is_estate_owner(current_user["id"], plan["estate_id"]):
        raise HTTPException(status_code=403, detail="Only the benefactor can activate plans")
    # Check for existing active activation on this estate
    existing = await db.emergency_activations.find_one({"estate_id": plan["estate_id"], "status": "active"}, {"_id": 0})
    if existing:
        raise HTTPException(
            status_code=409, detail="An emergency is already active for this estate. Deactivate it first."
        )
    now = datetime.now(timezone.utc).isoformat()
    activation = {
        "id": str(uuid4()),
        "estate_id": plan["estate_id"],
        "plan_id": data.plan_id,
        "plan_name": plan["name"],
        "plan_type": plan["plan_type"],
        "is_drill": data.is_drill,
        "status": "active",
        "activated_by": current_user["id"],
        "activated_by_name": current_user.get("name", "Unknown"),
        "activated_at": now,
        "deactivated_at": None,
        "deactivation_notes": None,
        "notes": data.notes or "",
        "plan_snapshot": {
            "rendezvous_points": plan.get("rendezvous_points", []),
            "communication_plan": plan.get("communication_plan", ""),
            "resource_locations": plan.get("resource_locations", []),
            "instructions": plan.get("instructions", ""),
            "linked_document_ids": plan.get("linked_document_ids", []),
            "linked_ffn_contact_ids": plan.get("linked_ffn_contact_ids", []),
            "linked_dav_entry_ids": plan.get("linked_dav_entry_ids", []),
        },
    }
    await db.emergency_activations.insert_one({k: v for k, v in activation.items()})
    # Send push notifications to all estate members
    import asyncio

    members = await _get_estate_members(plan["estate_id"])
    prefix = "[DRILL] " if data.is_drill else ""
    title = f"{prefix}Emergency Protocol Activated"
    body = f"{current_user.get('name', 'Benefactor')} activated: {plan['name']}"
    nav_url = "/connected-protocol"
    for m in members:
        if m["id"] != current_user["id"]:
            asyncio.create_task(_notify_if_allowed(m["id"], title, body, nav_url))
    return activation


@router.post("/ccp/deactivate/{activation_id}")
async def deactivate(
    activation_id: str,
    data: DeactivateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Deactivate an active emergency. Benefactor only."""
    activation = await db.emergency_activations.find_one({"id": activation_id, "status": "active"}, {"_id": 0})
    if not activation:
        raise HTTPException(status_code=404, detail="Active emergency not found")
    if not await _is_estate_owner(current_user["id"], activation["estate_id"]):
        raise HTTPException(status_code=403, detail="Only the benefactor can deactivate")
    now = datetime.now(timezone.utc).isoformat()
    await db.emergency_activations.update_one(
        {"id": activation_id},
        {"$set": {"status": "resolved", "deactivated_at": now, "deactivation_notes": data.notes or ""}},
    )
    # Build summary report
    checkins = (
        await db.member_checkins.find({"activation_id": activation_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    )
    members = await _get_estate_members(activation["estate_id"])
    member_map = {m["id"]: m["name"] for m in members}
    summary = {
        "activation_id": activation_id,
        "plan_name": activation.get("plan_name", ""),
        "is_drill": activation.get("is_drill", False),
        "activated_at": activation.get("activated_at", ""),
        "deactivated_at": now,
        "total_members": len(members),
        "members_checked_in": len({c["user_id"] for c in checkins}),
        "checkins": [
            {
                "user_name": member_map.get(c["user_id"], "Unknown"),
                "status": c["status"],
                "status_note": c.get("status_note", ""),
                "location_description": c.get("location_description", ""),
                "created_at": c["created_at"],
            }
            for c in checkins
        ],
    }
    # Notify all members that emergency has been deactivated
    import asyncio

    prefix = "[DRILL] " if activation.get("is_drill") else ""
    title = f"{prefix}Emergency Protocol Deactivated"
    body = f"{activation.get('plan_name', 'Emergency')} has been stood down"
    for m in members:
        if m["id"] != current_user["id"]:
            asyncio.create_task(_notify_if_allowed(m["id"], title, body, "/connected-protocol"))
    return {"success": True, "summary": summary}


@router.get("/ccp/active/{estate_id}")
async def get_active_emergency(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Check if there's an active emergency for an estate."""
    if not await _is_estate_member(current_user["id"], estate_id):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    activation = await db.emergency_activations.find_one({"estate_id": estate_id, "status": "active"}, {"_id": 0})
    if not activation:
        return {"active": False}
    # Get all check-ins for this activation
    checkins = (
        await db.member_checkins.find({"activation_id": activation["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    # Get latest check-in per member
    latest_by_member = {}
    for c in checkins:
        if c["user_id"] not in latest_by_member:
            latest_by_member[c["user_id"]] = c
    members = await _get_estate_members(estate_id)
    status_board = []
    for m in members:
        ci = latest_by_member.get(m["id"])
        status_board.append(
            {
                "user_id": m["id"],
                "name": m["name"],
                "photo_url": m.get("photo_url", ""),
                "relation": m.get("relation", ""),
                "role_in_estate": m.get("role_in_estate", ""),
                "status": ci["status"] if ci else "not_checked_in",
                "status_note": ci.get("status_note", "") if ci else "",
                "location_description": ci.get("location_description", "") if ci else "",
                "location_address": ci.get("location_address", "") if ci else "",
                "checked_in_at": ci["created_at"] if ci else None,
            }
        )
    return {
        "active": True,
        "activation": activation,
        "status_board": status_board,
    }


@router.get("/ccp/history/{estate_id}")
async def get_activation_history(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get past activations for an estate."""
    if not await _is_estate_member(current_user["id"], estate_id):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    activations = (
        await db.emergency_activations.find(
            {"estate_id": estate_id, "status": {"$ne": "active"}},
            {"_id": 0},
        )
        .sort("activated_at", -1)
        .to_list(50)
    )
    return activations


# ===================== MEMBER CHECK-IN =====================


@router.post("/ccp/checkin")
async def check_in(data: CheckInRequest, current_user: dict = Depends(get_current_user)):
    """Member checks in with their status during an active emergency."""
    if data.status not in CHECKIN_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {CHECKIN_STATUSES}")
    activation = await db.emergency_activations.find_one({"id": data.activation_id, "status": "active"}, {"_id": 0})
    if not activation:
        raise HTTPException(status_code=404, detail="No active emergency found")
    if not await _is_estate_member(current_user["id"], activation["estate_id"]):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    now = datetime.now(timezone.utc).isoformat()
    checkin = {
        "id": str(uuid4()),
        "activation_id": data.activation_id,
        "estate_id": activation["estate_id"],
        "user_id": current_user["id"],
        "user_name": current_user.get("name", "Unknown"),
        "status": data.status,
        "status_note": (data.status_note or "").strip(),
        "location_description": (data.location_description or "").strip(),
        "location_address": (data.location_address or "").strip(),
        "created_at": now,
    }
    await db.member_checkins.insert_one({k: v for k, v in checkin.items()})
    # Notify the benefactor when a member checks in
    import asyncio

    estate = await db.estates.find_one(
        {"id": activation["estate_id"]}, {"_id": 0, "owner_id": 1}
    )
    if estate and estate["owner_id"] != current_user["id"]:
        status_label = data.status.replace("_", " ").upper()
        asyncio.create_task(
            _notify_if_allowed(
                estate["owner_id"],
                "Member Check-In",
                f"{current_user.get('name', 'Member')} checked in: {status_label}",
                "/connected-protocol",
            )
        )
    return checkin
