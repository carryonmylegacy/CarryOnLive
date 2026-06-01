/**
 * CarryOn — Offline Sync Progress Pill (Phase 6)
 * ============================================================================
 * A subtle toast-style pill that surfaces post-login warm-up progress.
 * Listens for `carryon:sync:start/progress/finish` events dispatched by
 * `warmup.js` and renders a small progress indicator in the bottom-right.
 *
 * Design:
 *   - Only mounts when the offline flag is 'on'. Shadow mode and off mode
 *     stay invisible so we don't confuse beta testers.
 *   - Auto-dismisses 1.2s after the final task completes.
 *   - Respects safe-area insets so it never overlaps the iOS home-bar.
 *   - Light/dark aware via CSS variables.
 *
 * The pill is intentionally subtle — a thin gold progress bar with a
 * "Syncing for offline use · 12/21" label. Users see "your data is being
 * prepared so the app works without cell service."
 */

import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { getOfflineMode } from '../offline/featureFlag';
import {
  isPlatformOfflineVisible,
  PLATFORM_OFFLINE_FLAG_EVENT,
} from '../utils/platformOfflineFlag';

export default function OfflineSyncProgress() {
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [label, setLabel] = useState('');
  // Mirror the founder's master Offline-Mode platform switch — when
  // OFF, this whole pill must NEVER render, even if a warm-up event
  // somehow fires (Feb 27 2026 founder report: pill was visible with
  // Offline globally disabled in Admin). Re-reads live on every
  // flag-change broadcast so toggling in the Admin sidebar makes the
  // pill vanish without a page reload.
  const [platformOfflineVisible, setPlatformOfflineVisible] = useState(() => isPlatformOfflineVisible());
  const hideTimerRef = useRef(null);
  // "Ready for offline use" confirmation — flashed once per session when
  // the Service Worker reports it has finished caching every app chunk
  // (OFFLINE_READY message). Lives in the SAME bottom-right pill slot as
  // the sync-progress indicator and auto-dismisses.
  const [readyVisible, setReadyVisible] = useState(false);
  const readyTimerRef = useRef(null);

  useEffect(() => {
    const onPlatformChange = () => setPlatformOfflineVisible(isPlatformOfflineVisible());
    window.addEventListener(PLATFORM_OFFLINE_FLAG_EVENT, onPlatformChange);
    return () => window.removeEventListener(PLATFORM_OFFLINE_FLAG_EVENT, onPlatformChange);
  }, []);

  // If the platform switch flips OFF mid-sync, force-hide immediately
  // and clear any pending auto-dismiss timer.
  useEffect(() => {
    if (!platformOfflineVisible) {
      setVisible(false);
      setReadyVisible(false);
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
      if (readyTimerRef.current) { clearTimeout(readyTimerRef.current); readyTimerRef.current = null; }
    }
  }, [platformOfflineVisible]);

  // Listen for the Service Worker's OFFLINE_READY signal (fired once it has
  // cached every app chunk) and flash the confirmation pill — capped to
  // once per session so it reassures without nagging on every reload.
  useEffect(() => {
    if (!platformOfflineVisible) return;
    if (getOfflineMode() !== 'on') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onSwMessage = (event) => {
      if (event.data?.type !== 'OFFLINE_READY') return;
      try {
        if (sessionStorage.getItem('carryon_offline_ready_shown') === '1') return;
        sessionStorage.setItem('carryon_offline_ready_shown', '1');
      } catch { /* private mode — still show, just may repeat */ }
      setReadyVisible(true);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      readyTimerRef.current = setTimeout(() => setReadyVisible(false), 2600);
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, [platformOfflineVisible]);

  useEffect(() => {
    if (!platformOfflineVisible) return;
    if (getOfflineMode() !== 'on') return;
    const onStart = (e) => {
      setDone(0);
      setTotal(e.detail?.total || 0);
      setLabel('');
      setVisible(true);
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    };
    const onProgress = (e) => {
      setDone(e.detail?.done || 0);
      setTotal(e.detail?.total || 0);
      setLabel(e.detail?.label || '');
      setVisible(true);
    };
    const onFinish = () => {
      // Give the user 1.2s to notice the "100%" state, then fade out.
      hideTimerRef.current = setTimeout(() => setVisible(false), 1200);
    };
    window.addEventListener('carryon:sync:start', onStart);
    window.addEventListener('carryon:sync:progress', onProgress);
    window.addEventListener('carryon:sync:finish', onFinish);
    return () => {
      window.removeEventListener('carryon:sync:start', onStart);
      window.removeEventListener('carryon:sync:progress', onProgress);
      window.removeEventListener('carryon:sync:finish', onFinish);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [platformOfflineVisible]);

  // Belt-and-braces render gate: even if an event somehow slipped
  // through before the effect re-evaluated, the founder's master
  // switch wins.
  if (!platformOfflineVisible) return null;
  const showProgress = visible && total > 0;
  if (!showProgress && !readyVisible) return null;

  // "Ready for offline use" confirmation pill — same slot/look as the
  // progress pill, green check instead of a progress bar.
  if (!showProgress && readyVisible) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="offline-ready-pill"
        style={{
          position: 'fixed',
          right: 'max(16px, env(safe-area-inset-right, 0px))',
          bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
          zIndex: 2147483000,
          pointerEvents: 'none',
          opacity: readyVisible ? 1 : 0,
          transition: 'opacity 260ms ease-out',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 200,
            padding: '10px 14px',
            borderRadius: 14,
            background: 'var(--bg2, rgba(15, 22, 41, 0.92))',
            color: 'var(--t, #e9edf5)',
            border: '1px solid rgba(16, 185, 129, 0.45)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            fontFamily: 'var(--sans, system-ui, -apple-system, sans-serif)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <CheckCircle2 className="w-4 h-4" style={{ color: '#10b981', flexShrink: 0 }} />
          <span>Ready for offline use</span>
        </div>
      </div>
    );
  }

  const pct = Math.round((done / total) * 100);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-sync-progress"
      style={{
        position: 'fixed',
        right: 'max(16px, env(safe-area-inset-right, 0px))',
        bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        zIndex: 2147483000,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 260ms ease-out',
      }}
    >
      <div
        style={{
          minWidth: 200,
          padding: '10px 14px',
          borderRadius: 14,
          background: 'var(--bg2, rgba(15, 22, 41, 0.92))',
          color: 'var(--t, #e9edf5)',
          border: '1px solid var(--b, rgba(255,255,255,0.08))',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          fontFamily: 'var(--sans, system-ui, -apple-system, sans-serif)',
          fontSize: 13,
          lineHeight: 1.3,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>Syncing for offline use</span>
          <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
            {done}/{total}
          </span>
        </div>
        <div
          style={{
            height: 4,
            width: '100%',
            borderRadius: 2,
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #d4af37, #f5d876)',
              transition: 'width 300ms ease-out',
            }}
          />
        </div>
        {label && (
          <div style={{ opacity: 0.55, marginTop: 6, fontSize: 11 }}>{label}</div>
        )}
      </div>
    </div>
  );
}
