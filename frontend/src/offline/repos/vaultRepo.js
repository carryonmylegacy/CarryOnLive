/**
 * CarryOn — Secure Document Vault Offline Repository (Phase 5)
 * ============================================================================
 * Mirrors per-estate document metadata into IndexedDB so the Vault landing
 * screen can paint the document grid instantly on cold boot or when offline.
 *
 * SCOPE — METADATA ONLY:
 *   We intentionally do NOT cache encrypted document blobs. Unlocking a
 *   vault item requires the server's per-estate AES-GCM key derivation
 *   (600k PBKDF2 iterations), which must happen server-side. The offline
 *   mirror lets the user see WHICH documents they have; opening one still
 *   requires connectivity. This is a deliberate security trade-off.
 *
 * Schema (see db.js `vaultItem` store):
 *   vaultItem: 'id, estate_id, category, _updatedAt'
 *
 * Gated on the offline feature flag.
 */

import { getDB } from '../db';
import { isOfflineEnabled } from '../featureFlag';

/** Read the cached document list for an estate, in the order stored. */
export async function getLocalVaultItems(estateId) {
  if (!isOfflineEnabled() || !estateId) return [];
  try {
    const rows = await getDB().vaultItem.where('estate_id').equals(estateId).toArray();
    return rows.map(({ _updatedAt, ...rest }) => rest);
  } catch (err) {
    console.warn('[offline] getLocalVaultItems failed:', err);
    return [];
  }
}

/** Replace the cached list for this estate with the server's canonical list. */
export async function upsertLocalVaultItems(estateId, list) {
  if (!isOfflineEnabled() || !estateId || !Array.isArray(list)) return;
  try {
    const db = getDB();
    const now = Date.now();
    const rows = list.map((d) => ({ ...d, estate_id: estateId, _updatedAt: now }));
    await db.transaction('rw', db.vaultItem, async () => {
      await db.vaultItem.where('estate_id').equals(estateId).delete();
      if (rows.length) await db.vaultItem.bulkPut(rows);
    });
    await db.syncMeta.put({
      entity_type: `vaultItems:${estateId}`,
      last_synced_at: now,
    });
  } catch (err) {
    console.warn('[offline] upsertLocalVaultItems failed:', err);
  }
}
