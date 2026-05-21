"""CarryOn™ — WebSocket Notifications for Real-Time Queue Alerts

Provides:
  - WebSocket endpoint for real-time push to connected staff
  - Background SLA breach checker (runs every 60s)
  - Instant notifications when items breach SLA deadlines
  - Queue overflow alerts when queue size exceeds thresholds
"""

import asyncio
from datetime import datetime, timezone
from typing import Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt

from config import db, logger

router = APIRouter()

# Connected clients: {user_id: [websocket, ...]}
_connections: Dict[str, list] = {}

# Queue size alert thresholds
QUEUE_THRESHOLDS = {
    "support": 10,
    "dts": 5,
    "tvt": 5,
    "verification": 10,
}


async def _authenticate_ws(token: str) -> dict:
    """Validate JWT token for WebSocket auth."""
    try:
        import os

        secret = os.environ.get("JWT_SECRET", "")
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        user_id = payload.get("user_id")
        if not user_id:
            return None
        user = await db.users.find_one(
            {"id": user_id, "role": {"$in": ["admin", "operator"]}},
            {"_id": 0, "id": 1, "role": 1, "operator_role": 1, "name": 1},
        )
        return user
    except Exception:
        return None


async def broadcast_to_staff(message: dict, role_filter: str = None):
    """Send a message to all connected staff (or filtered by role)."""
    dead = []
    for user_id, sockets in _connections.items():
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append((user_id, ws))

    # Clean up dead connections
    for user_id, ws in dead:
        if user_id in _connections:
            _connections[user_id] = [s for s in _connections[user_id] if s is not ws]
            if not _connections[user_id]:
                del _connections[user_id]


async def send_to_user(user_id: str, message: dict):
    """Send a message to a specific connected user."""
    if user_id not in _connections:
        return
    dead = []
    for ws in _connections[user_id]:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _connections[user_id] = [s for s in _connections[user_id] if s is not ws]
    if user_id in _connections and not _connections[user_id]:
        del _connections[user_id]


