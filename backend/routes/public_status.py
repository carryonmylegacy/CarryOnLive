"""CarryOn™ — Public platform status endpoint.

Unauthenticated, cached, safe to poll from a public status page (statuspage.io,
Better Uptime, etc). Returns a minimal "up/down + version + timestamp" payload.

NEVER exposes internal metrics — for that use /api/admin/launch-war-room
(admin-only).
"""

import asyncio
import os
from datetime import datetime, timezone

from fastapi import APIRouter

from config import db

router = APIRouter()


@router.get("/status")
async def public_status():
    """Public health + version. Safe for status-page polling."""
    try:
        await asyncio.wait_for(db.command("ping"), timeout=1.5)
        status = "operational"
    except Exception:
        status = "degraded"

    return {
        "status": status,
        "version": os.environ.get("BUILD_HASH", "unknown"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
