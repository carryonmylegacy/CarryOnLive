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
/**
 * Hosts that have already returned a hard CORS / network failure during
 * this session. Once a host fails CORS, we skip subsequent fetches to it
 * to avoid spamming the browser console with red `net::ERR_FAILED`
 * entries that the user cannot suppress with try/catch.
 *
 * IMPORTANT: this set is reserved for genuine **CORS / network**
 * failures only — i.e. cases where `fetch()` itself throws. A 403/404
 * response from the server is per-URL (a single expired presigned
 * signature) and does NOT mean the entire host is unreachable, so we
 * must NOT poison the blocklist on those. Previous behaviour ("any
 * non-OK status pollutes the host blocklist") meant the very first
 * stale URL in a warmup batch would knock out every subsequent photo
 * sharing the same S3 bucket — exactly the "some avatars cached, some
 * fell back to initials" bug reported on Feb 22, 2026.
 *
 * The page still renders these images correctly via `<img src>` (which
 * is not subject to CORS); we just can't pre-fetch them into IndexedDB
 * for true offline use until the bucket's CORS policy is configured.
 */
const _corsBlockedHosts = new Set();

/**
 * In-flight probes per host. Warm-up fans out fetches in parallel via
 * Promise.all, so without this we'd race: all N concurrent fetches see
 * `_corsBlockedHosts` as empty, each fires, and all N log a CORS error
 * before the first one resolves to populate the blocklist. By
 * registering the FIRST fetch's promise per host and gating subsequent
 * arrivals on it, only the very first request actually hits the wire.
 */
const _hostProbes = new Map();

export async function fetchAndStoreImageBlob(url, cacheKey, kind = 'photo') {
  if (!url || !cacheKey) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  let host;
  try {
    host = new URL(url).host;
  } catch {
    return false;
  }
  if (_corsBlockedHosts.has(host)) return false;

  // True dedup: synchronously decide whether this caller is the FIRST
  // for the host. If yes, this caller's fetch becomes the host-test
  // probe and registers itself in `_hostProbes` BEFORE any awaits run
  // so subsequent synchronous callers see it. If not, await the in-flight
  // probe — and if it failed (CORS), bail without firing another fetch.
  //
  // Why this matters: warmup fans out via `for (const b of bens.data)
  // fetchAndStoreImageBlob(...)` which is synchronous in scheduling.
  // Without this guard, all N callers see `_hostProbes` empty, each
  // fires their own fetch, and CORS errors land N times in the
  // console for what is fundamentally a single bucket-wide failure.
  const isFirstForHost = !_hostProbes.has(host);

  const myFetch = (async () => {
    if (!isFirstForHost) {
      // Lost the race — wait for the first caller's CORS probe to
      // resolve. If it failed, the host is now blocklisted, so bail.
      try { await _hostProbes.get(host); } catch {}
      if (_corsBlockedHosts.has(host)) return false;
    }

    let res;
    try {
      res = await fetch(url, { credentials: 'omit', cache: 'default' });
    } catch (corsOrNetwork) {
      // True fetch() rejection — CORS preflight failure or network
      // unreachable. Only the FIRST caller poisons the host blocklist;
      // followers would otherwise stomp the flag too which is harmless
      // but redundant. The per-URL <img> render path still works
      // because `<img>` doesn't enforce CORS.
      if (isFirstForHost) _corsBlockedHosts.add(host);
      throw corsOrNetwork;
    }
    if (!res.ok) {
      // Per-URL failure (e.g. 403 expired presigned signature, 404
      // missing object). DO NOT poison the host blocklist — the next
      // photo from the same bucket has its own fresh signed URL and
      // deserves its own attempt.
      throw new Error(`status ${res.status}`);
    }
    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error('empty');
    await putImageBlob(cacheKey, blob, kind);
    return true;
  })();

  // Register the FIRST caller's promise synchronously (before any
  // awaits below) so subsequent same-tick callers find it in the map.
  if (isFirstForHost) _hostProbes.set(host, myFetch);

  try {
    return await myFetch;
  } catch {
    return false;
  } finally {
    if (isFirstForHost && _hostProbes.get(host) === myFetch) {
      _hostProbes.delete(host);
    }
  }
}

/** Drop one row by cache key. */
export async function deleteImageBlob(cacheKey) {
  if (!cacheKey) return;
  try { await getDB().imageBlob.delete(cacheKey); } catch {}
}
