"""CarryOn™ — Centralized Notification Service

Handles both:
  - In-app notifications (stored in MongoDB, fetched by frontend)
  - Web Push notifications (via VAPID/WebPush)

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
    return notification["id"]


async def _send_push(
    user_id: str,
    title: str,
    body: str,
    url: str = "/",
    tag: str = "carryon",
    notification_type: str = "general",
):
    """Send a web push notification (fire-and-forget)."""
    try:
        from utils import send_push_notification

        await send_push_notification(user_id, title, body, url, tag, notification_type)
    except Exception as e:
        logger.warning(f"Push notification failed for {user_id}: {e}")


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
