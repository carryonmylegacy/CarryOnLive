/**
 * CarryOn — Milestone Messages Offline Repository
 * ============================================================================
 * Read/write mirror for the Messages page (`/messages`) so returning
 * users can browse their MM list while offline and so the page no
 * longer flashes its "Create your first milestone message" empty state
 * whenever the /messages fetch fails on airplane mode.
 *
 * Same flag contract as every other repo (see featureFlag.js).
 */

import { getDB } from '../db';

/** Returns all locally-cached MM rows for an estate, ordered by created_at desc.
 *  Flag-agnostic read — the mirror is a safety net even for users who have
 *  the offline flag off. See Apr 24, 2026 airplane-mode regression. */
export async function getLocalMessages(estateId) {
  if (!estateId) return [];
  try {
    const db = getDB();
    const rows = await db.milestoneMessage
      .where('estate_id')
      .equals(estateId)
      .toArray();
    // Strip our internal `_updatedAt` marker so shape matches server.
    const cleaned = rows.map(({ _updatedAt, ...rest }) => rest);
    // Sort newest-first to match server default.
    cleaned.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return cleaned;
  } catch (err) {
    console.warn('[offline] getLocalMessages failed:', err);
    return [];
  }
}

/**
 * Replace the locally-cached MM list for this estate with the server's
 * canonical list. Transactional so we never show a half-empty cache
 * mid-write.
 *
 * Use `upsertLocalMessagesPreservingPending` instead from the
 * online-refresh path — it keeps locally-queued offline rows alive
 * until the server confirms them.
 */
export async function upsertLocalMessages(estateId, list) {
  if (!estateId || !Array.isArray(list)) return;
  try {
    const db = getDB();
    const now = Date.now();
    const rows = list.map((m) => ({ ...m, estate_id: estateId, _updatedAt: now }));
    await db.transaction('rw', db.milestoneMessage, async () => {
      await db.milestoneMessage.where('estate_id').equals(estateId).delete();
      if (rows.length) await db.milestoneMessage.bulkPut(rows);
    });
    await db.syncMeta.put({ entity_type: `messages:${estateId}`, last_synced_at: now });
  } catch (err) {
    console.warn('[offline] upsertLocalMessages failed:', err);
  }
}

/**
 * Insert a single optimistic milestone-message row into the local cache.
 * Used by the offline-queue path in `MessagesPage` so a video/voice
 * message captured offline appears INSTANTLY in the user's MM list
 * with a `_pending: true` marker, rather than vanishing until the
 * upload drains and the next online refresh pulls the server row.
 */
export async function insertLocalMessage(message) {
  if (!message || !message.estate_id) return null;
  try {
    const db = getDB();
    const row = {
      ...message,
      _updatedAt: Date.now(),
      _pending: true, // surfaces a "Queued — will sync" badge in the UI
    };
    await db.milestoneMessage.put(row);
    return row;
  } catch (err) {
    console.warn('[offline] insertLocalMessage failed:', err);
    return null;
  }
}

/**
 * Replace the cached list with the server's canonical list while
 * preserving any locally-`_pending` rows that haven't been sent yet.
 * Use this from the online-refresh path so we never wipe a queued
 * recording on its way to the server.
 */
export async function upsertLocalMessagesPreservingPending(estateId, list) {
  if (!estateId || !Array.isArray(list)) return;
  try {
    const db = getDB();
    const now = Date.now();
    const pending = await db.milestoneMessage
      .where('estate_id').equals(estateId)
      .filter((r) => r._pending === true)
      .toArray();
    const serverIds = new Set(list.map((m) => m.id));
    const survivingPending = pending.filter((r) => !serverIds.has(r.id));
    const serverRows = list.map((m) => ({ ...m, estate_id: estateId, _updatedAt: now }));
    await db.transaction('rw', db.milestoneMessage, async () => {
      await db.milestoneMessage.where('estate_id').equals(estateId).delete();
      if (survivingPending.length) await db.milestoneMessage.bulkPut(survivingPending);
      if (serverRows.length) await db.milestoneMessage.bulkPut(serverRows);
    });
    await db.syncMeta.put({ entity_type: `messages:${estateId}`, last_synced_at: now });
  } catch (err) {
    console.warn('[offline] upsertLocalMessagesPreservingPending failed:', err);
  }
}
