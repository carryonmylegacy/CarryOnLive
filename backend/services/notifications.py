"""CarryOn™ — Centralized Notification Service

Handles both:
  - In-app notifications (stored in MongoDB, fetched by frontend)
  - Web Push notifications (via VAPID/WebPush)
  - Per-day delivery metrics (collection: notification_metrics) so the
    Founder System Health tile can spot a silent push regression
    across ALL notification types in one place — never per-feature
    health checks (per founder directive, May 5, 2026).

Usage:
    from services.notifications import notify
    await notify.benefactor(user_id, "Title", "Body", url="/dashboard", priority="normal")
    await notify.all_staff("Title", "Body", url="/admin")
    await notify.security_alert(user_id, "Title", "Body", url="/support?priority=p1")
"""

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from config import db, logger


async def _record_metric(
    notification_type: str,
    *,
    in_app: int = 0,
    push_attempts: int = 0,
    push_with_subs: int = 0,
    push_delivered: int = 0,
) -> None:
    """Increment per-day, per-type counters in `notification_metrics`.
    Single source of truth for the System Health tile. Schema:
        _id: f"{YYYY-MM-DD}:{notification_type}"
        day, notification_type
        in_app_count          — total in-app notifications stored
        push_attempts         — total send_push calls
        push_with_subs        — calls where the user had ≥1 active subscription
        push_delivered        — calls where ≥1 webpush succeeded
    Failures here are swallowed — a metrics failure must never break
    a real notification.
    """
    try:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        ntype = notification_type or "general"
        inc: dict = {}
        if in_app:
            inc["in_app_count"] = in_app
        if push_attempts:
            inc["push_attempts"] = push_attempts
        if push_with_subs:
            inc["push_with_subs"] = push_with_subs
        if push_delivered:
            inc["push_delivered"] = push_delivered
        if not inc:
            return
        await db.notification_metrics.update_one(
            {"_id": f"{day}:{ntype}"},
            {
                "$set": {"day": day, "notification_type": ntype},
                "$inc": inc,
            },
            upsert=True,
        )
    except Exception as e:  # pragma: no cover — observability is best-effort
        logger.warning(f"_record_metric failed: {e}")


