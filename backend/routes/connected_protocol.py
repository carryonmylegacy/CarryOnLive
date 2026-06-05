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

from config import db, xai_client, XAI_MODEL, XAI_MODEL_LIGHT, logger
from services.ai_burn_guard import require_ai_burn_budget
from services.ai_safety import hardened_system_prompt
from services.estate_auth import is_estate_member as _is_estate_member, is_estate_owner as _is_estate_owner
from services.access_control import can_access_document, resolve_estate_actor
from utils import get_current_user
from services.photo_urls import resolve_photo_url


async def _redact_plan_links_for_actor(plans: list, actor: dict) -> list:
    """For a non-owner beneficiary, strip linked SDV documents / DAV credentials
    from CCP plans down to only the ones that beneficiary can actually access
    (can_access_document + DAV assignment/visibility). Plans themselves are
    already assignment-filtered; this prevents the plan from leaking references
    to documents/credentials the beneficiary isn't entitled to (audit P1.1)."""
    if not plans:
        return plans
    doc_ids: set[str] = set()
    dav_ids: set[str] = set()
    for p in plans:
        doc_ids.update(p.get("linked_document_ids") or [])
        dav_ids.update(p.get("linked_dav_entry_ids") or [])

    accessible_docs: set[str] = set()
    if doc_ids:
        docs = await db.documents.find({"id": {"$in": list(doc_ids)}, "deleted_at": None}, {"_id": 0}).to_list(2000)
        accessible_docs = {d["id"] for d in docs if can_access_document(d, actor)}

    accessible_dav: set[str] = set()
    if dav_ids:
        is_transitioned = bool(actor.get("is_transitioned"))
        release_ids = actor.get("release_ids") or set()
        entries = await db.digital_wallet.find({"id": {"$in": list(dav_ids)}, "deleted_at": None}, {"_id": 0}).to_list(
            2000
        )
        for e in entries:
            assigned = e.get("assigned_beneficiary_id")
            if not (assigned and assigned in release_ids):
                continue
            vis = e.get("beneficiary_visibility") or "private"
            if vis == "show_now" or (vis == "posthumous_only" and is_transitioned):
                accessible_dav.add(e["id"])

    for p in plans:
        if p.get("linked_document_ids"):
            p["linked_document_ids"] = [i for i in p["linked_document_ids"] if i in accessible_docs]
        if p.get("linked_dav_entry_ids"):
            p["linked_dav_entry_ids"] = [i for i in p["linked_dav_entry_ids"] if i in accessible_dav]
    return plans


def _active_plan_assigned_to_actor(snapshot: dict, actor: dict) -> bool:
    """True if the active plan is assigned to this actor (or to 'all' members).
    Owners/admins/operators always pass; a beneficiary only passes when the
    plan's assigned_beneficiary_ids is None (= all) or intersects release_ids."""
    if actor.get("is_owner") or actor.get("is_admin") or actor.get("is_operator"):
        return True
    assigned = (snapshot or {}).get("assigned_beneficiary_ids")
    if assigned is None:  # None = all estate members
        return True
    return bool(set(assigned) & (actor.get("release_ids") or set()))


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
    drill_schedule: Optional[dict] = None  # {frequency, recommended_months, next_drill_date, enabled}
    # AI-generated state self-defense law summary (FIGHT-stage disasters
    # only — home_invasion / active_shooter / terrorism / civil_unrest).
    # Always carries a "not legal advice" disclaimer.
    self_defense_law_note: Optional[str] = None


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
    drill_schedule: Optional[dict] = None
    self_defense_law_note: Optional[str] = None


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


class DebriefRequest(BaseModel):
    rating: int  # 1-5 stars
    went_well: str = ""
    to_improve: str = ""


class WizardRequest(BaseModel):
    estate_id: str
    location: str  # "123 Main St, Houston, TX"
    household: list[str] = []  # ["children", "elderly", "pets", "disabled"]
    concern: str = ""  # single concern like "hurricane"
    follow_up_answers: dict = {}  # disaster-specific answers from frontend templates
    # Legacy fields (kept for backward compat)
    concerns: list[str] = []
    preference: str = "evacuate"


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

# Drill schedule recommendations per concern type
_DRILL_SCHEDULES = {
    "hurricane": {"frequency": "biannual", "months": [5, 11], "label": "Before & after hurricane season (May, Nov)"},
    "tornado": {"frequency": "biannual", "months": [3, 9], "label": "Spring & fall (Mar, Sep)"},
    "earthquake": {"frequency": "biannual", "months": [4, 10], "label": "Twice yearly (Apr, Oct)"},
    "flood": {"frequency": "biannual", "months": [3, 9], "label": "Before rainy seasons (Mar, Sep)"},
    "wildfire": {"frequency": "biannual", "months": [5, 11], "label": "Before & after fire season (May, Nov)"},
    "house_fire": {"frequency": "quarterly", "months": [1, 4, 7, 10], "label": "Every 3 months"},
    "nuclear": {"frequency": "annual", "months": [1], "label": "Once a year (Jan)"},
    "winter_storm": {"frequency": "annual", "months": [9], "label": "Before winter (Sep)"},
    "power_outage": {"frequency": "annual", "months": [6], "label": "Once a year (Jun)"},
    "terrorism": {"frequency": "annual", "months": [9], "label": "Once a year (Sep)"},
    "pandemic": {"frequency": "annual", "months": [1], "label": "Once a year (Jan)"},
    "civil_unrest": {"frequency": "annual", "months": [6], "label": "Once a year (Jun)"},
    "water_failure": {"frequency": "annual", "months": [6], "label": "Once a year (Jun)"},
    "chemical_spill": {"frequency": "annual", "months": [3], "label": "Once a year (Mar)"},
    "home_invasion": {"frequency": "quarterly", "months": [1, 4, 7, 10], "label": "Every 3 months"},
    "tsunami": {"frequency": "biannual", "months": [3, 9], "label": "Twice yearly (Mar, Sep)"},
    "cyber_attack": {"frequency": "annual", "months": [1], "label": "Once a year (Jan)"},
}

_MONTH_NAMES = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


