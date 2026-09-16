"""CarryOn™ — Email service wrapper using Resend."""

import asyncio
import re

import resend

from config import RESEND_API_KEY, SENDER_EMAIL, logger

# RFC 2606/6761 reserved names — used by test agents for seed accounts.
RESERVED_TEST_DOMAINS = frozenset({"example.com", "example.org", "example.net"})
RESERVED_TEST_TLDS = (".test", ".invalid", ".localhost", ".example")

# Public-form recipients (quiz results, testimonials) must never be throwaway/test inboxes.
BLOCKED_DOMAINS = RESERVED_TEST_DOMAINS | frozenset(
    {
        "test.com",
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
    }
)

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def is_valid_email(email: str) -> bool:
    """Syntactically valid and not a blocked/test domain."""
    if not email or not isinstance(email, str):
        return False
    email = email.strip().lower()
    if not EMAIL_REGEX.match(email):
        return False
    domain = email.split("@")[1]
    return domain not in BLOCKED_DOMAINS and not domain.endswith(RESERVED_TEST_TLDS)


async def send_email(to: str, subject: str, html: str):
    """Send a transactional email via Resend.

    Returns ``True`` on success, ``False`` on any failure. Preserved for
    backward compatibility with callers that don't need the error reason.
    """
    result = await send_email_ex(to, subject, html)
    return result["ok"]


async def send_email_ex(to: str, subject: str, html: str) -> dict:
    """Send a transactional email via Resend and return a structured result.

    Returns ``{"ok": bool, "error": str | None}``. Used by callers that
    want to surface the underlying Resend error to the end-user (e.g. the
    trustee invite flow shows the error inline + a copy-link fallback).
    """
    if not RESEND_API_KEY:
        logger.info(f"Email not configured — would send '{subject}' to {to}")
        return {"ok": False, "error": "Email service not configured on this environment."}
    domain = to.rsplit("@", 1)[-1].lower()
    if domain in RESERVED_TEST_DOMAINS or domain.endswith(RESERVED_TEST_TLDS):
        # RFC 2606/6761 reserved domains (test-agent seed data) — Resend
        # rejects these with an error; skip quietly instead of polluting logs.
        logger.info(f"Email skipped (reserved test domain): '{subject}' → {to}")
        return {"ok": False, "error": "Recipient domain is a reserved test domain."}
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
        return {"ok": True, "error": None}
    except Exception as e:
        logger.error(f"Email send failed ({subject} → {to}): {e}")
        return {"ok": False, "error": str(e)}
