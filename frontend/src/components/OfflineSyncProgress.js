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
 *   - On `carryon:sync:finish` the bar swaps to a green "Offline ready" +
 *     checkmark for ~3.2s, then fades. That is the ONLY readiness assertion
 *     in the app (the persistent dashboard banner was removed Jun 1 2026) so
 *     it can never claim "ready" while a sync is still in progress.
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
  // Re-read the DEVICE offline flag reactively. The post-login warm-up can
  // flip `carryon_offline_v1` to 'on' AFTER this component already mounted
  // (admin platform-settings task), and nothing re-subscribed the pill's SW
  // listener — so the "Ready for offline" confirmation never fired on the
  // first launch. Tracking it as state (updated on the flag-change broadcasts)
  // makes every gated effect below re-evaluate the moment the flag flips.
  const [offlineOn, setOfflineOn] = useState(() => getOfflineMode() === 'on');
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
    // Device offline-flag flips (warm-up admin task, manual toggle, diagnostics
    // "Turn offline flag ON") broadcast one of these two events.
    const onModeChange = () => setOfflineOn(getOfflineMode() === 'on');
    window.addEventListener('carryon:offline-mode-changed', onModeChange);
    window.addEventListener('carryon:offline-flag-changed', onModeChange);
    return () => {
      window.removeEventListener(PLATFORM_OFFLINE_FLAG_EVENT, onPlatformChange);
      window.removeEventListener('carryon:offline-mode-changed', onModeChange);
      window.removeEventListener('carryon:offline-flag-changed', onModeChange);
    };
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
  }, [platformOfflineVisible, offlineOn]);

  // The bottom-right pill ends with a green "Offline ready" confirmation
  // ONLY when the warm-up SYNC actually finishes (see onFinish below) — never
  // off a separate chunk-cache signal that could claim "ready" while the data
  // sync is still in flight. One truthful source of completion.

  useEffect(() => {
    if (!platformOfflineVisible) return;
    if (!offlineOn) return;
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
      // Sync is genuinely complete — swap the progress bar for a green
      // "Offline ready" confirmation, hold it ~3.2s, then fade out. This is
      // the ONLY thing that asserts offline-readiness, so it can never
      // contradict an in-progress sync (the earlier bug where the dashboard
      // claimed "ready" while this pill still read 7/12).
      setVisible(false);
      setReadyVisible(true);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      readyTimerRef.current = setTimeout(() => setReadyVisible(false), 3200);
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
  }, [platformOfflineVisible, offlineOn]);

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
          <span>Offline ready</span>
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
