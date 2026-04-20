/**
 * CarryOn — Offline Behavior Settings Card (Tier C Phase 9)
 * ============================================================================
 * Shows the user, in one place, exactly what they can and can't do when
 * offline, what the size limits are, and how many uploads are currently
 * queued.
 *
 * Mounted inside SettingsPage as a normal card. Visible to all users,
 * because even with the offline flag off today, the explanation is still
 * accurate (they just won't have a pending queue).
 */

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, CloudUpload, Info } from 'lucide-react';
import { countPendingUploads } from '../../offline/pendingUploadsRepo';
import { getOfflineMode } from '../../offline/featureFlag';

const LIMITS = [
  { label: 'Milestone audio', online: '60 min', offline: '60 min' },
  { label: 'Milestone video', online: '30 min', offline: '5 min' },
  { label: 'Document (per file)', online: '100 MB', offline: '25 MB' },
  { label: 'Chat attachments', online: '25 MB', offline: '10 MB' },
  { label: 'Beneficiaries / CCP / FFN / Checklist', online: 'unlimited', offline: 'unlimited' },
];

export default function OfflineBehaviorCard() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try { const c = await countPendingUploads(); if (!cancelled) setPending(c); } catch {}
    };
    refresh();
    const onComplete = () => refresh();
    window.addEventListener('carryon:upload:complete', onComplete);
    const poll = setInterval(refresh, 10000);
    return () => { cancelled = true; window.removeEventListener('carryon:upload:complete', onComplete); clearInterval(poll); };
  }, []);

  const mode = getOfflineMode();
  const inertMode = mode === 'off';

  return (
    <div
      className="rounded-xl border p-4 sm:p-5"
      style={{ borderColor: 'var(--b)', background: 'var(--bg2)' }}
      data-testid="offline-behavior-card"
    >
      <div className="flex items-center gap-2 mb-3">
        <CloudUpload className="w-5 h-5" style={{ color: 'var(--t2)' }} />
        <h3 className="font-semibold text-[var(--t)]">Offline behavior</h3>
        <span
          className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
          style={{
            background: online ? 'rgba(52,211,153,0.12)' : 'rgba(244,114,182,0.12)',
            color: online ? '#34d399' : '#f87171',
          }}
          data-testid="offline-behavior-status"
        >
          {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {online ? 'Online' : 'Offline'}
        </span>
      </div>

      <p className="text-[13px] text-[var(--t2)] mb-4 leading-relaxed">
        CarryOn is designed to work even when you don't have a signal. You can
        still record milestones, upload documents, send messages, and create
        anything you want — we'll sync it all to the cloud automatically when
        you're back online. Existing files from the cloud (documents you've
        already uploaded, milestones already sent) open when you reconnect.
      </p>

      {inertMode && (
        <div className="text-[11px] mb-4 p-2 rounded bg-[rgba(250,204,21,0.08)] border border-[rgba(250,204,21,0.25)] text-[var(--t3)] flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Offline mode is not yet enabled on your account. This is a preview
            of what's coming — your admin will flip the switch once it's fully
            tested with your cohort.
          </span>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--b)' }}>
        <div className="grid grid-cols-3 text-[11px] font-semibold uppercase tracking-wide px-3 py-2" style={{ background: 'var(--bg)', color: 'var(--t3)' }}>
          <div>Action</div>
          <div>Online</div>
          <div>Offline</div>
        </div>
        {LIMITS.map((row) => (
          <div key={row.label} className="grid grid-cols-3 text-[13px] px-3 py-2 border-t" style={{ borderColor: 'var(--b)', color: 'var(--t)' }}>
            <div className="truncate">{row.label}</div>
            <div className="text-[var(--t2)]">{row.online}</div>
            <div className={row.offline !== row.online ? 'font-semibold' : 'text-[var(--t2)]'}>{row.offline}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4 text-[12px]">
        <span className="text-[var(--t2)]">Pending uploads</span>
        <span data-testid="offline-behavior-pending-count" className="font-semibold">
          {pending}
        </span>
      </div>
    </div>
  );
}
