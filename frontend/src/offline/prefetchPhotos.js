/**
 * CarryOn — Photo Pre-cache Helper
 * ============================================================================
 * Fire-and-forget background fetches that warm the Service Worker's
 * IMAGE_CACHE with cross-origin photo URLs (S3 presigned links) so
 * profile / beneficiary / estate avatars survive an airplane-mode
 * session. Safe to call from anywhere — gated on the offline flag and
 * only runs when the browser is actually online.
 *
 * Pairs with sw-push.js `cacheFirst(IMAGE_CACHE)` which is specifically
 * written to cache opaque cross-origin responses.
 */

import { isOfflineEnabled } from './featureFlag';

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
  if (!isOfflineEnabled()) return;
  const items = Array.isArray(data) ? data : [data];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    for (const key of PHOTO_FIELDS) prefetchPhoto(it[key]);
  }
}
