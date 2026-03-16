"""CarryOn™ — Email service wrapper using Resend."""

import asyncio

import resend

from config import RESEND_API_KEY, SENDER_EMAIL, logger

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


async def send_email(to: str, subject: str, html: str):
    """Send a transactional email via Resend."""
    if not RESEND_API_KEY:
        logger.info(f"Email not configured — would send '{subject}' to {to}")
        return False
    try:
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": SENDER_EMAIL,
                "to": [to],
                "subject": subject,
                "html": html,
            },
        )
        logger.info(f"Email sent: '{subject}' → {to}")
        return True
    except Exception as e:
        logger.error(f"Email send failed ({subject} → {to}): {e}")
        return False
