"""CarryOn™ Backend — Admin Routes Package

Combines all admin sub-routers into a single `router` for server.py.
"""

from fastapi import APIRouter

from .analytics import router as analytics_router
from .dev_switcher import router as dev_switcher_router
from .estate_health import router as estate_health_router
from .grace_periods import router as grace_periods_router
from .platform import router as platform_router
from .security_scan import router as security_scan_router
from .users import router as users_router

router = APIRouter()

router.include_router(dev_switcher_router)
router.include_router(users_router)
router.include_router(analytics_router)
router.include_router(platform_router)
router.include_router(security_scan_router)
router.include_router(estate_health_router)
router.include_router(grace_periods_router)
