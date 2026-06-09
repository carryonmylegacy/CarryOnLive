"""CarryOn™ — SOC2 production-readiness checks (audit 5391e8b #7 / 735b3b7 #5).

Two distinct surfaces, deliberately split (founder directive, Jun 2026):

  1. `/health/ready` (server.py) — ADVISORY. It surfaces readiness violations
     and logs them CRITICAL at startup, but it does NOT 503 on them: a missing
     log setting or a stalled background job must NEVER pull a live pod out of
     rotation. The ONLY hard 503 on /health/ready is MongoDB being unreachable.

  2. `production_readiness_report()` — the HARD, ENFORCEABLE gate. It combines
     the static logging/middleware snapshot with live scheduler + staff
     session-policy checks and returns a pass/fail. It is exposed to compliance
     admins at `GET /api/admin/soc2-readiness` and is meant to back a production
     uptime/alerting monitor (page on `ok: false`) and/or a deploy gate — so
     production is BLOCKED/ALERTED when a required control is inactive, without
     risking an availability outage from the liveness path.

Required production controls: REDACT_PII=1, LOG_FORMAT=json, full security
middleware stack loaded, required schedulers healthy (or a dedicated worker),
and staff session inactivity policies enabled.

Non-production (preview/dev) is INERT: `is_production()` is False, so every
check returns "ok".
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


# Staff roles whose session inactivity policy MUST be enabled in production.
REQUIRED_SESSION_POLICY_ROLES = ("admin", "manager", "worker")


async def session_policy_violations() -> list[str]:
    """Staff session inactivity policies (admin/manager/worker) must be ENABLED
    in production (SOC2 CC6.1 — bounded privileged sessions). Inert otherwise."""
    if not is_production():
        return []
    from config import db

    doc = await db.session_policies.find_one({"_id": "global"}, {"_id": 0})
    policies = (doc or {}).get("policies", {})
    v = []
    for role_type in REQUIRED_SESSION_POLICY_ROLES:
        if not policies.get(role_type, {}).get("enabled"):
            v.append(f"staff session policy not enabled: {role_type}")
    return v


async def production_readiness_report() -> dict:
    """HARD, enforceable readiness report (audit 735b3b7 #5).

    Combines the static logging/middleware snapshot (computed at startup) with
    LIVE scheduler + staff session-policy checks. Backs the compliance monitor
    endpoint `GET /api/admin/soc2-readiness` and any production deploy/uptime
    gate. Distinct from `/health/ready`, which is intentionally advisory.
    """
    violations = list(get_readiness_state().get("violations", []))
    violations += scheduler_violations()
    violations += await session_policy_violations()
    return {
        "ok": not violations,
        "production": is_production(),
        "violations": violations,
        "required_controls": {
            "REDACT_PII": "1",
            "LOG_FORMAT": "json",
            "middleware": sorted(REQUIRED_MIDDLEWARE),
            "schedulers": sorted(REQUIRED_SCHEDULERS),
            "session_policy_roles": list(REQUIRED_SESSION_POLICY_ROLES),
        },
    }
