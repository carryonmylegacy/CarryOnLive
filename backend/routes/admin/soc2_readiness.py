"""CarryOn™ — Admin: SOC2 production-readiness monitor (audit 735b3b7 #5).

The HARD, enforceable readiness gate (as opposed to the advisory /health/ready).
Compliance-scoped. A production uptime/alert monitor (or deploy gate) should
poll this and page when `ok` is false — that is what BLOCKS/ALERTS production
when a required SOC2 control (REDACT_PII / LOG_FORMAT / middleware / schedulers /
staff session policies) is inactive, without risking an availability outage from
the liveness path.
"""

from fastapi import APIRouter, Depends

from utils import get_current_user

router = APIRouter()


@router.get("/admin/soc2-readiness")
async def get_soc2_readiness(current_user: dict = Depends(get_current_user)):
    """Full hard SOC2 readiness report. Compliance-scoped (router-level)."""
    from services.production_readiness import production_readiness_report

    return await production_readiness_report()
