/**
 * CarryOn — Founder Voices Offline Repository (Phase 5)
 * ============================================================================
 * Mirrors the public Voices feed (quotes curated via the Share Your CarryOn
 * flow) so the landing-page strip and /voices wall continue to render on
 * flaky or absent connectivity.
 *
 * Public, unauthenticated data — safe to cache without concern.
 *
 * Schema (see db.js `voicesQuote` store):
 *   voicesQuote: 'id, _updatedAt'
 */

import { getDB } from '../db';

/** All cached public voices, ordered as stored. */
export async function getLocalVoices() {
    try {
    const rows = await getDB().voicesQuote.toArray();
    return rows.map(({ _updatedAt, ...rest }) => rest);
  } catch (err) {
    console.warn('[offline] getLocalVoices failed:', err);
    return [];
  }
}

/** Replace the cached list with the server's canonical list. */
export async function upsertLocalVoices(list) {
  if (!Array.isArray(list)) return;
  try {
    const db = getDB();
    const now = Date.now();
    const rows = list.map((v) => ({ ...v, _updatedAt: now }));
    await db.transaction('rw', db.voicesQuote, async () => {
      await db.voicesQuote.clear();
      if (rows.length) await db.voicesQuote.bulkPut(rows);
    });
    await db.syncMeta.put({ entity_type: 'voicesPublic', last_synced_at: now });
  } catch (err) {
    console.warn('[offline] upsertLocalVoices failed:', err);
  }
}
