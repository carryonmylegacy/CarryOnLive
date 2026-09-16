"""CarryOn™ — Real member testimonials (submission → founder moderation → public display) and live platform stats.
No testimonial is ever shown publicly until an admin approves it."""

import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from config import db, logger
from guards import require_admin, require_admin_scope
from services.email import is_valid_email

router = APIRouter()

ROLES = {"benefactor", "beneficiary", "hospice_family", "military", "other"}
STATUSES = {"pending", "approved", "rejected"}
LIVE_STATS_MIN_FAMILIES = 25
_stats_cache: dict = {"at": 0.0, "data": None}


class TestimonialSubmission(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    location: str = Field(default="", max_length=60)
    role: str = "benefactor"
    quote: str = Field(min_length=40, max_length=600)
    email: str
    member_since: Optional[str] = Field(default=None, max_length=20)
    consent: bool


class TestimonialReview(BaseModel):
    status: Optional[str] = None
    display_name: Optional[str] = Field(default=None, max_length=60)
    quote: Optional[str] = Field(default=None, min_length=20, max_length=600)
    featured: Optional[bool] = None


def public_view(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "display_name": doc.get("display_name") or doc["name"],
        "location": doc.get("location", ""),
        "role": doc.get("role", "benefactor"),
        "quote": doc["quote"],
        "member_since": doc.get("member_since"),
        "verified_member": bool(doc.get("verified_member")),
        "featured": bool(doc.get("featured")),
        "approved_at": doc.get("approved_at"),
    }


@router.post("/testimonials", status_code=201)
async def submit_testimonial(body: TestimonialSubmission, request: Request):
    if not body.consent:
        raise HTTPException(status_code=400, detail="Please confirm you're happy for us to publish your words")
    email = body.email.strip().lower()
    if not is_valid_email(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    if body.role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    recent = await db.testimonials.count_documents({"email": email, "status": "pending"})
    if recent >= 3:
        raise HTTPException(status_code=429, detail="You already have stories waiting for review — thank you!")
    is_member = await db.users.find_one({"email": email}, {"_id": 1}) is not None
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "display_name": body.name.strip(),
        "location": body.location.strip(),
        "role": body.role,
        "quote": body.quote.strip(),
        "email": email,
        "member_since": (body.member_since or "").strip() or None,
        "verified_member": is_member,
        "consent": True,
        "status": "pending",
        "featured": False,
        "user_agent": request.headers.get("user-agent", "")[:200],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "reviewed_by": None,
    }
    await db.testimonials.insert_one(doc)
    logger.info(f"Testimonial submitted: {doc['id']} verified_member={is_member}")
    return {"id": doc["id"], "status": "pending", "verified_member": is_member}


@router.get("/testimonials")
async def list_public_testimonials(limit: int = 12):
    cursor = (
        db.testimonials.find({"status": "approved"}, {"_id": 0})
        .sort([("featured", -1), ("approved_at", -1)])
        .limit(min(limit, 50))
    )
    items = [public_view(d) async for d in cursor]
    total = await db.testimonials.count_documents({"status": "approved"})
    return {"items": items, "total": total}


@router.get("/admin/testimonials")
async def list_all_testimonials(status: Optional[str] = None, current_user: dict = Depends(require_admin)):
    require_admin_scope(current_user, ["marketing"])
    query = {"status": status} if status in STATUSES else {}
    items = await db.testimonials.find(query, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
    counts_raw = await db.testimonials.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}]).to_list(5)
    return {"items": items, "counts": {c["_id"]: c["n"] for c in counts_raw}}


@router.patch("/admin/testimonials/{testimonial_id}")
async def review_testimonial(testimonial_id: str, body: TestimonialReview, current_user: dict = Depends(require_admin)):
    require_admin_scope(current_user, ["marketing"])
    update = {}
    if body.status is not None:
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        update["status"] = body.status
        update["reviewed_by"] = current_user.get("email")
        update["approved_at"] = datetime.now(timezone.utc).isoformat() if body.status == "approved" else None
    if body.display_name is not None:
        update["display_name"] = body.display_name.strip()
    if body.quote is not None:
        update["quote"] = body.quote.strip()
    if body.featured is not None:
        update["featured"] = body.featured
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = await db.testimonials.find_one_and_update(
        {"id": testimonial_id}, {"$set": update}, projection={"_id": 0}, return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    return result


@router.delete("/admin/testimonials/{testimonial_id}")
async def delete_testimonial(testimonial_id: str, current_user: dict = Depends(require_admin)):
    require_admin_scope(current_user, ["marketing"])
    result = await db.testimonials.delete_one({"id": testimonial_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    return {"ok": True}


# ===================== LIVE PLATFORM STATS =====================


async def compute_platform_stats() -> dict:
    families = await db.estates.count_documents({})
    return {
        "families": families,
        "documents": await db.documents.count_documents({}),
        "messages": await db.messages.count_documents({}),
        "checklist_items": await db.checklists.count_documents({}),
        "people_invited": await db.beneficiaries.count_documents({}),
    }


@router.get("/public/platform-stats")
async def public_platform_stats():
    """Real counts from the live database. Hidden (visible=false) until the founder turns them on or >= 25 families exist."""
    now = time.time()
    if _stats_cache["data"] is None or now - _stats_cache["at"] > 600:
        _stats_cache["data"] = await compute_platform_stats()
        _stats_cache["at"] = now
    stats = _stats_cache["data"]
    settings = await db.platform_settings.find_one({"_id": "global"}, {"show_live_stats": 1}) or {}
    mode = settings.get("show_live_stats", "auto")
    visible = mode == "on" or (mode == "auto" and stats["families"] >= LIVE_STATS_MIN_FAMILIES)
    return {
        **stats,
        "visible": visible,
        "mode": mode,
        "updated_at": datetime.fromtimestamp(_stats_cache["at"], tz=timezone.utc).isoformat(),
    }
