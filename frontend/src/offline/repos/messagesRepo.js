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
import { isOfflineEnabled } from '../featureFlag';

/** Returns all locally-cached MM rows for an estate, ordered by created_at desc. */
export async function getLocalMessages(estateId) {
  if (!isOfflineEnabled() || !estateId) return [];
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
 */
export async function upsertLocalMessages(estateId, list) {
  if (!isOfflineEnabled() || !estateId || !Array.isArray(list)) return;
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
