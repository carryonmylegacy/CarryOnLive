"""CarryOn™ — CarryOn Contingency Protocols (CCP)

Family disaster planning tool. Features:
  - Emergency Plans: CRUD for pre-built disaster response plans
  - Plan Activation: One-tap activation triggers alerts to all estate members
  - Member Check-In: Status reporting (Safe, Evacuating, Need Help, etc.)
  - Drill Mode: Practice runs without real emergency alerts
  - Links to SDV documents, FFN contacts, and DAV entries
  - Tap-to-Create Wizard: AI-powered plan generation from 4 simple questions
"""

import asyncio as _asyncio
import json as _json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import db, xai_client, XAI_MODEL, logger
from utils import get_current_user
from services.photo_urls import resolve_photo_url

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
    assigned_beneficiary_ids: Optional[list[str]] = None  # None = all beneficiaries


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
    assigned_beneficiary_ids: Optional[list[str]] = None


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


class WizardRequest(BaseModel):
    estate_id: str
    location: str  # "123 Main St, Houston, TX"
    household: list[str] = []  # ["children", "elderly", "pets", "disabled"]
    concerns: list[str] = []  # ["hurricane", "fire", "earthquake", ...]
    preference: str = "evacuate"  # "evacuate" or "shelter"


# Mapping wizard concern strings to plan_types
_CONCERN_TO_PLAN_TYPE = {
    "hurricane": "natural_disaster",
    "tornado": "natural_disaster",
    "earthquake": "natural_disaster",
    "flood": "natural_disaster",
    "wildfire": "natural_disaster",
    "winter_storm": "natural_disaster",
    "tsunami": "natural_disaster",
    "nuclear": "national_emergency",
    "terrorism": "national_emergency",
    "civil_unrest": "national_emergency",
    "chemical_spill": "national_emergency",
    "pandemic": "medical_emergency",
    "medical": "medical_emergency",
    "power_outage": "infrastructure_failure",
    "water_failure": "infrastructure_failure",
    "cyber_attack": "infrastructure_failure",
    "house_fire": "custom",
    "home_invasion": "custom",
}



async def _is_estate_owner(user_id: str, estate_id: str) -> bool:
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1})
    return estate is not None and estate["owner_id"] == user_id


async def _is_estate_member(user_id: str, estate_id: str) -> bool:
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1, "beneficiaries": 1})
    if not estate:
        return False
    return estate["owner_id"] == user_id or user_id in estate.get("beneficiaries", [])


