"""CarryOn™ — Global Trial Policy

Stores the platform-wide trial duration (e.g. 5/7/10/14/15/20/30 days)
in `platform_settings` and exposes admin endpoints to read/update it.

Single source of truth: every signup, "Reset Trial" admin action, and
referral bonus computation reads from `get_trial_days()` rather than
the legacy `TRIAL_DURATION_DAYS = 30` constant. Reminder cadence is
auto-derived from the chosen duration via `get_reminder_intervals()`.

When the founder changes the global policy, all *in-progress* trials
(`subscription_status` not in {active, cancelled} and `trial_ends_at`
in the future) are re-stretched/re-shrunk to
`signed_up_at + new_days` so the new policy applies retroactively.
Each affected user's `trial_reminder_*d_sent` flags are reset so the
new cadence fires correctly.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from config import db
from utils import get_current_user

router = APIRouter()

# ─── Allowed values + cadence map ───────────────────────────────────
# These are the only durations the founder can pick. Each maps to a
# pre-baked reminder cadence (days BEFORE trial_ends_at to fire each
# nudge email). The cadence + a single "trial expired" notice are
# managed by `trial_reminders.py`.
ALLOWED_TRIAL_DAYS = (5, 7, 10, 14, 15, 20, 30)

REMINDER_CADENCE: dict[int, list[int]] = {
    5: [3, 1],
    7: [5, 2, 1],
    10: [7, 3, 1],
    14: [10, 5, 2, 1],
    15: [10, 5, 2, 1],
    20: [14, 7, 3, 1],
    30: [21, 10, 5, 1],
}

DEFAULT_TRIAL_DAYS = 30

# In-process cache for the hot signup path. Read-through with 30s TTL
# so changes via the admin endpoint propagate quickly without thrashing
# Mongo on every signup. Cache miss → DB read.
_cache: dict[str, Any] = {"value": None, "fetched_at": None}
_CACHE_TTL_SECONDS = 30


def get_reminder_intervals(trial_days: int) -> list[int]:
    """Return the reminder cadence for the given trial duration."""
    return list(REMINDER_CADENCE.get(int(trial_days), REMINDER_CADENCE[DEFAULT_TRIAL_DAYS]))


async def get_trial_days() -> int:
    """Resolve the current global trial duration (days).

    Falls back to `DEFAULT_TRIAL_DAYS` (30) if no setting has been
    written yet. Cached for `_CACHE_TTL_SECONDS` to avoid DB hits on
    every signup.
    """
    now = datetime.now(timezone.utc)
    fetched = _cache.get("fetched_at")
    if (
        _cache.get("value") is not None
        and isinstance(fetched, datetime)
        and (now - fetched).total_seconds() < _CACHE_TTL_SECONDS
    ):
        return int(_cache["value"])

    doc = await db.platform_settings.find_one({"key": "trial_policy"}, {"_id": 0, "trial_days": 1})
    days = int(doc.get("trial_days")) if doc and doc.get("trial_days") else DEFAULT_TRIAL_DAYS
    _cache["value"] = days
    _cache["fetched_at"] = now
    return days


def _invalidate_cache() -> None:
    """Bust the in-process cache after a write so the next read goes
    to Mongo."""
    _cache["value"] = None
    _cache["fetched_at"] = None


# ─── Endpoints ──────────────────────────────────────────────────────


@router.get("/admin/trial-policy")
async def get_trial_policy(current_user: dict = Depends(get_current_user)) -> dict:
    """Return the current global trial duration + the derived cadence
    map + the allowed values, so the admin UI can render the picker
    without hardcoding anything."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    days = await get_trial_days()
    return {
        "trial_days": days,
        "allowed": list(ALLOWED_TRIAL_DAYS),
        "reminder_intervals": get_reminder_intervals(days),
        "cadence_map": {str(d): REMINDER_CADENCE[d] for d in ALLOWED_TRIAL_DAYS},
    }


@router.put("/admin/trial-policy")
async def set_trial_policy(request: Request, current_user: dict = Depends(get_current_user)) -> dict:
    """Set the global trial duration. Retroactively recomputes
    `trial_ends_at` for every user still in-trial so the policy
    applies platform-wide. Resets each affected user's reminder
    flags so the new cadence fires correctly."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    body = await request.json()
    requested = body.get("trial_days")
    try:
        requested = int(requested)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="trial_days must be an integer")

    if requested not in ALLOWED_TRIAL_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"trial_days must be one of {list(ALLOWED_TRIAL_DAYS)}",
        )

    now = datetime.now(timezone.utc)

    # 1. Persist the new policy.
    await db.platform_settings.update_one(
        {"key": "trial_policy"},
        {
            "$set": {
                "key": "trial_policy",
                "trial_days": requested,
                "updated_at": now.isoformat(),
                "updated_by": current_user.get("email") or current_user.get("id"),
            }
        },
        upsert=True,
    )
    _invalidate_cache()

    # 2. Find every user still actively in a trial.
    # A user is "in trial" when:
    #   • trial_ends_at is set
    #   • subscription_status is not "active" / "cancelled"
    #   • (we don't filter by date — if their existing end is in the
    #     past we'll recompute it; the cap below keeps things sane)
    cursor = db.users.find(
        {
            "trial_ends_at": {"$exists": True, "$ne": None},
            "subscription_status": {"$nin": ["active", "cancelled"]},
        },
        {
            "_id": 0,
            "id": 1,
            "signed_up_at": 1,
            "created_at": 1,
            "trial_ends_at": 1,
        },
    )

    shifted = 0
    skipped = 0
    fields_to_reset = {f"trial_reminder_{d}d_sent": False for d in {1, 2, 3, 5, 7, 10, 14, 21}}
    fields_to_reset["trial_expired_email_sent"] = False

    async for u in cursor:
        # Prefer signed_up_at; fall back to created_at; final fallback
        # to "trial_ends_at minus old_days" reconstruction.
        anchor = u.get("signed_up_at") or u.get("created_at")
        if not anchor:
            skipped += 1
            continue
        try:
            anchor_dt = datetime.fromisoformat(str(anchor).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            skipped += 1
            continue

        new_end = anchor_dt + timedelta(days=requested)
        # If the recomputed end is in the past, give them a small
        # grace window so they aren't yanked offline mid-session.
        # 24 hours is enough for the next reminder + a courtesy email
        # to land before access flips.
        if new_end < now + timedelta(hours=24):
            new_end = now + timedelta(hours=24)

        await db.users.update_one(
            {"id": u["id"]},
            {
                "$set": {
                    "trial_ends_at": new_end.isoformat(),
                    **fields_to_reset,
                }
            },
        )
        shifted += 1

    return {
        "trial_days": requested,
        "reminder_intervals": get_reminder_intervals(requested),
        "users_shifted": shifted,
        "users_skipped": skipped,
        "updated_at": now.isoformat(),
    }
