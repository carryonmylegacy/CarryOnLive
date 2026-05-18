/**
 * CarryOn — Platform-wide Pending Sync Chip
 * ============================================================================
 * Fixed in the top banner area at all times (alongside the offline banner
 * when offline, or on its own slim strip when online), this chip tells
 * the user — across every page — how many writes are queued locally and
 * haven't yet hit the server.
 *
 * Counts aggregate:
 *   - `outbox` rows with status='pending' (text-style writes enqueued by
 *     mutateWithOutbox — checklists, FFN, CCP, Financial Portal, MM,
 *     beneficiary edits, etc.)
 *   - `pendingUpload` rows with status != 'complete' (large-file chunked
 *     uploads — DAV documents + milestone video/audio).
 *   - `outbox` rows with status='conflict' (surface a red "attention
 *     needed" chip when any writes collided with a newer server state).
 *
 * Visibility:
 *   - Pending count = 0 → null (nothing rendered).
 *   - Pending count > 0 + OFFLINE → rendered INSIDE NetworkStatusBanner
 *     as an inline gold chip (see NetworkStatusBanner integration).
 *   - Pending count > 0 + ONLINE → rendered as its own thin blue bar at
 *     the top of the screen, above the header.
 *   - Conflict count > 0 → red variant overrides both above.
 *
 * Event contract:
 *   Listens on window for every sync-adjacent event so the count updates
 *   in near-real-time:
 *     'carryon:outbox:enqueued'    — new outbox row added
 *     'carryon:outbox:drained'     — drain finished (sent, failed)
 *     'carryon:outbox:drained-one' — single row drained
 *     'carryon:outbox:conflict'    — HTTP 409/412 detected
 *     'carryon:upload:progress'    — chunked upload tick
 *     'carryon:upload:complete'    — chunked upload finished
 *     'online' / 'offline'         — refresh whenever network flips
 *   Also polls every 8s as a safety net for any missed events.
 */

import React, { useEffect, useState, useRef } from 'react';
import { RefreshCw, AlertTriangle, CloudUpload } from 'lucide-react';
import { getOfflineMode } from '../offline/featureFlag';
import PendingSyncPanel from './PendingSyncPanel';

function safeCount(fn) {
  return fn().catch(() => 0);
}

