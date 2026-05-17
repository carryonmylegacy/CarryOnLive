/**
 * DbStatusCard — live MongoDB cluster status for the Founder admin
 * dashboard and the CTO/IT (`/ops`) System Health portal.
 *
 * Single source of truth: `GET /api/admin/db-status`. We pull every
 * 60s and render a green/yellow/red status dot, host + region,
 * server version + replica set, ping latency, db-size totals, and
 * the headline collections with document counts.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  HardDrive,
  GitBranch,
} from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { API_URL } from '../../config';

const STATE_PALETTE = {
  healthy: { color: '#10B981', border: '#10B981', bg: 'rgba(16,185,129,0.06)', label: 'Healthy', Icon: CheckCircle2 },
  degraded: { color: '#F59E0B', border: '#F59E0B', bg: 'rgba(245,158,11,0.06)', label: 'Degraded', Icon: AlertTriangle },
  unreachable: { color: '#EF4444', border: '#EF4444', bg: 'rgba(239,68,68,0.06)', label: 'Unreachable', Icon: XCircle },
};

// Format raw byte counts as KB / MB / GB.
const fmtBytes = (n) => {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const fmtNum = (n) => (n === null || n === undefined ? '—' : n.toLocaleString());

const fmtCheckedAt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Math.max(0, Date.now() - d.getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
};

export const DbStatusCard = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await apiClient.get(`${API_URL}/admin/db-status`, getAuthHeaders());
      setData(res.data);
    } catch {
      /* leave previous data; the card surfaces a stale state below */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchStatus(false); }, [fetchStatus]);
  // Light auto-refresh — DB state changes rarely; 60s is more than enough.
  useEffect(() => {
    const t = setInterval(() => fetchStatus(false), 60000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  if (loading) {
    return (
      <Card className="glass-card" data-testid="db-status-card-loading">
        <CardContent className="py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--t4)]" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const palette = STATE_PALETTE[data.state] || STATE_PALETTE.degraded;
  const StateIcon = palette.Icon;
  const host = data.host || {};
  const rs = data.replica_set;
  const stats = data.db_stats || {};

  return (
    <Card
      className="glass-card"
      style={{ borderLeft: `3px solid ${palette.border}` }}
      data-testid="db-status-card"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-[var(--t)] flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Database className="w-4 h-4" style={{ color: palette.color }} />
            Database — {host.backend || 'MongoDB'}
          </span>
          <button
            type="button"
            onClick={() => fetchStatus(true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg hover:bg-[var(--s)] transition"
            title="Refresh now"
            data-testid="db-status-refresh"
            aria-label="Refresh database status"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--t4)] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* ── Headline state row ─────────────────────────────────── */}
        <div
          className="flex items-center justify-between p-3 rounded-lg mb-3"
          style={{ background: palette.bg, border: `1px solid ${palette.border}30` }}
        >
          <div className="flex items-center gap-2">
            <StateIcon className="w-5 h-5" style={{ color: palette.color }} />
            <div>
              <p className="text-sm font-bold" style={{ color: palette.color }} data-testid="db-status-state">
                {palette.label}
              </p>
              <p className="text-[11px] text-[var(--t5)]">
                Ping {data.ping?.latency_ms ?? '—'} ms · checked {fmtCheckedAt(data.checked_at)}
              </p>
            </div>
          </div>
          {host.cluster && (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-[var(--t5)]">Cluster</p>
              <p className="text-xs font-bold text-[var(--t)] font-mono truncate max-w-[180px]" title={host.cluster}>
                {host.cluster}
              </p>
            </div>
          )}
        </div>

        {/* ── Server / replica-set summary ───────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <div className="text-sm font-bold text-[var(--t)]" data-testid="db-stats-version">
              {data.server?.version || '—'}
            </div>
            <div className="text-[10px] text-[var(--t5)] uppercase tracking-wider mt-1">Server version</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <div className="text-sm font-bold text-[var(--t)] flex items-center justify-center gap-1">
              <GitBranch className="w-3.5 h-3.5 text-[var(--t4)]" />
              {rs ? `${rs.healthy_count}/${rs.member_count}` : '—'}
            </div>
            <div className="text-[10px] text-[var(--t5)] uppercase tracking-wider mt-1">
              {rs?.set_name ? `RS: ${rs.set_name}` : 'Replica set'}
            </div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <div className="text-sm font-bold text-[var(--t)] flex items-center justify-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-[var(--t4)]" />
              {fmtBytes(stats.data_size)}
            </div>
            <div className="text-[10px] text-[var(--t5)] uppercase tracking-wider mt-1">Data size</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <div className="text-sm font-bold text-[var(--t)]">{fmtNum(stats.objects)}</div>
            <div className="text-[10px] text-[var(--t5)] uppercase tracking-wider mt-1">Total documents</div>
          </div>
        </div>

        {/* ── Collection counts ───────────────────────────────────── */}
        {Array.isArray(data.collections) && data.collections.length > 0 && (
          <div data-testid="db-status-collections">
            <div className="text-[11px] uppercase tracking-wider text-[var(--t5)] mb-1.5">
              Collections ({stats.collections ?? data.collections.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {data.collections.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between p-2 rounded text-xs"
                  style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
                  data-testid={`db-col-${c.name}`}
                >
                  <span className="font-bold text-[var(--t)] truncate flex-1" title={c.name}>
                    {c.name}
                    {c.extra && <span className="ml-1 text-[10px] text-[var(--t5)]">·extra</span>}
                  </span>
                  <span className="text-[var(--t4)] tabular-nums ml-2">{fmtNum(c.count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer with full host detail (for IT/ops) ──────────── */}
        {host.host && (
          <p className="text-[11px] text-[var(--t5)] italic mt-3 break-all">
            Host: <span className="font-mono">{host.host}</span>
            {host.srv && <span className="ml-1 text-[var(--gold)]">· SRV</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default DbStatusCard;
