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
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "ok": result["ok"],
        "entries_checked": result["entries_checked"],
        "skipped_legacy": result["skipped_legacy"],
        "first_break_at": result["first_break_at"],
        "first_break_id": result["first_break_id"],
        "limit": 10000,
        "genesis_created_now": genesis["created"],
    }
