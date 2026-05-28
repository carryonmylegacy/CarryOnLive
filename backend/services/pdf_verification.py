"""CarryOn™ — PDF verification snapshot store + HMAC integrity.

Why this exists
---------------
The QR code stamped on every CarryOn-generated PDF deep-links to a
server-rendered verification page that shows (a) the locked Prime
Directive and (b) the user's structured inputs as of the moment the
PDF was generated. A professional reviewing the PDF can scan the QR,
land on the verification page, and confirm in <5 seconds that the
document is authentic, came from CarryOn, and was built on the
inputs claimed.

Threat model + integrity guarantee
----------------------------------
Verification tokens are of the form ``<snapshot_id>.<hmac_prefix>``:

* ``snapshot_id`` — 16-char URL-safe hex, used as the Mongo lookup
  key.
* ``hmac_prefix`` — first 16 chars of HMAC-SHA256(JWT_SECRET, canonical
  snapshot JSON). Recomputed server-side on every verification read.

This gives us three independent tamper guarantees:

1. An attacker who modifies any DB field (including ``manifest_entries``
   or ``generated_at``) — the recomputed HMAC will no longer match the
   prefix in the URL printed on the PDF. Verification fails.
2. An attacker who fabricates a URL without an entry in the DB — the
   lookup misses. Verification fails.
3. An attacker without the ``JWT_SECRET`` cannot forge a passing URL
   for ANY content. The signing key never leaves the backend.

The DB stores the canonical content but NOT the HMAC itself, by design.
Recomputation on read is the integrity check.

Public-safety
-------------
The verification snapshot is intentionally minimal — it carries the
Verified Inputs Manifest content (which is what the PDF already
prints) and timestamps. It does NOT carry email, SSN, or any PII the
PDF reader does not already have in hand. Sharing the verify URL
publicly leaks no additional data.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timezone
from typing import Any

from config import db, logger
from services.prime_directive import PRIME_DIRECTIVE_LOCKED_AT

_COLLECTION = "pdf_verification_snapshots"
_HMAC_PREFIX_LEN = 16  # 64 bits of preimage resistance against forgery


def _signing_key() -> bytes:
    """Resolve the HMAC signing key from environment at call time so
    secret rotation does not require a process restart."""
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        # Misconfiguration — every CarryOn deployment ships JWT_SECRET.
        # We deliberately do NOT fall back to a hard-coded value; a
        # missing key MUST fail loudly.
        raise RuntimeError("JWT_SECRET is not set — PDF verification cannot sign or verify snapshots without it.")
    return secret.encode("utf-8")


def _canonical_payload(
    *,
    snapshot_id: str,
    user_id: str,
    pdf_kind: str,
    generated_at_iso: str,
    prime_directive_locked_at: str,
    manifest_entries: list[dict[str, Any]],
) -> bytes:
    """Stable byte-canonicalization of a snapshot for HMAC. Order keys
    explicitly and sort manifest entry keys to defeat dict-ordering
    drift between Python versions / JSON libraries."""
    sorted_entries = [
        {
            "section": e.get("section", ""),
            "field": e.get("field", ""),
            "value": e.get("value", ""),
            "source_step": e.get("source_step", ""),
        }
        for e in manifest_entries
    ]
    payload = {
        "snapshot_id": snapshot_id,
        "user_id": user_id,
        "pdf_kind": pdf_kind,
        "generated_at": generated_at_iso,
        "prime_directive_locked_at": prime_directive_locked_at,
        "manifest_entries": sorted_entries,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _compute_hmac_prefix(canonical: bytes) -> str:
    mac = hmac.new(_signing_key(), canonical, hashlib.sha256).hexdigest()
    return mac[:_HMAC_PREFIX_LEN]


async def create_snapshot(
    *,
    user_id: str,
    pdf_kind: str,
    manifest_entries: list[dict[str, Any]],
    generated_at: datetime,
) -> str:
    """Persist a verification snapshot and return the URL-safe token.

    Returns ``<snapshot_id>.<hmac_prefix>`` — the value that becomes the
    path segment in the verify URL printed on the PDF QR code.
    """
    snapshot_id = secrets.token_hex(8)  # 16-char hex
    generated_at_iso = generated_at.astimezone(timezone.utc).isoformat()

    canonical = _canonical_payload(
        snapshot_id=snapshot_id,
        user_id=user_id,
        pdf_kind=pdf_kind,
        generated_at_iso=generated_at_iso,
        prime_directive_locked_at=PRIME_DIRECTIVE_LOCKED_AT,
        manifest_entries=manifest_entries,
    )
    hmac_prefix = _compute_hmac_prefix(canonical)

    doc = {
        "snapshot_id": snapshot_id,
        "user_id": user_id,
        "pdf_kind": pdf_kind,
        "generated_at": generated_at_iso,
        "prime_directive_locked_at": PRIME_DIRECTIVE_LOCKED_AT,
        "manifest_entries": manifest_entries,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db[_COLLECTION].insert_one(doc)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to persist PDF verification snapshot")
        # Don't crash the PDF render path on a snapshot persistence
        # failure — the document still ships, just without a usable QR.
        # Returning empty string signals the caller to skip QR stamping.
        return ""

    return f"{snapshot_id}.{hmac_prefix}"


async def read_snapshot(verify_token: str) -> dict[str, Any] | None:
    """Resolve a verify token to the original snapshot ONLY if the
    HMAC re-computation matches the token's prefix.

    Returns ``None`` on any failure mode — bad token shape, missing
    snapshot, HMAC mismatch (tamper detected), or DB error. The
    caller surfaces a single "Verification failed" message to the
    user; we deliberately do NOT distinguish failure modes externally
    to avoid leaking which snapshots exist.
    """
    if not verify_token or "." not in verify_token:
        return None
    try:
        snapshot_id, provided_prefix = verify_token.split(".", 1)
    except ValueError:
        return None
    if (
        len(snapshot_id) != 16
        or len(provided_prefix) != _HMAC_PREFIX_LEN
        or not all(c in "0123456789abcdef" for c in snapshot_id)
        or not all(c in "0123456789abcdef" for c in provided_prefix)
    ):
        return None

    try:
        # pre-push-invariants: allow-missing-id (snapshot_id is the natural key)
        doc = await db[_COLLECTION].find_one(
            {"snapshot_id": snapshot_id},
            {"_id": 0},
        )
    except Exception:  # noqa: BLE001
        logger.exception("PDF verification snapshot lookup failed")
        return None

    if not doc:
        return None

    canonical = _canonical_payload(
        snapshot_id=doc["snapshot_id"],
        user_id=doc.get("user_id", ""),
        pdf_kind=doc.get("pdf_kind", ""),
        generated_at_iso=doc.get("generated_at", ""),
        prime_directive_locked_at=doc.get("prime_directive_locked_at", ""),
        manifest_entries=doc.get("manifest_entries", []),
    )
    expected_prefix = _compute_hmac_prefix(canonical)
    if not hmac.compare_digest(expected_prefix, provided_prefix):
        return None

    return {
        "snapshot_id": doc["snapshot_id"],
        "pdf_kind": doc.get("pdf_kind", ""),
        "generated_at": doc.get("generated_at", ""),
        "prime_directive_locked_at": doc.get("prime_directive_locked_at", ""),
        "manifest_entries": doc.get("manifest_entries", []),
    }