async def _store_notification(
    user_id: str,
    title: str,
    body: str,
    url: str = "/",
    notification_type: str = "general",
    priority: str = "normal",
    metadata: dict = None,
):
    """Store an in-app notification in MongoDB."""
    notification = {
        "id": str(uuid4()),
        "user_id": user_id,
        "title": title,
        "body": body,
        "url": url,
        "type": notification_type,
        "priority": priority,
        "read": False,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notifications.insert_one(notification)
    await _record_metric(notification_type, in_app=1)
    return notification["id"]


async def _send_push(
    user_id: str,
    title: str,
    body: str,
    url: str = "/",
    tag: str = "carryon",
    notification_type: str = "general",
):
    """Send a web push notification (fire-and-forget). Records delivery
    metrics on every call so the Founder System Health tile can show
    delivery rate per type without per-feature instrumentation."""
    try:
        from utils import send_push_notification

        result = await send_push_notification(user_id, title, body, url, tag, notification_type)
        # send_push_notification returns a dict {with_subs, delivered}.
        # Older callers treat it as a bool — Python dict truthiness
        # still works (non-empty dict == True).
        with_subs = 0
        delivered = 0
        if isinstance(result, dict):
            with_subs = 1 if result.get("with_subs") else 0
            delivered = 1 if result.get("delivered") else 0
        elif isinstance(result, bool):
            # Legacy bool return: treat True as both with_subs + delivered.
            with_subs = 1 if result else 0
            delivered = 1 if result else 0
        await _record_metric(
            notification_type,
            push_attempts=1,
            push_with_subs=with_subs,
            push_delivered=delivered,
        )
    except Exception as e:
        logger.warning(f"Push notification failed for {user_id}: {e}")
        await _record_metric(notification_type, push_attempts=1)


async def send_notification(
    user_id: str,
    title: str,
    body: str,
    url: str = "/",
    notification_type: str = "general",
    priority: str = "normal",
    tag: str = "carryon",
    metadata: dict = None,
):
    """Send both in-app + web push notification to a single user."""
    await _store_notification(user_id, title, body, url, notification_type, priority, metadata)
    asyncio.create_task(_send_push(user_id, title, body, url, tag, notification_type))


async def send_to_role(
    role: str,
    title: str,
    body: str,
    url: str = "/",
    notification_type: str = "general",
    priority: str = "normal",
    tag: str = "carryon",
    operator_role: str = None,
    metadata: dict = None,
):
    """Send notification to all users with a specific role."""
    query = {"role": role}
    if operator_role:
        query["operator_role"] = operator_role
    users = await db.users.find(query, {"_id": 0, "id": 1}).to_list(500)
    for u in users:
        await send_notification(u["id"], title, body, url, notification_type, priority, tag, metadata)


async def send_to_all_staff(
    title: str,
    body: str,
    url: str = "/admin",
    notification_type: str = "general",
    priority: str = "normal",
    tag: str = "staff-notification",
    metadata: dict = None,
):
    """Send notification to Founder + all Operators (managers + workers)."""
    staff = await db.users.find({"role": {"$in": ["admin", "operator"]}}, {"_id": 0, "id": 1}).to_list(500)
    for u in staff:
        await send_notification(u["id"], title, body, url, notification_type, priority, tag, metadata)


async def send_security_alert(
    user_id: str,
    title: str,
    body: str,
    url: str = "/support?priority=p1&reason=security_alert",
    metadata: dict = None,
):
    """Send a Priority 1 security alert (in-app + push)."""
    await send_notification(
        user_id,
        title,
        body,
        url,
        notification_type="security_alert",
        priority="critical",
        tag="security-alert",
        metadata=metadata,
    )


# ── Convenience namespace ──


class _Notify:
    """Namespace for notification shortcuts."""

    async def benefactor(self, user_id, title, body, url="/dashboard", priority="normal", metadata=None):
        await send_notification(user_id, title, body, url, "benefactor", priority, "benefactor", metadata)

    async def beneficiary(self, user_id, title, body, url="/beneficiary", priority="normal", metadata=None):
        await send_notification(user_id, title, body, url, "beneficiary", priority, "beneficiary", metadata)

    async def founder(self, title, body, url="/admin", priority="normal", metadata=None):
        await send_to_role("admin", title, body, url, "founder", priority, "founder", metadata)

    async def operator(self, user_id, title, body, url="/ops", priority="normal", metadata=None):
        await send_notification(user_id, title, body, url, "operator", priority, "operator", metadata)

    async def all_operators(self, title, body, url="/ops", priority="normal", metadata=None):
        await send_to_role(
            "operator",
            title,
            body,
            url,
            "operator",
            priority,
            "operator-all",
            metadata=metadata,
        )

    async def all_staff(self, title, body, url="/admin", priority="normal", metadata=None):
        await send_to_all_staff(title, body, url, "staff", priority, "staff", metadata)

    async def security_alert(
        self,
        user_id,
        title,
        body,
        url="/support?priority=p1&reason=security_alert",
        metadata=None,
    ):
        await send_security_alert(user_id, title, body, url, metadata)

    async def all_staff_security(self, title, body, url="/admin", metadata=None):
        """P1 Alert — Amber Alert to ALL staff (buried alive, emergency contact)"""
        await send_to_all_staff(title, body, url, "security_alert", "critical", "security-alert", metadata)

    async def p2_alert(self, title, body, url="/ops", metadata=None):
        """P2 Alert — All staff (Founder + Managers + Team Members). No Amber Alert."""
        await send_to_all_staff(title, body, url, "p2_alert", "high", "p2-alert", metadata)

    async def p3_alert(self, title, body, url="/ops", metadata=None):
        """P3 Alert — Operators only (Managers + Team Members). Not founder."""
        await send_to_role(
            "operator",
            title,
            body,
            url,
            "p3_alert",
            "normal",
            "p3-alert",
            metadata=metadata,
        )

    async def p4_alert(self, title, body, url="/ops", metadata=None):
        """P4 Alert — Operators only (Managers + Team Members). Routine work items."""
        await send_to_role(
            "operator",
            title,
            body,
            url,
            "p4_alert",
            "normal",
            "p4-alert",
            metadata=metadata,
        )


notify = _Notify()
