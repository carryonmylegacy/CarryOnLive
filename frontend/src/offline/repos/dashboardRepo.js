/**
 * CarryOn — Dashboard Tile Offline Repository (Phase 3)
 * ============================================================================
 * Mirrors the per-estate dashboard summary into IndexedDB so the home
 * Dashboard can paint its stat cards + readiness speedometer instantly
 * on cold boot or when offline.
 *
 * Unlike the per-entity tables (beneficiary, estate), this is a denormalized
 * snapshot table keyed by estate_id. One row == one dashboard. Overwritten
 * in-place on each successful fetch.
 *
 * Schema (see db.js `dashboardTile` store):
 *   {
 *     id: estateId,                  // primary key (acts as estate_id)
 *     estate_id: estateId,           // duplicate for by-estate index
 *     stats: { documents, messages, beneficiaries },
 *     readiness: { documents, messages, checklist, overall_score },
 *     checklists: [ ... ],
 *     financialSummary: { ... } | null,
 *     _updatedAt: Date.now(),
 *   }
 *
 * Gated on the offline feature flag.
 */

import { getDB } from '../db';
import { isOfflineEnabled } from '../featureFlag';

/** Read the cached dashboard tile for an estate, or null if missing. */
export async function getLocalDashboardTile(estateId) {
  if (!isOfflineEnabled() || !estateId) return null;
  try {
    const row = await getDB().dashboardTile.get(estateId);
    if (!row) return null;
    const { _updatedAt, ...rest } = row;
    return rest;
  } catch (err) {
    console.warn('[offline] getLocalDashboardTile failed:', err);
    return null;
  }
}

/** Upsert the full dashboard tile snapshot for an estate. */
export async function upsertLocalDashboardTile(estateId, tile) {
  if (!isOfflineEnabled() || !estateId || !tile) return;
  try {
    const db = getDB();
    const row = {
      id: estateId,
      estate_id: estateId,
      ...tile,
      _updatedAt: Date.now(),
    };
    await db.dashboardTile.put(row);
    await db.syncMeta.put({
      entity_type: `dashboardTile:${estateId}`,
      last_synced_at: row._updatedAt,
    });
  } catch (err) {
    console.warn('[offline] upsertLocalDashboardTile failed:', err);
  }
}

/** Read the cached readiness score for an estate, or null. */
export async function getLocalReadiness(estateId) {
  if (!isOfflineEnabled() || !estateId) return null;
  try {
    const row = await getDB().readinessScore.get(estateId);
    if (!row) return null;
    const { _updatedAt, ...rest } = row;
    return rest.data || null;
  } catch (err) {
    console.warn('[offline] getLocalReadiness failed:', err);
    return null;
  }
}

/** Upsert the readiness score for an estate. `data` is the full API payload. */
export async function upsertLocalReadiness(estateId, data) {
  if (!isOfflineEnabled() || !estateId || !data) return;
  try {
    const db = getDB();
    await db.readinessScore.put({
      estate_id: estateId,
      data,
      _updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[offline] upsertLocalReadiness failed:', err);
  }
}
