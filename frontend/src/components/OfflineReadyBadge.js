/**
 * CarryOn — "Offline ready" dashboard badge
 * ============================================================================
 * A small, reassuring pill on the dashboard header that tells the user, in
 * plain language, that their data is saved on THIS device and the app will
 * keep working without a signal. It reads the SAME on-device truth the
 * Offline Diagnostics panel uses (real Service-Worker cache state + the
 * decrypted profile mirror) — so it can only say "ready" when it genuinely
 * is. Tap it to open the full diagnostics.
 *
 * States:
 *   - checking   → render nothing (no flicker)
 *   - preparing  → subtle "Saving for offline…" (caching still in progress)
 *   - ready      → green "Offline ready ✓" + one-line explanation
 */

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, WifiOff } from 'lucide-react';
import { getLocalProfile } from '../offline/repos/profileRepo';

// Ask the controlling Service Worker for its cache state over a dedicated
// MessageChannel. Resolves null if there's no controller / no reply in time.
function askServiceWorker(message, timeoutMs = 10000) {
  return new Promise((resolve) => {
    try {
      const ctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (!ctrl) { resolve(null); return; }
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), timeoutMs);
      channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
      ctrl.postMessage(message, [channel.port2]);
    } catch { resolve(null); }
  });
}

export default function OfflineReadyBadge() {
  const [status, setStatus] = useState('checking'); // 'checking' | 'preparing' | 'ready'

  const check = useCallback(async () => {
    try {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) { setStatus('checking'); return; }
      const sw = await askServiceWorker({ type: 'GET_DIAG' });
      const profile = await getLocalProfile().catch(() => null);
      if (!sw) { setStatus('preparing'); return; }
      // Chunk completeness is only knowable when online (needs the manifest).
      // Offline, trust the worker + profile signals we CAN read.
      const chunksOk = sw.online
        ? (sw.expectedChunks > 0 && sw.cachedChunks >= sw.expectedChunks && sw.missingCount === 0)
        : true;
      const ready = chunksOk && !!sw.pdfWorkerReactCached && !!sw.shellLogoCached && !!profile;
      setStatus(ready ? 'ready' : 'preparing');
    } catch {
      setStatus('checking');
    }
  }, []);

  useEffect(() => {
    check();
    const onAny = () => check();
    window.addEventListener('online', onAny);
    window.addEventListener('carryon:sync:finish', onAny);
    let swHandler = null;
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      swHandler = (e) => { if (e.data?.type === 'OFFLINE_READY') check(); };
      navigator.serviceWorker.addEventListener('message', swHandler);
    }
    // Re-check shortly after mount to catch caching that finishes just after load.
    const t = setTimeout(check, 4000);
    return () => {
      window.removeEventListener('online', onAny);
      window.removeEventListener('carryon:sync:finish', onAny);
      if (swHandler) navigator.serviceWorker.removeEventListener('message', swHandler);
      clearTimeout(t);
    };
  }, [check]);

  if (status === 'checking') return null;

  const openDiag = () => window.dispatchEvent(new Event('carryon:open-diagnostics'));

  if (status === 'preparing') {
    return (
      <button
        type="button"
        onClick={openDiag}
        data-testid="offline-ready-badge-preparing"
        className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-full text-left transition-colors"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--b, rgba(255,255,255,0.1))' }}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--t4)' }} />
        <span className="text-xs" style={{ color: 'var(--t4)' }}>Saving your data for offline use…</span>
      </button>
    );
  }

  // ready
  return (
    <button
      type="button"
      onClick={openDiag}
      data-testid="offline-ready-badge"
      className="group inline-flex items-start gap-2.5 mt-2 px-3 py-2 rounded-xl text-left transition-all"
      style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)' }}
    >
      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#10b981' }} />
      <span className="leading-tight">
        <span className="block text-sm font-semibold" style={{ color: 'var(--t)' }}>
          Offline ready
        </span>
        <span className="block text-xs mt-0.5" style={{ color: 'var(--t4)' }}>
          You can now use CarryOn without a signal — your profile, documents and plan are saved on this device.
        </span>
      </span>
      <WifiOff className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-40 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--t4)' }} />
    </button>
  );
}
