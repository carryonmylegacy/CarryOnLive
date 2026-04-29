"""CarryOn™ Backend — Admin Routes Package

Combines all admin sub-routers into a single `router` for server.py.
"""

from fastapi import APIRouter

from .analytics import router as analytics_router
from .bulk_ops import router as bulk_ops_router
from .canned_responses import router as canned_responses_router
from .dev_switcher import router as dev_switcher_router
from .download_diagnostics import router as download_diagnostics_router
from .download_diagnostics import ensure_indexes as ensure_download_diagnostics_indexes
from .funnel_analytics import router as funnel_analytics_router
from .funnel_analytics import ensure_indexes as ensure_funnel_analytics_indexes
from .estate_health import router as estate_health_router
from .grace_periods import router as grace_periods_router
from .ip_whitelist import router as ip_whitelist_router
from .launch_war_room import router as launch_war_room_router
from .maintenance import router as maintenance_router
from .platform import router as platform_router
from .scoped_roles import router as scoped_roles_router
from .security_scan import router as security_scan_router
from .session_policy import router as session_policy_router
from .task_management import router as task_management_router
from .users import router as users_router

router = APIRouter()

router.include_router(dev_switcher_router)
router.include_router(users_router)
router.include_router(analytics_router)
router.include_router(platform_router)
router.include_router(security_scan_router)
router.include_router(estate_health_router)
router.include_router(grace_periods_router)
router.include_router(scoped_roles_router)
router.include_router(ip_whitelist_router)
router.include_router(bulk_ops_router)
router.include_router(canned_responses_router)
router.include_router(maintenance_router)
router.include_router(session_policy_router)
router.include_router(task_management_router)
router.include_router(launch_war_room_router)
router.include_router(download_diagnostics_router)
router.include_router(funnel_analytics_router)

__all__ = [
    "router",
    "ensure_download_diagnostics_indexes",
    "ensure_funnel_analytics_indexes",
]
