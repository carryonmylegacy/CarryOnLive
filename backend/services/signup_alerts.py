"""Founder-metered "New User Signup" alerts.

The founder picks how often the admin team is pinged when someone joins
(platform_settings.signup_alert_mode). Every signup still bumps the counter so
milestone modes ("every 25th") and digests ("47 new signups in the last hour")
are exact regardless of mode switches.
"""

import asyncio
from datetime import datetime, timedelta, timezone

from pymongo import ReturnDocument

from config import db, logger

MODES = {
    "each": "Every signup",
    "every_10": "Every 10th signup",
    "every_25": "Every 25th signup",
    "every_100": "Every 100th signup",
    "hourly": "Hourly summary",
    "daily": "Daily summary",
    "off": "Off",
}
DEFAULT_MODE = "each"
_DIGEST_SECONDS = {"hourly": 3600, "daily": 86400}


def _now():
    return datetime.now(timezone.utc)


async def get_settings() -> dict:
    doc = (
        await db.platform_settings.find_one(
            {"_id": "global"},
            {"_id": 0, "signup_alert_mode": 1, "signup_alert_counter": 1, "signup_alert_last_digest_at": 1},
        )
        or {}
    )
    mode = doc.get("signup_alert_mode") or DEFAULT_MODE
    if mode not in MODES:
        mode = DEFAULT_MODE
    return {
        "mode": mode,
        "counter": int(doc.get("signup_alert_counter") or 0),
        "last_digest_at": doc.get("signup_alert_last_digest_at"),
    }


async def set_mode(mode: str) -> dict:
    if mode not in MODES:
        raise ValueError(f"unknown signup alert mode: {mode}")
    update = {"signup_alert_mode": mode}
    if mode in _DIGEST_SECONDS:
        update["signup_alert_last_digest_at"] = _now().isoformat()
    await db.platform_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    return await get_settings()


async def signup_stats() -> dict:
    now = _now()
    hour_ago = (now - timedelta(hours=1)).isoformat()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    return {
        "last_hour": await db.users.count_documents({"created_at": {"$gte": hour_ago}}),
        "today": await db.users.count_documents({"created_at": {"$gte": day_start}}),
        "total": await db.users.count_documents({}),
    }


async def on_signup(full_name: str, email: str, username: str, role: str) -> bool:
    """Called once per registration. Returns True if a founder ping was sent."""
    from services.notifications import notify

    doc = await db.platform_settings.find_one_and_update(
        {"_id": "global"},
        {"$inc": {"signup_alert_counter": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0, "signup_alert_mode": 1, "signup_alert_counter": 1},
    )
    n = int(doc.get("signup_alert_counter") or 0)
    mode = doc.get("signup_alert_mode") or DEFAULT_MODE
    if mode not in MODES:
        mode = DEFAULT_MODE

    if mode == "each":
        await notify.founder(
            "New User Signup",
            f"{full_name} ({email}, @{username}) registered as {role}",
            url="/admin",
            priority="normal",
        )
        return True
    if mode.startswith("every_"):
        step = int(mode.split("_", 1)[1])
        if n % step == 0:
            await notify.founder(
                f"Signup milestone: #{n:,}",
                f"{step} more people joined. Latest: {full_name} (@{username}) as {role}",
                url="/admin",
                priority="normal",
            )
            return True
    return False


async def send_digest_if_due() -> bool:
    """Send the hourly/daily summary when the window has elapsed. Returns True if sent."""
    from services.notifications import notify

    s = await get_settings()
    window = _DIGEST_SECONDS.get(s["mode"])
    if not window:
        return False
    now = _now()
    last_iso = s["last_digest_at"]
    if not last_iso:
        await db.platform_settings.update_one(
            {"_id": "global"}, {"$set": {"signup_alert_last_digest_at": now.isoformat()}}, upsert=True
        )
        return False
    last = datetime.fromisoformat(last_iso.replace("Z", "+00:00"))
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if (now - last).total_seconds() < window:
        return False
    # Claim the window first so a second pod / tick can't double-send.
    claimed = await db.platform_settings.update_one(
        {"_id": "global", "signup_alert_last_digest_at": last_iso},
        {"$set": {"signup_alert_last_digest_at": now.isoformat()}},
    )
    if claimed.modified_count == 0:
        return False
    count = await db.users.count_documents({"created_at": {"$gte": last_iso}})
    if count == 0:
        return False
    label = "hour" if s["mode"] == "hourly" else "day"
    total = await db.users.count_documents({})
    await notify.founder(
        f"{count:,} new signup{'s' if count != 1 else ''} in the last {label}",
        f"{total:,} members total. Tap to open the founder portal.",
        url="/admin",
        priority="normal",
    )
    return True


async def signup_alert_digest_scheduler():
    while True:
        try:
            await send_digest_if_due()
        except Exception as e:
            logger.error(f"signup_alert_digest: {e}")
        await asyncio.sleep(60)
