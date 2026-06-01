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
import { sealRecord, unsealRecord } from '../crypto';

const KEY = 'current';
// Identity fields kept PLAINTEXT in the local mirror so the header, greeting
// and Profile page always render offline — even if the encrypted blob can't
// be decrypted yet (cold boot before the session key is primed) OR the write
// raced a slow backend. Genuinely sensitive fields (DOB, address, phone, SSN,
// etc.) still live ONLY inside the encrypted `__enc` blob.
const DISPLAY_FIELDS = ['name', 'first_name', 'last_name', 'photo_url'];
const PLAIN_FIELDS = ['id', 'email', ...DISPLAY_FIELDS];

function pickDisplay(row) {
  const out = {};
  if (!row) return out;
  for (const f of ['email', ...DISPLAY_FIELDS]) {
    if (row[f] != null && row[f] !== '') out[f] = row[f];
  }
  return out;
}

/** Read the cached profile, or null if never seeded. */
export async function getLocalProfile() {
    try {
    const row = await getDB().user.get(KEY);
    if (!row) return null;
    // Try to unseal the full (sensitive) profile.
    const unsealed = await unsealRecord(row);
    if (unsealed && unsealed.data) {
      // Full decrypt succeeded — merge the plaintext identity fields as a
      // safety net (they're authoritative and never stale vs the blob).
      return { ...pickDisplay(row), ...unsealed.data };
    }
    // Decryption unavailable (key not primed / blob missing) — fall back to
    // the plaintext identity subset so the user still sees their name, email
    // and photo offline instead of "User" / empty.
    const display = pickDisplay(row);
    return Object.keys(display).length ? display : null;
  } catch (err) {
    console.warn('[offline] getLocalProfile failed:', err);
    return null;
  }
}

/** Upsert the full server-canonical profile snapshot. */
export async function upsertLocalProfile(profile) {
  if (!profile) return;
  try {
    const row = {
      id: KEY,
      email: profile.email || null,
      name: profile.name || null,
      first_name: profile.first_name || null,
      last_name: profile.last_name || null,
      photo_url: profile.photo_url || null,
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
  if (!patch) return null;
  try {
    const db = getDB();
    const existingRaw = await db.user.get(KEY);
    const existing = existingRaw ? await unsealRecord(existingRaw) : null;
    const mergedProfile = { ...(existing?.data || {}), ...patch };
    const row = {
      id: KEY,
      email: mergedProfile.email || existing?.email || (existingRaw && existingRaw.email) || null,
      name: mergedProfile.name || null,
      first_name: mergedProfile.first_name || null,
      last_name: mergedProfile.last_name || null,
      photo_url: mergedProfile.photo_url || null,
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
