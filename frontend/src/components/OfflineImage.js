/**
 * CarryOn — OfflineImage
 * ============================================================================
 * Drop-in replacement for `<img>` that survives airplane mode for
 * cross-origin S3-presigned URLs whose signatures expire each session.
 *
 * How it works:
 *   • While ONLINE, it renders the `src` directly. As a side effect, it
 *     fetches the bytes once and persists them as a Blob in IndexedDB
 *     keyed by `cacheKey` (NOT the URL — see `imageBlobsRepo.js`).
 *   • While OFFLINE, it skips the network entirely. It looks up the
 *     blob by `cacheKey`, materializes a fresh `URL.createObjectURL`
 *     for it, and renders that. If the cache misses, the caller's
 *     `fallback` slot is rendered instead (initials, "?" placeholder,
 *     etc.).
 *
 * Object URLs are revoked on unmount and on src change to avoid blob
 * memory leaks.
 *
 * The component never tries to suppress the natural error path of
 * `<img>`; if the live URL fails for any reason while online (e.g. S3
 * 403 because the signature expired during a long session), the
 * `onError` handler falls back to the cached blob if available.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  fetchAndStoreImageBlob,
  getImageObjectUrl,
} from '../offline/imageBlobsRepo';

export default function OfflineImage({
  src,
  cacheKey,
  alt = '',
  className,
  style,
  onLoad,
  onError,
  fallback = null,
  // Optional: kind tag stored alongside the blob ('photo', 'thumb', etc.).
  kind = 'photo',
  // When true (default), show a subtle gold shimmer sheen over the
  // fallback while the <img>'s URL is still being resolved (offline
  // blob lookup, etc.). Set to `false` for tiny inline pixel icons
  // where the shimmer would feel like jitter.
  shimmer = true,
  ...rest
}) {
  const [resolvedSrc, setResolvedSrc] = useState(null);
  const [errored, setErrored] = useState(false);
  const objectUrlRef = useRef(null);

  // Track the latest invocation so an in-flight async lookup can't
  // overwrite a newer src/cacheKey with a stale resolution.
  const generationRef = useRef(0);

  useEffect(() => {
    const myGen = ++generationRef.current;
    setErrored(false);

    // Revoke any previous object URL to free GPU/memory.
    if (objectUrlRef.current) {
      try { URL.revokeObjectURL(objectUrlRef.current); } catch {}
      objectUrlRef.current = null;
    }

    if (!src && !cacheKey) {
      setResolvedSrc(null);
      return;
    }

    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

    if (isOffline) {
      // Offline: try the IndexedDB blob cache first (stable cache key,
      // survives S3 presigned-URL rotation across sessions).
      if (cacheKey) {
        getImageObjectUrl(cacheKey).then((url) => {
          if (myGen !== generationRef.current) {
            // A newer src arrived — ignore this stale lookup.
            if (url) try { URL.revokeObjectURL(url); } catch {}
            return;
          }
          if (url) {
            objectUrlRef.current = url;
            setResolvedSrc(url);
          } else if (src) {
            // No IndexedDB blob, but we still have a `src`. Try the
            // live URL anyway — the Service Worker's IMAGE_CACHE
            // (cross-origin opaque responses, populated via
            // <img>-based prefetchPhotosFrom on prior visits) may
            // intercept and serve it. The SW lookup is the ONLY way
            // we can rescue cross-origin photos when CORS is missing
            // on the upstream bucket (since fetch() can't store the
            // bytes to IndexedDB without CORS, but <img> can still
            // be served from CacheStorage opaque entries).
            //
            // If the SW also misses, the natural <img> onError
            // handler downstream will fall back to `fallback` (the
            // initials block).
            setResolvedSrc(src);
          } else {
            setResolvedSrc(null);
            setErrored(true);
          }
        });
      } else if (src) {
        // No stable cacheKey but still have a src: same SW-cache
        // rescue path as above.
        setResolvedSrc(src);
      } else {
        setResolvedSrc(null);
        setErrored(true);
      }
      return;
    }

    // Online: render the live URL immediately, and warm the blob cache
    // in the background so the next offline visit has bytes to serve.
    setResolvedSrc(src || null);
    if (src && cacheKey) {
      fetchAndStoreImageBlob(src, cacheKey, kind).catch(() => {});
    }

    return () => {
      if (objectUrlRef.current) {
        try { URL.revokeObjectURL(objectUrlRef.current); } catch {}
        objectUrlRef.current = null;
      }
    };
  }, [src, cacheKey, kind]);

  const handleError = (e) => {
    setErrored(true);
    if (typeof onError === 'function') onError(e);
    // If the live URL failed (e.g. 403 expired signature) and we have a
    // cached blob, swap to that.
    if (cacheKey) {
      getImageObjectUrl(cacheKey).then((url) => {
        if (url) {
          objectUrlRef.current = url;
          setResolvedSrc(url);
          setErrored(false);
        }
      });
    }
  };

  if (errored) {
    // Live URL failed AND any cache rescue inside handleError already
    // had its chance — render the caller's fallback (initials block,
    // gold UserIcon, etc.) instead of leaving a broken <img> in place
    // that would show the browser's stock "?" glyph forever.
    return fallback;
  }

  if (!resolvedSrc) {
    // Photo not yet selected (or no src at all). When `src` is set but
    // we haven't yet picked a renderable URL, wrap the fallback in a
    // gold shimmer sheen so the user sees the avatar is "loading"
    // instead of looking like a permanent initials avatar.
    if (shimmer && src) {
      return (
        <span
          className={className}
          style={{ ...style, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
          data-testid="offline-image-shimmer"
        >
          {fallback}
          <span
            aria-hidden
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'linear-gradient(110deg, transparent 25%, rgba(212,175,55,0.22) 50%, transparent 75%)',
              animation: 'offline-image-shimmer 1.4s ease-in-out infinite',
            }}
          />
          <style>{`
            @keyframes offline-image-shimmer {
              0%   { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>
        </span>
      );
    }
    return fallback;
  }

  // Image is ready to render. Render it exactly as the original
  // (unmodified) `<img>` — no wrapper, no opacity transition, no
  // `display:contents` trick. The shimmer fired during the pre-img
  // phase above; once the URL is resolved, the browser's own image
  // decode is fast enough that adding a JS-driven fade-in is more
  // risk than it's worth (cached-image races, positioning-context
  // edge cases on parents that aren't `position: relative`).
  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      style={style}
      onLoad={onLoad}
      onError={handleError}
      {...rest}
    />
  );
}
