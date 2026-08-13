"""CarryOn™ — Email service wrapper using Resend."""

import asyncio

import resend

from config import RESEND_API_KEY, SENDER_EMAIL, logger

# RFC 2606/6761 reserved names — used by test agents for seed accounts.
RESERVED_TEST_DOMAINS = frozenset({"example.com", "example.org", "example.net"})
RESERVED_TEST_TLDS = (".test", ".invalid", ".localhost", ".example")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


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
