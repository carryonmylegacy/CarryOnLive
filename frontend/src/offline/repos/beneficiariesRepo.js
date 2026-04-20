/**
 * CarryOn — Beneficiaries Offline Repository (Phase 1)
 * ============================================================================
 * Thin read-through / write-through adapter over the Dexie `beneficiary`
 * table. Every function is a pure accessor — it does NOT call the server;
 * page-level code still does that. The repo only knows how to read and
 * write the local mirror.
 *
 * Flag behaviour (see featureFlag.js):
 *   off     — callers bypass this module entirely, nothing changes.
 *   shadow  — pages still render from server responses; this module is
 *             written to as a side-effect so we can verify parity.
 *   on      — pages paint from `getLocal*` first, then refresh from the
 *             server, then call `upsertLocal*` to keep the mirror fresh.
 */

import { getDB } from '../db';
import { isOfflineEnabled } from '../featureFlag';

/** Returns all locally-cached beneficiaries for an estate, ordered as stored. */
export async function getLocalBeneficiaries(estateId) {
  if (!isOfflineEnabled() || !estateId) return [];
  try {
    const db = getDB();
    const rows = await db.beneficiary.where('estate_id').equals(estateId).toArray();
    // Strip our internal `_updatedAt` marker so the shape matches the server
    // response exactly — callers use the same `beneficiary.id`, etc.
    return rows.map(({ _updatedAt, ...rest }) => rest);
  } catch (err) {
    console.warn('[offline] getLocalBeneficiaries failed:', err);
    return [];
  }
}

/**
 * Replace the locally-cached list of beneficiaries for this estate with the
 * server's canonical list. Uses a transaction so we never show a half-empty
 * local cache mid-write.
 */
export async function upsertLocalBeneficiaries(estateId, list) {
  if (!isOfflineEnabled() || !estateId || !Array.isArray(list)) return;
  try {
    const db = getDB();
    const now = Date.now();
    const rows = list.map((b) => ({ ...b, estate_id: estateId, _updatedAt: now }));
    await db.transaction('rw', db.beneficiary, async () => {
      // Remove rows that are no longer on the server (beneficiary deleted).
      await db.beneficiary.where('estate_id').equals(estateId).delete();
      if (rows.length) await db.beneficiary.bulkPut(rows);
    });
    // Mark the sync so Phase 6 incremental fetches can skip if unchanged.
    await db.syncMeta.put({ entity_type: `beneficiaries:${estateId}`, last_synced_at: now });
  } catch (err) {
    console.warn('[offline] upsertLocalBeneficiaries failed:', err);
  }
}

/** Dev helper — total rows currently cached across all estates. */
export async function countLocalBeneficiaries() {
  try { return await getDB().beneficiary.count(); } catch { return 0; }
}

/**
 * Apply an optimistic patch to a single beneficiary locally. Merges the
 * patch into the existing row, bumps `_updatedAt`, and returns the merged
 * row (or null if the row doesn't exist yet). Call this BEFORE the server
 * PUT so the UI reacts instantly.
 */
export async function updateLocalBeneficiary(id, patch) {
  if (!isOfflineEnabled() || !id) return null;
  try {
    const db = getDB();
    const existing = await db.beneficiary.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...patch, _updatedAt: Date.now() };
    await db.beneficiary.put(merged);
    return merged;
  } catch (err) {
    console.warn('[offline] updateLocalBeneficiary failed:', err);
    return null;
  }
}

/** Remove a beneficiary from the local mirror. */
export async function deleteLocalBeneficiary(id) {
  if (!isOfflineEnabled() || !id) return;
  try { await getDB().beneficiary.delete(id); }
  catch (err) { console.warn('[offline] deleteLocalBeneficiary failed:', err); }
}

/**
 * Phase 2.1 — Insert a beneficiary that was created while offline into
 * the local mirror. Caller is responsible for generating the temp id
 * (use `generateTempId()` below). The record is tagged with
 * `_local_pending: true` so the UI can show a "syncing" badge if desired.
 */
export async function insertLocalBeneficiary(beneficiary) {
  if (!isOfflineEnabled() || !beneficiary?.id) return;
  try {
    const db = getDB();
    await db.beneficiary.put({
      ...beneficiary,
      _local_pending: true,
      _updatedAt: Date.now(),
    });
  } catch (err) { console.warn('[offline] insertLocalBeneficiary failed:', err); }
}

/**
 * Phase 2.1 — After the outbox drains a POST, the server returns the
 * real row with its canonical id. This helper atomically replaces the
 * temp row with the real row so the UI and local queries now see a
 * valid server id.
 */
export async function replaceLocalBeneficiaryId(tempId, serverRow) {
  if (!isOfflineEnabled() || !tempId || !serverRow?.id) return;
  try {
    const db = getDB();
    await db.transaction('rw', db.beneficiary, async () => {
      await db.beneficiary.delete(tempId);
      await db.beneficiary.put({ ...serverRow, _updatedAt: Date.now() });
    });
  } catch (err) { console.warn('[offline] replaceLocalBeneficiaryId failed:', err); }
}

/** Generate a client-side temp id for offline-created rows. */
export function generateTempId() {
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local-${rand}`;
}

/** Is this id a client-generated temp id (vs a server-assigned one)? */
export function isTempId(id) {
  return typeof id === 'string' && id.startsWith('local-');
}
