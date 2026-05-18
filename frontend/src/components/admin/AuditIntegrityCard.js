/**
 * AuditIntegrityCard — live SOC 2 audit-trail hash-chain status.
 *
 * Calls `GET /api/admin/audit-chain-status` every 10 min (and on mount)
 * which runs `services.audit.verify_audit_chain` over the latest 10k
 * audit entries. Surfaces a green/red verdict with the first broken
 * entry pointer if any.
 *
 * Pitch talking point: "the audit trail is self-verifying — every 10
 * minutes the dashboard re-walks the SHA-256 hash chain and confirms
 * no entry has been tampered with since insertion."
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { API_URL } from '../../config';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 min

const fmtCheckedAt = (iso) => {
  if (!iso) return '—';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

export const AuditIntegrityCard = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await apiClient.get(
        `${API_URL}/admin/audit-chain-status`,
        getAuthHeaders()
      );
      setData(res.data);
    } catch {
      // leave previous data; the card surfaces stale state via fmtCheckedAt
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchStatus(false); }, [fetchStatus]);
  useEffect(() => {
    const t = setInterval(() => fetchStatus(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchStatus]);

  if (loading) {
    return (
      <Card className="glass-card" data-testid="audit-integrity-card-loading">
        <CardContent className="py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--t4)]" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const ok = data.ok === true;
  const chained = data.entries_checked ?? 0;
  const legacy = data.skipped_legacy ?? 0;
  const newlyEnabled = ok && chained === 0 && legacy > 0;

  const palette = !ok
    ? {
      color: '#EF4444',
      border: '#EF4444',
      bg: 'rgba(239,68,68,0.06)',
      label: 'Chain broken',
      Icon: ShieldAlert,
    }
    : newlyEnabled
      ? {
        color: '#3B82F6',
        border: '#3B82F6',
        bg: 'rgba(59,130,246,0.06)',
        label: 'Chain armed',
        Icon: ShieldCheck,
      }
      : {
        color: '#10B981',
        border: '#10B981',
        bg: 'rgba(16,185,129,0.06)',
        label: 'Chain verified',
        Icon: ShieldCheck,
      };
  const StateIcon = palette.Icon;

  return (
    <Card
      className="glass-card"
      style={{ borderLeft: `3px solid ${palette.border}` }}
      data-testid="audit-integrity-card"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-[var(--t)] flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" style={{ color: palette.color }} />
            Audit Trail — SOC 2 Hash Chain
          </span>
          <button
            type="button"
            onClick={() => fetchStatus(true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg hover:bg-[var(--s)] transition"
            title="Re-verify chain now"
            data-testid="audit-integrity-refresh"
            aria-label="Re-verify audit chain now"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--t4)] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* Headline status row */}
        <div
          className="flex items-center justify-between p-3 rounded-lg mb-3"
          style={{ background: palette.bg, border: `1px solid ${palette.border}30` }}
        >
          <div className="flex items-center gap-2">
            <StateIcon className="w-5 h-5" style={{ color: palette.color }} />
            <div>
              <p
                className="text-sm font-bold"
                style={{ color: palette.color }}
                data-testid="audit-integrity-state"
              >
                {palette.label}
              </p>
              <p className="text-[11px] text-[var(--t5)]">
                {newlyEnabled
                  ? `Hash chain armed for all new entries · ${legacy.toLocaleString()} legacy entries archived`
                  : `Checked ${fmtCheckedAt(data.checked_at)} · auto-refresh every 10 min`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-[var(--t5)]">Entries</p>
            <p
              className="text-xs font-bold text-[var(--t)] font-mono"
              data-testid="audit-integrity-entries"
            >
              {(data.entries_checked ?? 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-1">
          <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <div className="text-sm font-bold text-[var(--t)]">
              {(data.entries_checked ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--t5)] uppercase tracking-wider mt-1">Chained</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <div className="text-sm font-bold text-[var(--t)]">
              {(data.skipped_legacy ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-[var(--t5)] uppercase tracking-wider mt-1">Legacy (pre-chain)</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <div className="text-sm font-bold text-[var(--t)] font-mono">SHA-256</div>
            <div className="text-[11px] text-[var(--t5)] uppercase tracking-wider mt-1">Algorithm</div>
          </div>
        </div>

        {/* Break details if any */}
        {!ok && (data.first_break_at || data.first_break_id) && (
          <div
            className="mt-3 p-3 rounded-lg text-xs"
            style={{
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#FECACA',
            }}
            data-testid="audit-integrity-break"
          >
            <strong className="text-[#FCA5A5]">First broken link:</strong>{' '}
            {data.first_break_at && <span className="font-mono">{data.first_break_at}</span>}
            {data.first_break_id && (
              <span className="font-mono opacity-70 ml-2">_id={data.first_break_id}</span>
            )}
          </div>
        )}

        <p className="text-[11px] text-[var(--t5)] italic mt-3">
          Each audit entry is SHA-256 hashed and links to the previous entry's
          hash. Tampering with any record breaks every hash from that point
          onward.
        </p>
      </CardContent>
    </Card>
  );
};

export default AuditIntegrityCard;
