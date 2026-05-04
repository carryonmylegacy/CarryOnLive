import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '../ui/card';
import { CloudUpload, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { listPendingUploads } from '../../offline/pendingUploadsRepo';
import { getDB } from '../../offline/db';
import { drainPendingUploads } from '../../offline/chunkedUploader';
import { drain as drainOutbox } from '../../offline/outbox';
import { toast } from '../../utils/toast';

/**
 * Sync Status Card — Settings → Offline
 *
 * Permanent in-app diagnostics for the sync queue. The user (and any
 * sales-demo audience) can see at a glance:
 *   - How many uploads / outbox writes are queued, in-flight, or failed.
 *   - The last error message (if anything has gone wrong).
 *   - The timestamp of the last successful drain.
 *   - A one-tap "Sync now" button that runs the drainer with
 *     `forceRetry: true` to break any wedged in-flight attempt.
 *
 * Lives at the bottom of the Offline section in /settings. Renders
 * `null` if there's literally nothing to report (empty queues, no
 * errors, nothing in flight) so the page stays uncluttered for users
 * who never hit an offline scenario.
 */
const LAST_SYNC_KEY = 'carryon_last_sync_at';

function relTime(ts) {
  if (!ts) return null;
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 30_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)} s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  return `${Math.round(diff / 86_400_000)} d ago`;
}

export default function SyncStatusCard() {
  const { token } = useAuth();
  const [uploads, setUploads] = useState([]);
  const [outboxCount, setOutboxCount] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(() => {
    const v = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10);
    return v || null;
  });
  const [draining, setDraining] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await listPendingUploads();
      setUploads(rows || []);
      const firstErr = (rows || []).map((r) => r.last_error).filter(Boolean)[0] || null;
      setLastError(firstErr);
    } catch { setUploads([]); }
    try {
      const db = getDB();
      const c = await db.outbox.where('status').equals('pending').count();
      setOutboxCount(c);
    } catch { setOutboxCount(0); }
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    const onComplete = () => {
      const now = Date.now();
      localStorage.setItem(LAST_SYNC_KEY, String(now));
      setLastSyncAt(now);
      refresh();
    };
    window.addEventListener('carryon:pending:changed', onChange);
    window.addEventListener('carryon:upload:complete', onComplete);
    window.addEventListener('carryon:upload:failed', onChange);
    window.addEventListener('carryon:upload:start', onChange);
    window.addEventListener('carryon:outbox:enqueued', onChange);
    window.addEventListener('carryon:outbox:drained', onComplete);
    const poll = setInterval(refresh, 10_000);
    return () => {
      window.removeEventListener('carryon:pending:changed', onChange);
      window.removeEventListener('carryon:upload:complete', onComplete);
      window.removeEventListener('carryon:upload:failed', onChange);
      window.removeEventListener('carryon:upload:start', onChange);
      window.removeEventListener('carryon:outbox:enqueued', onChange);
      window.removeEventListener('carryon:outbox:drained', onComplete);
      clearInterval(poll);
    };
  }, [refresh]);

  const queuedCount = uploads.filter((r) => r.status === 'queued').length;
  const uploadingCount = uploads.filter((r) => r.status === 'uploading').length;
  const failedCount = uploads.filter((r) => r.status === 'failed').length;
  const totalUploads = uploads.length;
  const totalQueued = totalUploads + outboxCount;

  const onSyncNow = async () => {
    if (!token || draining) return;
    setDraining(true);
    try {
      const [u, o] = await Promise.all([
        drainPendingUploads(token, { forceRetry: true }),
        drainOutbox(),
      ]);
      const sentText = ((u?.processed || 0) + (o?.sent || 0));
      if (sentText > 0) {
        toast.success(`${sentText} item${sentText === 1 ? '' : 's'} synced.`);
        const now = Date.now();
        localStorage.setItem(LAST_SYNC_KEY, String(now));
        setLastSyncAt(now);
      } else if (totalQueued === 0) {
        toast.success('Nothing to sync — all caught up.');
      } else {
        toast('Sync attempted — check status above.');
      }
    } catch (err) {
      toast.error(`Sync failed: ${err?.message || 'unknown error'}`);
    } finally {
      setDraining(false);
      refresh();
    }
  };

  // Keep the card hidden when there's nothing useful to show.
  const hasAnything = totalQueued > 0 || failedCount > 0 || lastError || lastSyncAt;
  if (!hasAnything) return null;

  const statusIcon = uploadingCount > 0
    ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#60a5fa' }} />
    : failedCount > 0
      ? <AlertCircle className="w-4 h-4" style={{ color: '#f87171' }} />
      : totalQueued > 0
        ? <CloudUpload className="w-4 h-4" style={{ color: '#fbbf24' }} />
        : <CheckCircle2 className="w-4 h-4" style={{ color: '#34d399' }} />;

  const statusLabel = uploadingCount > 0
    ? `Uploading ${uploadingCount}…`
    : failedCount > 0
      ? `${failedCount} failed`
      : totalQueued > 0
        ? `${totalQueued} queued`
        : 'All synced';

  return (
    <Card className="glass-card" data-testid="settings-sync-status-card">
      <CardContent className="pt-5 pb-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {statusIcon}
            <div className="min-w-0">
              <div className="font-bold text-[14px]" style={{ color: 'var(--t)' }}>Sync status</div>
              <div className="text-[12px]" style={{ color: 'var(--t2)' }}>{statusLabel}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onSyncNow}
            disabled={draining || !token}
            data-testid="settings-sync-now-btn"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold disabled:opacity-50"
            style={{
              background: 'var(--gold, #d4af37)',
              color: '#0B1221',
              minHeight: 36,
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${draining ? 'animate-spin' : ''}`} />
            {draining ? 'Syncing…' : 'Sync now'}
          </button>
        </div>

        {(queuedCount > 0 || uploadingCount > 0 || failedCount > 0 || outboxCount > 0) && (
          <div className="grid grid-cols-2 gap-2 text-[11px]" style={{ color: 'var(--t2)' }}>
            {uploadingCount > 0 && (
              <div data-testid="sync-row-uploading">In flight: <strong style={{ color: 'var(--t)' }}>{uploadingCount}</strong></div>
            )}
            {queuedCount > 0 && (
              <div data-testid="sync-row-queued">Queued: <strong style={{ color: 'var(--t)' }}>{queuedCount}</strong></div>
            )}
            {failedCount > 0 && (
              <div data-testid="sync-row-failed">Failed: <strong style={{ color: '#f87171' }}>{failedCount}</strong></div>
            )}
            {outboxCount > 0 && (
              <div data-testid="sync-row-outbox">Edits queued: <strong style={{ color: 'var(--t)' }}>{outboxCount}</strong></div>
            )}
          </div>
        )}

        {lastError && (
          <div
            data-testid="sync-last-error"
            className="rounded-lg px-3 py-2 text-[11px]"
            style={{
              background: 'rgba(127,29,29,0.18)',
              color: '#fca5a5',
              border: '1px solid rgba(252,165,165,0.18)',
              wordBreak: 'break-word',
            }}
          >
            <div className="font-bold mb-0.5">Last error</div>
            <div style={{ opacity: 0.9 }}>{lastError}</div>
          </div>
        )}

        {lastSyncAt && (
          <div className="text-[11px]" style={{ color: 'var(--t2)' }} data-testid="sync-last-success">
            Last successful sync: <strong style={{ color: 'var(--t)' }}>{relTime(lastSyncAt)}</strong>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
