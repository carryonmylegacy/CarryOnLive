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
 * AT-REST ENCRYPTION (audit 3153523 #4)
 * -------------------------------------
 * The FULL `/auth/me` payload (DOB, address, phone, etc.) is force-encrypted
 * into an `__enc` blob regardless of the offline feature flag — using the same
 * device-seed key path as the outbox — so it is NEVER mirrored in plaintext,
 * even for users who never enabled offline mode. FAILS CLOSED: when no key can
 * be derived, only display-identity fields (name/email/photo) are persisted so
 * the header/greeting still paint offline; the sensitive snapshot is dropped.
 */

import { getDB } from '../db';
import { sealRecordForce, unsealRecordForce } from '../crypto';

const KEY = 'current';
// Identity fields kept PLAINTEXT in the local mirror so the header, greeting
// and Profile page always render offline — even before the session key is
// primed. Genuinely sensitive fields (DOB, address, phone, SSN, etc.) live
// ONLY inside the encrypted `__enc` blob (the full `data` snapshot).
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

function displayOnlyRow(profile) {
  return {
    id: KEY,
    email: profile.email || null,
    name: profile.name || null,
    first_name: profile.first_name || null,
    last_name: profile.last_name || null,
    photo_url: profile.photo_url || null,
    _updatedAt: Date.now(),
  };
}

/**
 * Persist the canonical profile snapshot. The full `data` blob is force-sealed;
 * if no key can be derived we FAIL CLOSED to a display-only row (never plaintext
 * sensitive data).
 */
async function persistProfile(profile) {
  const row = { ...displayOnlyRow(profile), data: profile };
  const sealed = await sealRecordForce(row, PLAIN_FIELDS);
  if (!sealed || !sealed.__enc) {
    await getDB().user.put(displayOnlyRow(profile));
    return;
  }
  await getDB().user.put(sealed);
}

/** Read the cached profile, or null if never seeded. */
export async function getLocalProfile() {
  try {
    const row = await getDB().user.get(KEY);
    if (!row) return null;
    // Legacy plaintext row (full `data`, no `__enc`) — self-heal by re-sealing,
    // then serve the value this one time.
    if (row.data && !row.__enc) {
      try { await persistProfile(row.data); } catch { /* best-effort */ }
      return { ...pickDisplay(row), ...row.data };
    }
    // Try to unseal the full (sensitive) profile.
    const unsealed = await unsealRecordForce(row);
    if (unsealed && unsealed.data) {
      // Merge plaintext identity fields as a safety net (authoritative).
      return { ...pickDisplay(row), ...unsealed.data };
    }
    // Decryption unavailable (key not primed / blob missing) — fall back to the
    // plaintext identity subset so the user still sees their name/email/photo.
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
    await persistProfile(profile);
  } catch (err) {
    console.warn('[offline] upsertLocalProfile failed:', err);
  }
}

/** Merge an optimistic patch into the cached profile. */
export async function updateLocalProfile(patch) {
  if (!patch) return null;
  try {
    const existingRaw = await getDB().user.get(KEY);
    let existingData = {};
    if (existingRaw) {
      if (existingRaw.data && !existingRaw.__enc) {
        existingData = existingRaw.data;
      } else {
        const u = await unsealRecordForce(existingRaw);
        existingData = (u && u.data) || {};
      }
    }
    const mergedProfile = { ...existingData, ...patch };
    await persistProfile(mergedProfile);
    return mergedProfile;
  } catch (err) {
    console.warn('[offline] updateLocalProfile failed:', err);
    return null;
  }
}
