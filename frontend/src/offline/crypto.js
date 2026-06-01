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

let _cachedKey = null; // CryptoKey | null — in-memory only, never persisted.

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
  catch {}
  if (mode !== 'on') _cachedKey = null;
}

/** Derive + cache the session key from the user's bearer token. */
export async function primeSessionKey(token) {
  if (!token || typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    const enc = new TextEncoder();
    const material = await window.crypto.subtle.importKey(
      'raw', enc.encode(token), 'PBKDF2', false, ['deriveKey'],
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
 * Unseal a record retrieved from storage. Transparent passthrough when
 * the row isn't sealed. Returns the original merged object.
 */
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
