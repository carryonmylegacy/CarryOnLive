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
 * Save an enrolled offline credential. Encrypts `token` with
 * (password + salt) then writes to IndexedDB. Identifier is the
 * lowercased email or username the user logs in with.
 */
export async function saveOfflineCredential({
  identifier,
  password,
  credentialId,
  token,
  salt,
}) {
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(token),
  );
  const record = {
    identifier: (identifier || '').trim().toLowerCase(),
    credential_id: credentialId,
    salt,
    iv: b64encode(iv),
    ciphertext: b64encode(ciphertext),
    enrolled_at: new Date().toISOString(),
  };
  await getDB().offlineCredential.put(record);
  return record;
}

/**
 * Look up a stored offline credential by identifier (email/username).
 * Returns the raw record (no decryption attempted) or null.
 */
export async function getOfflineCredential(identifier) {
  if (!identifier) return null;
  const id = identifier.trim().toLowerCase();
  const rec = await getDB().offlineCredential.get(id);
  return rec || null;
}

/**
 * Try to decrypt a stored credential with the supplied password.
 * Returns the recovered JWT string on success, throws on wrong
 * password (AES-GCM auth tag failure) — caller should surface a
 * "Wrong password" message.
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
  return { token: dec.decode(plaintextBuf), credential_id: rec.credential_id };
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
 * Has this device any offline credential at all? Cheap synchronous-ish
 * helper used to gate the Login screen's "Sign in offline" affordance.
 */
export async function hasAnyOfflineCredential() {
  const count = await getDB().offlineCredential.count();
  return count > 0;
}
