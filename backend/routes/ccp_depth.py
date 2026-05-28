"""CarryOn™ — CCP Depth Module
================================

Adds the persistent state CCP was missing relative to CFP:

  • Household Roster — named members with medical info; reused by every plan.
  • Go-Bag Inventory — items with expiration tracking + rotation reminders.
  • Rendezvous Points — primary/secondary/tertiary meetup spots + routes.
  • Out-of-Area Contact — single relay contact (FEMA-recommended pattern).
  • Family Drill — practice broadcast (Resend email instead of Twilio SMS).
  • Plan Activation — real broadcast for live events (Resend email).
  • Readiness Score — rolls everything above into a single 0-100 number
    with line-item breakdown, mirroring CFP's completion percentage.
  • AI Risk Profile — given the household zip / location, the xAI model
    ranks the 18 disaster types by likelihood so the plan picker stops
    asking the user to evaluate all 18 equally.

Each new collection is keyed on `estate_id` and obeys the same ownership
rules used by the existing /ccp endpoints (estate owner OR estate member).

Email delivery is wired through the same `resend` lib + SENDER_EMAIL the
auth and partner welcome flows already use; no new credentials required.
"""

from __future__ import annotations

import asyncio as _asyncio
import json as _json
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from config import db, xai_client, logger
from services.estate_auth import is_estate_member, is_estate_owner
from utils import RESEND_API_KEY, SENDER_EMAIL, get_current_user

import os

FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://app.carryon.us")

try:
    import resend
except Exception:  # pragma: no cover — installed in prod
    resend = None  # type: ignore


router = APIRouter()


# ─── Authorization helper (shared by every endpoint below) ──────────
async def _require_estate_access(estate_id: str, user: dict) -> None:
    """Allow estate owner OR any active estate member (mirrors /ccp rules)."""
    if await is_estate_owner(user["id"], estate_id):
        return
    if await is_estate_member(user["id"], estate_id):
        return
    raise HTTPException(status_code=403, detail="Not authorized for this estate")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ═══════════════════════════════════════════════════════════════════
# 1.  HOUSEHOLD ROSTER  (selection of beneficiaries — single source of
#     truth lives on each Beneficiary record)
# ═══════════════════════════════════════════════════════════════════
class HouseholdMember(BaseModel):
    """Legacy free-form shape — retained only for backward-compat with
    docs persisted before the picker refactor. Not used on writes."""

    id: Optional[str] = None
    name: str
    role: str = "adult"
    age: Optional[int] = None
    relationship: Optional[str] = None
    medical_conditions: Optional[str] = None
    allergies: Optional[str] = None
    prescriptions: Optional[str] = None
    blood_type: Optional[str] = None
    primary_doctor: Optional[str] = None
    school_or_employer: Optional[str] = None
    notes: Optional[str] = None


class HouseholdSelection(BaseModel):
    """New shape — user picks which beneficiaries are in the household;
    medical/emergency fields live on each Beneficiary record."""

    beneficiary_ids: list[str] = []


def _benef_to_member(b: dict) -> dict:
    """Project a beneficiary doc onto the HouseholdMember shape so the
    readiness logic + downstream consumers keep working without a fork."""
    age = None
    dob = b.get("date_of_birth")
    if dob:
        try:
            dt = datetime.fromisoformat(dob.replace("Z", "+00:00"))
            today = datetime.now(timezone.utc)
            age = today.year - dt.year - (1 if (today.month, today.day) < (dt.month, dt.day) else 0)
        except Exception:
            pass
    role = "child" if (age is not None and age < 18) else "adult"
    return {
        "id": b.get("id"),
        "name": b.get("name") or f"{b.get('first_name', '')} {b.get('last_name', '')}".strip(),
        "role": role,
        "age": age,
        "relationship": b.get("relation"),
        "medical_conditions": b.get("medical_conditions"),
        "allergies": b.get("allergies"),
        "prescriptions": b.get("prescriptions"),
        "blood_type": b.get("blood_type"),
        "primary_doctor": b.get("primary_doctor"),
        "school_or_employer": b.get("school_or_employer"),
        "notes": b.get("notes"),
        # Pretty-picker extras
        "photo_url": b.get("photo_url"),
        "initials": b.get("initials"),
        "avatar_color": b.get("avatar_color"),
        "email": b.get("email"),
    }


@router.get("/ccp/household/{estate_id}")
async def get_household(estate_id: str, current_user: dict = Depends(get_current_user)):
    await _require_estate_access(estate_id, current_user)
    doc = await db.ccp_household.find_one({"estate_id": estate_id}, {"_id": 0}) or {}

    selected_ids = doc.get("beneficiary_ids") or []
    members: list[dict] = []
    if selected_ids:
        cursor = db.beneficiaries.find(
            {"estate_id": estate_id, "id": {"$in": selected_ids}},
            {"_id": 0},
        )
        benefs = await cursor.to_list(200)
        by_id = {b["id"]: b for b in benefs}
        members = [_benef_to_member(by_id[i]) for i in selected_ids if i in by_id]

    # Legacy fallback so pre-refactor records aren't lost.
    if not members and doc.get("members"):
        members = doc["members"]

    return {
        "estate_id": estate_id,
        "beneficiary_ids": selected_ids,
        "members": members,
        "updated_at": doc.get("updated_at"),
    }


