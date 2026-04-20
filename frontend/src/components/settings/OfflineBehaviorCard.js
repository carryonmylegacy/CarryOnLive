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

import React, { useEffect, useState, useCallback } from 'react';
import { Wifi, WifiOff, CloudUpload, Info, RefreshCw, Trash2, FileText, Video, Mic, MessageSquare } from 'lucide-react';
import { countPendingUploads, listPendingUploads, updatePendingUpload, deletePendingUpload } from '../../offline/pendingUploadsRepo';
import { getOfflineMode } from '../../offline/featureFlag';
import { toast } from '../../utils/toast';

const LIMITS = [
  { label: 'Milestone audio', online: '60 min', offline: '60 min' },
  { label: 'Milestone video', online: '30 min', offline: '5 min' },
  { label: 'Document (per file)', online: '100 MB', offline: '25 MB' },
  { label: 'Chat attachments', online: '25 MB', offline: '10 MB' },
  { label: 'Beneficiaries / CCP / FFN / Checklist', online: 'unlimited', offline: 'unlimited' },
];

const KIND_ICONS = {
  document: FileText,
  milestone_video: Video,
  milestone_audio: Mic,
  chat_media: MessageSquare,
};

const KIND_LABELS = {
  document: 'Document',
  milestone_video: 'Milestone video',
  milestone_audio: 'Milestone voice',
  chat_media: 'Chat attachment',
};

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OfflineBehaviorCard() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pending, setPending] = useState(0);
  const [pendingRows, setPendingRows] = useState([]);
  const [retryingId, setRetryingId] = useState(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [count, rows] = await Promise.all([countPendingUploads(), listPendingUploads()]);
      setPending(count);
      setPendingRows(rows.filter(r => r.status !== 'complete'));
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const onEvent = () => refresh();
    window.addEventListener('carryon:upload:complete', onEvent);
    window.addEventListener('carryon:upload:progress', onEvent);
    const poll = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('carryon:upload:complete', onEvent);
      window.removeEventListener('carryon:upload:progress', onEvent);
      clearInterval(poll);
    };
  }, [refresh]);

  const handleRetry = async (row) => {
    setRetryingId(row.id);
    try {
      // Reset status to queued + clear retry counter so the drainer picks it up.
      await updatePendingUpload(row.id, { status: 'queued', retry_count: 0, last_error: null });
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const token = localStorage.getItem('carryon_token');
        if (token) {
          const { drainPendingUploads } = await import('../../offline/chunkedUploader');
          drainPendingUploads(token).catch(() => {});
        }
        toast.success('Retrying upload…');
      } else {
        toast.success('Upload queued — will retry when you reconnect.');
      }
      await refresh();
    } catch (err) {
      toast.error('Could not retry upload.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleRemove = async (row) => {
    if (!window.confirm(`Remove this queued ${KIND_LABELS[row.kind] || 'upload'} permanently? Its contents will be lost.`)) return;
    try {
      await deletePendingUpload(row.id);
      toast.success('Queued upload removed.');
      await refresh();
    } catch {
      toast.error('Could not remove upload.');
    }
  };

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

      {pendingRows.length > 0 && (
        <div className="mt-3 space-y-2" data-testid="offline-pending-uploads-list">
          {pendingRows.map((row) => {
            const Icon = KIND_ICONS[row.kind] || CloudUpload;
            const kindLabel = KIND_LABELS[row.kind] || row.kind;
            const isFailed = row.status === 'failed';
            const isUploading = row.status === 'uploading';
            return (
              <div
                key={row.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 text-[12px]"
                style={{
                  borderColor: isFailed ? 'rgba(248,113,113,0.4)' : 'var(--b)',
                  background: isFailed ? 'rgba(248,113,113,0.05)' : 'var(--bg)',
                }}
                data-testid={`offline-pending-row-${row.id}`}
              >
                <Icon className="w-4 h-4 shrink-0" style={{ color: isFailed ? '#f87171' : 'var(--t3)' }} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-[var(--t)]">{row.filename || kindLabel}</div>
                  <div className="text-[11px] text-[var(--t3)] flex items-center gap-2">
                    <span>{kindLabel}</span>
                    <span>·</span>
                    <span>{formatBytes(row.size_bytes)}</span>
                    {isUploading && <><span>·</span><span className="text-[#34d399]">uploading…</span></>}
                    {isFailed && <><span>·</span><span className="text-[#f87171]">failed ({row.retry_count || 0}×)</span></>}
                    {!isUploading && !isFailed && <><span>·</span><span>queued</span></>}
                  </div>
                </div>
                <button
                  onClick={() => handleRetry(row)}
                  disabled={retryingId === row.id || isUploading}
                  className="shrink-0 p-1.5 rounded-md hover:bg-[var(--s)] disabled:opacity-40"
                  title="Retry upload"
                  data-testid={`offline-pending-retry-${row.id}`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retryingId === row.id ? 'animate-spin' : ''}`} style={{ color: 'var(--t3)' }} />
                </button>
                <button
                  onClick={() => handleRemove(row)}
                  className="shrink-0 p-1.5 rounded-md hover:bg-[var(--s)]"
                  title="Remove from queue"
                  data-testid={`offline-pending-remove-${row.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" style={{ color: '#f87171' }} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
