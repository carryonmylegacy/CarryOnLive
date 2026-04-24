/**
 * CarryOn — Photo Pre-cache Helper
 * ============================================================================
 * Fire-and-forget background fetches that warm the Service Worker's
 * IMAGE_CACHE with cross-origin photo URLs (S3 presigned links) so
 * profile / beneficiary / estate avatars survive an airplane-mode
 * session. Safe to call from anywhere — only runs when the browser
 * is actually online. Flag-agnostic as of Apr 24, 2026: we always
 * warm the cache because `no-cors` + `cache:'default'` is cheap and
 * the payoff (avatars instead of "?" placeholders on airplane mode)
 * applies to EVERY user, not just those who explicitly enabled
 * offline mode.
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

/** One background fetch, every error swallowed. */
export function prefetchPhoto(url) {
  if (!url || typeof url !== 'string') return;
  if (!/^https?:\/\//i.test(url)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    fetch(url, { mode: 'no-cors', credentials: 'omit', cache: 'default' }).catch(() => {});
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
