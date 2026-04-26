"""CarryOn — 'What changed since last login?' digest.

Lightweight endpoint for the Beneficiary view: scans every estate
collection that carries `updated_at`/`created_at` ISO timestamps and
reports a flat, time-sorted list of changes since `since` (ISO 8601).

The frontend persists `last_seen_at` in localStorage on each successful
login and passes it back on the next session — so we don't need to
maintain a per-user cursor server-side.

The actual scanning logic lives in services/changelog_helper.py so the
weekly digest pipeline can reuse it.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from config import db
from services.changelog_helper import gather_changes_since
from utils import get_current_user

router = APIRouter()


def _user_estate_ids_query(user: dict):
    """Return a Mongo query that matches estates the user can see —
    either as owner or as beneficiary."""
    return {
        "$or": [
            {"owner_id": user["id"]},
            {"beneficiaries": user["id"]},
        ]
    }


@router.get("/changelog/since")
async def changelog_since(
    since: str = Query(..., description="ISO timestamp; only changes after this are returned"),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Returns up to `limit` change events newer than `since`. Each event
    has a stable shape so the UI can render a uniform timeline."""
    try:
        # Validate the cursor parses as ISO 8601 — invalid input → 400.
        datetime.fromisoformat(since.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="`since` must be ISO 8601")

    estates = await db.estates.find(_user_estate_ids_query(current_user), {"_id": 0, "id": 1, "name": 1}).to_list(50)
    estate_ids = [e["id"] for e in estates]
    estate_name_by_id = {e["id"]: e.get("name", "") for e in estates}

    events = await gather_changes_since(estate_ids, since, limit)
    # Annotate each event with its estate display name so the UI can
    # show "Bill in <Estate>" without a second round-trip.
    for e in events:
        e["estate_name"] = estate_name_by_id.get(e.get("estate_id"), "")

    return {
        "events": events,
        "since": since,
        "total_returned": len(events),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
