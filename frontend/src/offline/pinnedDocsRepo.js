/**
 * pinnedDocsRepo — Dexie-backed repository for documents the user has
 * explicitly pinned for offline access. Phase 9a of the offline
 * roadmap.
 *
 * Why a separate repo from imageBlobsRepo:
 *   • doc blobs are typically larger (PDFs / scans, 1-10 MB) so we
 *     want their own LRU policy if quota pressure ever forces us to
 *     evict.
 *   • a server-side `pinned_offline` flag lets the warmup re-prime
 *     the local blob the first time the user opens the app on a new
 *     device — without that, "pinning" would only work on the device
 *     where the click happened.
 *   • cache_key is always `doc:<doc_id>` for a stable lookup that
 *     survives presigned-URL rotation.
 */

import { getDB } from './db';
import { sealBlobForce, unsealBlob } from './crypto';

const TABLE = 'pinnedDoc';

const cacheKey = (docId) => `doc:${docId}`;

export async function pinDocument(doc, fetchHeaders) {
  const db = getDB();
  if (!doc?.id) {
    throw new Error('pinDocument: doc.id is required');
  }
  // Two fetch paths:
  //   A. Legacy / public docs that ship a direct `file_url` (e.g.
  //      pre-signed S3 link) — fetch that URL directly. Cross-origin
  //      handling preserved (S3 doesn't satisfy a credentialed
  //      preflight, so we strip cookies + auth headers for those).
  //   B. Modern cloud-stored docs (most production data) only carry a
  //      `storage_key` server-side; the FE never sees a static URL
  //      because the bytes are decrypted per-request. For these we
  //      hit the same auth'd `/documents/{id}/download` endpoint the
  //      Preview/Download buttons use.
  let res;
  if (doc.file_url) {
    let isCrossOrigin = false;
    try {
      const u = new URL(doc.file_url, window.location.origin);
      isCrossOrigin = u.origin !== window.location.origin;
    } catch { /* malformed URL — let fetch fail naturally */ }
    const init = isCrossOrigin
      ? { credentials: 'omit' }
      : { credentials: 'include', headers: fetchHeaders || {} };
    res = await fetch(doc.file_url, init);
  } else {
    // Cloud-storage path — pull through the auth'd API. This is the
    // path beneficiaries hit when toggling "Make available offline"
    // pre-transition (their essential-docs slots return cloud docs
    // without a static `file_url`).
    const apiBase = process.env.REACT_APP_BACKEND_URL;
    const url = `${apiBase}/api/documents/${doc.id}/download`;
    res = await fetch(url, {
      credentials: 'include',
      headers: fetchHeaders || {},
    });
  }
  if (!res.ok) throw new Error(`pinDocument: HTTP ${res.status}`);
  const blob = await res.blob();
  // Encryption at rest (audit 735b3b7 #3 — fail closed). Pinned documents are
  // sensitive SDV material (wills, POAs, credentials), so their bytes are
  // ALWAYS sealed with the per-device AES-GCM key before touching IndexedDB —
  // unconditionally, regardless of the offline feature flag. If a key cannot be
  // derived we REFUSE to store the blob rather than fall back to plaintext.
  //
  // Threat-model caveat: this protects against casual DevTools/disk inspection
  // and cross-user isolation within the browser profile. It is NOT a defense
  // against an attacker who already has full read access to this profile's
  // localStorage, because the device seed + bearer token live there too and can
  // re-derive the key. Device-level compromise is out of scope for at-rest enc.
  const sealed = await sealBlobForce(blob);
  if (!sealed) {
    throw new Error(
      'pinDocument: cannot encrypt at rest (no session key) — refusing to store sensitive document in plaintext',
    );
  }
  await db[TABLE].put({
    cache_key: cacheKey(doc.id),
    doc_id: doc.id,
    blob: null,
    enc: { iv: sealed.iv, ct: sealed.ct, mime: sealed.mime },
    encrypted: true,
    mime_type: blob.type || doc.mime_type || 'application/octet-stream',
    size_bytes: blob.size,
    // Vault documents carry their display label on `name` (see
    // VaultPage). Older code only checked `title`/`filename`, which are
    // absent on vault docs — so every pinned doc rendered as "Untitled"
    // in the Storage-used-offline panel. Check `name` too.
    title: doc.title || doc.name || doc.filename || '',
    fetched_at: Date.now(),
  });
  return blob.size;
}

export async function unpinDocument(docId) {
  const db = getDB();
  await db[TABLE].delete(cacheKey(docId));
}

export async function getPinnedBlob(docId) {
  const db = getDB();
  const row = await db[TABLE].get(cacheKey(docId));
  if (!row) return null;
  // Encrypted-at-rest rows (June 2026+) carry an `enc` descriptor; legacy rows
  // stored the raw blob directly. Handle both for backward compatibility.
  if (row.encrypted && row.enc) {
    return unsealBlob({ encrypted: true, iv: row.enc.iv, ct: row.enc.ct, mime: row.enc.mime });
  }
  return row.blob || null;
}

export async function isPinnedLocally(docId) {
  const db = getDB();
  const row = await db[TABLE].get(cacheKey(docId));
  return !!row;
}

export async function listPinned() {
  const db = getDB();
  return db[TABLE].toArray();
}

export async function totalPinnedBytes() {
  const rows = await listPinned();
  return rows.reduce((sum, r) => sum + (r.size_bytes || 0), 0);
}
