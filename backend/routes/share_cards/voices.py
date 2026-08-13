"""Share Cards — Voices management (admin CRUD, public listing, email moderation)."""

import hashlib
import io
import csv
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Query, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from config import db
from guards import check_founder_role
from utils import get_current_user

from ._helpers import (
    _decode_voice_action_token,
    _moderation_base_url,
    _notify_member_approved,
    router,
)


class VoiceEntry(BaseModel):
    id: str
    first_name: str
    quote: str
    variant: str
    created_at: str
    featured: bool = False
    approval_status: str = "approved"
    is_seed: bool = False


class VoicesResponse(BaseModel):
    total: int
    items: list[VoiceEntry]


@router.get("/admin/voices", response_model=VoicesResponse)
async def list_voices(
    current_user: dict = Depends(get_current_user),
    q: str = Query("", max_length=80),
    variant: str = Query("", pattern="^(fc|sub|)$"),
    status: str = Query("", pattern="^(pending|approved|rejected|)$"),
    featured_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    check_founder_role(current_user)
    mongo_q: dict = {"consent_public": True}
    if variant in ("fc", "sub"):
        mongo_q["variant"] = variant
    if q.strip():
        mongo_q["quote"] = {"$regex": q.strip(), "$options": "i"}
    if featured_only:
        mongo_q["featured"] = True
    if status:
        mongo_q["approval_status"] = status

    total = await db.share_quote_submissions.count_documents(mongo_q)
    cursor = (
        db.share_quote_submissions.find(
            mongo_q,
            {
                "_id": 0,
                "id": 1,
                "first_name": 1,
                "quote": 1,
                "variant": 1,
                "created_at": 1,
                "featured": 1,
                "approval_status": 1,
                "is_seed": 1,
            },
        )
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
    )
    items = [
        VoiceEntry(**{"featured": False, "approval_status": "approved", "is_seed": False, **doc})
        async for doc in cursor
    ]
    return VoicesResponse(total=total, items=items)


@router.get("/admin/voices/pending-count")
async def pending_count(current_user: dict = Depends(get_current_user)):
    check_founder_role(current_user)
    n = await db.share_quote_submissions.count_documents({"consent_public": True, "approval_status": "pending"})
    return {"pending": n}


@router.get("/voices/public", response_model=VoicesResponse)
async def list_public_voices(limit: int = Query(60, ge=1, le=200)):
    mongo_q = {"consent_public": True, "approval_status": "approved"}
    cursor = (
        db.share_quote_submissions.find(
            mongo_q,
            {
                "_id": 0,
                "id": 1,
                "first_name": 1,
                "quote": 1,
                "variant": 1,
                "created_at": 1,
                "featured": 1,
                "is_seed": 1,
            },
        )
        .sort([("featured", -1), ("created_at", -1)])
        .limit(limit)
    )
    items = [
        VoiceEntry(**{"approval_status": "approved", "featured": False, "is_seed": False, **doc})
        async for doc in cursor
    ]
    return VoicesResponse(total=len(items), items=items)


@router.patch("/admin/voices/{submission_id}/feature")
async def toggle_feature(
    submission_id: str,
    featured: bool = Query(...),
    current_user: dict = Depends(get_current_user),
):
    check_founder_role(current_user)
    if not submission_id or len(submission_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid submission id")
    res = await db.share_quote_submissions.update_one({"id": submission_id}, {"$set": {"featured": bool(featured)}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Submission not found")
    return {"id": submission_id, "featured": bool(featured)}


@router.patch("/admin/voices/{submission_id}/approve")
async def approve_voice(
    submission_id: str,
    feature: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    check_founder_role(current_user)
    if not submission_id or len(submission_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid submission id")
    update = {"approval_status": "approved"}
    if feature:
        update["featured"] = True
    res = await db.share_quote_submissions.update_one(
        {"id": submission_id},
        {"$set": update, "$currentDate": {"approved_at": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Submission not found")
    await _notify_member_approved(submission_id, featured=bool(feature))
    return {"id": submission_id, "approval_status": "approved", "featured": feature}


@router.patch("/admin/voices/{submission_id}/reject")
async def reject_voice(submission_id: str, current_user: dict = Depends(get_current_user)):
    check_founder_role(current_user)
    if not submission_id or len(submission_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid submission id")
    res = await db.share_quote_submissions.update_one(
        {"id": submission_id},
        {"$set": {"approval_status": "rejected", "featured": False}, "$currentDate": {"rejected_at": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Submission not found")
    return {"id": submission_id, "approval_status": "rejected"}


def _moderation_result_page(*, success, headline, sub, portal_url, accent="#d4af37"):
    icon = "✓" if success else "⚠"
    return f"""<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>CarryOn — Voices moderation</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;1,600&family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
  <style>
    body{{margin:0;min-height:100vh;background:#080e1a;color:#e8ecf4;font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;}}
    .card{{max-width:520px;width:100%;background:#0b1221;border:1px solid #1c2740;border-radius:20px;padding:36px 28px;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,0.35);}}
    .badge{{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:{accent};color:#080e1a;font-size:28px;font-weight:800;margin-bottom:18px;}}
    h1{{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:34px;line-height:1.15;margin:0 0 10px;color:#f5f1e6;}}
    h1 em{{font-style:italic;color:{accent};}}
    p{{font-size:15px;line-height:1.55;color:#9aa5b9;margin:0 0 22px;}}
    a.btn{{display:inline-block;padding:11px 22px;background:{accent};color:#080e1a;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;}}
    .hint{{font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8b6b1f;margin:20px 0 0;}}
  </style>
</head>
<body><div class="card">
  <div class="badge">{icon}</div>
  <h1>{headline}</h1><p>{sub}</p>
  <a class="btn" href="{portal_url}/admin/voices">Open Voices Admin</a>
  <div class="hint">CarryOn Founder Portal</div>
</div></body></html>"""


@router.get("/voices/moderate", response_class=HTMLResponse)
async def moderate_voice_via_email(token: str = Query(..., min_length=20, max_length=2048)):
    portal_url = _moderation_base_url()
    try:
        payload = _decode_voice_action_token(token)
    except HTTPException as e:
        return HTMLResponse(
            status_code=e.status_code,
            content=_moderation_result_page(
                success=False,
                headline="Link no longer valid",
                sub=str(e.detail),
                portal_url=portal_url,
                accent="#ef4444",
            ),
        )

    submission_id = payload["sub"]
    action = payload["act"]

    doc = await db.share_quote_submissions.find_one(
        {"id": submission_id}, {"_id": 0, "id": 1, "first_name": 1, "approval_status": 1, "variant": 1}
    )
    if not doc:
        return HTMLResponse(
            status_code=404,
            content=_moderation_result_page(
                success=False,
                headline="Submission not found",
                sub="This quote may have been redacted.",
                portal_url=portal_url,
                accent="#ef4444",
            ),
        )

    first_name = doc.get("first_name") or "this member"
    current_status = doc.get("approval_status") or "pending"

    if action in ("approve_feature", "approve") and current_status == "approved":
        return HTMLResponse(
            _moderation_result_page(
                success=True,
                headline=f"Already approved — <em>{first_name}</em>",
                sub="This quote was approved previously. No change was made.",
                portal_url=portal_url,
            )
        )
    if action == "reject" and current_status == "rejected":
        return HTMLResponse(
            _moderation_result_page(
                success=True,
                headline="Already rejected",
                sub="This quote is already hidden. No change was made.",
                portal_url=portal_url,
                accent="#ef4444",
            )
        )

    if action == "approve_feature":
        await db.share_quote_submissions.update_one(
            {"id": submission_id},
            {"$set": {"approval_status": "approved", "featured": True}, "$currentDate": {"approved_at": True}},
        )
        await _notify_member_approved(submission_id, featured=True)
        return HTMLResponse(
            _moderation_result_page(
                success=True,
                headline=f"Approved &amp; featured — <em>{first_name}</em>",
                sub="This quote is now live on /voices and will appear in the home rotation strip.",
                portal_url=portal_url,
            )
        )
    if action == "approve":
        await db.share_quote_submissions.update_one(
            {"id": submission_id},
            {"$set": {"approval_status": "approved"}, "$currentDate": {"approved_at": True}},
        )
        await _notify_member_approved(submission_id, featured=False)
        return HTMLResponse(
            _moderation_result_page(
                success=True,
                headline=f"Approved — <em>{first_name}</em>",
                sub="This quote is approved. Open the portal to toggle Feature when you're ready.",
                portal_url=portal_url,
            )
        )

    await db.share_quote_submissions.update_one(
        {"id": submission_id},
        {"$set": {"approval_status": "rejected", "featured": False}, "$currentDate": {"rejected_at": True}},
    )
    return HTMLResponse(
        _moderation_result_page(
            success=True,
            headline="Rejected",
            sub=f"{first_name}'s quote has been hidden permanently. The record is kept for audit.",
            portal_url=portal_url,
            accent="#ef4444",
        )
    )


_SEED_VOICES = [
    ("fc", "Marcus", "My dad left us with a shoebox of papers and three weeks of chaos. My kids will never have that."),
    (
        "fc",
        "Elena",
        "I'm the organized one in this family. I finally made it count for something beyond birthday parties.",
    ),
    ("fc", "David", "My wife kept saying we should. CarryOn is the first thing I've actually done."),
    ("fc", "Priya", "I don't want my funeral to be the first time my brother sees my handwriting."),
    ("fc", "Hannah", "I'm fifty-two. My mom's seventy-nine. It's time I led."),
    ("fc", "Ray", "My whole career was contingency planning. It's embarrassing it took me this long to do it at home."),
    ("fc", "Trisha", "I'm the family CFO whether I wanted the job or not. This just gave me the office."),
    ("sub", "Jason", "Before CarryOn: four passwords on sticky notes. After: one place my wife can find them."),
    ("sub", "Sarah", "My doctor asked if my family knew my wishes. I didn't have a good answer. Now I do."),
    ("sub", "Omar", "I did this on a Saturday morning in under two hours. Easiest adult thing I've ever done."),
    ("sub", "Nadia", "I travel a lot. My girls have peace of mind now. So do I."),
    ("sub", "Kevin", "I'm not ready for the worst. But my family is."),
    ("sub", "Luis", "Setting this up was the first thing my wife and I agreed on in a month."),
    ("sub", "Mariana", "I stopped carrying the anxiety alone."),
]


@router.post("/admin/voices/seed")
async def seed_voices(
    current_user: dict = Depends(get_current_user),
    feature_all: bool = Query(True),
):
    check_founder_role(current_user)
    inserted = 0
    updated = 0
    for variant, name, quote in _SEED_VOICES:
        seed_id = "seed-" + hashlib.sha256(f"{variant}|{name}|{quote}".encode()).hexdigest()[:18]
        doc = {
            "id": seed_id,
            "user_id": "__seed__",
            "variant": variant,
            "first_name": name,
            "quote": quote,
            "consent_public": True,
            "dedup_hash": seed_id,
            "approval_status": "approved",
            "featured": bool(feature_all),
            "is_seed": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        res = await db.share_quote_submissions.update_one({"id": seed_id}, {"$set": doc}, upsert=True)
        if res.upserted_id:
            inserted += 1
        elif res.modified_count:
            updated += 1
    return {"inserted": inserted, "updated": updated, "total": len(_SEED_VOICES)}


@router.get("/admin/voices/export")
async def export_voices_csv(current_user: dict = Depends(get_current_user)):
    check_founder_role(current_user)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "first_name", "variant", "quote", "created_at"])
    cursor = db.share_quote_submissions.find(
        {"consent_public": True},
        {"_id": 0, "id": 1, "first_name": 1, "variant": 1, "quote": 1, "created_at": 1},
    ).sort("created_at", -1)
    async for doc in cursor:
        w.writerow([doc["id"], doc["first_name"], doc["variant"], doc["quote"], doc["created_at"]])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="carryon-voices.csv"', "Cache-Control": "no-store"},
    )


@router.delete("/admin/voices/{submission_id}")
async def delete_voice(submission_id: str, current_user: dict = Depends(get_current_user)):
    check_founder_role(current_user)
    if not submission_id or len(submission_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid submission id")
    res = await db.share_quote_submissions.delete_one({"id": submission_id})  # hk-25: reviewed
    return {"deleted": res.deleted_count}
