"""CarryOn™ Backend — Admin Routes Package

Combines all admin sub-routers into a single `router` for server.py.
"""

from fastapi import APIRouter, Depends

from guards import require_scope

from .analytics import router as analytics_router
from .audit_chain_status import router as audit_chain_status_router
from .bulk_ops import router as bulk_ops_router
from .canned_responses import router as canned_responses_router
from .dev_switcher import router as dev_switcher_router
from .download_diagnostics import router as download_diagnostics_router
from .download_diagnostics import ensure_indexes as ensure_download_diagnostics_indexes
from .funnel_analytics import router as funnel_analytics_router
from .funnel_analytics import ensure_indexes as ensure_funnel_analytics_indexes
from .email_health import router as email_health_router
from .email_health import ensure_indexes as ensure_email_health_indexes
from .email_health import email_health_scheduler
from .estate_health import router as estate_health_router
from .grace_periods import router as grace_periods_router
from .ip_whitelist import router as ip_whitelist_router
from .launch_war_room import router as launch_war_room_router
from .llm_cost import router as llm_cost_router
from .db_status import router as db_status_router
from .maintenance import router as maintenance_router
from .partners import router as partners_router
from .platform import router as platform_router
from .scoped_roles import router as scoped_roles_router
from .security_scan import router as security_scan_router
from .session_policy import router as session_policy_router
from .soc2_readiness import router as soc2_readiness_router
from .task_management import router as task_management_router
from .trial_policy import router as trial_policy_router
from .users import router as users_router

router = APIRouter()

# ── Router-level admin scope enforcement (SOC2 CC6.1) ───────────────────────
# Founder admins (and legacy admins with no scope) always pass. Operators are
# SCOPE-ENFORCED (audit 735b3b7 #1): mapped via derive_operator_scopes
# (manager → ops_manager, else ops_team) and must hold one of a router's
# allowed scopes — so an ops_team worker cannot reach finance / compliance /
# founder / platform_health routers. Scoped admins are restricted to their
# family. Families without an explicit scope below remain open to any
# admin/operator (unchanged behavior).
router.include_router(dev_switcher_router, dependencies=[Depends(require_scope("founder"))])
router.include_router(users_router, dependencies=[Depends(require_scope("compliance", "ops_manager"))])
router.include_router(analytics_router, dependencies=[Depends(require_scope("marketing", "ops_manager"))])
router.include_router(platform_router, dependencies=[Depends(require_scope("founder"))])
router.include_router(security_scan_router, dependencies=[Depends(require_scope("compliance"))])
router.include_router(estate_health_router, dependencies=[Depends(require_scope("compliance", "ops_manager"))])
router.include_router(grace_periods_router, dependencies=[Depends(require_scope("finance", "ops_manager"))])
router.include_router(scoped_roles_router, dependencies=[Depends(require_scope("founder"))])
router.include_router(ip_whitelist_router, dependencies=[Depends(require_scope("founder"))])
router.include_router(bulk_ops_router, dependencies=[Depends(require_scope("founder"))])
router.include_router(canned_responses_router, dependencies=[Depends(require_scope("ops_manager", "ops_team"))])
router.include_router(maintenance_router, dependencies=[Depends(require_scope("platform_health"))])
router.include_router(partners_router, dependencies=[Depends(require_scope("marketing"))])
router.include_router(session_policy_router, dependencies=[Depends(require_scope("compliance"))])
router.include_router(task_management_router, dependencies=[Depends(require_scope("ops_manager", "ops_team"))])
router.include_router(launch_war_room_router, dependencies=[Depends(require_scope("marketing", "ops_manager"))])
router.include_router(download_diagnostics_router, dependencies=[Depends(require_scope("platform_health"))])
router.include_router(funnel_analytics_router, dependencies=[Depends(require_scope("marketing"))])
router.include_router(email_health_router, dependencies=[Depends(require_scope("platform_health"))])
router.include_router(trial_policy_router, dependencies=[Depends(require_scope("finance"))])
router.include_router(llm_cost_router, dependencies=[Depends(require_scope("platform_health"))])
router.include_router(db_status_router, dependencies=[Depends(require_scope("platform_health"))])
router.include_router(audit_chain_status_router, dependencies=[Depends(require_scope("compliance"))])
router.include_router(soc2_readiness_router, dependencies=[Depends(require_scope("compliance"))])

__all__ = [
    "router",
    "ensure_download_diagnostics_indexes",
    "ensure_funnel_analytics_indexes",
    "ensure_email_health_indexes",
    "email_health_scheduler",
]
