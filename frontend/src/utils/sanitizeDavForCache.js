/**
 * CarryOn — DAV secret sanitizer for browser caches (audit d5a54f5e P0).
 * ============================================================================
 * The owner/beneficiary `GET /digital-wallet/:estate` response returns DAV
 * entries with their DECRYPTED `password` + `additional_access` fields so the
 * UI can reveal them on demand. Those decrypted secrets must NEVER be written
 * to `localStorage` (airplane-mode list caches) where they would sit in
 * plaintext on the device indefinitely.
 *
 * Every code path that caches DAV entries (DigitalWalletPage,
 * FinancialPortalPage portal blob, offline warmup) MUST route the payload
 * through `sanitizeDavList` / `sanitizeDavEntry` before calling `saveList`.
 *
 * Non-secret fields (account_name, login_username, notes, category,
 * assignments, visibility, linked entity, ids) are preserved so the offline
 * list still renders — only the secret material is dropped. Offline reveal of
 * a password simply shows blank, which is the correct fail-closed posture.
 */

const SECRET_FIELDS = [
  'password',
  'additional_access',
  'encrypted_password',
  'encrypted_additional',
];

export function sanitizeDavEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const clean = { ...entry };
  for (const f of SECRET_FIELDS) {
    if (f in clean) delete clean[f];
  }
  return clean;
}

export function sanitizeDavList(list) {
  if (!Array.isArray(list)) return list;
  return list.map(sanitizeDavEntry);
}

function entryHasSecret(e) {
  return !!e && typeof e === 'object' && SECRET_FIELDS.some((f) => f in e);
}

function listHasSecret(list) {
  return Array.isArray(list) && list.some(entryHasSecret);
}

/**
 * One-time, self-healing migration: walk every `carryon_list_cache:*` entry
 * that can hold DAV rows (`financial:dav:*` lists and `financial:portal:*`
 * blobs), and rewrite any that still carry plaintext secrets from an older
 * build. After the first boot nothing is dirty, so subsequent boots no-op.
 * Called from `index.js` on app start.
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
          if (listHasSecret(v)) { v = sanitizeDavList(v); dirty = true; }
        } else if (v && typeof v === 'object' && Array.isArray(v.dav) && listHasSecret(v.dav)) {
          v = { ...v, dav: sanitizeDavList(v.dav) };
          dirty = true;
        }
        if (dirty) localStorage.setItem(k, JSON.stringify({ ...parsed, v }));
      } catch { /* skip corrupt entry */ }
    }
  } catch { /* non-fatal */ }
}

export default sanitizeDavList;
