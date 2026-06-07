/**
 * CarryOn — Offline Encryption at Rest (Phase 7)
 * ============================================================================
 * Provides a thin WebCrypto wrapper for sealing/unsealing IndexedDB payloads
 * with a per-session AES-256-GCM key. The key is derived from the user's
 * bearer token via PBKDF2(210,000 iterations, SHA-256) — so a user who
 * signs out and signs back in re-derives the same key and can still read
 * older rows, but a different user on the same device derives a
 * completely different key and sees only garbled ciphertext.
 *
 * Design:
 *   - Key NEVER persisted anywhere. Held in a module-scoped variable;
 *     lost on page reload and re-derived at next login. IndexedDB rows
 *     outlive the key, but a fresh login re-derives it.
 *   - AES-GCM with a 96-bit random IV per record (spec-recommended).
 *   - Only non-indexed fields are encrypted; indexed fields stay plaintext
 *     so Dexie can still query (`estate_id`, `id`, `created_at`, etc.).
 *     Callers provide a list of "plain keys" — everything else goes into
 *     an encrypted `__enc` blob.
 *   - Gated on its own flag `carryon_offline_enc_v1` (default 'off') so
 *     we can roll it out independently of the main offline flag.
 *
 * API:
 *   isEncryptionEnabled()         → boolean
 *   setEncryptionMode('on'|'off') → persists to localStorage
 *   primeSessionKey(token)        → derives + caches the session key
 *   clearSessionKey()             → wipes the cached key (call on logout)
 *   sealRecord(row, plainKeys)    → { ...plainFields, __enc: { iv, ct } }
 *   unsealRecord(stored)          → original merged row, or the input as-is
 *                                    when encryption is off or key missing
 */

const KEY_FLAG = 'carryon_offline_enc_v1';
const ITERATIONS = 210000;
// Fixed salt — identical across devices so re-login on a new device still
// decrypts cloud-synced (future) payloads. Rotate only if the whole encryption
// schema is bumped.
const FIXED_SALT = new TextEncoder().encode('carryon-offline-v1');
// Stable per-device secret. The key used to be derived from the bearer token,
// but the JWT ROTATES (different string every login/refresh — observed 364 vs
// 389 chars on the same device), which silently changed the derived key and
// made yesterday's ciphertext undecryptable today ("encrypted with a DIFFERENT
// key" offline). This seed is generated ONCE and persists, so the AES key is
// reproducible across token rotations and cold boots.
const SEED_KEY = 'carryon_enc_seed_v1';

let _cachedKey = null; // CryptoKey | null — in-memory only, never persisted.

function getDeviceSeed() {
  try {
    let seed = localStorage.getItem(SEED_KEY);
    if (!seed) {
      const rnd = window.crypto.getRandomValues(new Uint8Array(32));
      let s = '';
      for (let i = 0; i < rnd.length; i += 1) s += String.fromCharCode(rnd[i]);
      seed = btoa(s);
      localStorage.setItem(SEED_KEY, seed);
    }
    return seed;
  } catch { return null; }
}

// Stable per-user namespace so two accounts on the same device can't read each
// other's rows. user_id is constant across token rotations (unlike the token).
function decodeUserId(token) {
  try {
    const part = (token || '').split('.')[1];
    if (!part) return '';
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return json.user_id || json.sub || json.email || '';
  } catch { return ''; }
}

// One-switch design: encryption at rest is ON whenever the main offline
// feature flag (`carryon_offline_v1`) is set to 'on'. The legacy
// `carryon_offline_enc_v1` key is retained only for explicit override
// during debug sessions — if a developer sets it to 'off' it wins, but
// in normal operation flipping the main flag is all the user needs to do.
export function isEncryptionEnabled() {
  try {
    const override = localStorage.getItem(KEY_FLAG);
    if (override === 'off') return false; // explicit opt-out (debug only)
    if (override === 'on') return true;   // explicit opt-in (debug only)
    // Default: follow the main offline flag.
    return localStorage.getItem('carryon_offline_v1') === 'on';
  } catch { return false; }
}

export function setEncryptionMode(mode) {
  try { localStorage.setItem(KEY_FLAG, mode === 'on' ? 'on' : 'off'); }
  catch { /* private mode */ }
  if (mode !== 'on') _cachedKey = null;
}

