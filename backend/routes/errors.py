"""CarryOn™ — Client Error Tracking

Receives frontend error reports (crashes, unhandled exceptions) and stores them
for monitoring. Lightweight alternative to Sentry — runs on our own infrastructure.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Request
from pydantic import BaseModel

from config import db, logger

router = APIRouter()


class ClientErrorReport(BaseModel):
    message: str
    stack: str = ""
    component: str = ""
    url: str = ""
    user_agent: str = ""
    app_version: str = ""
    platform: str = ""  # ios | android | web
    severity: str = "error"  # error | warning | fatal


@router.post("/errors/report")
async def report_client_error(report: ClientErrorReport, request: Request):
    """Receive a client-side error report. No auth required so pre-login crashes are captured."""
    forwarded = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown"
    )

    doc = {
        "message": report.message[:2000],
        "stack": report.stack[:5000],
        "component": report.component[:200],
        "url": report.url[:500],
        "user_agent": report.user_agent[:500] or request.headers.get("user-agent", "")[:500],
        "app_version": report.app_version[:20],
        "platform": report.platform[:10],
        "severity": report.severity,
        "ip": client_ip,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.client_errors.insert_one(doc)

    if report.severity == "fatal":
        logger.error(f"FATAL client error: {report.message[:200]} | {report.component}")
    else:
        logger.warning(f"Client error: {report.message[:100]} | {report.component}")

    return {"received": True}
