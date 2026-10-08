"""Admin → Finance: dictation minutes per day + AI Builder draft spend, read from the LLM cost ledger."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from config import db_read
from guards import require_admin

router = APIRouter()

BUILDER_LABELS = {
    "voice_transcribe": "Private dictation (speech-to-text)",
    "entities_ai_draft": "Entities & Structures builder",
    "cfp_ai_draft": "Financial Picture builder",
    "beneficiaries_ai_draft": "Beneficiaries builder",
    "ffn_ai_draft": "Friends & Family builder",
    "digital_wallet_ai_draft": "Digital Wallet builder",
    "checklist_ai_draft": "Immediate Action Checklist builder",
    "ccp_ai_draft": "Contingency Protocols builder",
    "messages_ai_draft": "Milestone Message scaffolding",
    "quickstart_ai_draft": "QuickStart story",
}


@router.get("/admin/dictation-usage")
async def dictation_usage(days: int = Query(30, ge=1, le=90), _admin: dict = Depends(require_admin)):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    per_day: dict[str, dict] = {}
    async for row in db_read.llm_cost_ledger.aggregate(
        [
            {"$match": {"endpoint": "voice_transcribe", "created_at": {"$gte": cutoff}}},
            {
                "$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "seconds": {"$sum": "$audio_seconds"},
                    "dictations": {"$sum": 1},
                    "cost": {"$sum": "$estimated_cost_usd"},
                    "users": {"$addToSet": "$user_id"},
                }
            },
        ]
    ):
        per_day[row["_id"]] = {
            "minutes": round((row["seconds"] or 0) / 60, 2),
            "dictations": row["dictations"],
            "cost_usd": round(row["cost"] or 0, 4),
            "users": len(row["users"]),
        }
    series = []
    for i in range(days):
        d = (cutoff + timedelta(days=i)).strftime("%Y-%m-%d")
        series.append({"date": d, **per_day.get(d, {"minutes": 0, "dictations": 0, "cost_usd": 0, "users": 0})})
    totals = {
        "minutes": round(sum(x["minutes"] for x in series), 2),
        "dictations": sum(x["dictations"] for x in series),
        "cost_usd": round(sum(x["cost_usd"] for x in series), 4),
    }
    builders = []
    async for row in db_read.llm_cost_ledger.aggregate(
        [
            {
                "$match": {
                    "endpoint": {"$in": [k for k in BUILDER_LABELS if k != "voice_transcribe"]},
                    "created_at": {"$gte": cutoff},
                }
            },
            {
                "$group": {
                    "_id": "$endpoint",
                    "calls": {"$sum": 1},
                    "tokens": {"$sum": "$total_tokens"},
                    "cost": {"$sum": "$estimated_cost_usd"},
                    "errors": {"$sum": {"$cond": ["$success", 0, 1]}},
                    "users": {"$addToSet": "$user_id"},
                }
            },
            {"$sort": {"cost": -1}},
        ]
    ):
        builders.append(
            {
                "endpoint": row["_id"],
                "label": BUILDER_LABELS[row["_id"]],
                "calls": row["calls"],
                "tokens": row["tokens"] or 0,
                "cost_usd": round(row["cost"] or 0, 4),
                "errors": row["errors"],
                "users": len(row["users"]),
            }
        )
    return {
        "window_days": days,
        "stt_model": "grok-voice-transcribe-2.0",
        "stt_usd_per_hour": 0.10,
        "days": series,
        "totals": totals,
        "builders": builders,
        "builders_cost_usd": round(sum(b["cost_usd"] for b in builders), 4),
    }