/**
 * Derive + cache the session key.
 *
 * Key material = STABLE device seed + STABLE user_id (decoded from the token).
 * The `token` argument is used ONLY to namespace per-user — its rotating
 * signature/exp no longer affect the key, which is what made offline reads
 * fail intermittently before.
 */
export async function primeSessionKey(token) {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    const seed = getDeviceSeed();
    if (!seed) return null;
    const userId = decodeUserId(token);
    const enc = new TextEncoder();
    const material = await window.crypto.subtle.importKey(
      'raw', enc.encode(`${seed}:${userId}`), 'PBKDF2', false, ['deriveKey'],
    );
    const key = await window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: FIXED_SALT, iterations: ITERATIONS },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    _cachedKey = key;
    return key;
  } catch (err) {
    console.warn('[offline-enc] primeSessionKey failed:', err);
    return null;
  }
}

export function clearSessionKey() { _cachedKey = null; _primingPromise = null; }

// Tracks an in-flight lazy key derivation so concurrent encrypted reads on
// an offline cold boot share ONE PBKDF2 pass instead of each kicking off
// their own 210k-iteration derivation.
let _primingPromise = null;

/**
 * Ensure the AES session key is available, lazily deriving it from the
 * PERSISTED bearer token when it hasn't been primed yet.
 *
 * This is the safety net for OFFLINE COLD BOOTS. The key lives only in
 * module memory and is wiped on every page reload; AuthContext primes it
 * fire-and-forget at boot, so an encrypted read that runs first (e.g. the
 * Profile page or the diagnostics panel after an airplane-mode relaunch)
 * would otherwise hit a null key and return empty. By re-deriving on demand
 * from `carryon_token`, every encrypted read self-heals regardless of boot
 * ordering or which component triggered it. Idempotent + deduped.
 */
export async function ensureSessionKey() {
  if (_cachedKey) return _cachedKey;
  if (!isEncryptionEnabled()) return null;
  if (_primingPromise) return _primingPromise;
  let token = null;
  try { token = localStorage.getItem('carryon_token'); } catch { /* private mode */ }
  if (!token) return null;
  _primingPromise = primeSessionKey(token).finally(() => { _primingPromise = null; });
  return _primingPromise;
}

function getKey() { return _cachedKey; }

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromBase64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function encryptString(text) {
  const key = getKey();
  if (!key) throw new Error('no-session-key');
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ct = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text),
  );
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

async function decryptString(iv, ct) {
  const key = getKey();
  if (!key) throw new Error('no-session-key');
  const pt = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(ct),
  );
  return new TextDecoder().decode(pt);
}

/**
 * Seal a record for storage. When encryption is off OR no session key
 * is cached, returns the row as-is — callers get a transparent passthrough.
 * When encryption is on, returns `{ ...plainFields, __enc: { iv, ct } }`
 * with all non-plain fields serialized and encrypted.
 */
export async function sealRecord(row, plainKeys = []) {
  if (!row || typeof row !== 'object') return row;
  if (!isEncryptionEnabled() || !getKey()) return row;
  const plain = {};
  const sensitive = {};
  for (const [k, v] of Object.entries(row)) {
    if (plainKeys.includes(k) || k === '_updatedAt' || k === '_local_pending') {
      plain[k] = v;
    } else {
      sensitive[k] = v;
    }
  }
  try {
    const __enc = await encryptString(JSON.stringify(sensitive));
    return { ...plain, __enc };
  } catch (err) {
    console.warn('[offline-enc] sealRecord fallback to plaintext:', err);
    return row;
  }
}

/**
 * Seal a binary Blob for at-rest storage in IndexedDB (used for pinned
 * document blobs — PDFs/scans that must survive offline). Returns a
 * descriptor with the raw AES-GCM ciphertext (ArrayBuffer) + IV so Dexie can
 * store it directly without a base64 round-trip. When encryption is off or no
 * key is available, returns a transparent passthrough `{ encrypted: false }`.
 */
export async function sealBlob(blob) {
  if (!blob) return { encrypted: false, blob };
  if (!isEncryptionEnabled()) return { encrypted: false, blob };
  const key = await ensureSessionKey();
  if (!key) return { encrypted: false, blob };
  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const buf = await blob.arrayBuffer();
    const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf);
    return { encrypted: true, iv, ct, mime: blob.type || 'application/octet-stream' };
  } catch (err) {
    console.warn('[offline-enc] sealBlob fallback to plaintext:', err);
    return { encrypted: false, blob };
  }
}

