/**
 * CarryOn — Image Blob Cache (offline-survival photos)
 * ============================================================================
 * Photos served by the backend (beneficiary avatars, estate cover shots,
 * profile pics, vault thumbnails) come back as **S3 presigned URLs**. The
 * presigned signature expires every session, so the URL changes between
 * logins. That defeats the Service Worker's URL-keyed image cache: a
 * URL fetched yesterday is a cache miss today, and offline = `?` icon.
 *
 * This module solves it by storing the actual image **bytes** (Blob) in
 * IndexedDB keyed by a STABLE identifier the caller controls — e.g.
 * `beneficiary:<id>:photo`. The blob survives URL rotation, browser
 * cache eviction, and SW version bumps. On airplane mode, the
 * `<OfflineImage>` component reads the blob and renders it via
 * `URL.createObjectURL`.
 *
 * Size note: a typical compressed JPEG avatar is 30-200KB. Storing 50
 * blobs ≈ 5MB total. IndexedDB on iOS/Safari has a per-origin quota of
 * ~50MB minimum, so we have plenty of headroom.
 */

import { getDB } from './db';

/** Persist a blob under a stable cache key. Replaces any existing entry. */
export async function putImageBlob(cacheKey, blob, kind = 'photo') {
  if (!cacheKey || !blob) return;
  try {
    await getDB().imageBlob.put({
      cache_key: cacheKey,
      blob,
      kind,
      fetched_at: Date.now(),
    });
  } catch {
    /* quota exceeded or schema mismatch — non-fatal */
  }
}

/** Read a blob by cache key, returns null on miss. */
export async function getImageBlob(cacheKey) {
  if (!cacheKey) return null;
  try {
    const row = await getDB().imageBlob.get(cacheKey);
    return row?.blob || null;
  } catch {
    return null;
  }
}

/** Convenience: read and return an object URL the caller must revoke. */
export async function getImageObjectUrl(cacheKey) {
  const blob = await getImageBlob(cacheKey);
  if (!blob) return null;
  try { return URL.createObjectURL(blob); } catch { return null; }
}

/**
 * Fetch a remote URL and persist its bytes under cacheKey.
 * Quietly returns false on network/CORS failure so callers can ignore.
 *
 * Note: requires the S3 bucket to allow CORS for cross-origin reads.
 * The presigned URLs in CarryOn are issued from a CORS-enabled bucket;
 * if a future asset host doesn't allow CORS, this will silently no-op
 * and the SW's URL-cache fallback continues to work as before.
 */
export async function fetchAndStoreImageBlob(url, cacheKey, kind = 'photo') {
  if (!url || !cacheKey) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'default' });
    if (!res.ok) return false;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return false;
    await putImageBlob(cacheKey, blob, kind);
    return true;
  } catch {
    return false;
  }
}

/** Drop one row by cache key. */
export async function deleteImageBlob(cacheKey) {
  if (!cacheKey) return;
  try { await getDB().imageBlob.delete(cacheKey); } catch {}
}
