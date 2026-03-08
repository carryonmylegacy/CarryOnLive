import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, Database, Shield, Users, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const SystemHealthTab = ({ getAuthHeaders }) => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = async (showRefresh) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await axios.get(`${API_URL}/admin/system-health`, getAuthHeaders());
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

      {/* Status timestamp */}
      <p className="text-[10px] text-[var(--t5)]">Last checked: {new Date(health.timestamp).toLocaleString()}</p>

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
                <div className="text-[10px] text-[var(--t5)] capitalize">{key.replace(/_/g, ' ')}</div>
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
              <div className="text-[10px] text-[var(--t5)]">Active Sessions</div>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: health.activity.client_errors_24h > 0 ? 'rgba(239,68,68,0.08)' : 'var(--s)' }}>
              <div className="text-xl font-bold" style={{ color: health.activity.client_errors_24h > 0 ? '#EF4444' : 'var(--t)' }}>{health.activity.client_errors_24h}</div>
              <div className="text-[10px] text-[var(--t5)]">Client Errors</div>
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: 'var(--s)' }}>
              <div className="text-xl font-bold text-[var(--t)]">{health.activity.audit_events_today}</div>
              <div className="text-[10px] text-[var(--t5)]">Audit Events Today</div>
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
    </div>
  );
};