@router.put("/ccp/household/{estate_id}")
async def upsert_household(
    estate_id: str,
    data: HouseholdSelection,
    current_user: dict = Depends(get_current_user),
):
    """Persist the selected beneficiary IDs. The medical / emergency info
    lives on each Beneficiary record — edit it there, not here."""
    await _require_estate_access(estate_id, current_user)

    # Defense: silently drop any IDs that don't belong to this estate.
    if data.beneficiary_ids:
        cursor = db.beneficiaries.find(
            {"estate_id": estate_id, "id": {"$in": data.beneficiary_ids}},
            {"_id": 0, "id": 1},
        )
        valid = {b["id"] for b in await cursor.to_list(200)}
        clean_ids = [i for i in data.beneficiary_ids if i in valid]
    else:
        clean_ids = []

    await db.ccp_household.update_one(
        {"estate_id": estate_id},
        {
            "$set": {
                "estate_id": estate_id,
                "beneficiary_ids": clean_ids,
                "updated_at": _now_iso(),
                "updated_by": current_user["id"],
            },
            # Drop the legacy free-form members array now that we use refs.
            "$unset": {"members": ""},
        },
        upsert=True,
    )
    return await get_household(estate_id, current_user)


# ═══════════════════════════════════════════════════════════════════
# 2.  GO-BAG INVENTORY
# ═══════════════════════════════════════════════════════════════════
GO_BAG_CATEGORIES = [
    "water",
    "food",
    "medication",
    "first_aid",
    "tools",
    "documents",
    "cash",
    "clothing",
    "communication",
    "pet_supplies",
    "comfort",
    "other",
]


class GoBagItem(BaseModel):
    id: Optional[str] = None
    category: str = "other"
    name: str
    qty: Optional[str] = None  # "2 gal", "30 day supply"
    expires_at: Optional[str] = None  # ISO date — items past now() flag stale
    last_checked: Optional[str] = None
    notes: Optional[str] = None


@router.get("/ccp/go-bag/{estate_id}")
async def get_go_bag(estate_id: str, current_user: dict = Depends(get_current_user)):
    await _require_estate_access(estate_id, current_user)
    doc = await db.ccp_go_bag.find_one({"estate_id": estate_id}, {"_id": 0})
    if not doc:
        return {"estate_id": estate_id, "items": []}
    return doc


@router.put("/ccp/go-bag/{estate_id}")
async def upsert_go_bag(
    estate_id: str,
    items: list[GoBagItem],
    current_user: dict = Depends(get_current_user),
):
    await _require_estate_access(estate_id, current_user)
    cleaned = []
    for it in items:
        d = it.model_dump()
        d["id"] = d.get("id") or str(uuid4())
        if d.get("category") not in GO_BAG_CATEGORIES:
            d["category"] = "other"
        cleaned.append(d)
    await db.ccp_go_bag.update_one(
        {"estate_id": estate_id},
        {
            "$set": {
                "estate_id": estate_id,
                "items": cleaned,
                "updated_at": _now_iso(),
                "updated_by": current_user["id"],
            }
        },
        upsert=True,
    )
    return {"estate_id": estate_id, "items": cleaned}


# ═══════════════════════════════════════════════════════════════════
# 3.  RENDEZVOUS POINTS (primary / secondary / tertiary)
# ═══════════════════════════════════════════════════════════════════
class Rendezvous(BaseModel):
    primary_label: Optional[str] = None
    primary_address: Optional[str] = None
    primary_notes: Optional[str] = None
    secondary_label: Optional[str] = None
    secondary_address: Optional[str] = None
    secondary_notes: Optional[str] = None
    tertiary_label: Optional[str] = None
    tertiary_address: Optional[str] = None
    tertiary_notes: Optional[str] = None
    evacuation_routes: Optional[str] = None  # free-text route notes


@router.get("/ccp/rendezvous/{estate_id}")
async def get_rendezvous(estate_id: str, current_user: dict = Depends(get_current_user)):
    await _require_estate_access(estate_id, current_user)
    doc = await db.ccp_rendezvous.find_one({"estate_id": estate_id}, {"_id": 0})
    if not doc:
        return {"estate_id": estate_id}
    return doc


@router.put("/ccp/rendezvous/{estate_id}")
async def upsert_rendezvous(
    estate_id: str,
    data: Rendezvous,
    current_user: dict = Depends(get_current_user),
):
    await _require_estate_access(estate_id, current_user)
    payload = data.model_dump()
    payload["estate_id"] = estate_id
    payload["updated_at"] = _now_iso()
    payload["updated_by"] = current_user["id"]
    await db.ccp_rendezvous.update_one(
        {"estate_id": estate_id},
        {"$set": payload},
        upsert=True,
    )
    return payload


# ═══════════════════════════════════════════════════════════════════
# 4.  OUT-OF-AREA RELAY CONTACT (FEMA-recommended pattern)
# ═══════════════════════════════════════════════════════════════════
class OutOfAreaContact(BaseModel):
    name: Optional[str] = None
    relationship: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    notes: Optional[str] = None


