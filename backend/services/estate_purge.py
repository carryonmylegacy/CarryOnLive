"""CarryOn™ — Estate/User storage purge (SOC2 deletion finality, audit 5391e8b #6).

When an estate or user is HARD-deleted, the encrypted blobs in object storage
(documents, message video/voice/attachments, chat media, entity/binder PDFs,
photos) must be enumerated and deleted BEFORE the DB rows are removed — once the
metadata that points to a blob is gone, the encrypted material is orphaned in
S3/local storage forever.

Strategy (defence in depth):
  1. Enumerate documents → delete each `storage_key`.
  2. Enumerate messages → delete estate-scoped + legacy media blobs.
  3. Sweep the estate's storage prefixes (`estates/{id}/`, `photos/estates/{id}/`)
     to catch everything else written via `storage.upload(..., estate_id, ...)`
     and any blob whose metadata row was already gone.

All operations are best-effort: a missing blob never aborts the deletion.
"""

from config import db, logger
from services.storage import storage


async def _safe_delete(key: str) -> None:
    try:
        await storage.delete(key)
    except Exception as e:
        logger.warning(f"[estate_purge] delete failed for {key}: {e}")


async def purge_estate_storage(estate_id: str) -> dict:
    """Delete every object-storage blob owned by an estate. Call BEFORE removing
    the estate's DB rows. Returns a small counter dict for audit/logging."""
    if not estate_id:
        return {"documents": 0, "messages": 0, "prefixes": 0}
    counts = {"documents": 0, "messages": 0, "prefixes": 0}

    # 1) Documents — explicit estate-scoped storage_key.
    async for doc in db.documents.find(
        {"estate_id": estate_id},
        {"_id": 0, "id": 1, "storage_key": 1},
    ):
        key = doc.get("storage_key")
        if key:
            await _safe_delete(key)
            counts["documents"] += 1

    # 2) Messages — video/voice/attachment blobs (estate-scoped + legacy prefixes).
    async for msg in db.messages.find(
        {"estate_id": estate_id},
        {"_id": 0, "id": 1, "video_url": 1, "voice_url": 1, "attachment_url": 1},
    ):
        for _url, _legacy in (
            (msg.get("video_url"), "videos"),
            (msg.get("voice_url"), "voices"),
            (msg.get("attachment_url"), "attachments"),
        ):
            if not _url:
                continue
            await _safe_delete(f"estates/{estate_id}/{_url}")
            await _safe_delete(f"{_legacy}/{_url}")
            counts["messages"] += 1

    # 3) Sweep the estate's storage prefixes — chat media, entity/binder PDFs,
    #    quickstart media, estate photos, and any orphaned blob.
    for prefix in (f"estates/{estate_id}/", f"photos/estates/{estate_id}/"):
        try:
            counts["prefixes"] += await storage.purge_prefix(prefix)
        except Exception as e:
            logger.warning(f"[estate_purge] prefix purge failed for {prefix}: {e}")

    logger.info(f"[estate_purge] estate={estate_id} purged storage: {counts}")
    return counts


async def purge_user_storage(user_id: str) -> int:
    """Delete a user's personal media + cached PDFs. Estate-owned blobs are
    handled per-estate by purge_estate_storage. Best-effort.

    Covers (audit 735b3b7 #4):
      • profile photos          → photos/users/{id}/
      • cached "latest" PDFs    → latest-pdfs/{id}/ (QuickStart guide, binder
                                  exports, etc. — written by routes/pdfs.py and
                                  routes/quickstart.py)
    """
    if not user_id:
        return 0
    removed = 0
    for prefix in (f"photos/users/{user_id}/", f"latest-pdfs/{user_id}/"):
        try:
            removed += await storage.purge_prefix(prefix)
        except Exception as e:
            logger.warning(f"[estate_purge] user storage purge failed for {prefix}: {e}")
    logger.info(f"[estate_purge] user={user_id} purged {removed} personal blob(s)")
    return removed
