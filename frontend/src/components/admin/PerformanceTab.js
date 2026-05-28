import React, { useState, useEffect } from 'react';
import apiClient from '../../utils/apiClient';
import { BarChart3, Loader2, TrendingUp, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { toast } from '../../utils/toast';
import { API_URL } from '../../config';

export const PerformanceTab = ({ getAuthHeaders, operatorId = '' }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const headers = getAuthHeaders()?.headers || {};

  const fetch_ = async () => {
    setLoading(true);
    try {
      const url = operatorId
        ? `${API_URL}/ops/performance?operator_id=${operatorId}&days=${days}`
        : `${API_URL}/ops/performance?days=${days}`;
      const res = await apiClient.get(url, { headers });
      setData(res.data);
    } catch { toast.error('Failed to load performance data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch_(); }, [days]); // eslint-disable-line

  if (loading) return <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--t4)]" /></div>;
  if (!data) return null;

  const stats = [
    { label: 'Total Actions', value: data.total_actions, icon: TrendingUp, color: '#3B82F6' },
    { label: 'Actions Today', value: data.actions_today, icon: BarChart3, color: '#22C993' },
    { label: 'Tasks Resolved', value: data.tasks_resolved, icon: CheckCircle, color: '#22C993' },
    { label: 'Tasks Active', value: data.tasks_active, icon: Clock, color: '#F59E0B' },
    { label: 'SLA Breaches', value: data.sla_breaches, icon: AlertTriangle, color: data.sla_breaches > 0 ? '#ef4444' : '#64748B' },
    { label: 'Avg/Day', value: data.avg_actions_per_day, icon: TrendingUp, color: '#B794F6' },
  ];

  return (
    <div className="space-y-4" data-testid="performance-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-[var(--t)]">
            {data.operator_name ? `${data.operator_name}'s Performance` : 'My Performance'}
          </h2>
          <p className="text-xs text-[var(--t5)]">{data.operator_role || 'Operator'} &middot; Last {days} days</p>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="px-3 py-2 rounded-lg bg-[var(--bg2)] border border-[var(--b)] text-[var(--t)] text-xs">
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map(s => (
          <Card key={s.label} className="glass-card">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="w-3.5 h-3.5" style={{ color: s.color }} />
                <span className="text-[11px] text-[var(--t5)]">{s.label}</span>
              </div>
              <p className="text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {Object.keys(data.actions_by_category || {}).length > 0 && (
        <Card className="glass-card">
          <CardContent className="p-4">
            <h3 className="text-sm font-bold text-[var(--t)] mb-3">Actions by Category</h3>
            <div className="space-y-2">
              {Object.entries(data.actions_by_category).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
                const max = Math.max(...Object.values(data.actions_by_category));
                const pct = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-[var(--t3)] capitalize">{cat.replace(/_/g, ' ')}</span>
                      <span className="text-[var(--t5)] font-bold">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--s)]">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'var(--gold)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