@router.get("/ccp/out-of-area/{estate_id}")
async def get_out_of_area(estate_id: str, current_user: dict = Depends(get_current_user)):
    await _require_estate_access(estate_id, current_user)
    doc = await db.ccp_out_of_area.find_one({"estate_id": estate_id}, {"_id": 0})
    return doc or {"estate_id": estate_id}


@router.put("/ccp/out-of-area/{estate_id}")
async def upsert_out_of_area(
    estate_id: str,
    data: OutOfAreaContact,
    current_user: dict = Depends(get_current_user),
):
    await _require_estate_access(estate_id, current_user)
    payload = data.model_dump()
    payload["estate_id"] = estate_id
    payload["updated_at"] = _now_iso()
    payload["updated_by"] = current_user["id"]
    await db.ccp_out_of_area.update_one(
        {"estate_id": estate_id},
        {"$set": payload},
        upsert=True,
    )
    return payload


# ═══════════════════════════════════════════════════════════════════
# 5.  FAMILY DRILL — practice broadcast via Resend email
# ═══════════════════════════════════════════════════════════════════
class DrillRequest(BaseModel):
    estate_id: str
    plan_id: Optional[str] = None
    plan_name: Optional[str] = None
    recipient_emails: list[EmailStr] = []
    custom_note: Optional[str] = None


async def _send_email(to: str, subject: str, html: str) -> bool:
    """Fire a single email via Resend. Returns True on success."""
    if not RESEND_API_KEY or resend is None:
        logger.warning("Resend not configured — CCP email skipped to %s", to)
        return False
    try:
        await _asyncio.to_thread(
            resend.Emails.send,
            {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html},
        )
        return True
    except Exception as e:
        logger.error("Resend send failed for %s: %s", to, e)
        return False


def _drill_html(plan_name: str, sender_name: str, custom_note: str | None) -> str:
    note_block = f'<p style="color:#94a3b8;margin:16px 0;line-height:1.6;">{custom_note}</p>' if custom_note else ""
    return f"""<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif;">
<table width="100%" style="background:#0b1120;padding:40px 20px;"><tr><td align="center">
<table width="540" style="max-width:540px;background:#0f1d35;border-radius:16px;border:1px solid #1e293b;">
<tr><td style="padding:36px;">
<p style="margin:0 0 8px 0;font-size:11px;letter-spacing:2px;color:#d4af37;font-weight:bold;">⚠︎ CARRYON FAMILY DRILL — THIS IS NOT A REAL EMERGENCY</p>
<h1 style="color:#f8fafc;margin:0 0 12px 0;font-size:22px;">Practice run: {plan_name}</h1>
<p style="color:#94a3b8;margin:0 0 16px 0;line-height:1.6;">
  <strong>{sender_name}</strong> is testing the family emergency plan. Please reply to this
  email confirming you remember the meetup point and the out-of-area contact.
</p>
{note_block}
<p style="color:#64748b;font-size:13px;margin:24px 0 0 0;line-height:1.6;">
  If this were a real activation, you'd receive a separate email titled <em>"ACTIVATION"</em>
  with a live meetup link and a request to confirm your status.
</p>
<table width="100%" style="margin-top:28px;padding-top:20px;border-top:1px solid #1e293b;">
<tr><td style="color:#64748b;font-size:11px;text-align:center;">CarryOn — Every American Family. Ready.</td></tr></table>
</td></tr></table></td></tr></table></body></html>"""


@router.post("/ccp/drill/run")
async def run_drill(req: DrillRequest, current_user: dict = Depends(get_current_user)):
    await _require_estate_access(req.estate_id, current_user)
    if not req.recipient_emails:
        raise HTTPException(status_code=400, detail="At least one recipient email is required")

    plan_label = req.plan_name or "your CarryOn contingency plan"
    sender_name = current_user.get("name") or current_user.get("email") or "A family member"
    html = _drill_html(plan_label, sender_name, req.custom_note)
    subject = f"⚠︎ Family Drill — {plan_label} (this is a practice run)"

    results = []
    for addr in req.recipient_emails:
        ok = await _send_email(addr, subject, html)
        results.append({"email": addr, "sent": ok})

    drill_id = str(uuid4())
    await db.ccp_drill_runs.insert_one(
        {
            "id": drill_id,
            "estate_id": req.estate_id,
            "plan_id": req.plan_id,
            "plan_name": plan_label,
            "channel": "email",
            "recipients": results,
            "custom_note": req.custom_note,
            "started_at": _now_iso(),
            "started_by": current_user["id"],
        }
    )
    return {"drill_id": drill_id, "results": results}


@router.get("/ccp/drill/history/{estate_id}")
async def drill_history(estate_id: str, current_user: dict = Depends(get_current_user)):
    await _require_estate_access(estate_id, current_user)
    cursor = db.ccp_drill_runs.find({"estate_id": estate_id}, {"_id": 0}).sort("started_at", -1).limit(20)
    return await cursor.to_list(20)


# ═══════════════════════════════════════════════════════════════════
# 6.  PLAN ACTIVATION — real-event broadcast via Resend email
# ═══════════════════════════════════════════════════════════════════
class ActivationStart(BaseModel):
    estate_id: str
    plan_id: str
    plan_name: str
    rendezvous_label: Optional[str] = None
    rendezvous_address: Optional[str] = None
    custom_instructions: Optional[str] = None
    recipient_emails: list[EmailStr] = []