@router.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket, token: str = Query("")):
    """WebSocket endpoint for real-time staff notifications."""
    user = await _authenticate_ws(token)
    if not user:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    user_id = user["id"]

    if user_id not in _connections:
        _connections[user_id] = []
    _connections[user_id].append(websocket)

    logger.info(f"WS connected: {user.get('name', user_id)} (total: {sum(len(v) for v in _connections.values())})")

    try:
        # Send initial connection confirmation
        await websocket.send_json(
            {
                "type": "connected",
                "message": "Real-time alerts active",
                "connected_staff": len(_connections),
            }
        )

        # Keep connection alive with heartbeat
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                # Send heartbeat
                try:
                    await websocket.send_json({"type": "heartbeat"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if user_id in _connections:
            _connections[user_id] = [s for s in _connections[user_id] if s is not websocket]
            if not _connections[user_id]:
                del _connections[user_id]
        logger.info(f"WS disconnected: {user.get('name', user_id)}")


# ── Background SLA Breach Checker ─────────────────────────


async def check_sla_breaches():
    """Check for SLA breaches across all task queues and send alerts."""
    now = datetime.now(timezone.utc).isoformat()

    collections = {
        "support": "support_conversations",
        "dts": "dts_tasks",
        "tvt": "death_certificates",
        "milestone": "milestone_deliveries",
        "verification": "tier_verifications",
    }

    breaches = []

    for task_type, coll_name in collections.items():
        coll = db[coll_name]

        # Find items that have an SLA deadline that has passed, are still open, and not yet alerted
        cursor = coll.find(
            {
                "sla_deadline": {"$lt": now, "$exists": True},
                "sla_alerted": {"$ne": True},
                "status": {
                    "$nin": ["resolved", "completed", "approved", "executed", "verified", "rejected", "destroyed"]
                },
            },
            {"_id": 0, "id": 1, "sla_deadline": 1, "claimed_by": 1, "claimed_by_name": 1},
        )

        async for doc in cursor:
            breaches.append(
                {
                    "task_type": task_type,
                    "task_id": doc["id"],
                    "sla_deadline": doc.get("sla_deadline", ""),
                    "claimed_by": doc.get("claimed_by", ""),
                    "claimed_by_name": doc.get("claimed_by_name", "Unassigned"),
                }
            )

            # Mark as alerted so we don't spam
            await coll.update_one(
                {"id": doc["id"]},
                {"$set": {"sla_alerted": True}},
            )

    if breaches:
        # Send SLA breach alerts via WebSocket
        for breach in breaches:
            alert = {
                "type": "sla_breach",
                "task_type": breach["task_type"],
                "task_id": breach["task_id"],
                "message": f"SLA BREACH: {breach['task_type'].upper()} task overdue (assigned to {breach['claimed_by_name']})",
                "timestamp": now,
            }
            await broadcast_to_staff(alert)

        # Also create persistent notifications for managers + founders
        from services.notifications import notify

        for breach in breaches:
            await notify.all_staff(
                f"SLA Breach: {breach['task_type'].upper()}",
                f"A {breach['task_type']} task has passed its SLA deadline. Assigned to: {breach['claimed_by_name']}",
                url=f"/ops/{breach['task_type']}",
            )

    # ── Queue overflow check ──
    for task_type, coll_name in collections.items():
        threshold = QUEUE_THRESHOLDS.get(task_type, 10)
        open_count = await db[coll_name].count_documents(
            {
                "status": {
                    "$nin": ["resolved", "completed", "approved", "executed", "verified", "rejected", "destroyed"]
                },
            }
        )

        if open_count > threshold:
            # Check if we already alerted for this queue overflow recently
            recent_alert = await db.queue_alerts.find_one(
                {
                    "task_type": task_type,
                    "alert_type": "overflow",
                    "created_at": {
                        "$gte": (datetime.now(timezone.utc).replace(hour=0, minute=0, second=0)).isoformat()
                    },
                }
            )

            if not recent_alert:
                alert = {
                    "type": "queue_overflow",
                    "task_type": task_type,
                    "count": open_count,
                    "threshold": threshold,
                    "message": f"Queue Alert: {open_count} open {task_type.upper()} items (threshold: {threshold})",
                    "timestamp": now,
                }
                await broadcast_to_staff(alert)

                # Log the alert to prevent re-alerting
                await db.queue_alerts.insert_one(
                    {
                        "task_type": task_type,
                        "alert_type": "overflow",
                        "count": open_count,
                        "created_at": now,
                    }
                )

    return len(breaches)


async def sla_checker_loop():
    """Background loop that checks SLA breaches every 60 seconds.

    Resilient to transient ``AuthenticationFailed`` errors from MongoDB
    Atlas — those occur ~once a day when the SCRAM session handshake
    races a credential refresh on a pooled connection that has been
    idle right at the ``maxIdleTimeMS`` boundary. The driver normally
    retries reads, but a SCRAM-time auth blip can fall through. We
    swallow up to 2 consecutive auth failures (log at warning, no
    Sentry escalation) and only emit an error after the 3rd consecutive
    failure so a genuine credential break still surfaces.
    """
    consecutive_auth_failures = 0
    while True:
        try:
            breach_count = await check_sla_breaches()
            if breach_count > 0:
                logger.info(f"SLA checker found {breach_count} breach(es)")
            consecutive_auth_failures = 0  # reset on any success
        except Exception as e:
            err_str = str(e)
            is_auth = "Authentication failed" in err_str or "AuthenticationFailed" in err_str or "'code': 18" in err_str
            if is_auth:
                consecutive_auth_failures += 1
                if consecutive_auth_failures <= 2:
                    logger.warning(
                        "SLA checker transient Mongo auth failure "
                        f"#{consecutive_auth_failures} — will retry next cycle."
                    )
                else:
                    logger.error(f"SLA checker persistent Mongo auth failure #{consecutive_auth_failures}: {e}")
            else:
                logger.error(f"SLA checker error: {e}")
        await asyncio.sleep(60)
