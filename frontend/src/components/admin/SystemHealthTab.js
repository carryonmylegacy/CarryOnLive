import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import { Activity, Database, Shield, CheckCircle2, Loader2, RefreshCw, Zap, AlertTriangle, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';
import { DbStatusCard } from './DbStatusCard';

const XAICreditsCard = ({ getAuthHeaders }) => {
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSetBalance, setShowSetBalance] = useState(false);
  const [newBalance, setNewBalance] = useState('');

  const fetchCredits = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/admin/xai-credits`, getAuthHeaders());
      setCredits(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchCredits();
    const t = setInterval(fetchCredits, 300000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  const handleSetBalance = async () => {
    const val = parseFloat(newBalance);
    if (isNaN(val) || val < 0) return;
    try {
      await apiClient.post(`${API_URL}/admin/xai-credits/set-balance`, { balance_usd: val }, getAuthHeaders());
      toast.success(`Credit balance set to $${val.toFixed(2)}`);
      setShowSetBalance(false);
      setNewBalance('');
      fetchCredits();
    } catch { toast.error('Failed to set balance'); }
  };

  if (loading) return <Card className="glass-card"><CardContent className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--t4)]" /></CardContent></Card>;
  if (!credits) return null;

  const level = credits.warning_level;
  const borderColor = level === 'critical' ? '#EF4444' : level === 'warning' ? '#F59E0B' : '#22C55E';
  const bgTint = level === 'critical' ? 'rgba(239,68,68,0.06)' : level === 'warning' ? 'rgba(245,158,11,0.06)' : 'rgba(34,197,94,0.06)';

  return (
    <Card className="glass-card" style={{ borderLeft: `3px solid ${borderColor}` }} data-testid="xai-credits-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ color: borderColor }} /> Estate Guardian AI Credits
            {level === 'critical' && <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500"><AlertTriangle className="w-3 h-3" /> LOW</span>}
            {level === 'warning' && <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500"><AlertTriangle className="w-3 h-3" /> Monitor</span>}
          </CardTitle>
          <button onClick={() => setShowSetBalance(!showSetBalance)} className="text-[11px] text-[var(--t4)] hover:text-[var(--t)] transition-colors" data-testid="set-balance-btn">
            {showSetBalance ? 'Cancel' : 'Update Balance'}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {showSetBalance && (
          <div className="flex items-center gap-2 mb-3 p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <span className="text-xs text-[var(--t4)]">$</span>
            <input type="number" value={newBalance} onChange={e => setNewBalance(e.target.value)} placeholder="500.00"
              className="flex-1 bg-transparent text-base text-[var(--t)] outline-none border-b border-[var(--b)] pb-1" data-testid="balance-input" />
            <button onClick={handleSetBalance} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#d4af37] text-[#0b1120]" data-testid="save-balance-btn">Set</button>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-lg" style={{ background: bgTint }}>
            <div className="text-2xl font-bold" style={{ color: borderColor }}>${credits.balance_usd != null ? credits.balance_usd.toFixed(2) : '—'}</div>
            <div className="text-[11px] text-[var(--t5)]">Credits Remaining</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <div className="text-xl font-bold text-[var(--t)]">${credits.month_spent_usd != null ? credits.month_spent_usd.toFixed(2) : '—'}</div>
            <div className="text-[11px] text-[var(--t5)]">Spent This Month</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <div className="text-xl font-bold text-[var(--t)]">{credits.today_calls || 0}</div>
            <div className="text-[11px] text-[var(--t5)]">Calls Today</div>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <div className="text-xl font-bold text-[var(--t)]">{credits.month_calls || 0}</div>
            <div className="text-[11px] text-[var(--t5)]">Calls This Month</div>
          </div>
        </div>
        {credits.daily_breakdown && credits.daily_breakdown.length > 0 && (
          <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--s)' }}>
            <div className="text-[11px] font-bold text-[var(--t4)] mb-2">Last 7 Days</div>
            <div className="flex items-end gap-1 h-12">
              {credits.daily_breakdown.map((d, i) => {
                const maxCost = Math.max(...credits.daily_breakdown.map(x => x.cost), 0.01);
                const height = Math.max(4, (d.cost / maxCost) * 100);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full rounded-t" style={{ height: `${height}%`, background: borderColor, minHeight: '2px' }} title={`${d.date}: $${d.cost.toFixed(4)} (${d.calls} calls)`} />
                    <span className="text-[11px] text-[var(--t5)]">{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {level === 'critical' && (
          <a href="https://console.x.ai" target="_blank" rel="noopener noreferrer"
            className="mt-3 block text-center text-xs font-bold px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors" data-testid="buy-credits-link">
            Buy More Credits →
          </a>
        )}
        {level === 'warning' && (
          <a href="https://console.x.ai" target="_blank" rel="noopener noreferrer"
            className="mt-3 block text-center text-xs font-bold px-4 py-2 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors" data-testid="buy-credits-link">
            Top Up Credits →
          </a>
        )}
        {Array.isArray(credits.top_spenders_today) && credits.top_spenders_today.length > 0 && (
          <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--s)' }} data-testid="top-spenders-block">
            <div className="text-[11px] font-bold text-[var(--t4)] mb-2 flex items-center justify-between">
              <span>Top Users Today (by tokens)</span>
              <span className="text-[var(--t5)]">Daily budget: 500K tokens/user</span>
            </div>
            <div className="space-y-1.5">
              {credits.top_spenders_today.slice(0, 5).map((s, i) => {
                const pct = Math.min(100, Math.round((s.tokens / 500000) * 100));
                const barColor = pct >= 90 ? '#EF4444' : pct >= 60 ? '#F59E0B' : '#22C55E';
                return (
                  <div key={s.user_id || i} className="flex items-center gap-2 text-[12px]" data-testid={`top-spender-row-${i}`}>
                    <span className="flex-1 truncate text-[var(--t)]" title={s.email}>
                      {s.email}
                      {s.ai_unlimited && <span className="ml-1 text-[11px] text-[var(--gold)] font-bold">(UNLIMITED)</span>}
                    </span>
                    <span className="font-mono text-[var(--t4)] tabular-nums" style={{ minWidth: 80 }}>
                      {s.tokens.toLocaleString()}t
                    </span>
                    <span className="font-mono text-[var(--t4)] tabular-nums" style={{ minWidth: 60 }}>
                      ${s.cost_usd.toFixed(3)}
                    </span>
                    {!s.ai_unlimited && (
                      <span className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--b)' }}>
                        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const SystemHealthTab = ({ getAuthHeaders }) => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = async (showRefresh) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await apiClient.get(`${API_URL}/admin/system-health`, getAuthHeaders());
      setHealth(res.data);
    } catch { toast.error('Failed to load system health'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchHealth(false); }, []); // eslint-disable-line
  // Auto-refresh every 60s
  useEffect(() => { const t = setInterval(() => fetchHealth(false), 60000); return () => clearInterval(t); }, []); // eslint-disable-line

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>;
  if (!health) return null;

  const statusColor = health.status === 'healthy' ? '#22C55E' : '#EF4444';

  return (
    <div className="space-y-4" data-testid="system-health-tab">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-[var(--t)]">System Health</h2>
          <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full" style={{ background: `${statusColor}15`, color: statusColor }}>
            <CheckCircle2 className="w-3 h-3" /> {health.status}
          </span>
        </div>
        <button onClick={() => fetchHealth(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[var(--s)] text-[var(--t4)] border border-[var(--b)]" data-testid="refresh-health-btn">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* xAI Credits Monitor */}
      <XAICreditsCard getAuthHeaders={getAuthHeaders} />

      {/* MongoDB cluster status — answers "where is our data, is it
          healthy, and how much do we have?" at a glance. Live to both
          /admin/system-health and /ops/system-health. */}
      <DbStatusCard getAuthHeaders={getAuthHeaders} />

      {/* Status timestamp */}
      <p className="text-[11px] text-[var(--t5)]">Last checked: {new Date(health.timestamp).toLocaleString()}</p>

      {/* Database Stats */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
            <Database className="w-4 h-4 text-[#3B82F6]" /> Database
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(health.database).map(([key, value]) => (
              <div key={key} className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
                <div className="text-xl font-bold text-[var(--t)]">{value.toLocaleString()}</div>
                <div className="text-[11px] text-[var(--t5)] capitalize">{key.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Activity Metrics */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#22C55E]" /> Activity (24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
              <div className="text-xl font-bold text-[#3B82F6]">{health.activity.active_sessions_24h}</div>
              <div className="text-[11px] text-[var(--t5)]">Active Sessions</div>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: health.activity.client_errors_24h > 0 ? 'rgba(239,68,68,0.08)' : 'var(--s)' }}>
              <div className="text-xl font-bold" style={{ color: health.activity.client_errors_24h > 0 ? '#EF4444' : 'var(--t)' }}>{health.activity.client_errors_24h}</div>
              <div className="text-[11px] text-[var(--t5)]">Client Errors</div>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
              <div className="text-xl font-bold text-[var(--t)]">{health.activity.audit_events_today}</div>
              <div className="text-[11px] text-[var(--t5)]">Audit Events Today</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Health */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#F59E0B]" /> Queues
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: health.queues.open_support_tickets > 0 ? 'rgba(245,158,11,0.08)' : 'var(--s)' }}>
              <span className="text-xs font-bold text-[var(--t)]">Open Support Tickets</span>
              <span className="text-sm font-bold" style={{ color: health.queues.open_support_tickets > 0 ? '#F59E0B' : 'var(--t)' }}>{health.queues.open_support_tickets}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications Health — generic across ALL notification types
          (no per-feature trackers). Lights up automatically for any
          new notify.* call site. */}
      {health.notifications && (() => {
        const n = health.notifications;
        const rate = n.delivery_rate_pct;
        const rateColor = rate === null ? 'var(--t)' : rate >= 90 ? '#10B981' : rate >= 70 ? '#F59E0B' : '#EF4444';
        const types = Object.entries(n.by_type || {}).sort((a, b) => (b[1].in_app_count || 0) - (a[1].in_app_count || 0));
        return (
          <Card className="glass-card" data-testid="notifications-health-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-[var(--t)] flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#3B82F6]" /> Notifications &mdash; last {n.window_days}d
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
                  <div className="text-xl font-bold text-[var(--t)]" data-testid="notif-in-app-total">{n.totals.in_app_count}</div>
                  <div className="text-[11px] text-[var(--t5)] uppercase tracking-wider">In-app sent</div>
                </div>
                <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
                  <div className="text-xl font-bold text-[var(--t)]" data-testid="notif-push-attempts">{n.totals.push_attempts}</div>
                  <div className="text-[11px] text-[var(--t5)] uppercase tracking-wider">Push attempts</div>
                </div>
                <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
                  <div className="text-xl font-bold text-[var(--t)]" data-testid="notif-push-with-subs">{n.totals.push_with_subs}</div>
                  <div className="text-[11px] text-[var(--t5)] uppercase tracking-wider">With subs</div>
                </div>
                <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
                  <div className="text-xl font-bold" style={{ color: rateColor }} data-testid="notif-delivery-rate">
                    {rate === null ? '—' : `${rate}%`}
                  </div>
                  <div className="text-[11px] text-[var(--t5)] uppercase tracking-wider">Delivery rate</div>
                </div>
              </div>
              {types.length > 0 ? (
                <div className="space-y-1" data-testid="notif-by-type">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--t5)] mb-1">By type</div>
                  {types.map(([t, agg]) => {
                    const subs = agg.push_with_subs || 0;
                    const delivered = agg.push_delivered || 0;
                    const r = subs > 0 ? Math.round((100 * delivered) / subs) : null;
                    return (
                      <div key={t} className="flex items-center justify-between p-2 rounded text-xs" style={{ background: 'var(--s)', border: '1px solid var(--b)' }} data-testid={`notif-row-${t}`}>
                        <span className="font-bold text-[var(--t)] truncate flex-1">{t}</span>
                        <span className="text-[var(--t5)] mx-2">{agg.in_app_count} in-app</span>
                        <span className="text-[var(--t5)] mx-2">{agg.push_attempts} push</span>
                        <span className="font-bold" style={{ color: r === null ? 'var(--t5)' : r >= 90 ? '#10B981' : r >= 70 ? '#F59E0B' : '#EF4444' }}>
                          {r === null ? '—' : `${r}%`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[var(--t5)] italic">No notifications fired in the last {n.window_days} days.</p>
              )}
              <p className="text-[11px] text-[var(--t5)] italic mt-3">
                Delivery rate = pushes that reached at least one device ÷ pushes to users with ≥1 active subscription. Excludes users who never granted push permission.
              </p>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
};
