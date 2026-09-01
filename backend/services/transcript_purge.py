"""CarryOn™ — AI-transcript deletion cascade (deletion finality, Sep 2026).

EGA transcripts (`chat_history`) and BEC transcripts (`beneficiary_concierge_messages`)
must disappear when the estate or the user they belong to is hard-deleted.
Legacy rows carry no `estate_id`, so every cascade matches on BOTH keys —
an estate-only match is exactly how orphaned plaintext rows accumulated.
"""

from config import db

TRANSCRIPT_COLLECTIONS = ("chat_history", "beneficiary_concierge_messages")


async def purge_estate_transcripts(estate_ids) -> dict:
    """Delete every transcript row scoped to one estate id or a list of them."""
    ids = [estate_ids] if isinstance(estate_ids, str) else [e for e in estate_ids if e]
    counts = {c: 0 for c in TRANSCRIPT_COLLECTIONS}
    if not ids:
        return counts
    for coll in TRANSCRIPT_COLLECTIONS:
        r = await db[coll].delete_many({"estate_id": {"$in": ids}})
        counts[coll] = r.deleted_count
    return counts


async def purge_user_transcripts(user_id: str, estate_ids=()) -> dict:
    """Delete every transcript row written by `user_id` OR scoped to any of that
    user's estates — the user_id arm is what catches estate-less legacy rows."""
    counts = {c: 0 for c in TRANSCRIPT_COLLECTIONS}
    if not user_id:
        return counts
    clauses = [{"user_id": user_id}]
    ids = [e for e in estate_ids if e]
    if ids:
        clauses.append({"estate_id": {"$in": ids}})
    for coll in TRANSCRIPT_COLLECTIONS:
        r = await db[coll].delete_many({"$or": clauses})
        counts[coll] = r.deleted_count
    return counts
