/**
 * Beneficiary offline cache — read-only multi-estate data layer.
 * ============================================================================
 *
 * Beneficiaries can be connected to several estates at once. When they
 * open the app offline, they expect to switch between every estate
 * they're a beneficiary of and read every section they have access to,
 * exactly the way they did online — only document file blobs and AI
 * Guardian chats and live transition alerts are gated.
 *
 * This module is the single source of truth for that read-only,
 * per-estate, per-section cache. Each beneficiary page calls
 * `cacheBenSection(...)` with the freshly-fetched data on a successful
 * online load, and `readBenSection(...)` to rehydrate on offline mount
 * (or as an instant skeleton-bypass on the second online visit).
 *
 * Cache keys live under the existing `carryon_list_cache:` namespace
 * so they share the storage budget and clearing semantics with other
 * list caches in the app.
 *
 * Sections cached:
 *   estates                  → the list of beneficiary-connected estates
 *   estate                   → the estate doc
 *   permissions              → per-estate beneficiary feature_access flags
 *   documents                → vault listing (metadata only — blobs are NEVER cached)
 *   messages                 → milestone messages addressed to this beneficiary
 *   checklist                → IAC items (read-only; toggling requires online)
 *   financial_bills          → bills designated to this beneficiary
 *   financial_debts          → debts designated to this beneficiary
 *   financial_accounts       → accounts designated to this beneficiary
 *   financial_property       → property/assets designated to this beneficiary
 *   primary_for              → list of estates this user is the primary on
 *   family_connections       → family-connection summary used by Settings page
 */

import { saveList, readList } from './localListCache';

const ESTATES_KEY = 'beneficiary:estates';
const PRIMARY_FOR_KEY = 'beneficiary:primary_for';
const FAMILY_CONN_KEY = 'beneficiary:family_connections';

/** Persist the user's beneficiary-connected estates list. */
export function cacheBenEstates(estatesArray) {
  if (Array.isArray(estatesArray)) saveList(ESTATES_KEY, estatesArray);
}
export function readBenEstates() {
  const v = readList(ESTATES_KEY);
  return Array.isArray(v) ? v : [];
}

/** Persist the "I am the designated primary on these estates" list. */
export function cacheBenPrimaryFor(rows) {
  if (Array.isArray(rows)) saveList(PRIMARY_FOR_KEY, rows);
}
export function readBenPrimaryFor() {
  const v = readList(PRIMARY_FOR_KEY);
  return Array.isArray(v) ? v : [];
}

/** Persist the beneficiary's family-connection summary (used by Settings). */
export function cacheBenFamilyConnections(rows) {
  if (Array.isArray(rows)) saveList(FAMILY_CONN_KEY, rows);
}
export function readBenFamilyConnections() {
  const v = readList(FAMILY_CONN_KEY);
  return Array.isArray(v) ? v : [];
}

/**
 * Per-estate, per-section cache.
 *
 * @param {string} estateId
 * @param {'estate'|'permissions'|'documents'|'messages'|'checklist'|'financial_bills'|'financial_debts'|'financial_accounts'|'financial_property'} section
 * @param {*} value  Plain JSON-serializable payload (array or object).
 */
export function cacheBenSection(estateId, section, value) {
  if (!estateId || !section) return;
  // Documents file blobs MUST never be cached — the user explicitly
  // chose online-only download to avoid 100s of MB of blob storage.
  // Scrub any stray base64/blob-like fields that might have leaked
  // into a document row before we persist it.
  if (section === 'documents' && Array.isArray(value)) {
    value = value.map(d => {
      const { file_data, content_b64, blob, ...rest } = d || {}; // eslint-disable-line no-unused-vars
      return rest;
    });
  }
  saveList(`beneficiary:${section}:${estateId}`, value);
}

export function readBenSection(estateId, section) {
  if (!estateId || !section) return null;
  return readList(`beneficiary:${section}:${estateId}`);
}

/**
 * Helper: detect offline state without lying when iOS PWA's
 * `navigator.onLine` is stale. Mirrors the helper used elsewhere.
 */
export function isOffline() {
  if (typeof window !== 'undefined' && typeof window.__isDeviceOffline === 'function') {
    try { return !!window.__isDeviceOffline(); } catch { /* fall through */ }
  }
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