def _activation_html(
    plan_name: str, sender: str, rendezvous: str | None, instructions: str | None, status_url: str
) -> str:
    rdv_block = (
        f'<tr><td style="padding:10px 14px;background:rgba(212,175,55,0.08);'
        f'border-left:3px solid #d4af37;color:#f8fafc;font-size:15px;">'
        f'<strong style="color:#d4af37;">Meetup:</strong> {rendezvous}</td></tr>'
        if rendezvous
        else ""
    )
    instr_block = f'<p style="color:#cbd5e1;margin:18px 0;line-height:1.6;">{instructions}</p>' if instructions else ""
    return f"""<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif;">
<table width="100%" style="background:#0b1120;padding:40px 20px;"><tr><td align="center">
<table width="540" style="max-width:540px;background:#0f1d35;border-radius:16px;border:1px solid #b91c1c;">
<tr><td style="padding:36px;">
<p style="margin:0 0 8px 0;font-size:11px;letter-spacing:2px;color:#f87171;font-weight:bold;">▣ ACTIVATION — REAL EVENT</p>
<h1 style="color:#f8fafc;margin:0 0 14px 0;font-size:22px;">{plan_name} has been activated</h1>
<p style="color:#cbd5e1;margin:0 0 16px 0;line-height:1.6;">
  <strong>{sender}</strong> activated this CarryOn contingency plan. This is not a drill.
</p>
<table width="100%" style="margin:18px 0;">{rdv_block}</table>
{instr_block}
<p style="color:#94a3b8;font-size:13px;margin:24px 0 8px 0;">Please confirm your status:</p>
<table width="100%"><tr><td align="center" style="padding:14px 0;">
  <a href="{status_url}" style="display:inline-block;background:#d4af37;color:#0b1120;font-size:15px;font-weight:bold;padding:14px 28px;border-radius:10px;text-decoration:none;">Confirm your status →</a>
</td></tr></table>
<table width="100%" style="margin-top:28px;padding-top:20px;border-top:1px solid #1e293b;">
<tr><td style="color:#64748b;font-size:11px;text-align:center;">CarryOn — Every American Family. Ready.</td></tr></table>
</td></tr></table></td></tr></table></body></html>"""


@router.post("/ccp/activation/start")
async def start_activation(req: ActivationStart, current_user: dict = Depends(get_current_user)):
    await _require_estate_access(req.estate_id, current_user)
    if not req.recipient_emails:
        raise HTTPException(status_code=400, detail="At least one recipient email is required")

    activation_id = str(uuid4())
    rendezvous = None
    if req.rendezvous_label or req.rendezvous_address:
        rendezvous = " — ".join([p for p in [req.rendezvous_label, req.rendezvous_address] if p])

    sender_name = current_user.get("name") or current_user.get("email") or "A family member"
    # Status confirmation link — points to the public status page mounted on
    # the frontend (see /ccp/status-confirm/:activation_id route).
    status_url = f"{FRONTEND_URL}/ccp/status-confirm/{activation_id}"

    html = _activation_html(req.plan_name, sender_name, rendezvous, req.custom_instructions, status_url)
    subject = f"▣ ACTIVATION — {req.plan_name}"

    results = []
    for addr in req.recipient_emails:
        ok = await _send_email(addr, subject, html)
        results.append({"email": addr, "sent": ok, "status": "pending"})

    await db.ccp_activations.insert_one(
        {
            "id": activation_id,
            "estate_id": req.estate_id,
            "plan_id": req.plan_id,
            "plan_name": req.plan_name,
            "rendezvous": rendezvous,
            "custom_instructions": req.custom_instructions,
            "channel": "email",
            "recipients": results,
            "status_responses": [],
            "started_at": _now_iso(),
            "started_by": current_user["id"],
            "ended_at": None,
        }
    )
    return {"activation_id": activation_id, "results": results, "status_url": status_url}


class ActivationStatusReport(BaseModel):
    activation_id: str
    email: EmailStr
    status: str  # safe | evacuating | en_route | need_help | sheltering
    note: Optional[str] = None


@router.post("/ccp/activation/status")  # pre-push-invariants: allow-public-mutation (signed activation link)
async def report_status(req: ActivationStatusReport):
    """Public endpoint (linked from activation email)."""
    await db.ccp_activations.update_one(
        {"id": req.activation_id},
        {
            "$push": {
                "status_responses": {
                    "email": req.email,
                    "status": req.status,
                    "note": req.note,
                    "reported_at": _now_iso(),
                }
            }
        },
    )
    return {"ok": True}


@router.post("/ccp/activation/end/{activation_id}")
async def end_activation(activation_id: str, current_user: dict = Depends(get_current_user)):
    act = await db.ccp_activations.find_one({"id": activation_id}, {"_id": 0})
    if not act:
        raise HTTPException(status_code=404, detail="Activation not found")
    await _require_estate_access(act["estate_id"], current_user)
    await db.ccp_activations.update_one(
        {"id": activation_id},
        {"$set": {"ended_at": _now_iso(), "ended_by": current_user["id"]}},
    )
    return {"ok": True}


