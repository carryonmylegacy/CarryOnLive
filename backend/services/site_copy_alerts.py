"""Copy alerts — e-mail + in-app ping when a scheduled wording change goes live or reverts.

A 60-second loop claims each due schedule atomically (`live_alert_at` / `revert_alert_at`)
so multiple pods never double-send. Toggle: platform_settings.copy_alerts_enabled (default on).
"""

import asyncio
import html
import os
from datetime import datetime, timezone

from config import db, logger

PUBLIC_SITE_URL = os.environ.get("PUBLIC_SITE_URL", "https://www.carryon.us").rstrip("/")
ET = "America/New_York"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def alerts_enabled() -> bool:
    doc = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0, "copy_alerts_enabled": 1}) or {}
    return bool(doc.get("copy_alerts_enabled", True))


async def founder_emails() -> list[str]:
    return [u["email"] async for u in db.users.find({"role": "admin", "email": {"$ne": None}}, {"_id": 0, "email": 1})]


def _fmt_et(iso: str | None) -> str:
    if not iso:
        return "until removed"
    try:
        from zoneinfo import ZoneInfo

        return (
            datetime.fromisoformat(iso.replace("Z", "+00:00"))
            .astimezone(ZoneInfo(ET))
            .strftime("%b %-d, %Y, %-I:%M %p ET")
        )
    except Exception:
        return iso


def _block(label: str, text: str, color: str) -> str:
    body = html.escape(text) if text else "<em>(built-in default)</em>"
    return (
        f'<p style="margin:14px 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7b879e">{label}</p>'
        f'<div style="padding:12px 14px;border-left:3px solid {color};background:#f6f7f9;border-radius:6px;'
        f'font-size:15px;line-height:1.5;color:#0f1629;white-space:pre-wrap">{body}</div>'
    )


def build_alert_email(schedule: dict, kind: str, base_text: str) -> tuple[str, str]:
    """Return (subject, html). kind = 'live' | 'revert'."""
    field = schedule.get("field_label") or schedule.get("key", "")
    page = schedule.get("page_label") or "the site"
    path = schedule.get("page_path") or "/"
    url = f"{PUBLIC_SITE_URL}{path}"
    if kind == "live":
        subject = f"Site copy went live: {field}"
        headline = "A scheduled wording change just went live"
        before, after = schedule.get("before_text", ""), schedule.get("value", "")
        window = f"Live since {_fmt_et(schedule['start_at'])} · reverts {_fmt_et(schedule.get('end_at'))}"
    else:
        subject = f"Site copy reverted: {field}"
        headline = "A scheduled wording change has ended — the saved text is back"
        before, after = schedule.get("value", ""), base_text
        window = f"Was live {_fmt_et(schedule['start_at'])} → {_fmt_et(schedule.get('end_at'))}"
    note = schedule.get("note") or ""
    body = f"""
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:28px 20px;color:#0f1629">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b8860b;font-weight:700">CarryOn · Site Copy</p>
  <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3">{html.escape(headline)}</h1>
  <p style="margin:0 0 4px;font-size:15px"><strong>{html.escape(page)}</strong> › {html.escape(field)}</p>
  <p style="margin:0;font-size:13px;color:#7b879e">{html.escape(window)}{(" · " + html.escape(note)) if note else ""}</p>
  {_block("Before", before, "#cbd5e1")}
  {_block("Now showing", after, "#d4af37")}
  <p style="margin:22px 0 0"><a href="{html.escape(url)}" style="display:inline-block;padding:12px 20px;background:#d4af37;color:#0f1629;font-weight:700;border-radius:8px;text-decoration:none">Open the live page</a></p>
  <p style="margin:10px 0 0;font-size:12px;color:#7b879e">{html.escape(url)}</p>
  <p style="margin:24px 0 0;font-size:12px;color:#7b879e">Manage schedules and this alert in Admin → Marketing → Site Copy → Schedules.</p>
</div>"""
    return subject, body


async def _send_alert(schedule: dict, kind: str) -> None:
    from services.email import send_email
    from services.notifications import notify

    base = await db.site_copy.find_one({"_id": schedule["key"]}, {"_id": 0, "value": 1}) or {}
    subject, body = build_alert_email(schedule, kind, base.get("value", ""))
    for email in await founder_emails():
        await send_email(email, subject, body)
    path = schedule.get("page_path") or "/"
    field = schedule.get("field_label") or schedule.get("key", "")
    await notify.founder(
        subject, f"{schedule.get('page_label') or path} — open the live page", url=path, priority="normal"
    )
    logger.info(f"copy alert ({kind}) sent for {field}")


async def process_due_alerts() -> int:
    """Send alerts for schedules that started / ended since the last tick. Returns count sent."""
    if not await alerts_enabled():
        return 0
    now = _now_iso()
    sent = 0
    for kind, query, stamp in (
        ("live", {"start_at": {"$lte": now}, "live_alert_at": None}, "live_alert_at"),
        ("revert", {"end_at": {"$ne": None, "$lte": now}, "revert_alert_at": None}, "revert_alert_at"),
    ):
        async for doc in db.site_copy_schedules.find(query):
            claimed = await db.site_copy_schedules.update_one({"_id": doc["_id"], stamp: None}, {"$set": {stamp: now}})
            if not claimed.modified_count:
                continue
            try:
                await _send_alert(doc, kind)
                sent += 1
            except Exception as e:
                logger.error(f"copy alert ({kind}) failed for {doc.get('key')}: {e}")
    return sent


async def site_copy_alert_scheduler():
    while True:
        try:
            await process_due_alerts()
        except Exception as e:
            logger.error(f"site_copy_alerts: {e}")
        await asyncio.sleep(60)
