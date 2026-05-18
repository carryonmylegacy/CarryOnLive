/**
 * CarryOn — Pending Sync Panel
 * ============================================================================
 * Tap-to-expand slide-over listing every queued outbox row and every
 * queued large-file upload, with per-item Retry / Remove controls.
 * Mounted once by PendingSyncChip and only rendered when the user
 * opens it.
 *
 * Reads:
 *   - `outbox.listPending()` → text writes queued by mutateWithOutbox
 *   - `pendingUploadsRepo.listPendingUploads()` → chunked uploads
 *
 * Writes:
 *   - `outbox.retryRow(id)` / `outbox.removeRow(id)`
 *   - `pendingUploadsRepo.updatePendingUpload(id, patch)` / `deletePendingUpload(id)`
 */

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Trash2, AlertTriangle, Clock, CloudUpload, CheckCircle2, Wifi } from 'lucide-react';
import { toast } from '../utils/toast';

const ENTITY_LABELS = {
  beneficiary: 'Beneficiary',
  profile: 'Profile',
  estate: 'Estate',
  ffn: 'Family Financial Network',
  ccp_plan: 'CarryOn Contingency Protocols',
  checklist: 'Checklist item',
  milestone_message: 'Milestone message',
  chat_message: 'Chat message',
  financial_bill: 'Bill',
  financial_debt: 'Debt',
  financial_account: 'Account',
  financial_property: 'Asset',
  digital_wallet_entry: 'Digital Wallet entry',
};

const UPLOAD_KIND_LABELS = {
  document: 'Document',
  milestone_video: 'Video message',
  milestone_audio: 'Voice message',
  chat_media: 'Chat attachment',
};

