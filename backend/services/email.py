"""CarryOn™ — Email service wrapper using Resend.

Features:
  - Email format validation before sending
  - Suppression list (bounced/invalid addresses auto-blocked)
  - Test domain blocking (@test.com, @example.com, etc.)
  - Centralized send_email() used by all email-sending code
"""

import asyncio
import re

import resend

from config import RESEND_API_KEY, SENDER_EMAIL, db, logger

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Domains that should never receive real email
BLOCKED_DOMAINS = frozenset(
    [
        "test.com",
        "example.com",
        "example.org",
        "example.net",
        "fake.com",
        "mailinator.com",
        "guerrillamail.com",
        "throwaway.email",
        "tempmail.com",
        "yopmail.com",
        "sharklasers.com",
        "grr.la",
        "guerrillamailblock.com",
        "localhost",
        "invalid",
        "test",
        "resend.dev",
    ]
)

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def is_valid_email(email: str) -> bool:
    """Check if an email address is syntactically valid and not a blocked domain."""
    if not email or not isinstance(email, str):
        return False
    email = email.strip().lower()
    if not EMAIL_REGEX.match(email):
        return False
    domain = email.split("@")[1]
    if domain in BLOCKED_DOMAINS:
        return False
    return True


async def is_suppressed(email: str) -> bool:
    """Check if an email is on the suppression list (previously bounced)."""
    email = email.strip().lower()
    entry = await db.email_suppressions.find_one(
        {"email": email},
        {"_id": 0, "email": 1},
    )
    return entry is not None


async def suppress_email(email: str, reason: str = "bounce"):
    """Add an email to the suppression list."""
    from datetime import datetime, timezone

    email = email.strip().lower()
    await db.email_suppressions.update_one(
        {"email": email},
        {
            "$set": {
                "email": email,
                "reason": reason,
                "suppressed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )
    logger.info(f"Email suppressed: {email} ({reason})")


async def send_email(to: str, subject: str, html: str):
    """Send a transactional email via Resend with validation and suppression checks."""
    if not RESEND_API_KEY:
        logger.info(f"Email not configured — would send '{subject}' to {to}")
        return False

    to = to.strip()

    # Validate format
    if not is_valid_email(to):
        domain = to.split("@")[1] if "@" in to else "?"
        logger.warning(f"Email blocked (invalid/test domain '{domain}'): '{subject}' → {to}")
        return False

    # Check suppression list
    if await is_suppressed(to):
        logger.warning(f"Email blocked (suppressed): '{subject}' → {to}")
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
        error_str = str(e).lower()
        # Auto-suppress if Resend reports the address as invalid
        if "bounce" in error_str or "invalid" in error_str or "not found" in error_str:
            await suppress_email(to, f"send_error: {str(e)[:200]}")
        logger.error(f"Email send failed ({subject} → {to}): {e}")
        return False
