import React, { useState, useEffect, useRef } from 'react';
import { Loader2, FileText, Download } from 'lucide-react';
import { toast } from '../../utils/toast';
import { platformDownload } from '../../utils/downloadFile';
import { API_URL } from '../../config';

// ── Cache-aware authenticated file fetch ──
const ECT_CACHE_NAME = 'carryon-ect-media-v1';

// In-flight fetch deduplication
const inflight = new Map();

export async function cachedFetch(fileId) {
  // Deduplicate: if already fetching this fileId, return same promise
  if (inflight.has(fileId)) return inflight.get(fileId);

  const promise = (async () => {
    const cacheKey = `${API_URL}/estate-chat/files/${fileId}`;
    // 1. Try the Cache API first
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
    // 2. Fetch from server
    const token = localStorage.getItem('carryon_token');
    const res = await fetch(cacheKey, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    // 3. Store in cache for next time
    if ('caches' in window) {
      try {
        const cache = await caches.open(ECT_CACHE_NAME);
        await cache.put(cacheKey, new Response(blob.slice(0)));
      } catch { /* cache write failed, non-critical */ }
    }
    return URL.createObjectURL(blob);
  })();

  inflight.set(fileId, promise);
  promise.finally(() => inflight.delete(fileId));
  return promise;
}

/**
 * Prefetch a batch of file IDs into the cache in parallel (up to 3 concurrent).
 * Call this when a conversation is opened to warm the cache for visible media.
 */
export function prefetchMedia(fileIds) {
  if (!fileIds?.length) return;
  // Limit concurrency to 3 to avoid saturating the connection
  let i = 0;
  const next = () => {
    if (i >= fileIds.length) return;
    const id = fileIds[i++];
    cachedFetch(id).catch(() => {}).then(next);
  };
  // Start up to 3 concurrent fetches
  for (let c = 0; c < Math.min(3, fileIds.length); c++) next();
}

// ── Authenticated Image ──
export function AuthImage({ fileId, fileName, msgId, onPreview }) {
  const [src, setSrc] = useState(null);
  const retryCount = useRef(0);

  useEffect(() => {
    retryCount.current = 0;
    cachedFetch(fileId).then(setSrc).catch(() => {});
    return () => { /* blob URLs cleaned up via onError retry cycle */ };
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadImage = () => {
    // iOS can revoke blob: URLs when the app backgrounds (Share Sheet, etc.)
    if (retryCount.current >= 2) return;
    retryCount.current += 1;
    cachedFetch(fileId).then(newSrc => setSrc(newSrc)).catch(() => {});
  };

  const handleDownload = async () => {
    if (!fileId) return;
    try {
      const token = localStorage.getItem('carryon_token');
      const resp = await fetch(`${API_URL}/estate-chat/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await resp.blob();
      const ext = (fileName || '').split('.').pop()?.toLowerCase() || 'jpg';
      const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
      const mimeType = mimeMap[ext] || blob.type || 'image/jpeg';
      const file = new File([blob], fileName || 'photo.jpg', { type: mimeType });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'photo.jpg';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err.name !== 'AbortError') toast.error('Could not save photo');
    }
  };

  if (!src) return <div className="w-full h-[160px] rounded-xl bg-white/5 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4af37' }} /></div>;

  return (
    <div>
      <div className="relative">
        <img
          src={src}
          alt={fileName}
          onError={reloadImage}
          draggable="false"
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
            // Only treat as a tap if < 300ms (not a long press) and no action menu visible
            if (dt < 300 && !document.querySelector('[data-testid^="msg-action-menu-"]')) {
              e.stopPropagation();
              e.preventDefault();
              if (onPreview) onPreview(src, fileName, fileId);
            }
            // Long presses fall through — parent bubble handles them
          }}
          onClick={(e) => {
            // Block all clicks from reaching the bubble — touch handler above handles taps
            e.stopPropagation();
            e.preventDefault();
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <span className="text-xs" style={{ color: 'var(--t4)' }}>{fileName}</span>
    </div>
  );
}

// ── Authenticated Video ──
export function AuthVideo({ fileId, fileName }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    cachedFetch(fileId).then(setSrc).catch(() => {});
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!src) return <div className="w-full h-[160px] rounded-xl bg-white/5 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: '#d4af37' }} /></div>;

  return (
    <div>
      <video
        src={src}
        controls
        playsInline
        className="rounded-xl max-w-full max-h-[240px] mb-1"
        style={{ background: 'var(--bg)' }}
      />
      <span className="text-xs" style={{ color: 'var(--t4)' }}>{fileName}</span>
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
