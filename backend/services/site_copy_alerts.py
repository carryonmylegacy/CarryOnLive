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


def build_draft_email(draft: dict, before: dict, after: dict) -> tuple[str, str]:
    """E-mail for a draft that published itself on schedule."""
    name = draft.get("name", "")
    changes = draft.get("changes") or {}
    labels = draft.get("field_labels") or {}
    pages = draft.get("pages") or []
    subject = f"Draft published: {name}"
    rows = []
    for key in list(changes)[:12]:
        rows.append(
            f'<p style="margin:16px 0 0;font-size:13px;font-weight:700;color:#0f1629">{html.escape(labels.get(key) or key)}</p>'
            + _block("Before", before.get(key, ""), "#cbd5e1")
            + _block("Now showing", after.get(key, ""), "#d4af37")
        )
    more = len(changes) - 12
    if more > 0:
        rows.append(
            f'<p style="margin:14px 0 0;font-size:13px;color:#7b879e">… and {more} more field{"s" if more != 1 else ""}.</p>'
        )
    links = "".join(
        f'<p style="margin:8px 0 0"><a href="{html.escape(PUBLIC_SITE_URL + p["path"])}" style="display:inline-block;padding:10px 16px;background:#d4af37;color:#0f1629;font-weight:700;border-radius:8px;text-decoration:none">Open {html.escape(p.get("label") or p["path"])}</a></p>'
        for p in pages[:8]
    )
    body = f"""
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:28px 20px;color:#0f1629">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b8860b;font-weight:700">CarryOn · Site Copy</p>
  <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3">Your scheduled draft is live</h1>
  <p style="margin:0;font-size:15px"><strong>{html.escape(name)}</strong> — {len(changes)} field{"s" if len(changes) != 1 else ""} published at {html.escape(_fmt_et(draft.get("publish_at")))}, scheduled by {html.escape(draft.get("scheduled_by") or "a founder")}.</p>
  {"".join(rows)}
  <div style="margin-top:22px">{links}</div>
  <p style="margin:24px 0 0;font-size:12px;color:#7b879e">Every change is in Site Copy → History under the draft’s name, with one-click restore.</p>
</div>"""
    return subject, body


async def publish_due_drafts() -> int:
    """Publish drafts whose publish_at has passed (claim-then-publish). Returns count published."""
    from routes.site_copy import apply_changes
    from services.email import send_email
    from services.notifications import notify

    now = _now_iso()
    published = 0
    async for doc in db.site_copy_drafts.find({"publish_at": {"$ne": None, "$lte": now}, "publishing_at": None}):
        claimed = await db.site_copy_drafts.update_one(
            {"_id": doc["_id"], "publishing_at": None}, {"$set": {"publishing_at": now}}
        )
        if not claimed.modified_count:
            continue
        changes = doc.get("changes") or {}
        try:
            before = {k: "" for k in changes}
            async for cur in db.site_copy.find({"_id": {"$in": list(changes)}}, {"_id": 1, "value": 1}):
                before[cur["_id"]] = cur.get("value", "")
            actor = {
                "id": doc.get("scheduled_by_id") or "scheduler",
                "email": doc.get("scheduled_by") or "scheduler@carryon.us",
                "role": doc.get("scheduled_by_role") or "admin",
            }
            await apply_changes(changes, actor, via=doc.get("name", ""))
            await db.site_copy_drafts.delete_one({"_id": doc["_id"]})
            published += 1
            logger.info(f"scheduled draft published: {doc.get('name')} ({len(changes)} fields)")
            if await alerts_enabled():
                subject, body = build_draft_email(doc, before, changes)
                for email in await founder_emails():
                    await send_email(email, subject, body)
                first = (doc.get("pages") or [{}])[0].get("path") or "/"
                await notify.founder(
                    subject, f"{len(changes)} fields are live — open the page", url=first, priority="normal"
                )
        except Exception as e:
            logger.error(f"scheduled draft publish failed for {doc.get('name')}: {e}")
            await db.site_copy_drafts.update_one({"_id": doc["_id"]}, {"$set": {"publishing_at": None}})
    return published


async def site_copy_alert_scheduler():
    while True:
        try:
            await publish_due_drafts()
            await process_due_alerts()
        except Exception as e:
            logger.error(f"site_copy_alerts: {e}")
        await asyncio.sleep(60)
