/**
 * CarryOn — Photo Pre-cache Helper
 * ============================================================================
 * Fire-and-forget image preloads that warm the Service Worker's
 * IMAGE_CACHE with cross-origin photo URLs (S3 presigned links) so
 * profile / beneficiary / estate avatars survive an airplane-mode
 * session.
 *
 * Implementation note (Apr 24, 2026): we use `new Image()` rather than
 * `fetch()` because the SW's cross-origin image detector keys off
 * `request.destination === 'image'`. `fetch()` calls have
 * `destination === ''` and silently bypass the cache-first handler —
 * which meant every "warmup" the app kicked off was actually a no-op
 * that never populated the IMAGE_CACHE. Loading via `new Image()`
 * triggers the real browser image path, guaranteeing SW interception.
 *
 * Pairs with sw-push.js `cacheFirst(IMAGE_CACHE)` which is specifically
 * written to cache opaque cross-origin responses.
 */

const PHOTO_FIELDS = [
  'photo_url',
  'photo_url_thumb',
  'estate_photo_url',
  'owner_photo_url',
  'avatar_url',
  'picture_url',
];

/** One background preload, every error swallowed. */
export function prefetchPhoto(url) {
  if (!url || typeof url !== 'string') return;
  if (!/^https?:\/\//i.test(url)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (typeof Image === 'undefined') return;
  try {
    const img = new Image();
    // `decoding=async` + `loading=eager` keeps this off the main thread
    // while still triggering a real image fetch the SW will intercept.
    img.decoding = 'async';
    img.loading = 'eager';
    // No onload/onerror — the byproduct we want is the cached response
    // in IMAGE_CACHE, not a DOM element. The Image object is discarded
    // by GC once the load completes (or errors).
    img.src = url;
  } catch { /* no-op */ }
}

/** Walk an object (or array) and prefetch every known photo field. */
export function prefetchPhotosFrom(data) {
  const items = Array.isArray(data) ? data : [data];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    for (const key of PHOTO_FIELDS) prefetchPhoto(it[key]);
  }
}
