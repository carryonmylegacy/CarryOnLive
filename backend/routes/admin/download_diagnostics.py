"""CarryOn™ Backend — Download Diagnostics

Frontend fires a single fire-and-forget POST to `/diagnostics/download-event`
after every download attempt (via `iosSafeDownload` helper or
`platformDownload` utility). Founder portal aggregates the events under
`/admin/download-diagnostics` to expose per-action × per-platform success vs
cancel rates over the last N days.

The collection has a TTL index of 90 days — telemetry is operational, not
analytical, and we don't want it bloating Mongo.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from config import db
from guards import get_current_user, require_admin

router = APIRouter()

VALID_OUTCOMES = {"saved", "opened", "downloaded", "shared", "cancelled", "failed"}
VALID_PLATFORMS = {"ios", "android", "ios-pwa", "android-pwa", "web", "capacitor", "unknown"}


class DownloadEvent(BaseModel):
    action: str = Field(..., max_length=64)
    outcome: str = Field(..., max_length=24)
    platform: str = Field(..., max_length=24)
    filename: Optional[str] = Field(None, max_length=160)
    bytes: Optional[int] = None
    ua_snippet: Optional[str] = Field(None, max_length=160)
    error_message: Optional[str] = Field(None, max_length=200)


@router.post("/diagnostics/download-event")
async def record_download_event(payload: DownloadEvent, user: dict = Depends(get_current_user)):
    """Fire-and-forget telemetry sink. Validates and stores."""
    outcome = payload.outcome.lower()
    platform = payload.platform.lower()
    if outcome not in VALID_OUTCOMES:
        raise HTTPException(status_code=400, detail="invalid outcome")
    if platform not in VALID_PLATFORMS:
        platform = "unknown"

    doc = {
        "id": str(uuid4()),
        "user_id": user["id"],
        "action": payload.action[:64],
        "outcome": outcome,
        "platform": platform,
        "filename": (payload.filename or "")[:160] or None,
        "bytes": payload.bytes,
        "ua_snippet": (payload.ua_snippet or "")[:160] or None,
        "error_message": (payload.error_message or "")[:200] or None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.download_events.insert_one(doc)
    return {"ok": True}


@router.get("/admin/download-diagnostics")
async def admin_download_diagnostics(
    days: int = Query(30, ge=1, le=180),
    _user: dict = Depends(require_admin),
):
    """Return per-action × per-platform outcome counts for the last N days,
    plus overall totals."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {
            "$group": {
                "_id": {"action": "$action", "platform": "$platform", "outcome": "$outcome"},
                "count": {"$sum": 1},
            }
        },
    ]
    rows = await db.download_events.aggregate(pipeline).to_list(length=5000)

    actions: dict[str, dict] = {}
    totals = {"events": 0, "by_outcome": {}, "by_platform": {}}

    for row in rows:
        action = row["_id"]["action"]
        platform = row["_id"]["platform"]
        outcome = row["_id"]["outcome"]
        count = row["count"]

        actions.setdefault(action, {"action": action, "total": 0, "platforms": {}})
        actions[action]["total"] += count
        plats = actions[action]["platforms"]
        plats.setdefault(platform, {"total": 0, "outcomes": {}})
        plats[platform]["total"] += count
        plats[platform]["outcomes"][outcome] = plats[platform]["outcomes"].get(outcome, 0) + count

        totals["events"] += count
        totals["by_outcome"][outcome] = totals["by_outcome"].get(outcome, 0) + count
        totals["by_platform"][platform] = totals["by_platform"].get(platform, 0) + count

    actions_list = sorted(actions.values(), key=lambda x: x["total"], reverse=True)

    cancelled = totals["by_outcome"].get("cancelled", 0)
    failed = totals["by_outcome"].get("failed", 0)
    success = totals["events"] - cancelled - failed
    success_rate = round(100 * success / totals["events"], 1) if totals["events"] else 0.0

    return {
        "days": days,
        "since": since.isoformat(),
        "totals": totals,
        "success_rate": success_rate,
        "actions": actions_list,
    }


async def ensure_indexes():
    """Called once at startup. TTL on `created_at` (90 days) keeps the
    collection compact. Compound index optimises the dashboard aggregation."""
    try:
        await db.download_events.create_index("created_at", expireAfterSeconds=90 * 24 * 3600)
        await db.download_events.create_index([("action", 1), ("platform", 1), ("outcome", 1)])
    except Exception:
        # Index creation is best-effort — it'll retry on next process start
        pass
