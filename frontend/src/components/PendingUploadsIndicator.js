/**
 * CarryOn — Pending Uploads Indicator (Tier B Phase 9)
 * ============================================================================
 * Subtle, unobtrusive pill that appears when there are large-file uploads
 * queued or in-flight. Sits next to the OfflineSyncProgress pill (bottom-
 * right, above the dock) so users always know where their precious content
 * is in its journey from their device to the cloud.
 *
 * States:
 *   - No pending → null
 *   - Queued offline → "📦 3 uploads waiting — will send when you reconnect"
 *   - Uploading → "⬆ Uploading filename.mov · 42%"
 *   - All done → briefly shows "✓ All uploads complete" then hides
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getOfflineMode } from '../offline/featureFlag';
import { countPendingUploads, listPendingUploads } from '../offline/pendingUploadsRepo';
import { useAuth } from '../contexts/AuthContext';

export default function PendingUploadsIndicator() {
  const { token } = useAuth();
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [progress, setProgress] = useState(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const [stalled, setStalled] = useState(null); // { error, filename }
  const [retrying, setRetrying] = useState(false);
  const completeTimerRef = useRef(null);
  const lastProgressAtRef = useRef(0);
  const stallWatchRef = useRef(null);
  const progressRef = useRef(null);
  useEffect(() => { progressRef.current = progress; }, [progress]);

  const refresh = async () => {
    if (getOfflineMode() === 'off') { setCount(0); return; }
    try { setCount(await countPendingUploads()); } catch { /* ignore */ }
  };

  const triggerDrain = useCallback(async () => {
    if (!token || retrying) return;
    setRetrying(true);
    setStalled(null);
    try {
      const m = await import('../offline/chunkedUploader');
      await m.drainPendingUploads(token);
    } catch { /* errors surface via the failed event */ }
    finally {
      setRetrying(false);
      refresh();
    }
  }, [token, retrying]);

  useEffect(() => {
    refresh();
    const onStorage = (e) => { if (e.key === 'carryon_offline_v1') refresh(); };
    const onProgress = (e) => {
      lastProgressAtRef.current = Date.now();
      setStalled(null);
      setProgress(e.detail);
    };
    const onStart = (e) => {
      lastProgressAtRef.current = Date.now();
      setStalled(null);
      setProgress({ id: e.detail?.id, filename: e.detail?.filename, pct: 0, total: e.detail?.total || 0 });
    };
    const onFailed = (e) => {
      setStalled({ error: e.detail?.error || 'Upload failed', filename: e.detail?.filename || '' });
      setProgress(null);
    };
    const onComplete = () => {
      setProgress(null);
      setStalled(null);
      setJustCompleted(true);
      refresh();
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
      completeTimerRef.current = setTimeout(() => setJustCompleted(false), 2500);
    };
    const onOnline = () => { setOnline(true); refresh(); };
    const onOffline = () => { setOnline(false); refresh(); };
    // If we've been claiming "Uploading X%" but haven't ticked in 30 s,
    // surface a stall so the user gets a Retry button instead of staring
    // at a frozen progress bar. Also auto-triggers a fresh drain in case
    // the previous attempt died silently before emitting 'failed'.
    stallWatchRef.current = setInterval(async () => {
      const cur = progressRef.current;
      if (!cur) return;
      const since = Date.now() - (lastProgressAtRef.current || 0);
      if (since < 30000) return;
      // Fetch the row's last known error from IndexedDB so we can show
      // something useful even if no event was ever fired.
      let lastError = 'Sync stalled — tap to retry';
      try {
        const rows = await listPendingUploads();
        const match = rows.find((r) => r.status !== 'complete');
        if (match?.last_error) lastError = match.last_error;
      } catch { /* ignore */ }
      setStalled({ error: lastError, filename: cur.filename });
      setProgress(null);
    }, 5000);
    const poll = setInterval(refresh, 8000);
    window.addEventListener('storage', onStorage);
    window.addEventListener('carryon:upload:progress', onProgress);
    window.addEventListener('carryon:upload:start', onStart);
    window.addEventListener('carryon:upload:failed', onFailed);
    window.addEventListener('carryon:upload:complete', onComplete);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('carryon:upload:progress', onProgress);
      window.removeEventListener('carryon:upload:start', onStart);
      window.removeEventListener('carryon:upload:failed', onFailed);
      window.removeEventListener('carryon:upload:complete', onComplete);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(poll);
      if (stallWatchRef.current) clearInterval(stallWatchRef.current);
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  if (count === 0 && !progress && !justCompleted && !stalled) return null;
  const baseStyle = {
    position: 'fixed',
    right: 'max(16px, env(safe-area-inset-right, 0px))',
    bottom: 'calc(150px + env(safe-area-inset-bottom, 0px))',
    zIndex: 2147482900,
    pointerEvents: stalled || (count > 0 && online && !progress) ? 'auto' : 'none',
    minWidth: 200,
    maxWidth: 320,
    padding: '10px 14px',
    borderRadius: 14,
    color: 'var(--t, #e9edf5)',
    border: '1px solid var(--b, rgba(255,255,255,0.08))',
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    fontFamily: 'var(--sans, system-ui, -apple-system, sans-serif)',
    fontSize: 13,
    lineHeight: 1.3,
    transition: 'opacity 240ms ease-out',
    cursor: stalled || (count > 0 && online && !progress) ? 'pointer' : 'default',
  };

  let body;
  if (stalled) {
    body = (
      <div data-testid="pending-uploads-stalled">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, color: '#fca5a5' }}>Sync stalled</span>
          <span style={{ opacity: 0.85, fontSize: 11 }}>{retrying ? 'Retrying…' : 'Tap to retry'}</span>
        </div>
        <div style={{ opacity: 0.85, fontSize: 11, marginBottom: 4, wordBreak: 'break-word' }}>{stalled.error}</div>
        {stalled.filename && (
          <div style={{ opacity: 0.6, fontSize: 11 }}>{stalled.filename}</div>
        )}
      </div>
    );
  } else if (progress) {
    body = (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>{(progress.pct || 0) > 0 ? 'Uploading' : 'Connecting…'}</span>
          <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{progress.pct || 0}%</span>
        </div>
        <div style={{ height: 4, width: '100%', borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${progress.pct || 0}%`,
            background: 'linear-gradient(90deg, #6ee7b7, #34d399)',
            transition: 'width 300ms ease-out',
          }} />
        </div>
        <div style={{ opacity: 0.6, marginTop: 6, fontSize: 11 }}>{progress.filename}</div>
      </>
    );
  } else if (justCompleted) {
    body = <div><span style={{ color: '#34d399' }}>✓</span> Upload complete</div>;
  } else if (!online && count > 0) {
    body = (
      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {count} {count === 1 ? 'upload waiting' : 'uploads waiting'}
        </div>
        <div style={{ opacity: 0.7, fontSize: 11 }}>
          Will sync when you reconnect.
        </div>
      </div>
    );
  } else {
    body = (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600 }}>{count} {count === 1 ? 'upload queued' : 'uploads queued'}</span>
          {online && <span style={{ opacity: 0.85, fontSize: 11 }}>{retrying ? 'Retrying…' : 'Tap to send'}</span>}
        </div>
        <div style={{ opacity: 0.7, fontSize: 11, marginTop: 4 }}>
          {online ? 'Tap to start uploading now.' : 'Will begin shortly.'}
        </div>
      </div>
    );
  }

  const tappable = stalled || (count > 0 && online && !progress);
  const handleClick = tappable ? () => triggerDrain() : undefined;

  return (
    <div
      role={tappable ? 'button' : 'status'}
      aria-live="polite"
      aria-label={tappable ? 'Retry pending uploads' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={tappable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerDrain(); } } : undefined}
      data-testid="pending-uploads-indicator"
      style={{
        ...baseStyle,
        background: stalled ? 'rgba(127,29,29,0.92)'
          : (progress ? 'var(--bg2, rgba(15, 22, 41, 0.92))'
          : (online ? 'var(--bg2, rgba(15, 22, 41, 0.92))' : 'rgba(124,29,29,0.92)')),
      }}
    >
      {body}
    </div>
  );
}