@router.get("/ccp/activation/{activation_id}")
async def get_activation(activation_id: str, current_user: dict = Depends(get_current_user)):
    act = await db.ccp_activations.find_one({"id": activation_id}, {"_id": 0})
    if not act:
        raise HTTPException(status_code=404, detail="Activation not found")
    await _require_estate_access(act["estate_id"], current_user)
    return act


@router.get("/ccp/activations/{estate_id}")
async def list_activations(estate_id: str, current_user: dict = Depends(get_current_user)):
    await _require_estate_access(estate_id, current_user)
    cursor = db.ccp_activations.find({"estate_id": estate_id}, {"_id": 0}).sort("started_at", -1).limit(20)
    return await cursor.to_list(20)


# ═══════════════════════════════════════════════════════════════════
# 7.  READINESS SCORE — single number with breakdown
# ═══════════════════════════════════════════════════════════════════
@router.get("/ccp/readiness/{estate_id}")
async def readiness_score(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Compute a 0–100 readiness score for the family's CCP setup.

    Weighting (must total 100):
      • Has ≥ 1 plan ......................... 20
      • Household roster has ≥ 1 member ..... 15
      • Go-bag has ≥ 5 items ................. 15
      • No go-bag items expiring within 30 d  10
      • Rendezvous primary defined ........... 10
      • Out-of-area contact defined .......... 10
      • Drill run in the last 12 months ...... 10
      • Plan has linked SDV documents ........ 10
    """
    await _require_estate_access(estate_id, current_user)
    return await compute_ccp_readiness(estate_id)


async def compute_ccp_readiness(estate_id: str) -> dict:
    """Pure-compute CCP readiness — no auth gate. Called by the GET
    endpoint above AND by the Family Readiness Report PDF generator,
    so the ring on the CCP landing page and the score printed on the
    PDF are always derived from the exact same source of truth.

    Fixes the Feb 2026 mismatch where the PDF was calling
    `services.readiness.calculate_estate_readiness(...)` and reading
    a field that didn't exist (`overall` vs `overall_score`), which
    silently floored the printed score to 0% even when the landing
    ring showed 40+.
    """
    plans = await db.ccp_plans.find({"estate_id": estate_id}, {"_id": 0}).to_list(50)
    household = await db.ccp_household.find_one({"estate_id": estate_id}, {"_id": 0}) or {}
    go_bag = await db.ccp_go_bag.find_one({"estate_id": estate_id}, {"_id": 0}) or {}
    rendezvous = await db.ccp_rendezvous.find_one({"estate_id": estate_id}, {"_id": 0}) or {}
    out_of_area = await db.ccp_out_of_area.find_one({"estate_id": estate_id}, {"_id": 0}) or {}

    breakdown = []
    score = 0

    if plans:
        score += 20
        breakdown.append({"key": "has_plan", "label": "At least one contingency plan", "points": 20, "earned": 20})
    else:
        breakdown.append({"key": "has_plan", "label": "Create your first plan", "points": 20, "earned": 0})

    # Household roster — accept either the new beneficiary_ids selection
    # OR the legacy free-form members array (back-compat).
    roster_count = len(household.get("beneficiary_ids") or []) or len(household.get("members") or [])
    if roster_count > 0:
        score += 15
        breakdown.append({"key": "roster", "label": f"Household roster ({roster_count})", "points": 15, "earned": 15})
    else:
        breakdown.append({"key": "roster", "label": "Add your household roster", "points": 15, "earned": 0})

    items = go_bag.get("items") or []
    if len(items) >= 5:
        score += 15
        breakdown.append({"key": "go_bag", "label": f"Go-bag stocked ({len(items)} items)", "points": 15, "earned": 15})
    else:
        breakdown.append(
            {"key": "go_bag", "label": f"Stock go-bag (need ≥5 items, have {len(items)})", "points": 15, "earned": 0}
        )

    # Expiration check
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=30)
    expiring = []
    for it in items:
        exp = it.get("expires_at")
        if not exp:
            continue
        try:
            dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            if dt <= soon:
                expiring.append(it)
        except Exception:
            pass
    if items and not expiring:
        score += 10
        breakdown.append({"key": "fresh", "label": "Nothing expiring in 30 days", "points": 10, "earned": 10})
    elif items:
        breakdown.append(
            {
                "key": "fresh",
                "label": f"{len(expiring)} item(s) expiring within 30 days — rotate",
                "points": 10,
                "earned": 0,
            }
        )
    else:
        breakdown.append({"key": "fresh", "label": "Add expiration dates to go-bag items", "points": 10, "earned": 0})

    if rendezvous.get("primary_address"):
        score += 10
        breakdown.append({"key": "rendezvous", "label": "Primary meetup point set", "points": 10, "earned": 10})
    else:
        breakdown.append({"key": "rendezvous", "label": "Set your primary meetup point", "points": 10, "earned": 0})

    if out_of_area.get("name") and (out_of_area.get("phone") or out_of_area.get("email")):
        score += 10
        breakdown.append({"key": "out_of_area", "label": "Out-of-area relay contact set", "points": 10, "earned": 10})
    else:
        breakdown.append(
            {"key": "out_of_area", "label": "Designate an out-of-area relay contact", "points": 10, "earned": 0}
        )

    # Drill in last 12 months
    twelve_mo = now - timedelta(days=365)
    recent_drill = await db.ccp_drill_runs.find_one(
        {"estate_id": estate_id, "started_at": {"$gte": twelve_mo.isoformat()}},
        {"_id": 0, "id": 1, "started_at": 1},
    )
    if recent_drill:
        score += 10
        breakdown.append({"key": "drill", "label": "Drill run in the last 12 months", "points": 10, "earned": 10})
    else:
        breakdown.append(
            {"key": "drill", "label": "Run a family drill (no drills in 12 months)", "points": 10, "earned": 0}
        )

    any_linked_docs = any(p.get("linked_document_ids") for p in plans)
    if any_linked_docs:
        score += 10
        breakdown.append({"key": "linked_docs", "label": "Plan linked to vault documents", "points": 10, "earned": 10})
    else:
        breakdown.append(
            {"key": "linked_docs", "label": "Link SDV documents to your plan(s)", "points": 10, "earned": 0}
        )

    return {
        "estate_id": estate_id,
        "score": score,
        "max": 100,
        "label": _readiness_label(score),
        "breakdown": breakdown,
        "computed_at": _now_iso(),
    }


def _readiness_label(score: int) -> str:
    if score >= 85:
        return "Mission-Ready"
    if score >= 65:
        return "Well-Prepared"
    if score >= 40:
        return "Getting There"
    if score >= 15:
        return "Just Started"
    return "Unprepared"


# ═══════════════════════════════════════════════════════════════════
# 8.  AI RISK PROFILE — rank disaster types by likelihood for this zip
# ═══════════════════════════════════════════════════════════════════
DISASTER_CATALOG = [
    # Weather & climate
    "Hurricane",
    "Tornado",
    "Earthquake",
    "Flood",
    "Tsunami",
    "Wildfire",
    "House Fire",
    "Gas Leak",
    "Heat Wave",
    "Drought",
    "Winter Storm",
    "Avalanche",
    "Hailstorm",
    "Lightning Storm",
    "Volcanic Activity",
    "Landslide",
    # Infrastructure & utilities
    "Water Failure",
    "Power Outage",
    "Cyber Attack",
    "Chemical Spill",
    "Train Derailment",
    "Nuclear Event",
    # Health
    "Pandemic",
    "Medical Emergency",
    # Security & social
    "Home Invasion",
    "Active Shooter",
    "Terrorism",
    "Civil Unrest",
]


class RiskProfileRequest(BaseModel):
    estate_id: str
    zip_code: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None


# ─── Static risk-profile prompt (built ONCE at module import) ──────
#
# Why this lives at module scope: the prompt is ~1.6 KB of regional
# anchors that NEVER change between calls. Building it on every request
# wastes a few microseconds AND — more importantly — makes the prompt
# byte-stream non-identical at the leading characters, which defeats
# any prefix-based prompt cache the upstream provider offers.
#
# By emitting the same static prefix on every call we let xAI's input-
# token cache deduplicate the long opening, which during a busy demo
# day (hundreds of address swaps) is a real cost saving on top of
# slightly lower latency.
#
# The ONLY dynamic part is the household location string, which is
# appended at the very end as the final user instruction.
_REGIONAL_ANCHORS = (
    "REGIONAL HAZARD ANCHORS — apply these patterns when the household location matches:\n"
    "\n"
    "• CALIFORNIA (all metros — LA, SF Bay, San Diego, Sacramento, Inland Empire, Central Valley): "
    "Earthquake AND Wildfire MUST be in the top tier (San Andreas + WUI). "
    "Coastal CA also Tsunami + Landslide (post-wildfire slopes). "
    "Drought is chronic. Power Outage elevated (PSPS shutoffs in fire season).\n"
    "\n"
    "• PACIFIC NORTHWEST (Seattle, Portland, Tacoma, Olympia, Eugene, coastal WA/OR): "
    "Cascadia Subduction Zone means Earthquake + Tsunami MUST be top tier "
    "(USGS estimates 1-in-3 megaquake probability over 50 years). "
    "Volcanic Activity elevated within ~50 mi of Mt. Rainier, Mt. Hood, Mt. Baker, Mt. St. Helens. "
    "Wildfire elevated east of the Cascades. Heat Wave elevated (2021 heat dome).\n"
    "\n"
    "• ALASKA: Most seismic state in the U.S. — Earthquake top tier always. "
    "Tsunami coastal, Volcanic Activity, Avalanche, Winter Storm, Wildfire (interior summers) all elevated.\n"
    "\n"
    "• HAWAII: Volcanic Activity top tier on Big Island; Tsunami all islands; "
    "Hurricane (less frequent but possible); Wildfire (Maui Lahaina 2023 proved this); Landslide.\n"
    "\n"
    "• GULF COAST (TX coastal, LA, MS, AL, FL Panhandle): "
    "Hurricane AND Flood MUST be top tier. Heat Wave elevated. "
    "Chemical Spill elevated in Houston Ship Channel, Louisiana Cancer Alley, Mobile, Baton Rouge corridors. "
    "Tornado elevated (Dixie Alley overlap).\n"
    "\n"
    "• FLORIDA PENINSULA: Hurricane top tier. Lightning Storm top tier (FL is the lightning capital "
    "of the U.S. by strike density). Flood (storm surge + freshwater). Heat Wave south FL.\n"
    "\n"
    "• SOUTH ATLANTIC (GA, SC, NC, VA coast & piedmont): Hurricane elevated. "
    "Charleston SC has a historic major-earthquake record. Wildfire risk in NC/SC pine forests during drought.\n"
    "\n"
    "• MID-ATLANTIC (DE, MD, NJ, NY, PA east, DC): Hurricane (post-tropical impacts), Winter Storm, "
    "Civil Unrest in dense metros, Cyber Attack elevated (DC/NY are tier-1 targets), "
    "Terrorism awareness elevated (DC/NYC). Gas Leak elevated in older Boston/NYC/Philly housing stock.\n"
    "\n"
    "• NEW ENGLAND (MA, CT, RI, VT, NH, ME): Winter Storm top tier. Hurricane (Sandy + Bob proved it). "
    "Power Outage from ice storms. Gas Leak elevated in older Boston housing.\n"
    "\n"
    "• GREAT LAKES / INDUSTRIAL MIDWEST (MI, OH, IN, IL, WI, western PA): "
    "Winter Storm, Tornado (Ohio Valley supercell season), Train Derailment elevated "
    "(East Palestine 2023 — Norfolk Southern + CSX corridors blanket this region), "
    "Chemical Spill (industrial), Civil Unrest in Detroit/Chicago/Cleveland metros.\n"
    "\n"
    "• TORNADO ALLEY (TX, OK, KS, NE, IA, MO): Tornado MUST be top tier. "
    "Heat Wave elevated. Hailstorm top tier (Hail Alley). Drought (High Plains). "
    "Lightning Storm elevated.\n"
    "\n"
    "• DIXIE ALLEY (MS, AL, TN, AR, northern LA): Tornado MUST be top tier "
    "(deadlier than Tornado Alley — nocturnal, heavily-forested, manufactured-home density). "
    "Hurricane for Gulf states. New Madrid Seismic Zone: Memphis, Little Rock, "
    "western TN/KY/MO must rank Earthquake high.\n"
    "\n"
    "• MOUNTAIN WEST / ROCKIES (CO, WY, MT, ID, ND, SD, UT, NM, northern NV): "
    "Wildfire top tier, Winter Storm, Hailstorm (CO/WY/NE Hail Alley), "
    "Avalanche (mountain residences + backcountry rec), Drought. "
    "Utah Wasatch Fault — Salt Lake City must rank Earthquake high.\n"
    "\n"
    "• DESERT SOUTHWEST (AZ, NM, southern NV, west TX): "
    "Heat Wave MUST be top tier (Phoenix routinely kills hundreds per heat season). "
    "Drought chronic. Wildfire. Flash Flood during monsoon. Lightning Storm during monsoon. "
    "Power Outage elevated (AC overload).\n"
    "\n"
    "UNIVERSAL CALIBRATIONS — apply regardless of region:\n"
    "• Cyber Attack: every internet-connected household is exposed (phishing, ransomware, identity); "
    "  baseline medium tier nationwide.\n"
    "• Medical Emergency: every household needs a plan — baseline medium tier.\n"
    "• Active Shooter: medium tier in any populated area. Do NOT bury it just because it's uncomfortable; "
    "  schools, workplaces, places of worship, and entertainment districts are all real exposure surfaces.\n"
    "• Pandemic: medium tier nationwide post-COVID; slightly elevated in dense urban centers, "
    "  international port cities, and agricultural-livestock counties (zoonotic spillover risk).\n"
    "• Power Outage: elevated EVERYWHERE — the U.S. grid is aging. Texas (ERCOT isolation), "
    "  California (PSPS), and the Northeast (winter storms) get an extra bump.\n"
    "• Home Invasion / House Fire / Gas Leak: household-scale events that occur nationwide; "
    "  rank by housing-stock age, population density, and known local crime patterns.\n"
    "• Nuclear Event: LOW for most addresses. Elevated within ~50 mi of an operating reactor "
    "  (PA, IL, SC, AL, GA, TN, NY, MI, CT, NJ, NC, FL, VA, etc.) or near strategic military targets "
    "  (DC metro, Norfolk VA, San Diego CA, Omaha NE, Cheyenne WY).\n"
    "• Train Derailment: elevated within ~1 mi of Class I freight main lines "
    "  (Norfolk Southern, CSX, BNSF, Union Pacific, Canadian Pacific Kansas City) — "
    "  this covers most of OH, PA, IN, IL, TX, plus rail-hub counties nationwide.\n"
    "• Water Failure: chronic risk elevated in Jackson MS, Flint MI, Newark NJ, "
    "  parts of TX (winter 2021), parts of CA Central Valley; trending up nationally as infrastructure ages.\n"
)

_RISK_PROMPT_STATIC = (
    "You are a FEMA-style risk analyst with deep knowledge of U.S. regional hazards. "
    "Your data sources include: NOAA climate + storm climatologies, USGS seismic + volcanic hazard maps, "
    "FEMA disaster-declaration history (1953–present), FBI/DHS threat assessments, "
    "Class I freight corridor maps (Norfolk Southern, CSX, BNSF, Union Pacific), EPA chemical-facility "
    "registries, USDA wildland-urban-interface mapping, and CDC heat-vulnerability indices.\n"
    "\n"
    f"You rank a fixed catalog of {len(DISASTER_CATALOG)} potential emergencies from MOST LIKELY to "
    "LEAST LIKELY for a specific U.S. household. The catalog is fixed; the only thing that changes "
    "between calls is the household location.\n"
    "\n"
    f"{_REGIONAL_ANCHORS}\n"
    "INTERPOLATION RULES:\n"
    "• If the household is in a sub-region not explicitly listed, interpolate from the nearest anchor region.\n"
    "• Suburban households inherit the same hazard profile as their nearest metro.\n"
    "• Rural households in a state get the state-level baseline + any specific corridor exposure "
    "  (freight rail / chemical plant / nuclear reactor / fault line / wildland-urban interface).\n"
    "• When the location is ambiguous or unknown, default to a national-median ranking and lean toward "
    "  the universal calibrations above.\n"
    "\n"
    "OUTPUT RULES:\n"
    "• Return STRICT JSON only, no prose, no markdown fences.\n"
    '• Shape: {"ranked":[{"name":"...","tier":"high|medium|low","reason":"≤15 words"}]}.\n'
    f"• Include ALL {len(DISASTER_CATALOG)} names exactly as listed. Do not omit any.\n"
    "• `reason` must reference a SPECIFIC local factor (named fault, named rail line, named industry, "
    "  named climate pattern, named historical event, etc.) — not a generic platitude.\n"
    "• Distribute tiers honestly: not every category can be high; not every uncomfortable category should be low.\n"
    "\n"
    f"Use ALL of these names exactly, in your output: {', '.join(DISASTER_CATALOG)}."
)


@router.post("/ccp/risk-profile")
async def risk_profile(req: RiskProfileRequest, current_user: dict = Depends(get_current_user)):
    await _require_estate_access(req.estate_id, current_user)

    # Address-aware cache key (Feb 2026 founder ask): if the household
    # address changes mid-demo or mid-session, the prior ranking is now
    # stale — Phoenix's "Heat Wave on top" is wrong the second you re-
    # pitch to a Seattle prospect. We key the cache row on (estate_id,
    # location_key) so changing the address forces a fresh xAI call.
    # Empty/unknown locations share a single "unknown" bucket so we
    # don't burn tokens re-ranking the same featureless query.
    location_key = (
        "|".join(
            [
                (req.city or "").strip().lower(),
                (req.state or "").strip().lower(),
                (req.zip_code or "").strip().lower(),
            ]
        )
        or "unknown"
    )

    # Try cache (1 day fresh) so the picker is instant on second open.
    cached = await db.ccp_risk_profile.find_one(
        {"estate_id": req.estate_id, "location_key": location_key},
        {"_id": 0},
    )
    if cached:
        try:
            ts = datetime.fromisoformat(cached["computed_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - ts < timedelta(days=1):
                return cached
        except Exception:
            pass

    location_hint = ", ".join([p for p in [req.city, req.state, req.zip_code] if p]) or "unknown US location"
    # Static prefix is identical across all calls (cached at module
    # import) → xAI's input-token cache can deduplicate it. Only the
    # location tail varies per request.
    prompt = (
        f'{_RISK_PROMPT_STATIC}\n\nNow rank the catalog for this household: "{location_hint}". Return only the JSON.'
    )

    try:
        import time as _time

        _t0 = _time.time()
        resp = await _asyncio.to_thread(
            xai_client.chat.completions.create,
            model="grok-3-mini",  # Risk-ranking is a simple classification
            messages=[{"role": "user", "content": prompt}],  # task; mini returns in 3-5s vs grok-4-latest's 80s+.
            temperature=0.2,
            max_tokens=1800,
        )
        try:
            from services.llm_cost_ledger import record_xai_response as _rec

            await _rec(
                resp,
                endpoint="ccp.risk_profile",
                model="grok-3-mini",
                user_id=current_user.get("id"),
                estate_id=req.estate_id,
                started_at=_t0,
            )
        except Exception:
            pass
        text = (resp.choices[0].message.content or "").strip()
        # strip markdown fences if present
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
        parsed = _json.loads(text)
        ranked = parsed.get("ranked") or []
        # sanity-filter unknown names
        ranked = [r for r in ranked if r.get("name") in DISASTER_CATALOG]
    except Exception as e:
        logger.warning("risk-profile xAI fallback: %s", e)
        # Conservative fallback: alphabetical, all medium tier
        ranked = [
            {"name": n, "tier": "medium", "reason": "Default ranking — set location for personalized risk."}
            for n in DISASTER_CATALOG
        ]

    result = {
        "estate_id": req.estate_id,
        "location_key": location_key,
        "location_hint": location_hint,
        "ranked": ranked,
        "computed_at": _now_iso(),
    }
    await db.ccp_risk_profile.update_one(
        {"estate_id": req.estate_id, "location_key": location_key},
        {"$set": result},
        upsert=True,
    )
    return result
