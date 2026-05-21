"""
CarryOn™ Backend — Main Entry Point
Security-hardened with rate limiting, security headers, and CORS.
Routes organized in /routes/*.py, middleware in middleware.py, schedulers in schedulers.py.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from guards import require_admin
from starlette.middleware.gzip import GZipMiddleware

from config import client, db, logger
from middleware import (
    RateLimitMiddleware,
    RequestTraceMiddleware,
    SecurityHeadersMiddleware,
    configure_cors,
)
from routes.admin import router as admin_router
from routes.admin_digest import router as admin_digest_router
from routes.public_status import router as public_status_router
from routes.partner_brief import router as partner_brief_router
from routes.beneficiary_concierge import router as beneficiary_concierge_router
from routes.auth import router as auth_router
from routes.beneficiaries import router as beneficiaries_router
from routes.checklist import router as checklist_router
from routes.compliance import router as compliance_router
from routes.digest import router as digest_router
from routes.digital_wallet import router as digital_wallet_router
from routes.documents import router as documents_router
from routes.documents_designate import router as documents_designate_router
from routes.documents_vault_security import router as documents_vault_security_router
from routes.documents_voice import router as documents_voice_router
from routes.dts import router as dts_router
from routes.emergency_access import router as emergency_access_router
from routes.estates import router as estates_router
from routes.family_plan import router as family_plan_router
from routes.guardian import router as guardian_router
from routes.guardian_chat_sessions import router as guardian_chat_sessions_router
from routes.guardian_iac_tasks import router as guardian_iac_tasks_router
from routes.guardian_warmup import router as guardian_warmup_router
from routes.messages import router as messages_router
from routes.onboarding import router as onboarding_router
from routes.pdf_export import router as pdf_export_router
from routes.pdfs import router as pdfs_router
from routes.estate_binder import router as estate_binder_router
from routes.share import router as share_router
from routes.push import router as push_router
from routes.uploads_chunked import router as uploads_chunked_router
from routes.security import router as security_router
from routes.share_cards import router as share_cards_router
from routes.subscriptions import router as subscriptions_router
from routes.platform_rules import router as platform_rules_router
from routes.changelog import router as changelog_router
from routes.support import router as support_router
from routes.timeline import router as timeline_router
from routes.transition import router as transition_router
from routes.webauthn import router as webauthn_router
from routes.errors import router as errors_router
from routes.section_permissions import router as section_permissions_router
from routes.operators import router as operators_router
from routes.staff_tools import router as staff_tools_router
from routes.notifications import router as notifications_router
from routes.ops_dashboard import router as ops_dashboard_router
from routes.milestone_deliveries import router as milestone_deliveries_router
from routes.photos import router as photos_router
from routes.beta import router as beta_router
from routes.ffn import router as ffn_router
from routes.feature_gates import router as feature_gates_router
from routes.funnel import router as funnel_router
from routes.founder_invites import router as founder_invites_router
from routes.shift_scheduling import router as shift_scheduling_router
from routes.team_chat import router as team_chat_router
from routes.estate_chat import router as estate_chat_router
from routes.connected_protocol import router as ccp_router
from routes.ccp_depth import router as ccp_depth_router
from routes.downloads import router as downloads_router
from routes.notification_prefs import router as notification_prefs_router
from routes.training_tracker import router as training_tracker_router
from routes.ws_notifications import router as ws_router, sla_checker_loop
from routes.user_preferences import router as user_preferences_router
from routes.financial_portal import router as financial_portal_router
from routes.guardian_exports import router as guardian_exports_router
from routes.staff_ops import router as staff_ops_router
from routes.referrals import router as referrals_router
from routes.referrals import ensure_indexes as ensure_referral_indexes
from routes.trustee_access import router as trustee_access_router
from routes.admin import email_health_scheduler
from services.onboarding_drip import onboarding_drip_scheduler
from schedulers import (
    daily_dob_check_scheduler,
    data_retention_scheduler,
    weekly_digest_scheduler,
    milestone_delivery_scheduler,
    grace_period_scheduler,
    bill_reminder_scheduler,
)
from services.scheduler_lock import with_scheduler_lock


# ===================== SCHEDULER WRAPPERS =====================
# Each scheduler is wrapped with a distributed MongoDB lock so only ONE pod
# executes the periodic work at a time in multi-pod deployments. The lock
# degrades open if Mongo is unreachable, preserving single-pod behavior.


async def _locked(name: str, coro_factory, ttl_seconds: int = 900):
    """Run an async scheduler coroutine under a distributed lock.

    `coro_factory` is a no-arg callable returning a fresh coroutine. This is
    necessary because awaiting a scheduler coroutine more than once is illegal
    in asyncio — we only create it when/if we acquire the lock.
    """
    while True:
        try:
            async with with_scheduler_lock(name, ttl_seconds=ttl_seconds) as got:
                if got:
                    logger.info(f"scheduler[{name}] acquired lock; running")
                    await coro_factory()
                    return  # schedulers are infinite loops; return means the loop exited
                else:
                    logger.debug(f"scheduler[{name}] lock held by another pod; sleeping")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"scheduler[{name}] crashed: {e}; retrying in 60s")
        # If we didn't acquire, or the loop exited/crashed, sleep before retry.
        await asyncio.sleep(60)


# ===================== LIFECYCLE =====================


@asynccontextmanager
async def lifespan(app):
    from routes.trial_reminders import trial_reminder_scheduler
    from services.billing_lifecycle import billing_lifecycle_scheduler
    from routes.connected_protocol import drill_reminder_scheduler

    logger.info("CarryOn™ API started - ready for real accounts")

    # ── Startup security checks ──────────────────────────────────────────────
    import os as _os

    if _os.environ.get("STRIPE_API_KEY") and not _os.environ.get("STRIPE_WEBHOOK_SECRET"):
        logger.critical(
            "⚠️  STRIPE_WEBHOOK_SECRET is NOT set. Stripe webhooks will be REJECTED. "
            "Add it to Render env vars: Stripe Dashboard → Developers → Webhooks → Signing Secret."
        )
    if not _os.environ.get("SENTRY_DSN"):
        logger.warning("SENTRY_DSN not set — error monitoring inactive.")

    # Run migrations and create indexes (extracted to db_indexes.py)
    from db_indexes import ensure_indexes, run_migrations

    await run_migrations(db, logger)
    await ensure_indexes(db, logger)

    # New versioned schema-migration runner (Feb 2026) — applies anything
    # under /app/backend/migrations/ that hasn't been recorded in
    # db.schema_migrations yet. Safe to run on every boot; idempotent.
    try:
        from migrations.runner import run_pending as _run_pending_migrations

        _migration_result = await _run_pending_migrations()
        if _migration_result.get("applied"):
            logger.info(f"Versioned schema migrations: applied {_migration_result['applied']} new")
    except Exception as _mig_exc:
        # Migrations failing must NOT block boot — log and continue.
        logger.error(f"Schema migration runner failed: {_mig_exc}", exc_info=True)

    # Best-effort: download-diagnostics + funnel-analytics indexes
    try:
        from routes.admin import (
            ensure_download_diagnostics_indexes,
            ensure_funnel_analytics_indexes,
            ensure_email_health_indexes,
        )

        await ensure_download_diagnostics_indexes()
        await ensure_funnel_analytics_indexes()
        await ensure_referral_indexes()
        await ensure_email_health_indexes()
    except Exception as e:
        logger.warning(f"diagnostics index init failed: {e}")

    # LLM cost ledger indexes — observability for xAI spend.
    try:
        from services.llm_cost_ledger import ensure_indexes as _ensure_llm_indexes

        await _ensure_llm_indexes()
    except Exception as e:
        logger.warning(f"llm cost ledger index init failed: {e}")

    # Each scheduler is wrapped with a distributed lock. `_locked()` is itself
    # infinite so we restart the scheduler if it ever returns/crashes.
    # Health state (last_error / last_success / failure_count) is mirrored
    # into `_SCHEDULER_HEALTH` so /api/health can surface scheduler status.
    from middleware import register_scheduler_health  # health.py reads this

    async def _supervise(name, factory, ttl=900):
        failure_count = 0
        while True:
            try:
                register_scheduler_health(name, "running")
                await _locked(name, factory, ttl_seconds=ttl)
                # _locked is infinite — only reachable if it returns cleanly.
                failure_count = 0
                register_scheduler_health(name, "stopped")
            except asyncio.CancelledError:
                register_scheduler_health(name, "cancelled")
                raise
            except Exception as e:
                failure_count += 1
                logger.error(f"scheduler supervisor[{name}] error #{failure_count}: {e}")
                register_scheduler_health(name, "error", error=str(e), failure_count=failure_count)
            # Exponential backoff capped at 5 minutes so a persistent
            # failure (Mongo down, env var missing) doesn't spin
            # tight-looping logs but also doesn't take longer than 5
            # minutes to recover once the dependency comes back.
            backoff = min(300, 30 * (2 ** min(failure_count, 4)))
            await asyncio.sleep(backoff)

    scheduler_tasks: list[asyncio.Task] = []

    # ── Optional: skip in-process schedulers ─────────────────────────────
    # When deployed with a dedicated scheduler worker process (see
    # /app/backend/scheduler_worker.py), set DISABLE_INPROC_SCHEDULERS=1 in
    # the API pods so only the worker pod owns the scheduler loops. This
    # decouples background jobs from API process crashes/restarts.
    _disable_inproc = _os.environ.get("DISABLE_INPROC_SCHEDULERS", "").strip() in ("1", "true", "True", "yes")
    if _disable_inproc:
        logger.info(
            "DISABLE_INPROC_SCHEDULERS=1 — in-process schedulers skipped. "
            "Make sure scheduler_worker.py is running in a separate pod."
        )
    else:
        scheduler_tasks = [
            asyncio.create_task(_supervise("weekly_digest", weekly_digest_scheduler)),
            asyncio.create_task(_supervise("trial_reminders", trial_reminder_scheduler)),
            asyncio.create_task(_supervise("daily_dob_check", daily_dob_check_scheduler)),
            asyncio.create_task(_supervise("billing_lifecycle", billing_lifecycle_scheduler)),
            asyncio.create_task(_supervise("data_retention", data_retention_scheduler)),
            asyncio.create_task(_supervise("milestone_delivery", milestone_delivery_scheduler)),
            asyncio.create_task(_supervise("grace_period", grace_period_scheduler)),
            asyncio.create_task(_supervise("bill_reminder", bill_reminder_scheduler)),
            asyncio.create_task(_supervise("drill_reminder", drill_reminder_scheduler)),
            asyncio.create_task(_supervise("onboarding_drip", onboarding_drip_scheduler, ttl=600)),
            asyncio.create_task(_supervise("email_health", email_health_scheduler, ttl=600)),
        ]

    # Warm up xAI connection + start periodic keepalive (local per-pod, no lock needed)
    from routes.guardian_warmup import warmup_xai

    asyncio.create_task(warmup_xai())

    # Start real-time SLA breach checker (every 60s) — also distributed-locked.
    sla_task = asyncio.create_task(_supervise("sla_checker", sla_checker_loop, ttl=120))
    scheduler_tasks.append(sla_task)

    yield

    # ── Graceful shutdown: bounded wait so SIGTERM doesn't hang pods ──
    logger.info("CarryOn™ API shutting down — cancelling background schedulers")
    for t in scheduler_tasks:
        t.cancel()
    try:
        await asyncio.wait_for(
            asyncio.gather(*scheduler_tasks, return_exceptions=True),
            timeout=10.0,
        )
    except asyncio.TimeoutError:
        logger.warning("Some schedulers did not cancel within 10s; forcing exit")
    client.close()
    logger.info("CarryOn™ API shutdown complete")


# ===================== APP SETUP =====================

app = FastAPI(
    title="CarryOn™ API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    summary="Family Preparedness Platform — Partner & B2B Integration API",
    description=(
        "CarryOn™ is an offline-first family-preparedness platform. This is the "
        "public partner API surface. For B2B integrators: authentication uses "
        "Bearer JWT tokens issued by `POST /api/auth/login`. All write "
        "operations support Stripe-style `Idempotency-Key` headers for safe "
        "retry. See `memory/SECURITY_POSTURE.md` for security model details.\n\n"
        "**Support**: founder@carryon.us\n\n"
        "**Rate limits**: 600 req/60s per IP, 1200 req/60s per user. "
        "Auth endpoints: 20 attempts/60s per IP."
    ),
    contact={
        "name": "CarryOn API Support",
        "url": "https://app.carryon.us",
        "email": "founder@carryon.us",
    },
    license_info={
        "name": "Proprietary — © 2026 CarryOn Technologies LLC",
    },
    servers=[
        {"url": "https://carryon-api-kacr.onrender.com", "description": "Production"},
        {"url": "http://localhost:8001", "description": "Local dev"},
    ],
    openapi_tags=[
        {"name": "auth", "description": "Login, registration, password reset, 2FA, sessions"},
        {"name": "estates", "description": "Core estate (family-data grouping) CRUD"},
        {"name": "beneficiaries", "description": "Beneficiary records tied to an estate"},
        {"name": "checklists", "description": "Estate-completion checklists"},
        {"name": "messages", "description": "Time/event-triggered family messages"},
        {"name": "documents", "description": "Secure Document Vault (SDV)"},
        {"name": "subscriptions", "description": "Stripe billing & plan management"},
        {"name": "guardian", "description": "Estate Guardian AI (EGA) — Grok-powered"},
        {"name": "beneficiary-concierge", "description": "Beneficiary-side AI concierge (BEC)"},
        {"name": "admin", "description": "Operator/admin-only routes — restricted access"},
    ],
)

# API router — mounted at BOTH `/api` (legacy) and `/api/v1` (canonical)
# below. No prefix here so we can include it under multiple mount points.
api_router = APIRouter()

# Include all route modules
api_router.include_router(admin_digest_router)
api_router.include_router(public_status_router)
api_router.include_router(partner_brief_router)
api_router.include_router(beneficiary_concierge_router)
api_router.include_router(admin_router)
api_router.include_router(auth_router)
api_router.include_router(beneficiaries_router)
api_router.include_router(checklist_router)
api_router.include_router(compliance_router)
api_router.include_router(digest_router)
api_router.include_router(digital_wallet_router)
api_router.include_router(documents_router)
api_router.include_router(documents_vault_security_router)
api_router.include_router(documents_voice_router)
api_router.include_router(documents_designate_router)
api_router.include_router(dts_router)
api_router.include_router(emergency_access_router)
api_router.include_router(estates_router)
api_router.include_router(family_plan_router)
api_router.include_router(guardian_router)
api_router.include_router(guardian_chat_sessions_router)
api_router.include_router(guardian_iac_tasks_router)
api_router.include_router(guardian_warmup_router)
api_router.include_router(messages_router)
api_router.include_router(onboarding_router)
api_router.include_router(pdf_export_router)
api_router.include_router(push_router)
api_router.include_router(uploads_chunked_router)
api_router.include_router(security_router)
api_router.include_router(share_cards_router)
api_router.include_router(subscriptions_router)
api_router.include_router(support_router)
api_router.include_router(timeline_router)
api_router.include_router(transition_router)
api_router.include_router(webauthn_router)
api_router.include_router(errors_router)
api_router.include_router(pdfs_router)
api_router.include_router(estate_binder_router)
api_router.include_router(share_router)
api_router.include_router(section_permissions_router)
api_router.include_router(operators_router)
api_router.include_router(staff_tools_router)
api_router.include_router(feature_gates_router)
api_router.include_router(notifications_router)
api_router.include_router(ops_dashboard_router)
api_router.include_router(milestone_deliveries_router)
api_router.include_router(photos_router)
api_router.include_router(beta_router)
api_router.include_router(ffn_router)
api_router.include_router(funnel_router)
api_router.include_router(founder_invites_router)
api_router.include_router(shift_scheduling_router)
api_router.include_router(team_chat_router)
api_router.include_router(estate_chat_router)
api_router.include_router(ccp_router)
api_router.include_router(ccp_depth_router)
api_router.include_router(downloads_router)
api_router.include_router(notification_prefs_router)
api_router.include_router(training_tracker_router)
api_router.include_router(ws_router)
api_router.include_router(user_preferences_router)
api_router.include_router(financial_portal_router)
api_router.include_router(guardian_exports_router)
api_router.include_router(staff_ops_router)
api_router.include_router(platform_rules_router)
api_router.include_router(changelog_router)
api_router.include_router(referrals_router)
api_router.include_router(trustee_access_router)


BUILD_HASH = "2026-04-28T00:00:00Z-pre-launch-refactor"


@api_router.get("/health")
async def health_check():
    """Check API, database, and background scheduler health."""
    from middleware import get_scheduler_health

    try:
        await db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    schedulers = get_scheduler_health()
    # Roll up the scheduler statuses for a quick top-line view.
    sched_summary = {
        "total": len(schedulers),
        "running": sum(1 for s in schedulers.values() if s.get("status") == "running"),
        "errored": sum(1 for s in schedulers.values() if s.get("status") == "error"),
    }
    return {
        "status": "healthy",
        "database": db_status,
        "version": "1.0.0",
        "min_version": "1.0.0",
        "build": BUILD_HASH,
        "schedulers": sched_summary,
        "schedulers_detail": schedulers,
    }


@api_router.get("/health/live")
async def health_live():
    """Kubernetes/Render liveness probe — process is alive, do NOT touch DB."""
    return {"status": "alive"}


@api_router.get("/health/ready")
async def health_ready():
    """Kubernetes/Render readiness probe — pod ready to accept traffic.

    Returns 503 if critical dependencies are unreachable so the orchestrator
    pulls the pod out of rotation.
    """
    from fastapi.responses import JSONResponse

    checks = {}
    ok = True
    try:
        await asyncio.wait_for(db.command("ping"), timeout=2.0)
        checks["mongodb"] = "ok"
    except Exception as e:
        checks["mongodb"] = f"error: {e.__class__.__name__}"
        ok = False
    status_code = 200 if ok else 503
    return JSONResponse(
        status_code=status_code,
        content={"status": "ready" if ok else "not_ready", "checks": checks, "build": BUILD_HASH},
    )


@api_router.get("/debug/user-state")
async def debug_user_state(email: str, current_user: dict = Depends(require_admin)):
    """Diagnostic: check a user's multi-role state. Admin-only."""
    user = await db.users.find_one(
        {"email": email.lower().strip()},
        {
            "_id": 0,
            "id": 1,
            "role": 1,
            "is_also_benefactor": 1,
            "is_also_beneficiary": 1,
        },
    )
    if not user:
        return {"error": "User not found", "build": BUILD_HASH}
    estates = await db.estates.find(
        {"owner_id": user["id"]},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "beneficiaries": 1},
    ).to_list(10)
    ben_count = 0
    estate_detail = {}
    if estates:
        eid = estates[0]["id"]
        ben_count = await db.beneficiaries.count_documents({"estate_id": eid})
        doc_count = await db.documents.count_documents({"estate_id": eid})
        msg_count = await db.messages.count_documents({"estate_id": eid})
        vault_count = await db.vault_items.count_documents({"estate_id": eid})
        checklist_count = await db.checklists.count_documents({"estate_id": eid})
        estate_detail = {
            "estate_id": eid,
            "documents": doc_count,
            "messages": msg_count,
            "vault_items": vault_count,
            "checklists": checklist_count,
            "ben_user_ids": len(estates[0].get("beneficiaries", [])),
            "is_ghost_eligible": ben_count == 0
            and len(estates[0].get("beneficiaries", [])) == 0
            and vault_count == 0
            and estates[0].get("status") == "pre-transition",
        }
    return {
        "build": BUILD_HASH,
        "role": user.get("role"),
        "db_is_also_benefactor": user.get("is_also_benefactor", False),
        "db_is_also_beneficiary": user.get("is_also_beneficiary", False),
        "owns_estates": len(estates),
        "estate_names": [e.get("name") for e in estates],
        "beneficiary_count_in_first_estate": ben_count,
        "computed_is_also_benefactor": user.get("is_also_benefactor", False) or len(estates) > 0,
        "estate_detail": estate_detail,
    }


