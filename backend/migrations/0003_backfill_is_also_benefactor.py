"""0003_backfill_is_also_benefactor — mark estate-owning beneficiaries dual-role.

Background: a user invited as a beneficiary who LATER creates their own estate
is a legitimate Benefactor Portal operator, but their stored
``is_also_benefactor`` flag was never set — login / ``/auth/me`` only compute it
on the fly for the API RESPONSE (``stored_flag OR owns_estate``) and never
persist it. Because ``get_current_user`` returns the RAW user doc, every
benefactor-write guard that keyed off the stored flag wrongly 403'd them.

This backfills the flag for all CURRENT estate owners whose role is not already
benefactor/admin and whose flag is unset. The runtime guards now also fall back
to a live estate-ownership lookup, so this migration is belt-and-suspenders +
a performance optimization (lets the guards short-circuit on the persisted
flag instead of querying ``estates`` on every write).

Idempotent: the ``is_also_benefactor != True`` filter makes re-runs a no-op.
"""

from __future__ import annotations


async def up(db) -> None:
    owner_ids = [oid for oid in await db.estates.distinct("owner_id") if oid]
    if not owner_ids:
        return
    await db.users.update_many(
        {
            "id": {"$in": owner_ids},
            "role": {"$nin": ["benefactor", "admin"]},
            "is_also_benefactor": {"$ne": True},
        },
        {"$set": {"is_also_benefactor": True}},
    )
