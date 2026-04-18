"""Beneficiaries — shared router, access helpers, and the FC free-access helper.
No route handlers in this file. All sub-modules import router from here.
"""

from datetime import datetime, timezone

from fastapi import APIRouter

from config import db, logger

router = APIRouter()


async def _grant_fc_free_access_if_applicable(estate_id: str, user_id: str) -> bool:
    """If `estate_id` has an active Founders Circle subscription, grant this
    beneficiary a free_access subscription override. Idempotent.

    Called whenever a beneficiary is linked to an estate (new account, existing
    account, or username/password login) so that beneficiaries ADDED AFTER FC
    activation also receive the promised free access.

    Returns True if an override was granted (or already existed), False otherwise.
    """
    try:
        fc = await db.founders_circle.find_one(
            {"estate_id": estate_id, "status": "active"},
            {"_id": 0, "id": 1, "tier": 1, "estate_id": 1},
        )
        if not fc:
            return False
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.subscription_overrides.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "user_id": user_id,
                    "free_access": True,
                    "reason": f"Founders Circle beneficiary (estate: {estate_id}, tier: {fc.get('tier')})",
                    "fc_estate_id": estate_id,
                    "fc_tier": fc.get("tier"),
                    "granted_at": now_iso,
                }
            },
            upsert=True,
        )
        logger.info(f"FC free_access granted to user {user_id} for estate {estate_id}")
        return True
    except Exception as e:
        # Failure here must NOT block the invitation acceptance flow. Log and
        # continue; an admin can grant the override manually if needed.
        logger.error(f"_grant_fc_free_access_if_applicable failed (estate={estate_id}, user={user_id}): {e}")
        return False
