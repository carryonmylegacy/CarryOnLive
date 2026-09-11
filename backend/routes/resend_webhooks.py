"""CarryOn™ — Resend Webhook Handler

Handles bounce, complaint, and delivery events from Resend.
Automatically suppresses bounced email addresses to prevent future sends.

Webhook URL to register in Resend Dashboard:
  POST https://carryon.us/api/webhooks/resend
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Request

from config import db, logger
from services.email import suppress_email

router = APIRouter()


@router.post("/webhooks/resend")
async def resend_webhook(request: Request):
    """Handle Resend webhook events (bounce, complaint, delivery status)."""
    try:
        payload = await request.json()
    except Exception:
        return {"status": "error", "message": "Invalid JSON"}

    event_type = payload.get("type", "")
    data = payload.get("data", {})

    # Log all webhook events
    logger.info(f"Resend webhook: {event_type}")

    if event_type in ("email.bounced", "email.complained"):
        # Extract the bounced/complained email address
        to_list = data.get("to", [])
        reason = event_type.replace("email.", "")
        bounce_type = data.get("bounce", {}).get("type", "unknown") if event_type == "email.bounced" else "complaint"

        for email_addr in to_list:
            await suppress_email(email_addr, f"{reason}:{bounce_type}")
            logger.warning(f"Resend {reason}: {email_addr} ({bounce_type})")

        # Log the event for analytics
        await db.email_webhook_events.insert_one(
            {
                "type": event_type,
                "email": to_list[0] if to_list else None,
                "bounce_type": bounce_type,
                "subject": data.get("subject", ""),
                "created_at": data.get("created_at", datetime.now(timezone.utc).isoformat()),
                "raw": payload,
            }
        )

    elif event_type == "email.delivery_delayed":
        to_list = data.get("to", [])
        logger.warning(f"Resend delivery delayed: {to_list}")

    return {"status": "ok"}
