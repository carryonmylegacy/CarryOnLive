"""CarryOn™ — SOC2 production-readiness gate (audit 5391e8b #7).

In production, the platform MUST run with PII-safe structured logging and the
full security-middleware stack, and its required background schedulers must be
active. This module evaluates those invariants and exposes the result so the
`/health/ready` probe can return 503 (degrade the pod out of rotation) when a
required control is inactive — rather than silently serving traffic without it.

Non-production (preview/dev) is INERT: `is_production()` is False, so every
check returns "ok" and `/health/ready` behaves exactly as before.
"""

import os

from config import logger
from services.environment import is_production

# Security/observability middleware that MUST be loaded in production. Each is
# added in server.py inside a try/except, so a packaging error could silently
# drop it — this gate catches that.
REQUIRED_MIDDLEWARE = {
    "SecurityHeadersMiddleware",
    "RateLimitMiddleware",
    "RequestTraceMiddleware",
    "DoSHardeningMiddleware",
    "IdempotencyMiddleware",
    "TrusteeAuditMiddleware",
}

# Background schedulers that MUST be active in production (compliance/billing
# critical). Skipped when a dedicated scheduler worker owns them
# (DISABLE_INPROC_SCHEDULERS=1).
REQUIRED_SCHEDULERS = {
    "data_retention",
    "milestone_delivery",
    "grace_period",
    "billing_lifecycle",
}

_STATE: dict = {"ok": True, "violations": [], "checked": False}


def get_readiness_state() -> dict:
    """Return the snapshot computed at startup by evaluate_production_readiness."""
    return dict(_STATE)


def _logging_violations() -> list[str]:
    from logging_json import _redact_enabled

    v = []
    if not _redact_enabled():
        v.append("REDACT_PII is not enabled (set REDACT_PII=1)")
    if os.environ.get("LOG_FORMAT", "").strip().lower() != "json":
        v.append("LOG_FORMAT is not 'json' (set LOG_FORMAT=json)")
    return v


def _middleware_violations(app) -> list[str]:
    present = set()
    for mw in getattr(app, "user_middleware", []):
        cls = getattr(mw, "cls", None)
        if cls is not None:
            present.add(cls.__name__)
    missing = REQUIRED_MIDDLEWARE - present
    return [f"required middleware not loaded: {m}" for m in sorted(missing)]


def evaluate_production_readiness(app) -> dict:
    """Compute and cache the static readiness invariants (logging + middleware).
    Called once at startup. Returns the snapshot. Inert outside production."""
    violations: list[str] = []
    if is_production():
        violations += _logging_violations()
        violations += _middleware_violations(app)
    _STATE.update({"ok": not violations, "violations": violations, "checked": True})
    return get_readiness_state()


def scheduler_violations() -> list[str]:
    """Live check of required schedulers — evaluated on each /health/ready poll.
    Empty list unless production (and in-proc schedulers are enabled)."""
    if not is_production():
        return []
    if os.environ.get("DISABLE_INPROC_SCHEDULERS", "").strip().lower() in ("1", "true", "yes"):
        return []  # a dedicated worker pod owns the scheduler loops
    try:
        from middleware import get_scheduler_health

        health = get_scheduler_health()
    except Exception as e:  # pragma: no cover
        logger.warning(f"scheduler health lookup failed in readiness gate: {e}")
        return []
    v = []
    for name in sorted(REQUIRED_SCHEDULERS):
        s = health.get(name)
        if not s:
            v.append(f"required scheduler not registered: {name}")
        elif s.get("status") == "error":
            v.append(f"required scheduler in error state: {name}")
    return v
