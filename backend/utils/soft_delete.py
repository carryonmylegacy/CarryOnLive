from datetime import datetime, timezone


async def soft_delete(collection, filter_query: dict):
    """Mark a single document as deleted instead of removing it."""
    return await collection.update_one(
        filter_query,
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )


async def soft_delete_many(collection, filter_query: dict):
    """Mark multiple documents as deleted instead of removing them."""
    return await collection.update_many(
        filter_query,
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )


def not_deleted(query: dict = None) -> dict:
    """Merge a 'not soft-deleted' filter into an existing query dict."""
    base = {"deleted_at": None}
    if query:
        base.update(query)
    return base
