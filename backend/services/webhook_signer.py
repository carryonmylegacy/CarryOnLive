"""CarryOn™ — Outbound Webhook Signing (HMAC-SHA256)

Signs outbound webhook payloads in a Stripe-compatible format so receivers
can verify authenticity without trusting the network.

Header format (X-CarryOn-Signature):
    t=<unix_timestamp>,v1=<hex_hmac_sha256>

Where the signed payload is:
    "<timestamp>.<raw_body_bytes>"

This module is intentionally framework-agnostic — pass it the secret and the
raw bytes you intend to send. Wire it in at the call site (httpx/aiohttp).

Receivers verify with `verify_signature(body, header, secret, tolerance_s=300)`
which (a) rejects timestamps older than `tolerance_s` (replay defence) and
(b) constant-time compares the HMAC.
"""

import hashlib
import hmac
import time

# Public header name our outbound webhooks always carry.
SIGNATURE_HEADER = "X-CarryOn-Signature"

# Scheme version. Bump if we ever rotate the hash algorithm.
SCHEME = "v1"


def _to_bytes(payload) -> bytes:
    if isinstance(payload, bytes):
        return payload
    if isinstance(payload, str):
        return payload.encode("utf-8")
    raise TypeError(f"webhook_signer requires bytes or str, got {type(payload).__name__}")


def sign(payload, secret: str, timestamp: int | None = None) -> dict[str, str]:
    """Sign a payload and return headers to attach to the outbound request.

    Args:
        payload: bytes or str — the EXACT body that will be sent on the wire.
        secret: shared secret with the receiver.
        timestamp: override for tests; defaults to current unix time.

    Returns:
        {"X-CarryOn-Signature": "t=...,v1=...", "Content-Type": "application/json"}
    """
    if not secret:
        raise ValueError("webhook_signer.sign requires a non-empty secret")
    body = _to_bytes(payload)
    ts = int(timestamp if timestamp is not None else time.time())
    signed = f"{ts}.".encode("utf-8") + body
    mac = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return {
        SIGNATURE_HEADER: f"t={ts},{SCHEME}={mac}",
        "Content-Type": "application/json",
    }


def _parse_header(header: str) -> tuple[int | None, str | None]:
    """Parse an X-CarryOn-Signature header into (timestamp, hmac_hex)."""
    if not header:
        return None, None
    ts: int | None = None
    mac: str | None = None
    for part in header.split(","):
        part = part.strip()
        if part.startswith("t="):
            try:
                ts = int(part[2:])
            except ValueError:
                ts = None
        elif part.startswith(f"{SCHEME}="):
            mac = part[len(SCHEME) + 1 :]
    return ts, mac


def verify_signature(payload, header: str, secret: str, tolerance_s: int = 300) -> bool:
    """Constant-time verify of an inbound payload signed by CarryOn.

    Returns True only if:
      • Header parses cleanly to (t, v1)
      • |now - t| <= tolerance_s   (replay defence)
      • HMAC matches in constant time

    `tolerance_s` defaults to 5 minutes (matches Stripe's default).
    Pass 0 to disable replay defence (NOT recommended outside tests).
    """
    if not secret:
        return False
    ts, mac = _parse_header(header)
    if ts is None or not mac:
        return False
    if tolerance_s and abs(int(time.time()) - ts) > tolerance_s:
        return False
    body = _to_bytes(payload)
    signed = f"{ts}.".encode("utf-8") + body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, mac)
