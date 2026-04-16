"""
CarryOn™ Backend — Main Entry Point
Security-hardened with rate limiting, security headers, and CORS.
Routes organized in /routes/*.py, middleware in middleware.py, schedulers in schedulers.py.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
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
from routes.auth import router as auth_router
from routes.beneficiaries import router as beneficiaries_router
from routes.checklist import router as checklist_router
from routes.compliance import router as compliance_router
from routes.digest import router as digest_router
from routes.digital_wallet import router as digital_wallet_router
from routes.documents import router as documents_router
from routes.dts import router as dts_router
from routes.emergency_access import router as emergency_access_router
from routes.estates import router as estates_router
from routes.family_plan import router as family_plan_router
from routes.guardian import router as guardian_router
from routes.messages import router as messages_router
from routes.onboarding import router as onboarding_router
from routes.pdf_export import router as pdf_export_router
from routes.push import router as push_router
from routes.security import router as security_router
from routes.subscriptions import router as subscriptions_router
from routes.platform_rules import router as platform_rules_router
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
from routes.downloads import router as downloads_router
from routes.notification_prefs import router as notification_prefs_router
from routes.training_tracker import router as training_tracker_router
from routes.ws_notifications import router as ws_router, sla_checker_loop
from routes.user_preferences import router as user_preferences_router
from routes.financial_portal import router as financial_portal_router
from routes.guardian_exports import router as guardian_exports_router
from routes.staff_ops import router as staff_ops_router
from schedulers import (
    daily_dob_check_scheduler,
    data_retention_scheduler,
    weekly_digest_scheduler,
    milestone_delivery_scheduler,
    grace_period_scheduler,
    bill_reminder_scheduler,
)


# ===================== LIFECYCLE =====================


@asynccontextmanager
async def lifespan(app):
    from routes.trial_reminders import trial_reminder_scheduler
    from services.billing_lifecycle import billing_lifecycle_scheduler
    from routes.connected_protocol import drill_reminder_scheduler

    logger.info("CarryOn™ API started - ready for real accounts")

    # Run migrations and create indexes (extracted to db_indexes.py)
    from db_indexes import ensure_indexes, run_migrations

    await run_migrations(db, logger)
    await ensure_indexes(db, logger)

    digest_task = asyncio.create_task(weekly_digest_scheduler())
    reminder_task = asyncio.create_task(trial_reminder_scheduler())
    dob_task = asyncio.create_task(daily_dob_check_scheduler())
    billing_task = asyncio.create_task(billing_lifecycle_scheduler())
    retention_task = asyncio.create_task(data_retention_scheduler())
    asyncio.create_task(milestone_delivery_scheduler())
    asyncio.create_task(grace_period_scheduler())
    asyncio.create_task(bill_reminder_scheduler())
    asyncio.create_task(drill_reminder_scheduler())

    # Warm up xAI connection + start periodic keepalive
    from routes.guardian import warmup_xai

    asyncio.create_task(warmup_xai())

    # Start real-time SLA breach checker (every 60s)
    sla_task = asyncio.create_task(sla_checker_loop())

    yield
    digest_task.cancel()
    reminder_task.cancel()
    dob_task.cancel()
    billing_task.cancel()
    retention_task.cancel()
    sla_task.cancel()
    client.close()
    logger.info("CarryOn™ API shutting down")


# ===================== APP SETUP =====================

app = FastAPI(
    title="CarryOn™ API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# API router with /api prefix
api_router = APIRouter(prefix="/api")

# Include all route modules
api_router.include_router(admin_digest_router)
api_router.include_router(admin_router)
api_router.include_router(auth_router)
api_router.include_router(beneficiaries_router)
api_router.include_router(checklist_router)
api_router.include_router(compliance_router)
api_router.include_router(digest_router)
api_router.include_router(digital_wallet_router)
api_router.include_router(documents_router)
api_router.include_router(dts_router)
api_router.include_router(emergency_access_router)
api_router.include_router(estates_router)
api_router.include_router(family_plan_router)
api_router.include_router(guardian_router)
api_router.include_router(messages_router)
api_router.include_router(onboarding_router)
api_router.include_router(pdf_export_router)
api_router.include_router(push_router)
api_router.include_router(security_router)
api_router.include_router(subscriptions_router)
api_router.include_router(support_router)
api_router.include_router(timeline_router)
api_router.include_router(transition_router)
api_router.include_router(webauthn_router)
api_router.include_router(errors_router)
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
api_router.include_router(downloads_router)
api_router.include_router(notification_prefs_router)
api_router.include_router(training_tracker_router)
api_router.include_router(ws_router)
api_router.include_router(user_preferences_router)
api_router.include_router(financial_portal_router)
api_router.include_router(guardian_exports_router)
api_router.include_router(staff_ops_router)
api_router.include_router(platform_rules_router)


BUILD_HASH = "2026-03-10T17:05:00Z-fix-welcome-redirect"


@api_router.get("/health")
async def health_check():
    """Check API and database health."""
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "disconnected"
    return {
        "status": "healthy",
        "database": db_status,
        "version": "1.0.0",
        "min_version": "1.0.0",
        "build": BUILD_HASH,
    }


@api_router.get("/debug/user-state")
async def debug_user_state(email: str):
    """Diagnostic: check a user's multi-role state. No sensitive data exposed."""
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


app.include_router(api_router)

# ===================== MIDDLEWARE (order: last added = first executed) =====================

app.add_middleware(RequestTraceMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, max_requests=20, window_seconds=60)
configure_cors(app)
app.add_middleware(GZipMiddleware, minimum_size=500)
