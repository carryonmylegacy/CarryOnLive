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
# 1.  HOUSEHOLD ROSTER
# ═══════════════════════════════════════════════════════════════════
class HouseholdMember(BaseModel):
    id: Optional[str] = None
    name: str
    role: str = "adult"  # adult | child | elderly | pet | dependent
    age: Optional[int] = None
    relationship: Optional[str] = None  # spouse, son, daughter, dog, etc.
    medical_conditions: Optional[str] = None
    allergies: Optional[str] = None
    prescriptions: Optional[str] = None
    blood_type: Optional[str] = None
    primary_doctor: Optional[str] = None
    school_or_employer: Optional[str] = None
    notes: Optional[str] = None


@router.get("/ccp/household/{estate_id}")
async def get_household(estate_id: str, current_user: dict = Depends(get_current_user)):
    await _require_estate_access(estate_id, current_user)
    doc = await db.ccp_household.find_one({"estate_id": estate_id}, {"_id": 0})
    if not doc:
        return {"estate_id": estate_id, "members": []}
    return doc


@router.put("/ccp/household/{estate_id}")
async def upsert_household(
    estate_id: str,
    members: list[HouseholdMember],
    current_user: dict = Depends(get_current_user),
):
    await _require_estate_access(estate_id, current_user)
    cleaned = []
    for m in members:
        d = m.model_dump()
        d["id"] = d.get("id") or str(uuid4())
        cleaned.append(d)
    await db.ccp_household.update_one(
        {"estate_id": estate_id},
        {
            "$set": {
                "estate_id": estate_id,
                "members": cleaned,
                "updated_at": _now_iso(),
                "updated_by": current_user["id"],
            }
        },
        upsert=True,
    )
    return {"estate_id": estate_id, "members": cleaned}


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


@router.post("/ccp/activation/status")
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

    members = household.get("members") or []
    if members:
        score += 15
        breakdown.append({"key": "roster", "label": f"Household roster ({len(members)})", "points": 15, "earned": 15})
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
        {"_id": 0, "started_at": 1},
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
    "Hurricane",
    "Tornado",
    "Earthquake",
    "Flood",
    "Wildfire",
    "House Fire",
    "Nuclear Event",
    "Winter Storm",
    "Power Outage",
    "Terrorism",
    "Pandemic",
    "Civil Unrest",
    "Water Failure",
    "Chemical Spill",
    "Home Invasion",
    "Tsunami",
    "Cyber Attack",
]


class RiskProfileRequest(BaseModel):
    estate_id: str
    zip_code: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None


@router.post("/ccp/risk-profile")
async def risk_profile(req: RiskProfileRequest, current_user: dict = Depends(get_current_user)):
    await _require_estate_access(req.estate_id, current_user)

    # Try cache (1 day fresh) so the picker is instant on second open.
    cached = await db.ccp_risk_profile.find_one({"estate_id": req.estate_id}, {"_id": 0})
    if cached:
        try:
            ts = datetime.fromisoformat(cached["computed_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - ts < timedelta(days=1):
                return cached
        except Exception:
            pass

    location_hint = ", ".join([p for p in [req.city, req.state, req.zip_code] if p]) or "unknown US location"
    catalog = ", ".join(DISASTER_CATALOG)
    prompt = (
        f'You are a FEMA-style risk analyst. For a household located at "{location_hint}", '
        f"rank the following 17 potential emergencies from MOST LIKELY to LEAST LIKELY, "
        f"considering geography, climate, infrastructure, and population density. "
        f"Return STRICT JSON only, no prose, in the shape: "
        f'{{"ranked":[{{"name":"...","tier":"high|medium|low","reason":"≤12 words"}}]}}. '
        f"Use ALL of these names exactly: {catalog}."
    )

    try:
        resp = await _asyncio.to_thread(
            xai_client.chat.completions.create,
            model="grok-3-mini",  # Risk-ranking is a simple classification
            messages=[{"role": "user", "content": prompt}],  # task; mini returns in 3-5s vs grok-4-latest's 80s+.
            temperature=0.2,
            max_tokens=900,
        )
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
        "location_hint": location_hint,
        "ranked": ranked,
        "computed_at": _now_iso(),
    }
    await db.ccp_risk_profile.update_one(
        {"estate_id": req.estate_id},
        {"$set": result},
        upsert=True,
    )
    return result
