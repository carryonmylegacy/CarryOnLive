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
from schedulers import daily_dob_check_scheduler, weekly_digest_scheduler


# ===================== LIFECYCLE =====================


@asynccontextmanager
async def lifespan(app):
    from routes.trial_reminders import trial_reminder_scheduler

    logger.info("CarryOn™ API started - ready for real accounts")

    # Create security-critical database indexes
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
        await db.estates.create_index("owner_id")
        await db.documents.create_index("estate_id")
        await db.messages.create_index("estate_id")
        await db.beneficiaries.create_index("estate_id")
        await db.beneficiaries.create_index("user_id")
        await db.beneficiary_display_overrides.create_index([("user_id", 1), ("estate_id", 1)])
        await db.estates.create_index("beneficiaries")
        await db.checklists.create_index("estate_id")
        await db.chat_history.create_index([("user_id", 1), ("session_id", 1)])
        await db.token_blacklist.create_index("expires_at", expireAfterSeconds=0)
        await db.token_blacklist.create_index("jti")
        await db.otps.create_index("email")
        await db.failed_logins.create_index("email")
        # Drop conflicting old indexes if they exist, then recreate with unique=True
        try:
            await db.otp_trust.drop_index("user_id_1_ip_address_1")
        except Exception:
            pass
        try:
            await db.otp_trust.drop_index("otp_trust_user_ip_unique")
        except Exception:
            pass
        await db.otp_trust.create_index([("user_id", 1), ("ip_address", 1)], unique=True)
        await db.security_audit_log.create_index("user_id")
        await db.security_audit_log.create_index("created_at")
        await db.sensitive_access_log.create_index("user_id")
        await db.sensitive_access_log.create_index("timestamp")
        await db.consent_audit_log.create_index("user_id")
        await db.deletion_requests.create_index("user_id")
        await db.security_incidents.create_index("created_at")
        await db.user_consent.create_index("user_id", unique=True)
        await db.section_unlock_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.section_unlock_sessions.create_index([("user_id", 1), ("section_id", 1)])
        await db.apple_transactions.create_index("transaction_id", unique=True)
        await db.apple_webhook_log.create_index("received_at")
        await db.client_errors.create_index("created_at")
        await db.audit_trail.create_index([("timestamp", -1)])
        await db.audit_trail.create_index("actor_id")
        await db.audit_trail.create_index("category")
        # Performance indexes for frequently-queried collections
        await db.user_subscriptions.create_index("user_id")
        await db.user_subscriptions.create_index("status")
        await db.dts_tasks.create_index("estate_id")
        await db.dts_tasks.create_index("assigned_to")
        await db.death_certificates.create_index("estate_id")
        await db.death_certificates.create_index("beneficiary_id")
        await db.death_certificates.create_index("status")
        await db.tier_verifications.create_index("user_id")
        await db.family_plans.create_index("owner_id")
        await db.emergency_access.create_index("estate_id")
        await db.emergency_access.create_index("beneficiary_id")
        await db.section_security.create_index("estate_id")
        await db.digital_wallet.create_index("estate_id")
        await db.activity_log.create_index("user_id")
        await db.notifications.create_index("user_id")
        await db.notifications.create_index([("user_id", 1), ("read", 1)])
        logger.info("Database indexes created/verified")
    except Exception as e:
        logger.warning(f"Index creation warning (may already exist): {e}")

    digest_task = asyncio.create_task(weekly_digest_scheduler())
    reminder_task = asyncio.create_task(trial_reminder_scheduler())
    dob_task = asyncio.create_task(daily_dob_check_scheduler())

    # Warm up xAI connection + start periodic keepalive
    from routes.guardian import warmup_xai

    asyncio.create_task(warmup_xai())

    yield
    digest_task.cancel()
    reminder_task.cancel()
    dob_task.cancel()
    # Cancel xAI keepalive if running
    from routes.guardian import _xai_keepalive_task as ka_task

    if ka_task:
        ka_task.cancel()
    client.close()
    logger.info("CarryOn™ API shutting down")


# ===================== APP SETUP =====================

app = FastAPI(title="CarryOn™ API", version="1.0.0", lifespan=lifespan)

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
api_router.include_router(notifications_router)
api_router.include_router(ops_dashboard_router)
api_router.include_router(milestone_deliveries_router)
api_router.include_router(photos_router)


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