function relativeTime(ms) {
  if (!ms) return 'just now';
  const delta = Math.max(0, Date.now() - ms);
  const s = Math.round(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function formatBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PendingSyncPanel({ open, onClose }) {
  const [rows, setRows] = useState({ outbox: [], uploads: [] });
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [
        { listPending },
        { listPendingUploads },
      ] = await Promise.all([
        import('../offline/outbox'),
        import('../offline/pendingUploadsRepo'),
      ]);
      const [outbox, uploads] = await Promise.all([
        listPending().catch(() => []),
        listPendingUploads().catch(() => []),
      ]);
      const activeUploads = (uploads || []).filter((u) => u.status !== 'complete');
      setRows({ outbox: outbox || [], uploads: activeUploads });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    // Keep the list fresh while the panel is open.
    const handler = () => refresh();
    const events = [
      'carryon:outbox:enqueued',
      'carryon:outbox:drained',
      'carryon:outbox:drained-one',
      'carryon:outbox:conflict',
      'carryon:upload:progress',
      'carryon:upload:complete',
      'carryon:pending:changed',
    ];
    events.forEach((e) => window.addEventListener(e, handler));
    const poll = setInterval(refresh, 4000);
    // Esc to close.
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearInterval(poll);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, refresh]);

  const retryOutbox = async (row) => {
    setBusyId(`ob-${row.id}`);
    try {
      const { retryRow } = await import('../offline/outbox');
      await retryRow(row.id);
      toast.success('Retrying…');
      refresh();
    } catch {
      toast.error('Could not retry.');
    } finally { setBusyId(null); }
  };

  const resolveOutbox = async (row, choice) => {
    setBusyId(`ob-${row.id}`);
    try {
      const { resolveConflict } = await import('../offline/outbox');
      await resolveConflict(row.id, choice);
      toast.success(choice === 'mine'
        ? 'Your version will be applied when the queue drains.'
        : 'Kept the server\'s version. Your change was discarded.');
      refresh();
    } catch {
      toast.error('Could not resolve the conflict. Please try again.');
    } finally { setBusyId(null); }
  };

  const removeOutbox = async (row) => {
    if (!window.confirm('Remove this queued change? The write will NOT be sent to the server.')) return;
    setBusyId(`ob-${row.id}`);
    try {
      const { removeRow } = await import('../offline/outbox');
      await removeRow(row.id);
      toast.success('Queued change removed.');
      refresh();
    } catch {
      toast.error('Could not remove.');
    } finally { setBusyId(null); }
  };

  const retryUpload = async (row) => {
    setBusyId(`up-${row.id}`);
    try {
      const { updatePendingUpload } = await import('../offline/pendingUploadsRepo');
      await updatePendingUpload(row.id, { status: 'queued', retry_count: 0, last_error: null });
      // Kick the drainer.
      try {
        const { drainPendingUploads } = await import('../offline/chunkedUploader');
        const token = localStorage.getItem('carryon_token');
        if (token) drainPendingUploads(token).catch(() => {});
      } catch { /* non-fatal */ }
      toast.success('Retrying upload…');
      refresh();
    } catch {
      toast.error('Could not retry upload.');
    } finally { setBusyId(null); }
  };

  const removeUpload = async (row) => {
    if (!window.confirm(`Remove this queued ${UPLOAD_KIND_LABELS[row.kind] || 'upload'} permanently? Its contents will be lost.`)) return;
    setBusyId(`up-${row.id}`);
    try {
      const { deletePendingUpload } = await import('../offline/pendingUploadsRepo');
      await deletePendingUpload(row.id);
      toast.success('Queued upload removed.');
      refresh();
    } catch {
      toast.error('Could not remove upload.');
    } finally { setBusyId(null); }
  };

  if (!open) return null;

  const total = rows.outbox.length + rows.uploads.length;
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const content = (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center sm:justify-center"
      style={{ background: 'rgba(5, 10, 22, 0.65)', backdropFilter: 'blur(6px)' }}
      data-testid="pending-sync-panel"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pending sync items"
    >
      <div
        className="w-full sm:max-w-lg bg-[#0F1A33] sm:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col"
        style={{
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 24px)',
          border: '1px solid rgba(var(--gold-rgb), 0.25)',
          boxShadow: '0 24px 72px rgba(0,0,0,0.55)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(var(--gold-rgb), 0.18)]">
          <div className="flex items-center gap-2">
            <CloudUpload className="w-5 h-5 text-[#d4af37]" />
            <div>
              <h2 className="text-base font-bold text-[#F4E7C1]" style={{ fontFamily: 'var(--sans)' }}>
                {total === 0 ? 'Everything synced' : `${total} ${total === 1 ? 'item' : 'items'} queued`}
              </h2>
              <p className="text-[11px] text-[rgba(244,231,193,0.6)] flex items-center gap-1">
                {online ? <><Wifi className="w-3 h-3" /> Online — draining now</> : <><AlertTriangle className="w-3 h-3" /> Offline — will sync when you reconnect</>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)' }}
            data-testid="pending-sync-panel-close"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {total === 0 && (
            <div className="py-12 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto text-[#10b981] mb-3 opacity-70" />
              <p className="text-sm text-[rgba(244,231,193,0.75)]">No queued changes.</p>
              <p className="text-[11px] text-[rgba(244,231,193,0.45)] mt-1">
                Every edit you make offline will show up here until it syncs.
              </p>
            </div>
          )}

          {rows.outbox.map((r) => {
            const label = ENTITY_LABELS[r.entity_type] || r.entity_type;
            const verb = r.method === 'DELETE' ? 'Delete' : (r.method === 'POST' ? 'Create' : 'Update');
            const isConflict = r.status === 'conflict';
            const isFailed = r.status === 'failed';
            // Build short diff summaries for conflict rows (mine vs server).
            const mineSummary = isConflict && typeof r.body === 'object'
              ? Object.keys(r.body || {}).slice(0, 5).join(', ')
              : '';
            const theirsSummary = isConflict && typeof r.server_row === 'object'
              ? Object.keys(r.server_row || {}).slice(0, 5).join(', ')
              : '—';
            return (
              <div
                key={`ob-${r.id}`}
                className="rounded-xl p-3"
                style={{
                  background: isConflict ? 'rgba(153,27,27,0.22)' : (isFailed ? 'rgba(124,29,29,0.18)' : 'rgba(255,255,255,0.04)'),
                  border: `1px solid ${isConflict ? '#b91c1c' : (isFailed ? '#7c1d1d' : 'rgba(255,255,255,0.08)')}`,
                }}
                data-testid={`pending-sync-row-outbox-${r.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[#F4E7C1]">{verb} {label}</span>
                      {isConflict && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#b91c1c] text-white font-bold uppercase tracking-wide">Conflict</span>}
                      {isFailed && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#7c1d1d] text-white font-bold uppercase tracking-wide">Failed ({r.retry_count || 0}×)</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[rgba(244,231,193,0.55)]">
                      <Clock className="w-3 h-3" />
                      <span>queued {relativeTime(r.created_at)}</span>
                      <span>·</span>
                      <span className="truncate">{r.method} {r.url}</span>
                    </div>
                    {r.last_error && !isConflict && (
                      <p className="text-[11px] text-[#f87171] mt-1 truncate" title={r.last_error}>{r.last_error}</p>
                    )}
                  </div>
                  {!isConflict && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => retryOutbox(r)}
                        disabled={busyId === `ob-${r.id}`}
                        className="px-2.5 h-8 rounded-full text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                        style={{ background: '#d4af37', color: '#0B1221' }}
                        data-testid={`pending-sync-retry-${r.id}`}
                      >
                        <RefreshCw className={`w-3 h-3 ${busyId === `ob-${r.id}` ? 'animate-spin' : ''}`} />
                        Retry
                      </button>
                      <button
                        onClick={() => removeOutbox(r)}
                        disabled={busyId === `ob-${r.id}`}
                        className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-50"
                        style={{ background: 'rgba(255,255,255,0.08)', color: '#fca5a5' }}
                        data-testid={`pending-sync-remove-${r.id}`}
                        aria-label="Remove queued change"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline conflict resolver — mine vs theirs diff + chooser. */}
                {isConflict && (
                  <div className="mt-3 space-y-2" data-testid={`pending-sync-conflict-${r.id}`}>
                    <p className="text-[12px] text-[rgba(244,231,193,0.8)] leading-snug">
                      Someone (possibly you on another device) changed this first.
                      Which version wins?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div
                        className="p-2 rounded-lg"
                        style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.35)' }}
                      >
                        <div className="text-[11px] uppercase tracking-wide font-bold text-[#d4af37] mb-1">Your version</div>
                        <div className="text-[11px] text-[#F4E7C1] font-mono break-words">{mineSummary || '—'}</div>
                      </div>
                      <div
                        className="p-2 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        <div className="text-[11px] uppercase tracking-wide font-bold text-[rgba(244,231,193,0.7)] mb-1">Server version</div>
                        <div className="text-[11px] text-[#F4E7C1] font-mono break-words">{theirsSummary}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => resolveOutbox(r, 'theirs')}
                        disabled={busyId === `ob-${r.id}`}
                        className="flex-1 h-9 rounded-full text-[12px] font-bold disabled:opacity-50"
                        style={{ background: 'transparent', color: '#F4E7C1', border: '1px solid rgba(244,231,193,0.25)' }}
                        data-testid={`conflict-keep-theirs-${r.id}`}
                      >
                        Keep theirs
                      </button>
                      <button
                        onClick={() => resolveOutbox(r, 'mine')}
                        disabled={busyId === `ob-${r.id}`}
                        className="flex-1 h-9 rounded-full text-[12px] font-bold disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
                        data-testid={`conflict-keep-mine-${r.id}`}
                      >
                        Keep mine
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {rows.uploads.map((r) => {
            const label = UPLOAD_KIND_LABELS[r.kind] || r.kind;
            const pct = r.size_bytes ? Math.round(((r.bytes_sent || 0) / r.size_bytes) * 100) : 0;
            const isUploading = r.status === 'uploading';
            const isFailed = r.status === 'failed';
            return (
              <div
                key={`up-${r.id}`}
                className="rounded-xl p-3"
                style={{
                  background: isFailed ? 'rgba(124,29,29,0.18)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isFailed ? '#7c1d1d' : 'rgba(255,255,255,0.08)'}`,
                }}
                data-testid={`pending-sync-row-upload-${r.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CloudUpload className="w-4 h-4 text-[#d4af37]" />
                      <span className="text-sm font-bold text-[#F4E7C1] truncate">{label}</span>
                      {isUploading && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#d4af37] text-[#0B1221] font-bold uppercase tracking-wide">Uploading</span>}
                      {isFailed && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#7c1d1d] text-white font-bold uppercase tracking-wide">Failed ({r.retry_count || 0}×)</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[rgba(244,231,193,0.55)]">
                      <Clock className="w-3 h-3" />
                      <span>queued {relativeTime(r.created_at)}</span>
                      <span>·</span>
                      <span className="truncate">{r.filename || 'file'} · {formatBytes(r.size_bytes)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => retryUpload(r)}
                      disabled={busyId === `up-${r.id}`}
                      className="px-2.5 h-8 rounded-full text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                      style={{ background: '#d4af37', color: '#0B1221' }}
                      data-testid={`pending-sync-upload-retry-${r.id}`}
                    >
                      <RefreshCw className={`w-3 h-3 ${busyId === `up-${r.id}` ? 'animate-spin' : ''}`} />
                      Retry
                    </button>
                    <button
                      onClick={() => removeUpload(r)}
                      disabled={busyId === `up-${r.id}`}
                      className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-50"
                      style={{ background: 'rgba(255,255,255,0.08)', color: '#fca5a5' }}
                      data-testid={`pending-sync-upload-remove-${r.id}`}
                      aria-label="Remove queued upload"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {r.size_bytes > 0 && (
                  <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: '#d4af37' }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t border-[rgba(var(--gold-rgb), 0.18)] text-[11px] text-[rgba(244,231,193,0.55)]"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          Queued changes are stored on your device only. They sync automatically once you're back online.
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
