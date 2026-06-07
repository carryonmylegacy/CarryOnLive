/**
 * CarryOn — DAV cache sanitizer (audit d5a54f5e P0 + #1798 P1).
 * ============================================================================
 * The owner/beneficiary `GET /digital-wallet/:estate` response returns DAV
 * entries with DECRYPTED `password` + `additional_access` AND free-text
 * `notes`. Notes routinely hold recovery hints, PIN context, backup-code
 * instructions and beneficiary access steps — i.e. they are just as sensitive
 * as the password itself. None of this may ever land in `localStorage`
 * (airplane-mode list caches) where it would sit in plaintext on the device.
 *
 * We use an ALLOWLIST (not a denylist) for cached DAV rows: only the small set
 * of non-sensitive fields needed to render the offline list survives. Any new
 * field added to the DAV model is therefore secret-by-default in caches until
 * explicitly allowlisted here.
 *
 * Every code path that caches DAV entries (DigitalWalletPage,
 * FinancialPortalPage portal blob, offline warmup) MUST route the payload
 * through `sanitizeDavList` / `sanitizeDavEntry` before calling `saveList`.
 */

// Non-sensitive fields kept for offline list rendering. NOTE: `notes`,
// `password`, `additional_access`, `encrypted_password`, `encrypted_additional`
// are deliberately absent — they are stripped from every cached row.
const DAV_CACHE_ALLOWLIST = [
  'id',
  'estate_id',
  'account_name',
  'login_username',
  'category',
  'beneficiary_visibility',
  'assigned_beneficiary_id',
  'assigned_beneficiary_name',
  'linked_entity_id',
  'linked_entity_name',
  'source_type',
  'source_id',
  'source_label',
  'source_tab',
  'created_at',
  'updated_at',
  'deleted_at',
];

export function sanitizeDavEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const clean = {};
  for (const k of DAV_CACHE_ALLOWLIST) {
    if (k in entry) clean[k] = entry[k];
  }
  return clean;
}

export function sanitizeDavList(list) {
  if (!Array.isArray(list)) return list;
  return list.map(sanitizeDavEntry);
}

// A cached row "needs sanitizing" if it carries ANY field outside the
// allowlist — this catches plaintext secrets AND notes (and any future
// sensitive field) so the boot purge rewrites notes-only leaks too.
function entryNeedsSanitize(e) {
  if (!e || typeof e !== 'object') return false;
  return Object.keys(e).some((k) => !DAV_CACHE_ALLOWLIST.includes(k));
}

function listNeedsSanitize(list) {
  return Array.isArray(list) && list.some(entryNeedsSanitize);
}

/**
 * One-time, self-healing migration: walk every `carryon_list_cache:*` entry
 * that can hold DAV rows (`financial:dav:*` lists and `financial:portal:*`
 * blobs), and rewrite any that still carry non-allowlisted fields (plaintext
 * secrets OR notes) from an older build. After the first boot nothing is
 * dirty, so subsequent boots no-op. Called from `index.js` on app start.
 */
export function purgeLeakedDavSecrets() {
  try {
    if (typeof localStorage === 'undefined') return;
    const PREFIX = 'carryon_list_cache:';
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && (k.includes('financial:dav:') || k.includes('financial:portal:'))) {
        keys.push(k);
      }
    }
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        let v = parsed?.v;
        let dirty = false;
        if (Array.isArray(v)) {
          if (listNeedsSanitize(v)) { v = sanitizeDavList(v); dirty = true; }
        } else if (v && typeof v === 'object' && Array.isArray(v.dav) && listNeedsSanitize(v.dav)) {
          v = { ...v, dav: sanitizeDavList(v.dav) };
          dirty = true;
        }
        if (dirty) localStorage.setItem(k, JSON.stringify({ ...parsed, v }));
      } catch { /* skip corrupt entry */ }
    }
  } catch { /* non-fatal */ }
}

export default sanitizeDavList;
