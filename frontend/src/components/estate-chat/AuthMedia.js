import React, { useState, useEffect, useRef } from 'react';
import { Loader2, FileText, Download } from 'lucide-react';
import { toast } from '../../utils/toast';
import { platformDownload } from '../../utils/downloadFile';
import { API_URL } from '../../config';

// ── Cache-aware authenticated file fetch ──
const ECT_CACHE_NAME = 'carryon-ect-media-v1';

// In-flight fetch deduplication
const inflight = new Map();

/**
 * Fetch a chat attachment with auth, caching it in the Cache API so
 * subsequent visits are instant. A URL `variant` parameter is appended
 * (e.g. `?variant=thumb`) so the thumbnail and original are cached
 * independently.
 */
export async function cachedFetch(fileId, variant = null) {
  const cacheKey = variant
    ? `${API_URL}/estate-chat/files/${fileId}?variant=${variant}`
    : `${API_URL}/estate-chat/files/${fileId}`;
  const dedupeKey = variant ? `${fileId}:${variant}` : fileId;
  if (inflight.has(dedupeKey)) return inflight.get(dedupeKey);

  const promise = (async () => {
    if ('caches' in window) {
      try {
        const cache = await caches.open(ECT_CACHE_NAME);
        const cached = await cache.match(cacheKey);
        if (cached) {
          const blob = await cached.blob();
          return URL.createObjectURL(blob);
        }
      } catch { /* cache miss, fall through */ }
    }
    const token = localStorage.getItem('carryon_token');
    const res = await fetch(cacheKey, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    if ('caches' in window) {
      try {
        const cache = await caches.open(ECT_CACHE_NAME);
        await cache.put(cacheKey, new Response(blob.slice(0)));
      } catch { /* cache write failed, non-critical */ }
    }
    return URL.createObjectURL(blob);
  })();

  inflight.set(dedupeKey, promise);
  promise.finally(() => inflight.delete(dedupeKey));
  return promise;
}

/**
 * Warm the cache for a batch of file IDs (thumbnail variant). Concurrency
 * capped at 3 so we don't saturate the connection on slow mobile networks.
 * Caller typically passes only the most recently-visible attachments to
 * avoid wasting bandwidth on messages far up the scrollback.
 */
export function prefetchMedia(fileIds) {
  if (!fileIds?.length) return;
  let i = 0;
  const next = () => {
    if (i >= fileIds.length) return;
    const id = fileIds[i++];
    cachedFetch(id, 'thumb').catch(() => {}).then(next);
  };
  for (let c = 0; c < Math.min(3, fileIds.length); c++) next();
}

// ── Authenticated Image ──
// Loads the ~50-80 KB thumbnail variant (server-resized to 480px) when
// the bubble is close to the viewport. Falls back to the full-res original
// only when the user taps to open the preview modal — so a chat history
// with 50 photos transfers ~4 MB of thumbnails instead of ~500 MB of
// full-res originals.
export function AuthImage({ fileId, fileName, msgId, onPreview }) {
  const [src, setSrc] = useState(null);
  const [inView, setInView] = useState(false);
  const containerRef = useRef(null);
  const retryCount = useRef(0);

  // Lazy-load: only fetch when the bubble is within 800px of the viewport.
  // Before this, every image in the conversation fired a blob fetch on mount
  // which hammered mobile networks and stalled scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '800px 0px' } // start loading well before the bubble enters view
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    retryCount.current = 0;
    cachedFetch(fileId, 'thumb').then(setSrc).catch(() => {});
  }, [fileId, inView]);

  const reloadImage = () => {
    // iOS can revoke blob: URLs when the app backgrounds (Share Sheet, etc.)
    if (retryCount.current >= 2) return;
    retryCount.current += 1;
    cachedFetch(fileId, 'thumb').then(newSrc => setSrc(newSrc)).catch(() => {});
  };

  // Preview = full-res. We hand the original URL to the preview handler
  // so the zoomed modal shows the uncompressed image.
  const handlePreview = async () => {
    if (!onPreview) return;
    try {
      const fullSrc = await cachedFetch(fileId); // no variant → original
      onPreview(fullSrc, fileName, fileId);
    } catch {
      // Fall back to the thumbnail if full fetch fails
      if (src) onPreview(src, fileName, fileId);
    }
  };

  return (
    <div ref={containerRef}>
      <div className="relative">
        {!src ? (
          <div className="w-full h-[160px] rounded-xl bg-white/5 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4af37' }} />
          </div>
        ) : (
          <>
            <img
              src={src}
              alt={fileName}
              onError={reloadImage}
              draggable="false"
              loading="lazy"
              decoding="async"
              className="rounded-xl max-w-full max-h-[240px] object-cover mb-1"
              style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none', pointerEvents: 'none' }}
              data-testid={`chat-image-${msgId}`}
            />
            {/* Transparent overlay — blocks iOS native image save; handles tap vs long-press */}
            <div
              className="absolute inset-0 rounded-xl"
              style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
              onTouchStart={(e) => { e.currentTarget._tapTime = Date.now(); }}
              onTouchEnd={(e) => {
                const dt = Date.now() - (e.currentTarget._tapTime || 0);
                if (dt < 300 && !document.querySelector('[data-testid^="msg-action-menu-"]')) {
                  e.stopPropagation();
                  e.preventDefault();
                  handlePreview();
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handlePreview();
              }}
              onContextMenu={(e) => e.preventDefault()}
            />
          </>
        )}
      </div>
      {src && <span className="text-xs" style={{ color: 'var(--t4)' }}>{fileName}</span>}
    </div>
  );
}

// ── Authenticated Video ──
// Videos also lazy-load (they're far more bandwidth-expensive than photos).
export function AuthVideo({ fileId, fileName }) {
  const [src, setSrc] = useState(null);
  const [inView, setInView] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    cachedFetch(fileId).then(setSrc).catch(() => {});
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [fileId, inView]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef}>
      {!src ? (
        <div className="w-full h-[160px] rounded-xl bg-white/5 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4af37' }} />
        </div>
      ) : (
        <>
          <video
            src={src}
            controls
            playsInline
            preload="metadata"
            className="rounded-xl max-w-full max-h-[240px] mb-1"
            style={{ background: 'var(--bg)' }}
          />
          <span className="text-xs" style={{ color: 'var(--t4)' }}>{fileName}</span>
        </>
      )}
    </div>
  );
}

// ── Authenticated File Link ──
export function AuthFileLink({ fileId, fileName, fileSize, msgId }) {
  const handleDownload = async (e) => {
    e.stopPropagation();
    try {
      await platformDownload({
        action: 'ect_file',
        params: { file_id: fileId },
        filename: fileName || 'file',
        onFallback: async () => {
          const token = localStorage.getItem('carryon_token');
          const res = await fetch(`${API_URL}/estate-chat/files/${fileId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
        },
      });
    } catch { /* silent */ }
  };

  return (
    <div className="flex items-center gap-2 py-1 cursor-pointer" onClick={handleDownload} data-testid={`chat-file-${msgId}`}>
      <FileText className="w-5 h-5 flex-shrink-0" style={{ color: '#3B7BF7' }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{fileName}</div>
        <div className="text-[11px]" style={{ color: 'var(--t4)' }}>{(fileSize / 1024).toFixed(0)} KB</div>
      </div>
      <Download className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--t4)' }} />
    </div>
  );
}