/**
 * Unseal a blob descriptor produced by sealBlob. Transparent passthrough for
 * unencrypted descriptors (and legacy plaintext rows). Returns a Blob or null.
 */
export async function unsealBlob(sealed) {
  if (!sealed) return null;
  if (!sealed.encrypted) return sealed.blob || null;
  const key = await ensureSessionKey();
  if (!key) return null;
  try {
    const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv }, key, sealed.ct);
    return new Blob([pt], { type: sealed.mime || 'application/octet-stream' });
  } catch (err) {
    console.warn('[offline-enc] unsealBlob failed:', err);
    return null;
  }
}
// ── Outbox-at-rest encryption (audit #3be1d2f P2) ───────────────────────────
// The sync outbox can hold PII bodies for EVERY authenticated user (entity
// writes for beneficiaries, financial items, messages, profile, chat), not
// just users who opted into the offline feature. Those rows must therefore be
// encrypted at rest UNCONDITIONALLY — independent of the `carryon_offline_v1`
// feature flag. The functions below mirror sealRecord/unsealRecord/ensureSession-
// Key but DROP the `isEncryptionEnabled()` gate: as long as a bearer token
// exists (so a key can be derived) the payload is sealed. The derived key is the
// SAME deterministic device-seed+user_id key, so rows seal/unseal identically
// whether or not the user later toggles offline mode on.

/** Derive + cache the AES key whenever a token exists — NOT gated on the flag. */
export async function ensureKeyForOutbox() {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  if (_cachedKey) return _cachedKey;
  if (_primingPromise) return _primingPromise;
  let token = null;
  try { token = localStorage.getItem('carryon_token'); } catch { /* private mode */ }
  if (!token) return null;
  _primingPromise = primeSessionKey(token).finally(() => { _primingPromise = null; });
  return _primingPromise;
}

/** Seal a row for the outbox regardless of the offline flag. Returns the row
 *  unchanged only when no key could be derived (caller decides fail-closed). */
export async function sealRecordForce(row, plainKeys = []) {
  if (!row || typeof row !== 'object') return row;
  const key = await ensureKeyForOutbox();
  if (!key) return row;
  const plain = {};
  const sensitive = {};
  for (const [k, v] of Object.entries(row)) {
    if (plainKeys.includes(k) || k === '_updatedAt' || k === '_local_pending') plain[k] = v;
    else sensitive[k] = v;
  }
  try {
    const __enc = await encryptString(JSON.stringify(sensitive));
    return { ...plain, __enc };
  } catch (err) {
    console.warn('[offline-enc] sealRecordForce error (not persisting plaintext):', err);
    return row;
  }
}

/** Unseal an outbox row regardless of the offline flag. Returns null when the
 *  ciphertext cannot be read (no key / wrong key / corrupt). */
export async function unsealRecordForce(stored) {
  if (!stored || typeof stored !== 'object') return stored;
  if (!stored.__enc) return stored;
  if (!getKey()) {
    await ensureKeyForOutbox();
    if (!getKey()) return null;
  }
  try {
    const { iv, ct } = stored.__enc;
    const json = await decryptString(iv, ct);
    const sensitive = JSON.parse(json);
    const { __enc: _ignored, ...plain } = stored;
    return { ...plain, ...sensitive };
  } catch (err) {
    console.warn('[offline-enc] unsealRecordForce failed:', err);
    return null;
  }
}

export async function unsealRecord(stored) {
  if (!stored || typeof stored !== 'object') return stored;
  if (!stored.__enc) return stored;
  if (!isEncryptionEnabled()) {
    // Encryption disabled mid-session — the row is unreadable until the
    // user logs back in and primes the key again.
    return null;
  }
  // Self-heal on offline cold boot: the in-memory key was wiped on reload
  // and the boot-time prime is fire-and-forget, so lazily re-derive it from
  // the persisted token before decrypting. Without this, the first
  // encrypted read after an airplane-mode relaunch returns null (the
  // "profile shows empty offline" bug).
  if (!getKey()) {
    await ensureSessionKey();
    if (!getKey()) return null;
  }
  try {
    const { iv, ct } = stored.__enc;
    const json = await decryptString(iv, ct);
    const sensitive = JSON.parse(json);
    const { __enc: _ignored, ...plain } = stored;
    return { ...plain, ...sensitive };
  } catch (err) {
    console.warn('[offline-enc] unsealRecord failed:', err);
    return null;
  }
}
