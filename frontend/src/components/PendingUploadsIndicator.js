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

import React, { useEffect, useState, useRef } from 'react';
import { getOfflineMode } from '../offline/featureFlag';
import { countPendingUploads } from '../offline/pendingUploadsRepo';

export default function PendingUploadsIndicator() {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [progress, setProgress] = useState(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const completeTimerRef = useRef(null);

  const refresh = async () => {
    if (getOfflineMode() === 'off') { setCount(0); return; }
    try { setCount(await countPendingUploads()); } catch { /* ignore */ }
  };

  useEffect(() => {
    refresh();
    const onStorage = (e) => { if (e.key === 'carryon_offline_v1') refresh(); };
    const onProgress = (e) => setProgress(e.detail);
    const onComplete = () => {
      setProgress(null);
      setJustCompleted(true);
      refresh();
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
      completeTimerRef.current = setTimeout(() => setJustCompleted(false), 2500);
    };
    const onOnline = () => { setOnline(true); refresh(); };
    const onOffline = () => { setOnline(false); refresh(); };
    // Refresh every 8s as a safety net so the count stays accurate
    // even if some events are missed.
    const poll = setInterval(refresh, 8000);
    window.addEventListener('storage', onStorage);
    window.addEventListener('carryon:upload:progress', onProgress);
    window.addEventListener('carryon:upload:complete', onComplete);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('carryon:upload:progress', onProgress);
      window.removeEventListener('carryon:upload:complete', onComplete);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(poll);
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

  if (count === 0 && !progress && !justCompleted) return null;
  const baseStyle = {
    position: 'fixed',
    right: 'max(16px, env(safe-area-inset-right, 0px))',
    bottom: 'calc(150px + env(safe-area-inset-bottom, 0px))',
    zIndex: 2147482900,
    pointerEvents: 'none',
    minWidth: 200,
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
  };

  let body;
  if (progress) {
    body = (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>Uploading</span>
          <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{progress.pct}%</span>
        </div>
        <div style={{ height: 4, width: '100%', borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${progress.pct}%`,
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
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {count} {count === 1 ? 'upload queued' : 'uploads queued'}
        </div>
        <div style={{ opacity: 0.7, fontSize: 11 }}>
          Will begin shortly.
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pending-uploads-indicator"
      style={{
        ...baseStyle,
        background: progress ? 'var(--bg2, rgba(15, 22, 41, 0.92))'
          : (online ? 'var(--bg2, rgba(15, 22, 41, 0.92))' : 'rgba(124,29,29,0.92)'),
      }}
    >
      {body}
    </div>
  );
}
