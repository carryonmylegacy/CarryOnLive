"""CarryOn — 'What changed since last login?' digest.

Lightweight endpoint for the Beneficiary view: scans every estate
collection that carries `updated_at`/`created_at` ISO timestamps and
reports a flat, time-sorted list of changes since `since` (ISO 8601).

The frontend persists `last_seen_at` in localStorage on each successful
login and passes it back on the next session — so we don't need to
maintain a per-user cursor server-side.
"""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query

from config import db
from utils import get_current_user

router = APIRouter()


# Collections we surface and the field used to label the change.
_WATCHED = [
    ("bills", "name", "Bill"),
    ("debts", "name", "Debt"),
    ("financial_accounts", "name", "Account"),
    ("property_assets", "name", "Asset"),
    ("documents", "title", "Document"),
    ("checklists", "title", "Checklist"),
    ("messages", "subject", "Message"),
    ("ccp_records", "title", "Care Protocol"),
    ("dts_tasks", "title", "Task"),
]


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
    if not estate_ids:
        return {"events": [], "since": since}

    events: List[dict] = []
    for coll, label_field, kind in _WATCHED:
        rows = (
            await db[coll]
            .find(
                {
                    "estate_id": {"$in": estate_ids},
                    "deleted_at": None,
                    "$or": [
                        {"updated_at": {"$gt": since}},
                        {"created_at": {"$gt": since}},
                    ],
                },
                {"_id": 0, "id": 1, label_field: 1, "estate_id": 1, "updated_at": 1, "created_at": 1},
            )
            .limit(100)
            .to_list(100)
        )
        for r in rows:
            ts = r.get("updated_at") or r.get("created_at")
            if not ts:
                continue
            created = r.get("created_at")
            updated = r.get("updated_at")
            action = "created" if (created and (not updated or updated == created)) else "updated"
            events.append(
                {
                    "id": r.get("id"),
                    "kind": kind,
                    "collection": coll,
                    "label": r.get(label_field) or "(untitled)",
                    "estate_id": r.get("estate_id"),
                    "estate_name": estate_name_by_id.get(r.get("estate_id"), ""),
                    "action": action,
                    "at": ts,
                }
            )

    events.sort(key=lambda e: e["at"], reverse=True)
    return {
        "events": events[:limit],
        "since": since,
        "total_returned": len(events[:limit]),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
