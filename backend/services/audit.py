"""CarryOn™ — SOC 2 Audit Trail Service

Immutable, append-only audit logging for all operator and founder actions.
SOC 2 Trust Service Criteria compliance:
  CC6.1 — Logical access security
  CC7.2 — System monitoring
  CC8.1 — Change management
  A1.2  — System availability monitoring

Logs are:
  - Append-only (no update/delete endpoints)
  - Timestamped in UTC ISO 8601
  - Actor-identified (user_id, email, role, IP)
  - Action-classified (category, action, severity)
  - Target-identified (resource_type, resource_id)
  - Integrity-hashed (SHA-256 of payload for tamper detection)
"""

import hashlib
import json
from datetime import datetime, timezone

from config import db, logger


async def log_audit_event(
    actor_id: str,
    actor_email: str,
    actor_role: str,
    action: str,
    category: str,
    resource_type: str = "",
    resource_id: str = "",
    details: dict | None = None,
    ip_address: str = "",
    severity: str = "info",
    session_id: str = "",
):
    """Append an immutable audit log entry."""
    now = datetime.now(timezone.utc)

    entry = {
        "timestamp": now.isoformat(),
        "actor_id": actor_id,
        "actor_email": actor_email,
        "actor_role": actor_role,
        "action": action,
        "category": category,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": json.dumps(details or {})[:2048],
        "ip_address": ip_address,
        "severity": severity,
        "session_id": session_id,
    }

    canonical = json.dumps(entry, sort_keys=True)
    entry["integrity_hash"] = hashlib.sha256(canonical.encode()).hexdigest()

    await db.audit_trail.insert_one(entry)

    if severity == "critical":
        logger.warning(f"AUDIT[{severity}] {actor_email} {action} {resource_type}:{resource_id}")


def get_client_ip(request) -> str:
    """Extract client IP from request, respecting proxy headers."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def audit_log(
    action="",
    user_id="",
    resource_type="",
    resource_id="",
    estate_id="",
    details=None,
    **kwargs,
):
    """Backward-compatible wrapper for legacy audit_log calls."""
    await log_audit_event(
        actor_id=user_id,
        actor_email="",
        actor_role="",
        action=action,
        category="system",
        resource_type=resource_type,
        resource_id=resource_id,
        details={**(details or {}), "estate_id": estate_id},
    )