app.include_router(api_router, prefix="/api")

# ───── API v1 alias ─────
# Same router mounted under `/api/v1/*` in addition to `/api/*`. Existing
# frontend keeps using `/api` — no breaking change. New clients (partner
# B2B integrations, mobile SDKs) should target `/api/v1/*` so we can
# introduce `/api/v2/*` later without touching the legacy surface.
# Adding a new endpoint to `api_router` automatically exposes it at both
# `/api/<route>` AND `/api/v1/<route>` at zero maintenance cost.
app.include_router(api_router, prefix="/api/v1")

# ===================== OBSERVABILITY (OpenTelemetry, opt-in via ENABLE_OTEL=1) =====================
try:
    from tracing import setup_tracing

    setup_tracing(app)
except Exception as _otel_exc:  # pragma: no cover — never crash boot on tracing errors
    logger.warning(f"OTel setup skipped: {_otel_exc}")

# ===================== MIDDLEWARE (order: last added = first executed) =====================

# DoS hardening (Feb 2026): body-size cap + wall-clock timeout + in-flight cap.
# Added FIRST so it runs LAST in the request pipeline — we want auth and
# idempotency middleware to fail fast on malicious requests without burning
# our compute on running them through DoS checks.
try:
    from middleware_dos_hardening import DoSHardeningMiddleware

    app.add_middleware(DoSHardeningMiddleware)
