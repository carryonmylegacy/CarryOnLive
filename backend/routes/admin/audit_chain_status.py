"""CarryOn™ Backend — Admin: Audit-Trail Hash-Chain Integrity.

Surfaces a live "audit integrity" health check for the Founder admin
dashboard and the CTO/IT (`/ops`) System Health portal. The endpoint
runs `services.audit.verify_audit_chain` and returns a green/red
verdict plus the first broken-entry pointer if any.

SOC 2 talking-point: this dashboard widget proves the audit trail is
self-verifying in production. Auditors can ask "when did you last
verify chain integrity?" and the answer is "every 10 minutes, here's
the live result."
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from config import logger
from guards import require_admin
from services.audit import ensure_chain_genesis, verify_audit_chain

router = APIRouter()


@router.get("/admin/audit-chain-status")
async def get_audit_chain_status(_admin: dict = Depends(require_admin)):
    """Walk the audit-trail hash chain and return its integrity verdict.

    On the very first call after deploy, writes a one-shot
    `audit_chain_genesis` audit entry so the chain has a named anchor
    point (SOC 2 evidence). Subsequent calls are idempotent.

    Pure read-only after genesis. The chain walk is bounded to the
    latest 10k entries to keep dashboard latency under ~500ms; the full
    historical chain can be verified out-of-band via
    `scripts/backup_drill_smoke.py`.
    """
    genesis = await ensure_chain_genesis()
    result = await verify_audit_chain(limit=10000)
    if not result["ok"]:
        # audit d5a54f5e P2 / SOC2 [CC7.2] — surface a SEVERE alert whenever the
        # chain is not fully authoritative: a broken link, a missing/mismatched
        # CAS head, or a non-zero repair-queue backlog. Streamed to logs (and
        # Sentry breadcrumbs) so on-call sees it without polling the dashboard.
        logger.warning(
            "[audit_chain] INTEGRITY NOT OK — links_ok=%s head_present=%s head_matches=%s "
            "repair_backlog=%s first_break_id=%s entries_checked=%s",
            result.get("chain_links_ok"),
            result.get("chain_head_present"),
            result.get("chain_head_matches_last_event"),
            result.get("repair_queue_backlog"),
            result.get("first_break_id"),
            result.get("entries_checked"),
        )
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "ok": result["ok"],
        "chain_links_ok": result.get("chain_links_ok", result["ok"]),
        "entries_checked": result["entries_checked"],
        "skipped_legacy": result["skipped_legacy"],
        "first_break_at": result["first_break_at"],
        "first_break_id": result["first_break_id"],
        # SOC2 evidence-completeness signals (audit fa1ad83 #1/#8).
        "repair_queue_backlog": result.get("repair_queue_backlog", 0),
        "chain_head_present": result.get("chain_head_present", False),
        "chain_head_matches_last_event": result.get("chain_head_matches_last_event", False),
        "limit": 10000,
        "genesis_created_now": genesis["created"],
    }
