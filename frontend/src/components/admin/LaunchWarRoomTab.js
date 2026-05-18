import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { Card, CardContent } from '../ui/card';
import {
  Activity, Users, TrendingUp, DollarSign, Database, AlertTriangle,
  CheckCircle2, Radio, RefreshCw, Clock, Zap, ShieldCheck,
} from 'lucide-react';
import { API_URL } from '../../config';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Launch War Room — real-time platform health during marketing pushes.
 *
 * Polls /api/admin/launch-war-room every 15s. Designed for the launch-day
 * scenario where you want ONE screen that shows: traffic, performance,
 * revenue, infrastructure. Alerts surface any red flags.
 */
export function LaunchWarRoomTab() {
  const { getAuthHeaders } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef(null);

  const load = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/admin/launch-war-room`, getAuthHeaders());
      setData(res.data);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (paused) return;
    intervalRef.current = setInterval(load, 15000);
    return () => intervalRef.current && clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  if (loading && !data) {
    return (
      <div className="p-6 flex items-center justify-center text-[var(--t5)]" data-testid="war-room-loading">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading war room…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6" data-testid="war-room-error">
        <Card className="glass-card border-[#ef4444]/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
            <div>
              <p className="text-[var(--t)] font-semibold">War Room unavailable</p>
              <p className="text-[var(--t5)] text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const alerts = data.alerts || [];
  const hasCritical = alerts.some(a => a.level === 'critical');

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-page-in" data-testid="war-room-root">
      {/* Header with pulse + last refresh */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 rounded-full" style={{ background: hasCritical ? 'linear-gradient(180deg, #fbbf24, #ef4444)' : 'linear-gradient(180deg, var(--gold2), var(--gold))' }} />
            <h2 className="text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)', letterSpacing: '-0.02em' }}>
              Launch War Room
            </h2>
            <PulseDot status={hasCritical ? 'critical' : alerts.length ? 'warn' : 'healthy'} />
          </div>
          <p className="text-[var(--t5)] text-xs pl-4 mt-1">
            Real-time platform health · refreshes every 15s · {lastRefresh ? `updated ${timeAgo(lastRefresh)}` : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
            style={{ background: 'var(--s)', color: paused ? '#ef4444' : 'var(--t4)', border: '1px solid var(--b)' }}
            data-testid="war-room-pause-btn"
          >
            {paused ? <Radio className="w-3 h-3" /> : <Radio className="w-3 h-3 animate-pulse" />}
            {paused ? 'PAUSED' : 'LIVE'}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-[var(--t4)] hover:text-[var(--t3)] transition-colors"
            style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
            data-testid="war-room-refresh-btn"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* Alerts strip */}
      {alerts.length > 0 && (
        <div className="space-y-2" data-testid="war-room-alerts">
          {alerts.map((a, i) => (
            <div
              key={i}
              className="rounded-xl p-3 flex items-center gap-3"
              style={{
                background: a.level === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(251,191,36,0.08)',
                border: `1px solid ${a.level === 'critical' ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.3)'}`,
              }}
            >
              <AlertTriangle className={`w-5 h-5 ${a.level === 'critical' ? 'text-[#ef4444]' : 'text-[#fbbf24]'}`} />
              <p className="text-[var(--t)] text-sm font-semibold">{a.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* TRAFFIC row */}
      <SectionHeader icon={Users} label="Traffic" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard testid="wr-signups-5m" icon={Zap} label="Signups · 5 min" value={fmt(data.traffic.signups_last_5m)} accent="gold" />
        <MetricCard testid="wr-signups-1h" icon={TrendingUp} label="Signups · 1 hr" value={fmt(data.traffic.signups_last_1h)} accent="teal" />
        <MetricCard testid="wr-signups-24h" icon={Users} label="Signups · 24 hr" value={fmt(data.traffic.signups_last_24h)} accent="blue" />
        <MetricCard testid="wr-active-users" icon={Activity} label="Active (15 min)" value={fmt(data.traffic.active_users_15m)} accent="green" pulse={data.traffic.active_users_15m > 0} />
      </div>

      {/* PERFORMANCE row */}
      <SectionHeader icon={Activity} label="Performance" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard testid="wr-p50" icon={Clock} label="p50 latency" value={`${fmt(data.performance.p50_response_ms)}ms`} accent="gold" />
        <MetricCard testid="wr-p95" icon={Clock} label="p95 latency" value={`${fmt(data.performance.p95_response_ms)}ms`} accent={data.performance.p95_response_ms > 1500 ? 'red' : 'teal'} />
        <MetricCard testid="wr-p99" icon={Clock} label="p99 latency" value={`${fmt(data.performance.p99_response_ms)}ms`} accent={data.performance.p99_response_ms > 3000 ? 'red' : 'blue'} />
        <MetricCard testid="wr-errors" icon={AlertTriangle} label="Error rate (5xx)" value={`${data.performance.error_rate_pct || 0}%`} accent={data.performance.error_rate_pct > 1 ? 'red' : 'green'} />
      </div>
      <div className="text-[11px] text-[var(--t5)] pl-1">
        Uptime: <span className="font-semibold text-[var(--t4)]">{data.performance.uptime}</span>
        {' · '}
        Total requests: <span className="font-semibold text-[var(--t4)]">{fmt(data.performance.total_requests)}</span>
        {' · '}
        Sample: <span className="font-semibold text-[var(--t4)]">{fmt(data.performance.sample_size)}</span>
      </div>

      {/* Slowest endpoints */}
      {data.performance.slowest_endpoints && data.performance.slowest_endpoints.length > 0 && (
        <Card className="glass-card" data-testid="wr-slowest-card">
          <CardContent className="p-4">
            <h3 className="text-[var(--t)] font-bold text-sm mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--gold)]" />
              Slowest Endpoints (last 100 req)
            </h3>
            <div className="space-y-1.5">
              {data.performance.slowest_endpoints.map((ep, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-[var(--b)]/30 last:border-0">
                  <code className="text-[var(--t4)] truncate max-w-[75%]">{ep.path}</code>
                  <div className="flex items-center gap-3 tabular-nums">
                    <span className="text-[var(--t5)]">{ep.calls}×</span>
                    <span className={`font-bold ${ep.avg_ms > 1500 ? 'text-[#ef4444]' : ep.avg_ms > 800 ? 'text-[#fbbf24]' : 'text-[var(--t)]'}`}>
                      {ep.avg_ms}ms
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* REVENUE row */}
      <SectionHeader icon={DollarSign} label="Revenue" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard testid="wr-checkouts" icon={TrendingUp} label="Checkouts · 1 hr" value={fmt(data.revenue.checkouts_last_1h)} accent="gold" />
        <MetricCard testid="wr-paid" icon={CheckCircle2} label="Completed · 1 hr" value={fmt(data.revenue.paid_last_1h)} accent="green" />
        <MetricCard testid="wr-revenue" icon={DollarSign} label="Revenue · 24 hr" value={`$${fmt(data.revenue.revenue_last_24h_usd)}`} accent="teal" />
        <MetricCard testid="wr-fc" icon={ShieldCheck} label="FC · 24 hr" value={fmt(data.revenue.founders_circle_last_24h)} accent="gold" />
      </div>

      {/* INFRASTRUCTURE row */}
      <SectionHeader icon={Database} label="Infrastructure" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="glass-card" data-testid="wr-db-card">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: data.infrastructure.database === 'connected' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}>
              <Database className={`w-6 h-6 ${data.infrastructure.database === 'connected' ? 'text-[#10b981]' : 'text-[#ef4444]'}`} />
            </div>
            <div className="flex-1">
              <p className="text-[var(--t5)] text-xs uppercase font-bold tracking-wider">Database</p>
              <p className="text-[var(--t)] text-xl font-bold">
                {data.infrastructure.database === 'connected' ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card" data-testid="wr-schedulers-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(var(--gold-rgb), 0.12)' }}>
                <Activity className="w-5 h-5 text-[var(--gold)]" />
              </div>
              <div>
                <p className="text-[var(--t5)] text-xs uppercase font-bold tracking-wider">Scheduler Locks Held</p>
                <p className="text-[var(--t)] text-xl font-bold">{data.infrastructure.scheduler_locks_count}</p>
              </div>
            </div>
            {data.infrastructure.scheduler_locks_held.length > 0 && (
              <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                {data.infrastructure.scheduler_locks_held.map((lock, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b border-[var(--b)]/20 last:border-0">
                    <code className="text-[var(--t4)]">{lock.name}</code>
                    <span className="text-[var(--t5)] truncate ml-2 max-w-[60%]">{lock.holder}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-[var(--t5)] text-center pt-2">
        Generated at {data.generated_at}
      </p>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, accent, pulse, testid }) {
  const colors = {
    gold: '#d4af37',
    teal: '#0d9488',
    blue: '#2563eb',
    green: '#10b981',
    red: '#ef4444',
  };
  const c = colors[accent] || colors.gold;
  return (
    <Card className="glass-card" data-testid={testid}>
      <CardContent className="p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: c, opacity: 0.7 }} />
        <div className="flex items-center justify-between mb-2">
          <Icon className="w-4 h-4" style={{ color: c }} />
          {pulse && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: c }} />}
        </div>
        <p className="text-[var(--t5)] text-[11px] uppercase font-bold tracking-wider mb-1">{label}</p>
        <p className="text-[var(--t)] text-2xl font-bold tabular-nums" style={{ fontFamily: 'var(--sans)' }}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <Icon className="w-4 h-4 text-[var(--gold)]" />
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--t4)]">{label}</span>
      <div className="flex-1 h-[1px] bg-[var(--b)]/50 ml-2" />
    </div>
  );
}

function PulseDot({ status }) {
  const color = status === 'critical' ? '#ef4444' : status === 'warn' ? '#fbbf24' : '#10b981';
  return (
    <span className="relative inline-flex" aria-label={status}>
      <span className="w-2.5 h-2.5 rounded-full animate-ping absolute" style={{ background: color, opacity: 0.6 }} />
      <span className="w-2.5 h-2.5 rounded-full relative" style={{ background: color }} />
    </span>
  );
}

function fmt(n) {
  if (n == null) return '—';
  if (typeof n !== 'number') return n;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export default LaunchWarRoomTab;