async def _get_estate_members(estate_id: str) -> list[dict]:
    """Get all members of an estate with their info."""
    estate = await db.estates.find_one(
        {"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1, "beneficiaries": 1, "name": 1}
    )
    if not estate:
        return []
    all_ids = list({estate["owner_id"]} | set(estate.get("beneficiaries", [])))
    users = await db.users.find(
        {"id": {"$in": all_ids}},
        {"_id": 0, "id": 1, "name": 1, "photo_url": 1, "role": 1},
    ).to_list(100)
    ben_records = await db.beneficiaries.find(
        {"estate_id": estate_id, "user_id": {"$in": all_ids}, "deleted_at": None},
        {"_id": 0, "id": 1, "user_id": 1, "relation": 1, "photo_url": 1},
    ).to_list(100)
    relation_map = {b["user_id"]: b.get("relation", "") for b in ben_records}
    ben_photo_map = {b["user_id"]: b.get("photo_url", "") for b in ben_records}
    members = []
    for u in users:
        is_owner = u["id"] == estate["owner_id"]
        photo = u.get("photo_url", "") or ben_photo_map.get(u["id"], "")
        members.append(
            {
                "id": u["id"],
                "name": u.get("name", "Unknown"),
                "photo_url": resolve_photo_url(photo),
                "role_in_estate": "benefactor" if is_owner else "beneficiary",
                "relation": relation_map.get(u["id"], "benefactor" if is_owner else ""),
            }
        )
    return members


@router.get("/ccp/members/{estate_id}")
async def get_estate_members_endpoint(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all members of an estate for beneficiary selector."""
    if not await _is_estate_member(current_user["id"], estate_id):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    return await _get_estate_members(estate_id)



# ===================== WIZARD — AI-POWERED PLAN GENERATION =====================


_WIZARD_SYSTEM_PROMPT = """You are an emergency preparedness expert. Generate a complete family emergency plan based on the user's inputs. Be direct, actionable, and specific. No explanations — just clear actions.

You MUST return valid JSON with exactly these fields:
{
  "plan_name": "Short descriptive name (e.g., Hurricane Evacuation Plan)",
  "rendezvous_points": [
    {"name": "Primary Meeting Point", "address": "Specific suggestion near their location", "notes": "Why this location works"},
    {"name": "Backup Meeting Point", "address": "Further away option", "notes": "Use if primary is compromised"}
  ],
  "communication_plan": "Step-by-step communication protocol. Be specific: 1) Text the family group chat. 2) If no response in 10 min, call each person. 3) If cell towers are down, use this backup method.",
  "resource_locations": [
    {"name": "Go-Bag / Emergency Kit", "location": "Suggested location in their home", "notes": "What to include"},
    {"name": "Important Documents", "location": "Fireproof safe or grab-and-go folder", "notes": "What to grab"}
  ],
  "instructions": "Numbered step-by-step instructions. Be direct and specific. Include timing (e.g., 'Leave 48h before landfall'). Tailor to their household (kids, elderly, pets). Match their preference (evacuate vs shelter).",
  "warnings": ["Potential risk or mistake to watch for", "Another warning specific to their scenario"]
}

Rules:
- Rendezvous points: Suggest real-world locations (parking lots, schools, parks) near their area. Include a primary (close) and backup (farther).
- Communication plan: Include backup methods (landline, radio, neighbor relay).
- Instructions: Number each step. Start with the FIRST action. Include pet/child/elderly-specific steps if applicable.
- Warnings: Flag real risks (flood zones, too-close locations, missing backup plans).
- Keep all text concise. No filler. Actions only.
- If the concern is "nuclear", prioritize sheltering regardless of preference.
- If the concern is "house_fire", always prioritize evacuation."""


@router.post("/ccp/wizard/generate")
async def wizard_generate_plan(data: WizardRequest, current_user: dict = Depends(get_current_user)):
    """AI-powered plan generation from 4 simple wizard questions."""
    if not await _is_estate_owner(current_user["id"], data.estate_id):
        raise HTTPException(status_code=403, detail="Only the benefactor can create plans")
    if not xai_client:
        raise HTTPException(status_code=503, detail="AI service is not available")
    if not data.location.strip():
        raise HTTPException(status_code=400, detail="Location is required")
    if not data.concerns:
        raise HTTPException(status_code=400, detail="At least one concern is required")

    # Build the user prompt
    household_desc = ", ".join(data.household) if data.household else "adults only"
    concerns_desc = ", ".join(c.replace("_", " ") for c in data.concerns)
    pref_desc = "evacuate (leave the area)" if data.preference == "evacuate" else "shelter in place (stay home)"

    user_prompt = f"""Create an emergency plan for this family:

Location: {data.location.strip()}
Household: {household_desc}
Primary concerns: {concerns_desc}
Preference: {pref_desc}

Generate a complete, actionable emergency plan. Return ONLY valid JSON."""

    try:
        response = await _asyncio.to_thread(
            xai_client.chat.completions.create,
            model=XAI_MODEL,
            messages=[
                {"role": "system", "content": _WIZARD_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=2000,
            temperature=0.7,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content.strip()
        plan_data = _json.loads(raw)
    except _json.JSONDecodeError:
        logger.error(f"Wizard AI returned invalid JSON: {raw[:500]}")
        raise HTTPException(status_code=502, detail="AI generated an invalid response. Please try again.")
    except Exception as e:
        logger.error(f"Wizard AI call failed: {e}")
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable. Please try again.")

    # Determine plan_type from the primary concern
    primary_concern = data.concerns[0] if data.concerns else "custom"
    plan_type = _CONCERN_TO_PLAN_TYPE.get(primary_concern, "custom")

    return {
        "plan_name": plan_data.get("plan_name", f"{concerns_desc.title()} Plan"),
        "plan_type": plan_type,
        "rendezvous_points": plan_data.get("rendezvous_points", []),
        "communication_plan": plan_data.get("communication_plan", ""),
        "resource_locations": plan_data.get("resource_locations", []),
        "instructions": plan_data.get("instructions", ""),
        "warnings": plan_data.get("warnings", []),
    }


# ===================== PLANS CRUD =====================


@router.get("/ccp/my-plans")
async def get_my_plans(current_user: dict = Depends(get_current_user)):
    """Get all CCP plans across all estates where this user is an assigned beneficiary."""
    user_id = current_user["id"]
    # Find all estates where user is a beneficiary
    estates = await db.estates.find(
        {"beneficiaries": user_id, "deleted_at": None},
        {"_id": 0, "id": 1, "name": 1, "owner_id": 1},
    ).to_list(50)
    if not estates:
        return []
    estate_map = {e["id"]: e for e in estates}
    estate_ids = list(estate_map.keys())
    # Fetch all plans from these estates
    plans = await db.emergency_plans.find(
        {"estate_id": {"$in": estate_ids}, "deleted_at": None},
        {"_id": 0},
    ).to_list(200)
    # Filter: only include plans where this user is assigned (or all are assigned)
    result = []
    for p in plans:
        assigned = p.get("assigned_beneficiary_ids")
        if assigned is None or user_id in assigned:
            estate = estate_map.get(p["estate_id"], {})
            # Look up benefactor name
            owner_id = estate.get("owner_id")
            owner = await db.users.find_one({"id": owner_id}, {"_id": 0, "id": 1, "name": 1}) if owner_id else None
            p["estate_name"] = estate.get("name", "Unknown Estate")
            p["benefactor_name"] = owner["name"] if owner else "Unknown"
            result.append(p)
    return result


@router.get("/ccp/plans/{estate_id}")
async def get_plans(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all emergency plans for an estate. Beneficiaries only see plans assigned to them."""
    if not await _is_estate_member(current_user["id"], estate_id):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    plans = (
        await db.emergency_plans.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(50)
    )
    # Benefactors (estate owners) see all plans; beneficiaries see only assigned ones
    is_owner = await _is_estate_owner(current_user["id"], estate_id)
    if not is_owner:
        plans = [
            p
            for p in plans
            if p.get("assigned_beneficiary_ids") is None or current_user["id"] in p["assigned_beneficiary_ids"]
        ]
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
        "assigned_beneficiary_ids": data.assigned_beneficiary_ids,
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
        "assigned_beneficiary_ids",
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


@router.get("/ccp/active/{estate_id}/linked-resources")
async def get_linked_resources(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get resolved linked SDV documents, FFN contacts, and DAV entries for the active emergency."""
    if not await _is_estate_member(current_user["id"], estate_id):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    activation = await db.emergency_activations.find_one({"estate_id": estate_id, "status": "active"}, {"_id": 0})
    if not activation:
        return {"documents": [], "ffn_contacts": [], "dav_entries": []}
    snap = activation.get("plan_snapshot", {})
    # Resolve SDV documents
    doc_ids = snap.get("linked_document_ids", [])
    documents = []
    if doc_ids:
        docs = await db.documents.find(
            {"id": {"$in": doc_ids}, "estate_id": estate_id},
            {"_id": 0, "id": 1, "name": 1, "category": 1, "file_type": 1, "file_size": 1},
        ).to_list(50)
        documents = docs
    # Resolve FFN contacts
    ffn_ids = snap.get("linked_ffn_contact_ids", [])
    ffn_contacts = []
    if ffn_ids:
        contacts = await db.ffn_contacts.find(
            {"id": {"$in": ffn_ids}, "estate_id": estate_id, "deleted_at": None},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "relationship": 1, "address": 1},
        ).to_list(50)
        ffn_contacts = contacts
    # Resolve DAV entries
    dav_ids = snap.get("linked_dav_entry_ids", [])
    dav_entries = []
    if dav_ids:
        entries = await db.digital_wallet.find(
            {"id": {"$in": dav_ids}, "estate_id": estate_id},
            {"_id": 0, "id": 1, "account_name": 1, "login_username": 1, "category": 1, "notes": 1},
        ).to_list(50)
        dav_entries = entries
    return {"documents": documents, "ffn_contacts": ffn_contacts, "dav_entries": dav_entries}


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

    estate = await db.estates.find_one({"id": activation["estate_id"]}, {"_id": 0, "id": 1, "owner_id": 1})
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