except Exception as _dos_exc:
    logger.warning(f"DoS hardening middleware skipped: {_dos_exc}")

# Idempotency: opt-in via `Idempotency-Key` header on writes (Feb 2026).
# Replays cached response for 24h to make POST/PUT/DELETE/PATCH safely
# retry-able by mobile clients on flaky networks. Added BEFORE rate
# limiting so duplicate-keyed retries don't burn through the per-user
# token bucket.
try:
    from middleware_idempotency import IdempotencyMiddleware, _ensure_index as _idem_ensure_index

    app.add_middleware(IdempotencyMiddleware)

    @app.on_event("startup")
    async def _idempotency_indexes() -> None:
        try:
            await _idem_ensure_index()
            logger.info("Idempotency middleware indexes ensured")
        except Exception as exc:
            logger.warning(f"Idempotency index setup failed: {exc}")
except Exception as _idem_exc:
    logger.warning(f"Idempotency middleware skipped: {_idem_exc}")

# Trustee Audit (TMA) — snapshots + notifications on every mutation
# performed by a trustee operating in `acting_as` mode. Wrapped in a
# try/except so a packaging issue can never block server boot.
try:
    from middleware_trustee_audit import TrusteeAuditMiddleware

    app.add_middleware(TrusteeAuditMiddleware)
except Exception as _tma_exc:
    logger.warning(f"Trustee audit middleware skipped: {_tma_exc}")

app.add_middleware(RequestTraceMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, max_requests=20, window_seconds=60)
configure_cors(app)
app.add_middleware(GZipMiddleware, minimum_size=500)
