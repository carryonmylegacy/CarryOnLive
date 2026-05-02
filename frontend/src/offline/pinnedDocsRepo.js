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
  if (!doc?.id || !doc?.file_url) {
    throw new Error('pinDocument: doc.id and doc.file_url are required');
  }
  // S3 presigned URLs encode auth in the query string; sending
  // `credentials: 'include'` or an `Authorization` header to S3 forces
  // a CORS preflight that S3 doesn't satisfy (it can't echo back
  // `Access-Control-Allow-Credentials: true`), so the fetch fails with
  // "Access to fetch ... blocked by CORS policy" — which was iter_117's
  // 18 residual console errors. Detect cross-origin URLs and drop
  // both the cookies AND the auth header for them; backend-relative
  // URLs keep the original behavior since the same-origin case never
  // triggers preflight.
  let isCrossOrigin = false;
  try {
    const u = new URL(doc.file_url, window.location.origin);
    isCrossOrigin = u.origin !== window.location.origin;
  } catch { /* malformed URL — let fetch fail naturally */ }
  const init = isCrossOrigin
    ? { credentials: 'omit' }
    : { credentials: 'include', headers: fetchHeaders || {} };
  const res = await fetch(doc.file_url, init);
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
