/**
 * CarryOn — User Profile Offline Repository (Phase 3)
 * ============================================================================
 * Mirrors the authenticated user's profile into IndexedDB so Settings and
 * the header avatar can paint instantly, and profile edits can be queued
 * via the outbox when offline.
 *
 * There is exactly one profile per device session, stored with a fixed
 * `id = 'current'`. Logout wipes this table via `purgeLocalData()`.
 *
 * Write-through:
 *   - `updateLocalProfile(patch)` merges a patch into the row and bumps
 *     `_updatedAt` so the UI reacts instantly.
 *   - The caller is responsible for enqueueing the matching PUT to the
 *     outbox; see `SettingsPage` / `PersonalInfoCard` wiring.
 */

import { getDB } from '../db';
import { isOfflineEnabled } from '../featureFlag';
import { sealRecord, unsealRecord } from '../crypto';

const KEY = 'current';
// Columns that MUST stay plaintext so Dexie can still query/index them.
const PLAIN_FIELDS = ['id', 'email'];

/** Read the cached profile, or null if never seeded. */
export async function getLocalProfile() {
  if (!isOfflineEnabled()) return null;
  try {
    const row = await getDB().user.get(KEY);
    if (!row) return null;
    // If the row was stored encrypted, unseal it. Transparent passthrough
    // when the row predates encryption.
    const unsealed = await unsealRecord(row);
    if (!unsealed) return null;
    const { _updatedAt, id, ...rest } = unsealed;
    return rest.data || null;
  } catch (err) {
    console.warn('[offline] getLocalProfile failed:', err);
    return null;
  }
}

/** Upsert the full server-canonical profile snapshot. */
export async function upsertLocalProfile(profile) {
  if (!isOfflineEnabled() || !profile) return;
  try {
    const row = {
      id: KEY,
      email: profile.email || null,
      data: profile,
      _updatedAt: Date.now(),
    };
    const sealed = await sealRecord(row, PLAIN_FIELDS);
    await getDB().user.put(sealed);
  } catch (err) {
    console.warn('[offline] upsertLocalProfile failed:', err);
  }
}

/** Merge an optimistic patch into the cached profile. */
export async function updateLocalProfile(patch) {
  if (!isOfflineEnabled() || !patch) return null;
  try {
    const db = getDB();
    const existingRaw = await db.user.get(KEY);
    const existing = existingRaw ? await unsealRecord(existingRaw) : null;
    const mergedProfile = { ...(existing?.data || {}), ...patch };
    const row = {
      id: KEY,
      email: mergedProfile.email || existing?.email || null,
      data: mergedProfile,
      _updatedAt: Date.now(),
    };
    const sealed = await sealRecord(row, PLAIN_FIELDS);
    await db.user.put(sealed);
    return mergedProfile;
  } catch (err) {
    console.warn('[offline] updateLocalProfile failed:', err);
    return null;
  }
}