def _compute_next_drill_date(months: list[int]) -> str:
    """Return the next upcoming drill date as ISO string (1st of the next applicable month)."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    current_month = now.month
    current_year = now.year

    for m in sorted(months):
        if m > current_month:
            return datetime(current_year, m, 1, tzinfo=timezone.utc).isoformat()
    # Wrap to next year
    return datetime(current_year + 1, sorted(months)[0], 1, tzinfo=timezone.utc).isoformat()


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


_WIZARD_SYSTEM_PROMPT = hardened_system_prompt("""You are an emergency preparedness expert creating a family contingency plan for the CarryOn platform. Generate a complete, actionable plan. Be direct and specific. No filler.

You MUST return valid JSON with exactly these fields:
{
  "plan_name": "Short descriptive name (e.g., Hurricane Evacuation Plan)",
  "rendezvous_points": [
    {"name": "Primary Meeting Point", "address": "Specific address or location", "notes": "Why this location"},
    {"name": "Backup Meeting Point", "address": "Alternative option", "notes": "When to use this instead"}
  ],
  "communication_plan": "Step-by-step communication protocol.",
  "resource_locations": [
    {"name": "Emergency Kit / Go-Bag", "location": "Where it's stored", "notes": "What to include"},
    {"name": "Critical Documents", "location": "Accessible via CarryOn Secure Document Vault (SDV)", "notes": "Already uploaded and available from any device"}
  ],
  "instructions": "Numbered step-by-step instructions tailored to this specific disaster type.",
  "warnings": ["Specific risk or mistake to watch for"],
  "self_defense_law_note": "ONLY include this field for FIGHT-stage disasters (home_invasion, active_shooter, terrorism, civil_unrest) AND only when the user's location contains a US state. 2–4 sentences summarizing that state's self-defense framework (Stand Your Ground vs Duty to Retreat, Castle Doctrine scope, use-of-force standard) — strictly factual, no advocacy. ALWAYS end with: 'This is general information, NOT legal advice. Self-defense laws vary by state and change over time. Consult a licensed attorney in your jurisdiction before relying on this in any plan.' Omit the field entirely for non-FIGHT disasters or unknown locations."
}

