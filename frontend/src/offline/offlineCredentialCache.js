// Offline-credential cache — encrypts a long-lived JWT with a
// password-derived AES-GCM key and stores the ciphertext in IndexedDB.
//
// Why password-encrypt instead of just storing the JWT?
//   The JWT alone would let anyone with raw IndexedDB access (e.g. a
//   stolen unlocked phone with developer tools enabled) impersonate the
//   user. Encrypting the JWT with a key derived from the user's password
//   means a stolen device with NO password is useless — the cipher
//   stays opaque. A correct password decrypts the JWT in milliseconds.
//
// Flow:
//   1. Online enroll → server returns { token, salt }. Client derives
//      AES key from (user_password + salt) via PBKDF2 (200k iters,
//      SHA-256), encrypts the JWT with AES-GCM, stores
//      { credential_id, salt, iv, ciphertext } in IndexedDB.
//   2. Offline login → user types password. Client derives AES key
//      from the entered password + stored salt, attempts decryption.
//      Wrong password → AES-GCM auth tag fails → throws → "Wrong password" UX.
//      Correct password → recovers JWT, hydrates localStorage.
//
// Storage: a single record keyed by user identifier (lowercased email
// or username). One device = one user = one offline credential at most.
// To revoke locally, just delete the record.
//
// Note: this only protects the JWT. The user's plaintext password is
// NEVER stored, never serialized, never logged.

import { getDB } from './db';

const PBKDF2_ITERATIONS = 200_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64encode(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out.buffer;
}

async function deriveKey(password, saltStr) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(saltStr),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Save an enrolled offline credential. Encrypts `token` AND a snapshot
 * of the full user object with (password + salt) then writes to
 * IndexedDB. Identifier is the lowercased email or username the user
 * logs in with.
 *
 * Why also encrypt the user snapshot? Without it, offline unlock can
 * only synthesize a stub user from JWT claims (`{user_id, email, role,
 * session_id}`) — which loses critical portal-routing flags like
 * `is_also_benefactor`, `is_also_beneficiary`, `default_portal`,
 * `current_portal`, `admin_scope`, etc. The result is a "limbo" landing
 * (e.g. multi-role users land on the Estate Plan Network empty state
 * instead of their canonical Benefactor portal). Caching the snapshot
 * captured at enroll time fixes that.
 */
export async function saveOfflineCredential({
  identifier,
  password,
  credentialId,
  token,
  salt,
  user,
}) {
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(token),
  );
  // Encrypt the user snapshot under a fresh IV (NEVER reuse an IV with
  // the same key — breaks AES-GCM security guarantees). The user JSON
  // is small (a few KB at most) so this is cheap.
  const userIv = crypto.getRandomValues(new Uint8Array(12));
  const userCipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: userIv },
    key,
    enc.encode(JSON.stringify(user || {})),
  );
  const record = {
    identifier: (identifier || '').trim().toLowerCase(),
    credential_id: credentialId,
    salt,
    iv: b64encode(iv),
    ciphertext: b64encode(ciphertext),
    user_iv: b64encode(userIv),
    user_ciphertext: b64encode(userCipher),
    enrolled_at: new Date().toISOString(),
  };
  await getDB().offlineCredential.put(record);
  return record;
}

/**
 * Look up a stored offline credential by identifier (email/username).
 * Returns the raw record (no decryption attempted) or null.
 *
 * Matching is deliberately lenient because the identifier on enroll
 * (usually the user's email from their account) can differ from what
 * the user types on the offline login form (often their username).
 * Resolution order:
 *   1. Exact match on the typed, trimmed, lower-cased identifier.
 *   2. If exactly ONE credential exists on this device, return it.
 *      The AES-GCM auth tag will still validate the password, so
 *      there's no security downgrade — a wrong identifier but right
 *      password is still a legitimate login on a trusted device.
 */
export async function getOfflineCredential(identifier) {
  const db = getDB();
  const id = (identifier || '').trim().toLowerCase();
  if (id) {
    const rec = await db.offlineCredential.get(id);
    if (rec) return rec;
  }
  const count = await db.offlineCredential.count();
  if (count === 1) {
    const all = await db.offlineCredential.toArray();
    return all[0] || null;
  }
  return null;
}

/**
 * Try to decrypt a stored credential with the supplied password.
 * Returns the recovered JWT string AND the cached user snapshot on
 * success, throws on wrong password (AES-GCM auth tag failure) — caller
 * should surface a "Wrong password" message.
 *
 * `user` is null for older records enrolled before the user-snapshot
 * was added; in that case the LoginPage falls back to the JWT-derived
 * stub (and shows the "first-visit limbo" state until the user
 * reconnects and the auth context refetches the real user).
 */
export async function unlockOfflineCredential({ identifier, password }) {
  const rec = await getOfflineCredential(identifier);
  if (!rec) throw new Error('no_offline_credential');
  const key = await deriveKey(password, rec.salt);
  const ivBuf = b64decode(rec.iv);
  const ctBuf = b64decode(rec.ciphertext);
  let plaintextBuf;
  try {
    plaintextBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBuf) },
      key,
      ctBuf,
    );
  } catch {
    throw new Error('wrong_password');
  }
  let cachedUser = null;
  if (rec.user_iv && rec.user_ciphertext) {
    try {
      const userIvBuf = b64decode(rec.user_iv);
      const userCtBuf = b64decode(rec.user_ciphertext);
      const userPlain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(userIvBuf) },
        key,
        userCtBuf,
      );
      cachedUser = JSON.parse(dec.decode(userPlain));
    } catch {
      // User snapshot decrypt failed — keep token, return null user so
      // the caller falls back to JWT-stub behavior. Don't throw; the
      // login should still succeed even if the snapshot is corrupt.
      cachedUser = null;
    }
  }
  return {
    token: dec.decode(plaintextBuf),
    credential_id: rec.credential_id,
    user: cachedUser,
  };
}

/**
 * Wipe the local credential record. Call after server-side revoke
 * succeeds (or as part of a logout-and-disable flow). Does NOT call
 * the server; do that separately.
 */
export async function clearOfflineCredential(identifier) {
  if (!identifier) return;
  await getDB().offlineCredential.delete(identifier.trim().toLowerCase());
}

/**
 * Wipe EVERY offline credential record on this device. Used when the
 * user toggles Settings → Offline access OFF so we don't leak a
 * mismatched row if the enroll identifier differs from the typed one.
 */
export async function clearAllOfflineCredentials() {
  await getDB().offlineCredential.clear();
}

/**
 * Has this device any offline credential at all? Cheap synchronous-ish
 * helper used to gate the Login screen's "Sign in offline" affordance.
 */
export async function hasAnyOfflineCredential() {
  const count = await getDB().offlineCredential.count();
  return count > 0;
}
