"""CarryOn™ — Readiness Quiz: anonymous result tracking, email follow-up, founder analytics."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from config import db, logger
from guards import require_admin, require_admin_scope
from services.email import is_valid_email, send_email

router = APIRouter()

APP_URL = "https://carryon.us"

# Mirrors QUESTIONS in frontend/src/components/landing/ReadinessQuiz.js (order matters)
QUESTIONS = [
    {
        "label": "Where the will is",
        "fix": "Put your will (or a note that you still need one) in the Document Vault and share it with one person.",
    },
    {
        "label": "Life insurance & claims number",
        "fix": "Upload the policy. Estate Guardian\u2122 pulls the claims number straight into your family\u2019s first-steps list.",
    },
    {
        "label": "Phone, email & bank access",
        "fix": "Save those logins in Passwords & Accounts and assign each one to a specific person.",
    },
    {"label": "Who to call first", "fix": "Build your Who-to-Call list, with a ranked backup for each person."},
    {
        "label": "First-72-hours checklist",
        "fix": "Start your What-to-Do-First checklist. CarryOn drafts it from your documents; you finish it in your words.",
    },
    {"label": "Papers in one place", "fix": "Move everything into one encrypted vault your family can actually reach."},
    {"label": "Messages for loved ones", "fix": "Record one Milestone Message. It takes about two minutes."},
    {
        "label": "Someone can pay the bills",
        "fix": "Set up Emergency Access and list your recurring bills in the Financial Portal.",
    },
]
MAX_PER_ANSWER = 2
TIERS = [
    (75, "ahead", "You\u2019re ahead of most families."),
    (40, "gaps", "You\u2019ve started. There are gaps."),
    (0, "searching", "Your family would be searching."),
]


class QuizSubmission(BaseModel):
    answers: list[int] = Field(min_length=len(QUESTIONS), max_length=len(QUESTIONS))
    utm: dict = Field(default_factory=dict)
    page: str = ""


class QuizEmailRequest(BaseModel):
    email: str


def score_for(answers: list[int]) -> int:
    return round(sum(answers) / (len(QUESTIONS) * MAX_PER_ANSWER) * 100)


def tier_for(score: int):
    return next(t for t in TIERS if score >= t[0])


def fixes_for(answers: list[int]) -> list[str]:
    weak = sorted((v, i) for i, v in enumerate(answers) if v < MAX_PER_ANSWER)
    return [QUESTIONS[i]["fix"] for _, i in weak[:3]]


def device_type_from(request: Request) -> str:
    ua = request.headers.get("user-agent", "").lower()
    if "ipad" in ua or "tablet" in ua:
        return "tablet"
    if "mobile" in ua or "iphone" in ua or "android" in ua:
        return "mobile"
    return "desktop"


def build_quiz_email(score: int, tier_title: str, fixes: list[str]) -> tuple[str, str]:
    subject = f"Your family readiness score: {score}/100"
    fix_items = (
        "".join(f'<li style="margin-bottom: 10px;">{f}</li>' for f in fixes)
        or "<li>Put it all in one place your family can reach \u2014 not just in your head or a drawer.</li>"
    )
    cta = f"{APP_URL}/start?utm_source=readiness_quiz&utm_medium=email&utm_content=score_{score}"
    html = f"""
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0F1629; color: #F1F3F8; border-radius: 16px; overflow: hidden;">
      <div style="padding: 40px 32px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.07);">
        <img src="{APP_URL}/carryon-logo.jpg" alt="CarryOn\u2122" style="width: 80px; height: auto; margin-bottom: 16px;" />
        <p style="color: #A0AABF; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 8px;">Your family readiness score</p>
        <h1 style="font-size: 48px; margin: 0; color: #d4af37;">{score}<span style="font-size: 20px; color: #A0AABF;">/100</span></h1>
        <p style="color: #F1F3F8; font-size: 18px; font-weight: bold; margin: 12px 0 0;">{tier_title}</p>
      </div>
      <div style="padding: 32px;">
        <p style="color: #d4af37; font-weight: bold; font-size: 14px; margin: 0 0 12px;">Fix these first</p>
        <ol style="color: #A0AABF; font-size: 14px; padding-left: 20px; margin: 0 0 24px; line-height: 1.6;">
          {fix_items}
        </ol>
        <p style="color: #A0AABF; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Every one of these takes minutes, not weekends. CarryOn\u2122 is one secure place for your documents, passwords, who to call first, and what to do next \u2014 so your family can handle what comes next instead of searching.
        </p>
        <div style="text-align: center;">
          <a href="{cta}" style="display: inline-block; padding: 14px 32px; background: #d4af37; color: #0F1629; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 14px;">
            Start fixing these
          </a>
          <p style="color: #525C72; font-size: 12px; margin: 12px 0 0;">Every plan starts with an exploration period. Cancel anytime.</p>
        </div>
      </div>
      <div style="padding: 20px 32px; text-align: center; border-top: 1px solid rgba(255,255,255,0.07);">
        <p style="color: #525C72; font-size: 11px; margin: 0;">You asked for this score on carryon.us. We may send occasional CarryOn\u2122 updates \u2014 reply "unsubscribe" to opt out anytime.</p>
        <p style="color: #525C72; font-size: 11px; margin: 4px 0 0;">CarryOn Enterprises Inc \u00b7 1550 Wilson Boulevard, 7th Floor, Arlington, VA 22209</p>
      </div>
    </div>
    """
    return subject, html


@router.post("/quiz/results")
async def submit_quiz(body: QuizSubmission, request: Request):
    if any(v not in (0, 1, 2) for v in body.answers):
        raise HTTPException(status_code=400, detail="Answers must be 0, 1, or 2")
    score = score_for(body.answers)
    _, tier_key, tier_title = tier_for(score)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "answers": body.answers,
        "score": score,
        "tier": tier_key,
        "utm": {
            k: str(v)[:120] for k, v in body.utm.items() if k.startswith("utm_") or k in ("ref", "partner", "code")
        },
        "page": body.page[:200],
        "device_type": device_type_from(request),
        "email": None,
        "email_sent": False,
        "created_at": now,
    }
    await db.readiness_quiz_results.insert_one(doc)
    return {
        "id": doc["id"],
        "score": score,
        "tier": tier_key,
        "tier_title": tier_title,
        "fixes": fixes_for(body.answers),
    }


@router.post("/quiz/results/{result_id}/email")
async def email_quiz_result(result_id: str, body: QuizEmailRequest):
    email = body.email.strip().lower()
    if not is_valid_email(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    result = await db.readiness_quiz_results.find_one({"id": result_id}, {"_id": 0})
    if not result:
        raise HTTPException(status_code=404, detail="Quiz result not found")
    _, _, tier_title = tier_for(result["score"])
    subject, html = build_quiz_email(result["score"], tier_title, fixes_for(result["answers"]))
    sent = await send_email(email, subject, html)
    await db.readiness_quiz_results.update_one(
        {"id": result_id},
        {
            "$set": {
                "email": email,
                "email_sent": bool(sent),
                "email_requested_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    if not sent:
        logger.warning(f"Quiz result email not delivered: {result_id} -> {email}")
        raise HTTPException(status_code=502, detail="We couldn't send to that address. Please check it and try again.")
    return {"ok": True}


@router.get("/admin/quiz/analytics")
async def quiz_analytics(current_user: dict = Depends(require_admin)):
    require_admin_scope(current_user, ["marketing"])
    coll = db.readiness_quiz_results
    total = await coll.count_documents({})
    if total == 0:
        return {"total": 0, "questions": [q["label"] for q in QUESTIONS], "recent": [], "leads": []}

    agg = await coll.aggregate(
        [
            {
                "$group": {
                    "_id": None,
                    "avg_score": {"$avg": "$score"},
                    "emails": {"$sum": {"$cond": [{"$ne": ["$email", None]}, 1, 0]}},
                    "emails_sent": {"$sum": {"$cond": ["$email_sent", 1, 0]}},
                    "last_7d": {
                        "$sum": {
                            "$cond": [
                                {"$gte": ["$created_at", (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()]},
                                1,
                                0,
                            ]
                        }
                    },
                }
            },
        ]
    ).to_list(1)
    summary = agg[0]

    tiers_raw = await coll.aggregate([{"$group": {"_id": "$tier", "count": {"$sum": 1}}}]).to_list(5)
    by_tier = {t["_id"]: t["count"] for t in tiers_raw}

    device_raw = await coll.aggregate([{"$group": {"_id": "$device_type", "count": {"$sum": 1}}}]).to_list(5)
    by_device = {d["_id"]: d["count"] for d in device_raw if d["_id"]}

    buckets_raw = await coll.aggregate(
        [
            {
                "$bucket": {
                    "groupBy": "$score",
                    "boundaries": [0, 20, 40, 60, 80, 101],
                    "default": "other",
                    "output": {"count": {"$sum": 1}},
                }
            }
        ]
    ).to_list(6)
    bucket_labels = {0: "0-19", 20: "20-39", 40: "40-59", 60: "60-79", 80: "80-100"}
    histogram = [
        {"range": bucket_labels[b], "count": next((r["count"] for r in buckets_raw if r["_id"] == b), 0)}
        for b in bucket_labels
    ]

    q_raw = await coll.aggregate(
        [
            {"$unwind": {"path": "$answers", "includeArrayIndex": "q"}},
            {
                "$group": {
                    "_id": "$q",
                    "yes": {"$sum": {"$cond": [{"$eq": ["$answers", 2]}, 1, 0]}},
                    "partly": {"$sum": {"$cond": [{"$eq": ["$answers", 1]}, 1, 0]}},
                    "no": {"$sum": {"$cond": [{"$eq": ["$answers", 0]}, 1, 0]}},
                }
            },
            {"$sort": {"_id": 1}},
        ]
    ).to_list(len(QUESTIONS))
    questions = []
    for row in q_raw:
        i = int(row["_id"])
        n = row["yes"] + row["partly"] + row["no"]
        gap = round((row["no"] + 0.5 * row["partly"]) / n * 100) if n else 0
        questions.append(
            {
                "index": i,
                "label": QUESTIONS[i]["label"],
                "yes": row["yes"],
                "partly": row["partly"],
                "no": row["no"],
                "gap_pct": gap,
            }
        )
    questions.sort(key=lambda q: -q["gap_pct"])

    source_raw = await coll.aggregate(
        [
            {
                "$group": {
                    "_id": {"$ifNull": ["$utm.utm_source", "direct"]},
                    "count": {"$sum": 1},
                    "avg_score": {"$avg": "$score"},
                }
            },
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
    ).to_list(10)
    by_source = [{"source": s["_id"], "count": s["count"], "avg_score": round(s["avg_score"])} for s in source_raw]

    proj = {
        "_id": 0,
        "id": 1,
        "score": 1,
        "tier": 1,
        "device_type": 1,
        "email": 1,
        "email_sent": 1,
        "page": 1,
        "utm": 1,
        "created_at": 1,
    }
    recent = await coll.find({}, proj).sort("created_at", -1).limit(20).to_list(20)
    leads = await coll.find({"email": {"$ne": None}}, proj).sort("created_at", -1).limit(500).to_list(500)

    return {
        "total": total,
        "last_7d": summary["last_7d"],
        "avg_score": round(summary["avg_score"]),
        "emails_captured": summary["emails"],
        "emails_sent": summary["emails_sent"],
        "capture_rate": round(summary["emails"] / total * 100, 1),
        "by_tier": by_tier,
        "by_device": by_device,
        "histogram": histogram,
        "questions": questions,
        "by_source": by_source,
        "recent": recent,
        "leads": leads,
    }