export function usePendingSyncCounts() {
  const [counts, setCounts] = useState({ outbox: 0, uploads: 0, conflicts: 0, lastSyncedAt: null });
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const timerRef = useRef(null);

  const refresh = async () => {
    if (getOfflineMode() === 'off') {
      setCounts({ outbox: 0, uploads: 0, conflicts: 0, lastSyncedAt: null });
      return;
    }
    try {
      // Lazy-imported so that with flag='off' these modules never touch Dexie.
      const [
        { pendingCount, listConflicts },
        { countPendingUploads },
      ] = await Promise.all([
        import('../offline/outbox'),
        import('../offline/pendingUploadsRepo'),
      ]);
      const [ob, up, confs] = await Promise.all([
        safeCount(pendingCount),
        safeCount(countPendingUploads),
        listConflicts().catch(() => []),
      ]);
      setCounts({
        outbox: ob || 0,
        uploads: up || 0,
        conflicts: (confs || []).length,
        lastSyncedAt: parseInt(localStorage.getItem('carryon_last_sync_at') || '0', 10) || null,
      });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    const onDrained = () => {
      try { localStorage.setItem('carryon_last_sync_at', String(Date.now())); } catch {}
      refresh();
    };
    const onOnline = () => { setOnline(true); refresh(); };
    const onOffline = () => { setOnline(false); refresh(); };
    window.addEventListener('carryon:outbox:enqueued', handler);
    window.addEventListener('carryon:outbox:drained', onDrained);
    window.addEventListener('carryon:outbox:drained-one', handler);
    window.addEventListener('carryon:outbox:conflict', handler);
    window.addEventListener('carryon:upload:progress', handler);
    window.addEventListener('carryon:upload:complete', onDrained);
    window.addEventListener('carryon:pending:changed', handler);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    timerRef.current = setInterval(refresh, 8000);
    return () => {
      window.removeEventListener('carryon:outbox:enqueued', handler);
      window.removeEventListener('carryon:outbox:drained', onDrained);
      window.removeEventListener('carryon:outbox:drained-one', handler);
      window.removeEventListener('carryon:outbox:conflict', handler);
      window.removeEventListener('carryon:upload:progress', handler);
      window.removeEventListener('carryon:upload:complete', onDrained);
      window.removeEventListener('carryon:pending:changed', handler);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { ...counts, online };
}

/** Inline variant — a small chip designed to sit inside another banner. */
export function PendingSyncChipInline() {
  const { outbox, uploads, conflicts } = usePendingSyncCounts();
  const [panelOpen, setPanelOpen] = useState(false);
  const total = outbox + uploads;
  if (conflicts > 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
          style={{ background: '#991B1B', color: '#FEE2E2', border: '1px solid #FCA5A5' }}
          data-testid="pending-sync-chip-inline"
          data-variant="conflict"
          aria-label="View conflicts"
        >
          <AlertTriangle className="w-3 h-3" />
          {conflicts} {conflicts === 1 ? 'conflict' : 'conflicts'} — tap to resolve
        </button>
        <PendingSyncPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
      </>
    );
  }
  if (total === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
        style={{ background: '#d4af37', color: '#0B1221', border: '1px solid rgba(var(--gold-rgb), 0.9)' }}
        data-testid="pending-sync-chip-inline"
        data-variant="pending"
        aria-label="View queued items"
      >
        <CloudUpload className="w-3 h-3" />
        {total} queued
      </button>
      <PendingSyncPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}

/** Online variant — a thin fixed strip above the app header when there
 *  are pending items and the user IS online (the banner itself is
 *  absent). Becomes "Syncing N items…" while a drain is in progress.
 *  Also auto-opens the inline PendingSyncPanel when a brand-new
 *  conflict is detected so the user is never left stranded without
 *  seeing a resolver. */
export default function PendingSyncChip() {
  const { outbox, uploads, conflicts, online } = usePendingSyncCounts();
  const [draining, setDraining] = useState(false);
  const [flashSynced, setFlashSynced] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const prevTotalRef = useRef(0);
  const flashTimerRef = useRef(null);

  useEffect(() => {
    // Auto-open the panel the moment a new conflict arrives so users
    // always see the resolver without having to tap the tiny header
    // chip first. Replaces the legacy standalone ConflictResolver modal.
    const onConflict = () => {
      if (getOfflineMode() !== 'on') return;
      setPanelOpen(true);
    };
    window.addEventListener('carryon:outbox:conflict', onConflict);
    return () => window.removeEventListener('carryon:outbox:conflict', onConflict);
  }, []);

  useEffect(() => {
    const onDrainedOne = () => setDraining(true);
    const onDrained = () => {
      setDraining(false);
      const prev = prevTotalRef.current;
      // If we just went from >0 pending to 0, briefly celebrate.
      if (prev > 0) {
        setFlashSynced(true);
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setFlashSynced(false), 2200);
      }
    };
    window.addEventListener('carryon:outbox:drained-one', onDrainedOne);
    window.addEventListener('carryon:upload:progress', onDrainedOne);
    window.addEventListener('carryon:outbox:drained', onDrained);
    window.addEventListener('carryon:upload:complete', onDrained);
    return () => {
      window.removeEventListener('carryon:outbox:drained-one', onDrainedOne);
      window.removeEventListener('carryon:upload:progress', onDrainedOne);
      window.removeEventListener('carryon:outbox:drained', onDrained);
      window.removeEventListener('carryon:upload:complete', onDrained);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const total = outbox + uploads;
  // Keep a rolling mirror so the drained handler can know how many items
  // we had immediately before the drain emitted its tick.
  useEffect(() => { prevTotalRef.current = total; }, [total]);

  // When offline, NetworkStatusBanner owns the top real-estate; we render
  // nothing here (the inline chip is used inside that banner instead).
  if (!online) return null;

  // Online + no pending + not flashing — hide entirely.
  if (total === 0 && conflicts === 0 && !flashSynced) return null;

  // Conflict variant wins.
  if (conflicts > 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-2 px-4 py-1.5 text-[12px] font-bold w-full"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)',
            background: '#991B1B',
            color: '#FEE2E2',
            boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
            animation: 'slideDown 0.3s ease-out',
          }}
          data-testid="pending-sync-chip"
          data-variant="conflict"
          aria-label="View sync conflicts"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{conflicts} sync {conflicts === 1 ? 'conflict' : 'conflicts'} — tap to resolve</span>
        </button>
        <PendingSyncPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
      </>
    );
  }

  // Just-synced celebration pill (briefly green). Not clickable — it's informational.
  if (total === 0 && flashSynced) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-2 px-4 py-1.5 text-[12px] font-bold"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)',
          background: '#047857',
          color: '#ECFDF5',
          boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
          animation: 'slideDown 0.3s ease-out',
        }}
        data-testid="pending-sync-chip"
        data-variant="synced"
        role="status"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>All caught up — your queued changes just synced</span>
      </div>
    );
  }

  // Online + pending items. Gold while draining, muted while waiting.
  const label = draining
    ? `Syncing ${total} ${total === 1 ? 'item' : 'items'}…`
    : `${total} ${total === 1 ? 'item' : 'items'} queued — tap to review`;
  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-2 px-4 py-1.5 text-[12px] font-bold w-full"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)',
          background: draining ? '#d4af37' : '#1E3A5F',
          color: draining ? '#0B1221' : '#F4E7C1',
          boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
          animation: 'slideDown 0.3s ease-out',
        }}
        data-testid="pending-sync-chip"
        data-variant={draining ? 'syncing' : 'waiting'}
        aria-label="View queued items"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${draining ? 'animate-spin' : ''}`} />
        <span>{label}</span>
      </button>
      <PendingSyncPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}

/** Utility so writers (outbox + chunked uploader) can proactively nudge
 *  any mounted chips without waiting for the 8s poll tick. */
export function notifyPendingChanged() {
  try { window.dispatchEvent(new CustomEvent('carryon:pending:changed')); } catch { /* no-op */ }
}
