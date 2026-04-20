/**
 * CarryOn — Estates Offline Repository (Phase 3)
 * ============================================================================
 * Mirrors the user's owned estates list into IndexedDB so the Dashboard,
 * Beneficiaries, Vault, etc. can paint their "estate switcher" dropdowns
 * instantly — even on a cold, offline boot.
 *
 * Shape: one row per estate, keyed by server id. We store ALL estates the
 * user has any role in (owner OR beneficiary); callers filter by role.
 *
 * Gated on the offline feature flag (see featureFlag.js). When flag is
 * 'off', every export is a no-op — callers simply fall back to the server.
 */

import { getDB } from '../db';
import { isOfflineEnabled } from '../featureFlag';

/** Read all locally-cached estates (owned + beneficiary). */
export async function getLocalEstates() {
  if (!isOfflineEnabled()) return [];
  try {
    const rows = await getDB().estate.toArray();
    return rows.map(({ _updatedAt, ...rest }) => rest);
  } catch (err) {
    console.warn('[offline] getLocalEstates failed:', err);
    return [];
  }
}

/** Replace the local estate list with the server's canonical list. */
export async function upsertLocalEstates(list) {
  if (!isOfflineEnabled() || !Array.isArray(list)) return;
  try {
    const db = getDB();
    const now = Date.now();
    const rows = list.map((e) => ({ ...e, _updatedAt: now }));
    await db.transaction('rw', db.estate, async () => {
      await db.estate.clear();
      if (rows.length) await db.estate.bulkPut(rows);
    });
    await db.syncMeta.put({ entity_type: 'estates', last_synced_at: now });
  } catch (err) {
    console.warn('[offline] upsertLocalEstates failed:', err);
  }
}

/** Optimistic local patch to a single estate (e.g. rename). */
export async function updateLocalEstate(id, patch) {
  if (!isOfflineEnabled() || !id) return null;
  try {
    const db = getDB();
    const existing = await db.estate.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch, _updatedAt: Date.now() };
    await db.estate.put(merged);
    return merged;
  } catch (err) {
    console.warn('[offline] updateLocalEstate failed:', err);
    return null;
  }
}
