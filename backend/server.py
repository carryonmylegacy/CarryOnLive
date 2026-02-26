"""
CarryOn™ Backend — Main Entry Point
Refactored: shared code in config.py, utils.py, models.py
Routes organized in /routes/*.py
"""
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from config import db, logger, client
import os
import asyncio
from datetime import datetime, timezone, timedelta

# Create the main app
app = FastAPI(title="CarryOn™ API", version="1.0.0")

# Create the /api prefix router
api_router = APIRouter(prefix="/api")

# Import all route modules
from routes.auth import router as auth_router
from routes.admin import router as admin_router
from routes.estates import router as estates_router
from routes.beneficiaries import router as beneficiaries_router
from routes.documents import router as documents_router
from routes.messages import router as messages_router
from routes.checklist import router as checklist_router
from routes.transition import router as transition_router
from routes.dts import router as dts_router
from routes.guardian import router as guardian_router
from routes.subscriptions import router as subscriptions_router
from routes.support import router as support_router
from routes.family_plan import router as family_plan_router
from routes.digital_wallet import router as digital_wallet_router
from routes.pdf_export import router as pdf_export_router
from routes.security import router as security_router
from routes.push import router as push_router
from routes.digest import router as digest_router

# Include all routers
api_router.include_router(auth_router)
api_router.include_router(admin_router)
api_router.include_router(estates_router)
api_router.include_router(beneficiaries_router)
api_router.include_router(documents_router)
api_router.include_router(messages_router)
api_router.include_router(checklist_router)
api_router.include_router(transition_router)
api_router.include_router(dts_router)
api_router.include_router(guardian_router)
api_router.include_router(subscriptions_router)
api_router.include_router(support_router)
api_router.include_router(family_plan_router)
api_router.include_router(digital_wallet_router)
api_router.include_router(pdf_export_router)
api_router.include_router(security_router)
api_router.include_router(push_router)
api_router.include_router(digest_router)

# Health check
@api_router.get("/health")
async def health_check():
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "disconnected"
    return {"status": "healthy", "database": db_status, "version": "1.0.0"}

# Include the main router
app.include_router(api_router)

# Startup/Shutdown
async def weekly_digest_scheduler():
    """Background task: sends weekly digest every Monday at 8 AM EST."""
    from routes.digest import run_weekly_digest
    while True:
        now = datetime.now(timezone.utc)
        # Next Monday 8 AM EST (13:00 UTC)
        days_ahead = (7 - now.weekday()) % 7  # 0 = Monday
        if days_ahead == 0 and now.hour >= 13:
            days_ahead = 7
        next_monday = (now + timedelta(days=days_ahead)).replace(
            hour=13, minute=0, second=0, microsecond=0
        )
        wait_seconds = (next_monday - now).total_seconds()
        logger.info(f"Weekly digest scheduled for {next_monday.isoformat()} ({wait_seconds/3600:.1f}h away)")
        await asyncio.sleep(wait_seconds)
        try:
            result = await run_weekly_digest("https://carryon.us/dashboard")
            logger.info(f"Weekly digest sent: {result}")
        except Exception as e:
            logger.error(f"Weekly digest failed: {e}")

@app.on_event("startup")
async def startup_event():
    logger.info("CarryOn™ API started - ready for real accounts")
    asyncio.create_task(weekly_digest_scheduler())

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