CRITICAL RULES:
- COMMUNICATION: Always recommend Estate Comms (ECT) as the PRIMARY communication method. ECT is a closed, private messaging system built into CarryOn — any family member can log in from ANY internet-connected device (phone, tablet, computer, library, hotel lobby) without needing their own phone. This makes ECT more reliable than phone calls or text messages during disasters when cell towers may be down or phones lost. Include backup methods (landline, radio) only as secondary options.
- DOCUMENTS: The family's critical documents (IDs, insurance, medical records, wills) are already stored in the CarryOn Secure Document Vault (SDV). Reference the SDV — do NOT suggest a fireproof safe or grab-and-go folder. Say something like: "Your critical documents are already secured in your SDV and can be accessed from any device with internet."
- RENDEZVOUS: Tailor meeting points to the disaster type. For hurricanes/floods/tsunamis, use the user's specified evacuation destinations — do NOT suggest local meetup points inside the danger zone. For earthquakes, use local open areas. For house fires, use the specified meetup spot outside.
- INSTRUCTIONS: Number each step. Include timing. Tailor to household (kids, elderly, pets). Be disaster-specific.
- WARNINGS: Flag real risks specific to this disaster and location.
- HONOR USER INPUTS: Every disaster-specific detail the family supplied MUST appear by name in the relevant part of the plan. Do NOT drop a user-provided codeword, safe room, escape destination, evacuation address, or defensive item. If you cannot place an input cleanly into one of the structured fields, weave it into `instructions` so the user sees their answer reflected back. Silent omission is unacceptable.
- THREAT-RESPONSE DISASTERS (home_invasion, active_shooter, terrorism, civil_unrest): The very first lines of `instructions` MUST be a Run / Hide / Fight framework block, in this exact format:
    "RUN — HIDE — FIGHT (in that order):
     RUN: When and how to escape this specific scenario.
     HIDE: Where to go and how to secure it (cite the user's safe room / lockdown spot by name).
     FIGHT: A LAST resort only — only if Run and Hide are impossible. Cite specific defensive items the user listed with their stored locations and what each is realistic for. Make clear that confronting an armed intruder is high-risk and the goal is creating an opening to Run."
   Then number the rest of the steps starting at 1.
- DEFENSIVE RESOURCES: If the family provided `defensive_resources` (firearms, bats, pepper spray, etc.), add ONE entry to `resource_locations` titled "Self-Defense Items" with `location` summarizing each item and where it's stored, and `notes` reading "Use ONLY in the Fight stage as last resort." Never recommend retrieving a firearm during the Run or Hide stages.
- Keep all text concise. Actions only.""")


# Disaster-specific prompt context for richer AI generation
_DISASTER_PROMPT_CONTEXT = {
    "hurricane": "This is a HURRICANE plan. The family must evacuate WELL BEFORE landfall (48+ hours ideally). Local rendezvous points are useless — use the evacuation destinations the user provided. Include steps for boarding up, vehicle fueling, and route planning. Mention monitoring the storm path and adjusting the evacuation direction if it shifts. The user may have provided primary, secondary, and tertiary destinations for different storm paths.",
    "flood": "This is a FLOOD plan. The family must evacuate to HIGH GROUND outside the flood zone. Roads can become impassable within hours. Use the evacuation destinations the user provided. Include steps for moving valuables to upper floors if time permits, turning off utilities, and avoiding flooded roads.",
    "tsunami": "This is a TSUNAMI plan. Time is critical — minutes matter. Move INLAND and to HIGH GROUND immediately. Use the high-ground points the user identified. No time to gather supplies. Include natural warning signs (earthquake, water receding). Post-wave return protocol.",
    "wildfire": "This is a WILDFIRE plan. Evacuate EARLY — don't wait for mandatory orders. Move upwind and away from the fire zone. Use the evacuation destinations the user provided. Include ember-proofing home steps, vehicle packing, and air quality considerations.",
    "earthquake": "This is an EARTHQUAKE plan. During the quake: Drop, Cover, Hold On. After: meet at the open-area meetup point the user specified (away from buildings and power lines). Include aftershock protocols, gas leak checks, and structural damage assessment before re-entering.",
    "tornado": "This is a TORNADO plan. When warning sounds: go immediately to the safe room the user specified (lowest interior room). After the tornado passes: meet at the outdoor meetup point. Include steps for monitoring weather radio, covering windows, and what to do if caught outside.",
    "house_fire": "This is a HOUSE FIRE plan. Everyone exits IMMEDIATELY — no stopping for belongings. Meet at the designated spot the user specified. Include: 2 exit routes per room, low-crawling under smoke, feel doors before opening, meeting point accountability (count heads), and when to call 911. Never re-enter a burning building.",
    "home_invasion": "This is a HOME INVASION plan. Use the RUN — HIDE — FIGHT framework explicitly. RUN: If the intruder isn't between you and an exit, leave immediately and go to the user's escape destination. HIDE: If escape is unsafe, get to the safe room the user named, lock the door, kill the lights, silence phones, text 911. FIGHT (last resort only — only if a violent confrontation is unavoidable): use the defensive items the user listed by name and stored location; goal is to create an opening to RUN, not to engage. If the family provided a silent codeword, mention it explicitly in the communication steps. Children must know to hide and stay quiet — never confront. If the user provided defensive_resources, surface them as a dedicated 'Self-Defense Items' entry in `resource_locations` with the explicit caveat 'Use ONLY in the Fight stage as last resort.'",
    "nuclear": "This is a NUCLEAR EVENT plan. Shelter in the most fortified structure with thick walls. Use the shelter the user identified. Seal all windows, doors, and vents. Stay inside for at least 24 hours. Include potassium iodide information, decontamination if exposed, and radio monitoring for government instructions.",
    "winter_storm": "This is a WINTER STORM plan. Shelter in place with backup heat. Use the heating source the user identified. Include: pipe freezing prevention, carbon monoxide warnings for generators/heaters, food/water for 3+ days, and when to evacuate to the backup shelter if home becomes uninhabitable.",
    "power_outage": "This is a POWER OUTAGE plan. Focus on food preservation, backup power for medical devices, and communication. If the user has medical devices needing power, prioritize those. Include generator safety (never indoors), candle alternatives (battery lanterns), and food safety (fridge stays cold ~4 hours, freezer ~48 hours if full).",
    "water_failure": "This is a WATER FAILURE plan. Focus on water rationing, alternative sources, and sanitation. Include: 1 gallon per person per day minimum, water purification methods, and hygiene without running water. Reference the user's stated reserves and alternative sources.",
    "pandemic": "This is a PANDEMIC plan. Focus on isolation readiness, supply runs, and medical access. Include: contactless delivery, masking/PPE, quarantine room setup, monitoring symptoms, and when to seek medical care. Reference the user's supply duration and nearest medical facility.",
    "cyber_attack": "This is a CYBER ATTACK plan. Focus on offline operations — banking, communication, and information access. Include: emergency cash usage, offline communication methods, paper records of critical information, and monitoring official channels for restoration updates.",
    "terrorism": "This is a TERRORISM response plan. Depends on proximity: evacuate if nearby, shelter if distant. Use the meetup point the user specified. Include: Run/Hide/Fight protocol, avoiding crowds and landmarks, and reunification procedures from workplaces/schools.",
    "civil_unrest": "This is a CIVIL UNREST plan. Monitor the situation — evacuate early if protests/unrest move toward your area. Use the evacuation destination and alternative routes the user provided. Include: avoiding gathering areas, travel in daylight, and communication protocols.",
    "chemical_spill": "This is a CHEMICAL SPILL plan. Move UPWIND immediately, or seal a room if evacuation isn't possible. Use the user's upwind destination. Include: sealing windows/doors with tape and plastic, monitoring wind direction, decontamination procedures, and monitoring official channels for all-clear.",
    "active_shooter": "This is an ACTIVE SHOOTER plan covering the home, workplaces, schools, and public venues for this family. Use the RUN — HIDE — FIGHT framework explicitly in the opening of `instructions`. Priority is reunification — every family member needs to know to go to the user's specified rendezvous AFTER police clear them, never during the event. Include: silent room-securing (lock, lights off, away from doors), texting (not calling) 911 to stay quiet, and the family code word to confirm safe-status messages are real. If the family provided defensive_resources for the home, surface them as a 'Self-Defense Items' entry in `resource_locations` with the caveat that they're only relevant if the event occurs at home and Run/Hide have been exhausted. For kids, reinforce listening to teachers' lockdown drills.",
    "heat_wave": "This is an EXTREME HEAT plan. Focus on hydration, cooling, and recognizing heat exhaustion vs heat stroke (life-threatening). Identify the coolest indoor space (lowest floor, north-facing rooms, libraries/malls as public cooling centers). Include: never-leave-anyone-in-a-vehicle rule, check on elderly/infants every 2 hours, signs of heat stroke (confusion, hot dry skin, no sweating — call 911 immediately), and pet safety (asphalt burns, water bowls).",
    "drought": "This is a DROUGHT response plan. Focus on water conservation, fire risk increase, and food/agriculture impact. Include: graywater capture for plants, low-water hygiene routines, increased wildfire-risk awareness, well-pump backup if on a private well, and monitoring municipal water restrictions. Stockpile recommendation: minimum 14 days of stored water per person.",
    "hailstorm": "This is a HAIL STORM plan. Hail can shatter windshields, dent roofs, and injure people outdoors. When warning is issued: pull vehicles into a garage or carport immediately; bring people, pets, and outdoor furniture inside. During the storm: stay away from windows, move to an interior room. After: document damage with photos for insurance BEFORE cleanup, and inspect the roof from the ground for missing shingles.",
    "lightning_storm": "This is a LIGHTNING STORM plan. The 30/30 rule: if thunder follows lightning within 30 seconds, go indoors and stay inside for 30 minutes after the last clap. Avoid plumbing, corded electronics, and standing near windows. If caught outside, avoid tall isolated objects (trees, flagpoles) and lie low if hair stands up. Unplug sensitive electronics ahead of the storm. Children's outdoor activities (soccer, pools) must clear immediately.",
    "volcanic": "This is a VOLCANIC ACTIVITY plan. Ash is the primary hazard for most households (can collapse roofs, ruin engines, damage lungs). Have N95+ respirators for everyone, including pets if possible. Seal windows, doors, and vents with damp towels. Cars: do NOT drive in ash — it destroys engines. If evacuation is ordered, take the user's specified destinations and routes — ash falls downwind, so route AWAY from the prevailing wind direction.",
    "landslide": "This is a LANDSLIDE / MUDSLIDE plan. Common after wildfires (no roots holding soil) and heavy rains in hillside areas. Warning signs: new cracks in walls, doors that suddenly stick, sounds of cracking trees or boulders. Evacuate IMMEDIATELY using the user's evacuation routes — never go uphill (you can't outrun a slide) and avoid river valleys where debris flows accelerate. After: do not return until officials clear the area; secondary slides are common.",
    "avalanche": "This is an AVALANCHE plan for backcountry recreation or mountain residence. Mandatory gear: beacon (transceiver), probe, and shovel for every person — and training to use them. Check the local avalanche forecast before any trip. If caught: try to swim toward the surface, create an air pocket in front of your face as the snow stops moving. For homes in avalanche paths, identify reinforced shelter areas and a downhill evacuation route.",
    "train_derailment": "This is a TRAIN DERAILMENT response plan, especially relevant if the family lives within 1 mile of rail lines. Treat any visible smoke/vapor cloud as potentially toxic (hazmat). Move UPWIND and uphill immediately using the user's evacuation route. Shelter-in-place is a backup ONLY if you cannot safely evacuate — seal a room. Monitor local emergency broadcasts; East Palestine-style incidents can require evacuation zones of several miles.",
    "gas_leak": "This is a NATURAL GAS LEAK plan. If you smell gas inside: do NOT flip light switches, do NOT use phones inside, do NOT light anything. Get everyone (and pets) outside immediately to a meetup point at least 300 ft from the home. Call 911 and the gas company from OUTSIDE. Do not re-enter until utility staff clear the home. If outside near the home: shut off the gas at the meter if you know how, otherwise just leave and call.",
    "medical_emergency": "This is a MEDICAL EMERGENCY plan, especially relevant for households with chronic conditions, medical-device dependence, or anyone with a known high-risk diagnosis (cardiac, diabetic, allergy/anaphylaxis, seizure). Include: location of the medication list, the nearest ER, recognizing the specific symptom-to-action triggers for this household, who calls 911 vs who drives, who notifies family. Reference the user's medical facility and any specialist contact info.",
}


@router.post("/ccp/wizard/generate")
async def wizard_generate_plan(data: WizardRequest, current_user: dict = Depends(get_current_user)):
    """AI-powered plan generation — one plan per disaster, with disaster-specific follow-up context."""
    if not await _is_estate_owner(current_user["id"], data.estate_id):
        raise HTTPException(status_code=403, detail="Only the benefactor can create plans")
    if not xai_client:
        raise HTTPException(status_code=503, detail="AI service is not available")
    if not data.location.strip():
        raise HTTPException(status_code=400, detail="Location is required")

    # Support both new (single concern) and legacy (concerns list) format
    primary_concern = data.concern.strip() if data.concern else (data.concerns[0] if data.concerns else "")
    if not primary_concern:
        raise HTTPException(status_code=400, detail="A disaster type is required")
    await require_ai_burn_budget(current_user, "ccp_generate")

    # Build the user prompt with disaster-specific context
    household_desc = ", ".join(data.household) if data.household else "adults only"
    concern_label = primary_concern.replace("_", " ").title()

    # Include disaster-specific follow-up answers
    follow_up_text = ""
    if data.follow_up_answers:
        parts = []
        for key, value in data.follow_up_answers.items():
            if value and str(value).strip():
                label = key.replace("_", " ").title()
                parts.append(f"  - {label}: {value}")
        if parts:
            follow_up_text = "\n\nDisaster-specific details provided by the family:\n" + "\n".join(parts)

    # Get disaster-specific AI context
    disaster_context = _DISASTER_PROMPT_CONTEXT.get(
        primary_concern, f"Create a thorough emergency plan for {concern_label}."
    )

    # Cross-state self-defense detection — surface contrast when the family's
    # locations span >1 US state so the AI can address both frameworks.
    _US_STATE_CODES = {
        "AL",
        "AK",
        "AZ",
        "AR",
        "CA",
        "CO",
        "CT",
        "DE",
        "FL",
        "GA",
        "HI",
        "ID",
        "IL",
        "IN",
        "IA",
        "KS",
        "KY",
        "LA",
        "ME",
        "MD",
        "MA",
        "MI",
        "MN",
        "MS",
        "MO",
        "MT",
        "NE",
        "NV",
        "NH",
        "NJ",
        "NM",
        "NY",
        "NC",
        "ND",
        "OH",
        "OK",
        "OR",
        "PA",
        "RI",
        "SC",
        "SD",
        "TN",
        "TX",
        "UT",
        "VT",
        "VA",
        "WA",
        "WV",
        "WI",
        "WY",
        "DC",
    }
    _STATE_NAMES = {
        "ALABAMA": "AL",
        "ALASKA": "AK",
        "ARIZONA": "AZ",
        "ARKANSAS": "AR",
        "CALIFORNIA": "CA",
        "COLORADO": "CO",
        "CONNECTICUT": "CT",
        "DELAWARE": "DE",
        "FLORIDA": "FL",
        "GEORGIA": "GA",
        "HAWAII": "HI",
        "IDAHO": "ID",
        "ILLINOIS": "IL",
        "INDIANA": "IN",
        "IOWA": "IA",
        "KANSAS": "KS",
        "KENTUCKY": "KY",
        "LOUISIANA": "LA",
        "MAINE": "ME",
        "MARYLAND": "MD",
        "MASSACHUSETTS": "MA",
        "MICHIGAN": "MI",
        "MINNESOTA": "MN",
        "MISSISSIPPI": "MS",
        "MISSOURI": "MO",
        "MONTANA": "MT",
        "NEBRASKA": "NE",
        "NEVADA": "NV",
        "NEW HAMPSHIRE": "NH",
        "NEW JERSEY": "NJ",
        "NEW MEXICO": "NM",
        "NEW YORK": "NY",
        "NORTH CAROLINA": "NC",
        "NORTH DAKOTA": "ND",
        "OHIO": "OH",
        "OKLAHOMA": "OK",
        "OREGON": "OR",
        "PENNSYLVANIA": "PA",
        "RHODE ISLAND": "RI",
        "SOUTH CAROLINA": "SC",
        "SOUTH DAKOTA": "SD",
        "TENNESSEE": "TN",
        "TEXAS": "TX",
        "UTAH": "UT",
        "VERMONT": "VT",
        "VIRGINIA": "VA",
        "WASHINGTON": "WA",
        "WEST VIRGINIA": "WV",
        "WISCONSIN": "WI",
        "WYOMING": "WY",
    }

    def _scan_states(s: str) -> set[str]:
        import re as _re

        if not s:
            return set()
        found = set()
        upper = s.upper()
        # 2-letter codes: ", XX" or ", XX 12345"
        for m in _re.finditer(r",\s*([A-Z]{2})(?:\s+\d{5})?\b", upper):
            if m.group(1) in _US_STATE_CODES:
                found.add(m.group(1))
        # Full state names (longest first to catch "NEW YORK" before "YORK")
        for name in sorted(_STATE_NAMES, key=len, reverse=True):
            if _re.search(r"\b" + name + r"\b", upper):
                found.add(_STATE_NAMES[name])
        return found

    _states = _scan_states(data.location)
    for _v in (data.follow_up_answers or {}).values():
        if isinstance(_v, str):
            _states |= _scan_states(_v)
        elif isinstance(_v, list):
            for _x in _v:
                if isinstance(_x, str):
                    _states |= _scan_states(_x)

    _is_fight_disaster = primary_concern in ("home_invasion", "active_shooter", "terrorism", "civil_unrest")
    cross_state_block = ""
    if _is_fight_disaster and len(_states) > 1:
        _state_list = ", ".join(sorted(_states))
        cross_state_block = (
            f"\n\nCROSS-STATE SELF-DEFENSE CONTEXT: The family's locations span multiple US states "
            f"({_state_list}). When generating `self_defense_law_note`, briefly contrast the relevant "
            f"frameworks of each state (e.g., Stand-Your-Ground vs. Duty-to-Retreat, Castle Doctrine "
            f"scope, use-of-force standard) and note that the applicable rule depends on which state "
            f"the incident occurs in. Keep the entire note under 5 sentences and end with the standard "
            f"'This is general information, NOT legal advice...' disclaimer."
        )

    user_prompt = f"""Create a {concern_label} emergency plan for this family:

Home Location: {data.location.strip()}
Household: {household_desc}
Disaster Type: {concern_label}

DISASTER-SPECIFIC GUIDANCE:
{disaster_context}
{follow_up_text}{cross_state_block}

Generate a complete, actionable emergency plan for this specific disaster. Return ONLY valid JSON."""

    # Failover ladder — lead with grok-3 (consistently healthy & fast),
    # fall back to grok-4 (higher quality), then grok-3-mini (last resort).
    # Mirrors the EGA pattern in guardian.py so a flaky grok-4 doesn't
    # hang the CCP wizard for 60+ seconds.
    _LADDER: list[str] = []
    for m in ("grok-3", XAI_MODEL, XAI_MODEL_LIGHT):
        if m and m not in _LADDER:
            _LADDER.append(m)
    _PER_CALL_TIMEOUT_S = 45.0  # hard per-attempt ceiling
    _SOFT_DEADLINE_S = 90.0  # total ladder budget

    raw: str = ""
    plan_data: dict | None = None
    last_error: Exception | None = None
    started_at = _asyncio.get_event_loop().time()
    _used_model: str | None = None
    _last_response = None

    for model_name in _LADDER:
        elapsed = _asyncio.get_event_loop().time() - started_at
        if elapsed > _SOFT_DEADLINE_S - 5:
            logger.warning(f"CCP wizard deadline guard: skipping {model_name} (elapsed {elapsed:.1f}s)")
            break
        try:
            response = await _asyncio.wait_for(
                _asyncio.to_thread(
                    xai_client.chat.completions.create,
                    model=model_name,
                    messages=[
                        {"role": "system", "content": _WIZARD_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    max_tokens=2000,
                    temperature=0.7,
                    response_format={"type": "json_object"},
                ),
                timeout=_PER_CALL_TIMEOUT_S,
            )
            raw = response.choices[0].message.content.strip()
            plan_data = _json.loads(raw)
            _used_model = model_name
            _last_response = response
            logger.info(f"CCP wizard plan generated via {model_name} for {primary_concern}")
            break  # success
        except _asyncio.TimeoutError as e:
            last_error = e
            logger.warning(f"CCP wizard {model_name} timed out after {_PER_CALL_TIMEOUT_S}s — failing over")
            continue
        except _json.JSONDecodeError as e:
            last_error = e
            logger.warning(f"CCP wizard {model_name} returned invalid JSON: {raw[:300]} — failing over")
            continue
        except Exception as e:
            last_error = e
            logger.warning(f"CCP wizard {model_name} call failed: {e} — failing over")
            continue

    # Cost ledger — fire-and-forget
    from services.llm_cost_ledger import record_xai_response as _record_xai

    if _last_response is not None and _used_model:
        duration_ms = int((_asyncio.get_event_loop().time() - started_at) * 1000)
        await _record_xai(
            _last_response,
            endpoint="ccp.wizard_generate_plan",
            model=_used_model,
            user_id=current_user.get("id"),
            estate_id=data.estate_id,
            duration_ms=duration_ms,
        )

    if plan_data is None:
        logger.error(f"CCP wizard AI exhausted all models. Last error: {last_error}")
        raise HTTPException(
            status_code=502,
            detail="AI service is busy right now. Please try again in a moment.",
        )

    # Determine plan_type from the concern
    plan_type = _CONCERN_TO_PLAN_TYPE.get(primary_concern, "custom")

    # Build drill schedule suggestion
    drill_sched = _DRILL_SCHEDULES.get(primary_concern, _DRILL_SCHEDULES.get("house_fire"))
    next_drill = _compute_next_drill_date(drill_sched["months"])

    return {
        "plan_name": plan_data.get("plan_name", f"{concern_label} Plan"),
        "plan_type": plan_type,
        "rendezvous_points": plan_data.get("rendezvous_points", []),
        "communication_plan": plan_data.get("communication_plan", ""),
        "resource_locations": plan_data.get("resource_locations", []),
        "instructions": plan_data.get("instructions", ""),
        "warnings": plan_data.get("warnings", []),
        "self_defense_law_note": plan_data.get("self_defense_law_note") or None,
        "drill_schedule": {
            "frequency": drill_sched["frequency"],
            "recommended_months": drill_sched["months"],
            "label": drill_sched["label"],
            "next_drill_date": next_drill,
            "enabled": True,
        },
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
    # Redact linked docs/credentials per estate (this user is a beneficiary in
    # every one of these estates, never the owner).
    by_estate: dict[str, list] = {}
    for p in result:
        by_estate.setdefault(p["estate_id"], []).append(p)
    for eid, eplans in by_estate.items():
        actor = await resolve_estate_actor(eid, current_user)
        await _redact_plan_links_for_actor(eplans, actor)
    return result


@router.get("/ccp/plans/{estate_id}")
async def get_plans(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get all emergency plans for an estate. Beneficiaries only see plans assigned to them.

    Each plan is enriched with `drill_count` — the number of times that plan
    has been drilled (logged in `ccp_drill_runs`). The dashboard uses this
    to compute the CCP slice of the Estate Readiness gauge: 100% requires
    5 plans + each drilled at least once.
    """
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
        # Redact linked docs/credentials down to what this beneficiary can access.
        actor = await resolve_estate_actor(estate_id, current_user)
        plans = await _redact_plan_links_for_actor(plans, actor)
    # Attach drill_count via a single aggregation rather than N round-trips.
    if plans:
        plan_ids = [p["id"] for p in plans if p.get("id")]
        if plan_ids:
            drill_rows = await db.ccp_drill_runs.aggregate(
                [
                    {"$match": {"estate_id": estate_id, "plan_id": {"$in": plan_ids}}},
                    {"$group": {"_id": "$plan_id", "count": {"$sum": 1}}},
                ]
            ).to_list(len(plan_ids))
            counts = {row["_id"]: row["count"] for row in drill_rows}
            for p in plans:
                p["drill_count"] = int(counts.get(p.get("id"), 0))
        else:
            for p in plans:
                p["drill_count"] = 0
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
        "drill_schedule": data.drill_schedule,
        "self_defense_law_note": data.self_defense_law_note,
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
        "drill_schedule",
        "self_defense_law_note",
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
    actor = await resolve_estate_actor(estate_id, current_user)
    if not actor.get("is_estate_member"):
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
    # Redact linked-resource references from the plan snapshot for beneficiaries
    # who aren't entitled to them (audit P1.1). The safety check-in board stays
    # visible to all members — that is the whole point of an active-emergency board.
    if not (actor.get("is_owner") or actor.get("is_admin") or actor.get("is_operator")):
        snap = activation.get("plan_snapshot")
        if isinstance(snap, dict):
            snap = (await _redact_plan_links_for_actor([snap], actor))[0]
            if not _active_plan_assigned_to_actor(snap, actor):
                snap["linked_ffn_contact_ids"] = []
                snap["assigned_beneficiary_ids"] = None
            activation["plan_snapshot"] = snap
    return {
        "active": True,
        "activation": activation,
        "status_board": status_board,
    }


@router.get("/ccp/active/{estate_id}/linked-resources")
async def get_linked_resources(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get resolved linked SDV documents, FFN contacts, and DAV entries for the
    active emergency. Beneficiaries only receive resources they are individually
    entitled to: documents via can_access_document, DAV via assignment+visibility,
    and FFN contacts only when the active plan is assigned to them (audit P1.1)."""
    actor = await resolve_estate_actor(estate_id, current_user)
    if not actor.get("is_estate_member"):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    activation = await db.emergency_activations.find_one({"estate_id": estate_id, "status": "active"}, {"_id": 0})
    if not activation:
        return {"documents": [], "ffn_contacts": [], "dav_entries": []}
    snap = activation.get("plan_snapshot", {})
    full = bool(actor.get("is_owner") or actor.get("is_admin") or actor.get("is_operator"))
    plan_assigned = _active_plan_assigned_to_actor(snap, actor)

    # Resolve SDV documents — beneficiaries only see designated, in-phase docs.
    doc_ids = snap.get("linked_document_ids", [])
    documents = []
    if doc_ids:
        docs = await db.documents.find(
            {"id": {"$in": doc_ids}, "estate_id": estate_id, "deleted_at": None},
            {"_id": 0},
        ).to_list(50)
        if not full:
            docs = [d for d in docs if can_access_document(d, actor)]
        documents = [
            {
                "id": d.get("id"),
                "name": d.get("name"),
                "category": d.get("category"),
                "file_type": d.get("file_type"),
                "file_size": d.get("file_size"),
            }
            for d in docs
        ]

    # Resolve DAV entries — assignment + visibility gated (mirrors digital_wallet).
    dav_ids = snap.get("linked_dav_entry_ids", [])
    dav_entries = []
    if dav_ids:
        entries = await db.digital_wallet.find(
            {"id": {"$in": dav_ids}, "estate_id": estate_id, "deleted_at": None},
            {"_id": 0},
        ).to_list(50)
        if not full:
            is_transitioned = bool(actor.get("is_transitioned"))
            release_ids = actor.get("release_ids") or set()
            visible = []
            for e in entries:
                assigned = e.get("assigned_beneficiary_id")
                if not (assigned and assigned in release_ids):
                    continue
                vis = e.get("beneficiary_visibility") or "private"
                if vis == "show_now" or (vis == "posthumous_only" and is_transitioned):
                    visible.append(e)
            entries = visible
        dav_entries = [
            {
                "id": e.get("id"),
                "account_name": e.get("account_name"),
                "login_username": e.get("login_username"),
                "category": e.get("category"),
                "notes": e.get("notes"),
            }
            for e in entries
        ]

    # Resolve FFN contacts — owner/admin always; beneficiaries only when the
    # active plan is explicitly assigned to them.
    ffn_ids = snap.get("linked_ffn_contact_ids", [])
    ffn_contacts = []
    if ffn_ids and (full or plan_assigned):
        ffn_contacts = await db.ffn_contacts.find(
            {"id": {"$in": ffn_ids}, "estate_id": estate_id, "deleted_at": None},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "relationship": 1, "address": 1},
        ).to_list(50)
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


# ===================== SHARE PLAN (PUBLIC LINK) =====================


@router.post("/ccp/plans/{plan_id}/share")
async def create_share_link(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Generate a public share token for a plan. Benefactor only."""
    plan = await db.emergency_plans.find_one({"id": plan_id, "deleted_at": None}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not await _is_estate_owner(current_user["id"], plan["estate_id"]):
        raise HTTPException(status_code=403, detail="Only the benefactor can share plans")
    # Reuse existing token if present
    existing = plan.get("share_token")
    if existing:
        return {"share_token": existing}
    token = str(uuid4())[:12]
    await db.emergency_plans.update_one(
        {"id": plan_id},
        {"$set": {"share_token": token, "shared_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"share_token": token}


@router.delete("/ccp/plans/{plan_id}/share")
async def revoke_share_link(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Revoke the public share link for a plan."""
    plan = await db.emergency_plans.find_one({"id": plan_id, "deleted_at": None}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not await _is_estate_owner(current_user["id"], plan["estate_id"]):
        raise HTTPException(status_code=403, detail="Only the benefactor can modify plans")
    await db.emergency_plans.update_one(
        {"id": plan_id},
        {"$unset": {"share_token": "", "shared_at": ""}},
    )
    return {"success": True}


@router.get("/public/ccp/{share_token}")
async def get_shared_plan(share_token: str):
    """Public endpoint — view a shared emergency plan. No auth required."""
    plan = await db.emergency_plans.find_one(
        {"share_token": share_token, "deleted_at": None},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "plan_type": 1,
            "rendezvous_points": 1,
            "communication_plan": 1,
            "resource_locations": 1,
            "instructions": 1,
            "drill_schedule": 1,
            "created_at": 1,
            "estate_id": 1,
        },
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found or link expired")
    # Get estate name (no sensitive data)
    estate = await db.estates.find_one({"id": plan["estate_id"]}, {"_id": 0, "id": 1, "name": 1})
    plan["estate_name"] = estate.get("name", "") if estate else ""
    plan.pop("estate_id", None)
    return plan


# ===================== POST-DRILL DEBRIEF =====================


@router.post("/ccp/debrief/{activation_id}")
async def submit_debrief(activation_id: str, data: DebriefRequest, current_user: dict = Depends(get_current_user)):
    """Submit a post-drill debrief with rating and notes."""
    if not 1 <= data.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    activation = await db.emergency_activations.find_one({"id": activation_id, "status": "resolved"}, {"_id": 0})
    if not activation:
        raise HTTPException(status_code=404, detail="Resolved activation not found")
    if not await _is_estate_member(current_user["id"], activation["estate_id"]):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    now = datetime.now(timezone.utc).isoformat()
    debrief = {
        "rating": data.rating,
        "went_well": data.went_well.strip(),
        "to_improve": data.to_improve.strip(),
        "submitted_by": current_user["id"],
        "submitted_by_name": current_user.get("name", "Unknown"),
        "submitted_at": now,
    }
    await db.emergency_activations.update_one(
        {"id": activation_id},
        {"$set": {"debrief": debrief}},
    )
    return {"success": True, "debrief": debrief}


@router.get("/ccp/debrief-stats/{estate_id}")
async def get_debrief_stats(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get drill debrief trend data for an estate — average rating over time."""
    if not await _is_estate_member(current_user["id"], estate_id):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    activations = (
        await db.emergency_activations.find(
            {"estate_id": estate_id, "is_drill": True, "status": "resolved", "debrief": {"$exists": True}},
            {"_id": 0, "id": 1, "plan_name": 1, "activated_at": 1, "deactivated_at": 1, "debrief": 1},
        )
        .sort("activated_at", 1)
        .to_list(100)
    )
    entries = []
    for a in activations:
        d = a.get("debrief", {})
        entries.append(
            {
                "activation_id": a["id"],
                "plan_name": a.get("plan_name", ""),
                "date": a.get("deactivated_at", a.get("activated_at", "")),
                "rating": d.get("rating", 0),
                "went_well": d.get("went_well", ""),
                "to_improve": d.get("to_improve", ""),
            }
        )
    avg_rating = round(sum(e["rating"] for e in entries) / len(entries), 1) if entries else 0
    return {
        "entries": entries,
        "total_drills": len(entries),
        "average_rating": avg_rating,
    }


# ===================== DRILL SCHEDULE & REMINDERS =====================


class DrillScheduleToggle(BaseModel):
    enabled: bool


@router.patch("/ccp/plans/{plan_id}/drill-schedule")
async def toggle_drill_schedule(
    plan_id: str, data: DrillScheduleToggle, current_user: dict = Depends(get_current_user)
):
    """Enable or disable drill reminders for a plan."""
    plan = await db.emergency_plans.find_one({"id": plan_id, "deleted_at": None}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not await _is_estate_owner(current_user["id"], plan["estate_id"]):
        raise HTTPException(status_code=403, detail="Only the benefactor can modify plans")
    sched = plan.get("drill_schedule") or {}
    sched["enabled"] = data.enabled
    await db.emergency_plans.update_one(
        {"id": plan_id},
        {"$set": {"drill_schedule": sched, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"success": True, "enabled": data.enabled}


def build_drill_reminder_email(user_name: str, plan_name: str, plan_type_label: str, app_url: str) -> tuple[str, str]:
    """Build CarryOn-branded drill reminder email with warm, guiding tone."""
    subject = f"Time for a Family Drill: {plan_name}"

    html = f"""
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0F1629; color: #F1F3F8; border-radius: 16px; overflow: hidden;">
      <div style="padding: 40px 32px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.07);">
        <img src="{app_url}/carryon-logo.jpg" alt="CarryOn" style="width: 80px; height: auto; margin-bottom: 16px;" />
        <h1 style="font-size: 22px; margin: 0 0 8px; color: #d4af37;">
          Time to Practice Your Plan
        </h1>
        <p style="color: #A0AABF; font-size: 14px; margin: 0;">
          Hi {user_name or "there"},
        </p>
      </div>

      <div style="padding: 32px;">
        <p style="color: #A0AABF; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">
          A little practice goes a long way. It's time to run through your
          <strong style="color: #F1F3F8;">{plan_name}</strong> with your family.
        </p>

        <div style="background: rgba(212,175,55,0.06); border: 1px solid rgba(212,175,55,0.15); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #d4af37; font-weight: bold; font-size: 14px; margin: 0 0 12px;">Here's how to run a drill:</p>
          <ol style="color: #A0AABF; font-size: 13px; padding-left: 18px; margin: 0; line-height: 2.0;">
            <li>Gather your family and open CarryOn</li>
            <li>Go to <strong style="color: #F1F3F8;">CarryOn Contingency Protocols</strong></li>
            <li>Find your <strong style="color: #F1F3F8;">{plan_name}</strong></li>
            <li>Tap <strong style="color: #3B7BF7;">DRILL</strong> to start a practice run</li>
            <li>Have everyone check in from their phones</li>
            <li>Debrief together — talk about what went well</li>
          </ol>
        </div>

        <div style="background: rgba(34,201,147,0.06); border: 1px solid rgba(34,201,147,0.15); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <p style="color: #22C993; font-size: 13px; margin: 0; line-height: 1.6;">
            <strong>Why practice?</strong> Families who run drills respond
            faster and calmer in real emergencies. Even a 10-minute walkthrough
            makes a difference.
          </p>
        </div>

        <p style="color: #A0AABF; font-size: 13px; margin: 0 0 20px; line-height: 1.6;">
          You can adjust your drill schedule anytime in your plan settings.
          We'll send you a gentle reminder when the next one is due.
        </p>

        <div style="text-align: center;">
          <a href="{app_url}/connected-protocol" style="display: inline-block; padding: 14px 32px; background: #d4af37; color: #0F1629; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 14px;">
            Open Your Plans
          </a>
        </div>
      </div>

      <div style="padding: 20px 32px; text-align: center; border-top: 1px solid rgba(255,255,255,0.07);">
        <p style="color: #525C72; font-size: 11px; margin: 0;">
          You're receiving this because you enabled drill reminders for this plan.
        </p>
        <p style="color: #525C72; font-size: 11px; margin: 4px 0 0;">
          CarryOn &middot; Every American Family. Ready.
        </p>
      </div>
    </div>
    """
    return subject, html


PLAN_TYPE_LABELS_MAP = {
    "natural_disaster": "Natural Disaster",
    "national_emergency": "National Emergency",
    "medical_emergency": "Medical Emergency",
    "infrastructure_failure": "Infrastructure Failure",
    "custom": "Custom Plan",
}


async def send_drill_reminders():
    """Check all plans with enabled drill schedules and send reminders when due."""
    from services.email import send_email

    now = datetime.now(timezone.utc)
    current_month = now.month
    current_day = now.day
    app_url = "https://app.carryon.us"
    sent_count = 0

    # Find all active plans with drill schedules enabled
    plans = await db.emergency_plans.find(
        {
            "deleted_at": None,
            "drill_schedule.enabled": True,
            "drill_schedule.recommended_months": current_month,
        },
        {"_id": 0},
    ).to_list(500)

    for plan in plans:
        sched = plan.get("drill_schedule", {})

        # Only send on the 1st of the recommended month
        if current_day != 1:
            continue

        # Check if we already sent this month
        last_sent = sched.get("last_reminder_sent", "")
        if last_sent:
            try:
                last_dt = datetime.fromisoformat(last_sent.replace("Z", "+00:00"))
                if last_dt.month == current_month and last_dt.year == now.year:
                    continue  # Already sent this month
            except (ValueError, AttributeError):
                pass

        # Look up the estate owner to get their email
        estate = await db.estates.find_one(
            {"id": plan["estate_id"]},
            {"_id": 0, "id": 1, "owner_id": 1},
        )
        if not estate:
            continue

        owner = await db.users.find_one(
            {"id": estate["owner_id"]},
            {"_id": 0, "id": 1, "name": 1, "email": 1},
        )
        if not owner or not owner.get("email"):
            continue

        plan_type_label = PLAN_TYPE_LABELS_MAP.get(plan.get("plan_type", ""), "Emergency")
        subject, html = build_drill_reminder_email(
            owner.get("name", ""),
            plan.get("name", "Emergency Plan"),
            plan_type_label,
            app_url,
        )

        success = await send_email(owner["email"], subject, html)
        if success:
            # Update last_reminder_sent and compute next drill date
            months = sched.get("recommended_months", [])
            next_date = _compute_next_drill_date(months)
            await db.emergency_plans.update_one(
                {"id": plan["id"]},
                {
                    "$set": {
                        "drill_schedule.last_reminder_sent": now.isoformat(),
                        "drill_schedule.next_drill_date": next_date,
                    }
                },
            )
            sent_count += 1
            logger.info(f"Drill reminder sent for '{plan['name']}' to {owner['email']}")

    return sent_count


async def drill_reminder_scheduler():
    """Background task: checks for drill reminders daily at 14:00 UTC."""
    await _asyncio.sleep(600)  # Wait 10 min after startup
    while True:
        now = datetime.now(timezone.utc)
        target_hour = 14
        if now.hour >= target_hour:
            wait_hours = 24 - (now.hour - target_hour)
        else:
            wait_hours = target_hour - now.hour
        wait_seconds = wait_hours * 3600 - now.minute * 60 - now.second
        logger.info(f"Drill reminder scheduler: next check in {wait_seconds / 3600:.1f}h")
        await _asyncio.sleep(max(60, wait_seconds))

        try:
            count = await send_drill_reminders()
            if count > 0:
                logger.info(f"Drill reminders sent: {count}")
            else:
                logger.info("Drill reminder check — no reminders to send")
        except Exception as e:
            logger.error(f"Drill reminder scheduler error: {e}")
