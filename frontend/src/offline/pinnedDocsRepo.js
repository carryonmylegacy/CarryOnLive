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
  await db[TABLE].put({
    cache_key: cacheKey(doc.id),
    doc_id: doc.id,
    blob,
    mime_type: blob.type || doc.mime_type || 'application/octet-stream',
    size_bytes: blob.size,
    title: doc.title || doc.filename || '',
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
  return row?.blob || null;
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
