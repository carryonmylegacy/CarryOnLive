"""CarryOn™ Backend — Admin: LLM cost ledger summary endpoint.

Exposes per-endpoint xAI spend so the admin dashboard can render a
"$X spent on AI this week" tile. Backed by `services.llm_cost_ledger`.
"""

from fastapi import APIRouter, Depends, Query

from guards import require_admin
from services.llm_cost_ledger import summary_for_user, summary_global

router = APIRouter()


@router.get("/admin/llm-cost-summary")
async def get_llm_cost_summary(
    days: int = Query(7, ge=1, le=90),
    user_id: str | None = Query(None),
    _admin: dict = Depends(require_admin),
):
    """Returns platform-wide xAI spend (or a single user's if `user_id` given).

    Window defaults to last 7 days, capped at 90 days (matches the
    180-day TTL on the cost-ledger collection).
    """
    if user_id:
        return await summary_for_user(user_id=user_id, days=days)
    return await summary_global(days=days)
