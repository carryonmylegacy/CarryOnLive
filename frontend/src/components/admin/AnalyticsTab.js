import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight, Clock, CreditCard,
  FileKey, Activity, Eye, Mail, Loader2, X
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { BarChart3, PieChart as PieIcon } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CHART_COLORS = ['#d4af37', '#60A5FA', '#22C993', '#B794F6', '#F59E0B', '#ec4899'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1a2035', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px' }}>
      <p style={{ color: '#A0AABF', fontSize: 12, margin: 0 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#d4af37', fontSize: 13, fontWeight: 700, margin: '4px 0 0' }}>
          {p.name}: {typeof p.value === 'number' && p.name?.includes('$') ? `$${p.value.toFixed(2)}` : p.value}
        </p>
      ))}
    </div>
  );
};

export const AnalyticsTab = ({ getAuthHeaders }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [digestPreview, setDigestPreview] = useState(null);

  const headers = getAuthHeaders()?.headers || {};

  useEffect(() => { fetchStats(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/subscription-stats`, { headers });
      setStats(res.data);
    } catch (err) { toast.error('Failed to load analytics'); }
    setLoading(false);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" /></div>;
  if (!stats) return null;

  const kpiCards = [
    { label: 'MRR', value: `$${stats.mrr.toFixed(2)}`, sub: `ARR: $${stats.arr.toFixed(2)}`, icon: DollarSign, color: '#d4af37' },
    { label: 'Trial Conversion', value: `${stats.trial_conversion_pct}%`, sub: `${stats.active_subscriptions} converted`, icon: TrendingUp, color: '#22C993' },
    { label: 'Churn Rate', value: `${stats.churn_rate_pct}%`, sub: `${stats.cancelled_subscriptions} cancelled`, icon: stats.churn_rate_pct > 5 ? ArrowDownRight : ArrowUpRight, color: stats.churn_rate_pct > 5 ? '#ef4444' : '#22C993' },
    { label: 'Active Trials', value: stats.active_trials, sub: `of ${stats.non_admin_users} users`, icon: Clock, color: '#60A5FA' },
    { label: 'Active Subs', value: stats.active_subscriptions, sub: `${stats.free_overrides} free overrides`, icon: CreditCard, color: '#B794F6' },
    { label: 'Pending Reviews', value: stats.pending_verifications, sub: 'verification requests', icon: FileKey, color: '#F59E0B' },
  ];

  const trialPieData = [
    { name: 'Active Trial', value: stats.trial_breakdown.active, color: '#60A5FA' },
    { name: 'Converted', value: stats.trial_breakdown.converted, color: '#22C993' },
    { name: 'Expired (No Sub)', value: stats.trial_breakdown.expired_no_sub, color: '#F59E0B' },
    { name: 'Churned', value: stats.trial_breakdown.churned, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const tierBarData = stats.tier_distribution.filter(t => t.count > 0 || t.price > 0);

  return (
    <div className="space-y-6" data-testid="subscription-analytics">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((kpi, i) => (
          <Card key={i} className="glass-card" data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${kpi.color}15` }}>
                  <kpi.icon className="w-3.5 h-3.5" style={{ color: kpi.color }} />
                </div>
                <span className="text-[10px] text-[var(--t5)] font-bold uppercase tracking-wider">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Cormorant Garamond, serif' }}>{kpi.value}</p>
              <p className="text-[10px] text-[var(--t5)] mt-0.5">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Signup Trend (30 days) */}
        <Card className="glass-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold text-[var(--t)] flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-[var(--gold)]" />
              Signups — Last 30 Days
            </h3>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={stats.signup_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" />
                  <XAxis dataKey="date" tick={{ fill: '#525C72', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#525C72', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="signups" stroke="#d4af37" strokeWidth={2} dot={{ fill: '#d4af37', r: 2.5 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Trial Status Breakdown */}
        <Card className="glass-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold text-[var(--t)] flex items-center gap-2 mb-4">
              <PieIcon className="w-4 h-4 text-[var(--gold)]" />
              Trial Funnel
            </h3>
            {trialPieData.length > 0 ? (
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={trialPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {trialPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-[var(--t5)] text-sm">
                No trial data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tier Distribution */}
        <Card className="glass-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold text-[var(--t)] flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-[var(--gold)]" />
              Tier Distribution
            </h3>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={tierBarData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" />
                  <XAxis dataKey="tier" tick={{ fill: '#525C72', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#525C72', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Subscribers" radius={[6, 6, 0, 0]}>
                    {tierBarData.map((entry, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Tier */}
        <Card className="glass-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold text-[var(--t)] flex items-center gap-2 mb-4">
              <DollarSign className="w-4 h-4 text-[var(--gold)]" />
              Monthly Revenue by Tier
            </h3>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={stats.revenue_by_tier.filter(r => r.revenue > 0 || r.subscribers > 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" />
                  <XAxis dataKey="tier" tick={{ fill: '#525C72', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#525C72', fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" name="$ Revenue" radius={[6, 6, 0, 0]}>
                    {stats.revenue_by_tier.map((entry, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions Row */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={fetchStats} className="text-xs border-[var(--b)] text-[var(--t4)]" data-testid="refresh-analytics">
          <Activity className="w-3 h-3 mr-1" /> Refresh Analytics
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs border-[var(--b)] text-[var(--t4)]"
          data-testid="preview-digest"
          onClick={async () => {
            try {
              const res = await axios.get(`${API_URL}/admin/analytics-digest/preview`, { headers });
              setDigestPreview(res.data.html);
            } catch (err) { toast.error('Failed to load preview'); }
          }}
        >
          <Eye className="w-3 h-3 mr-1" /> Preview Digest
        </Button>
        <Button
          size="sm"
          className="text-xs gold-button"
          disabled={sendingDigest}
          data-testid="send-digest"
          onClick={async () => {
            setSendingDigest(true);
            try {
              const res = await axios.post(`${API_URL}/admin/analytics-digest/send`, {}, { headers });
              toast.success(`Digest sent to ${res.data.sent} admin(s)`);
            } catch (err) { toast.error(err.response?.data?.detail || 'Failed to send digest'); }
            setSendingDigest(false);
          }}
        >
          {sendingDigest ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Mail className="w-3 h-3 mr-1" />}
          Send Digest Now
        </Button>
      </div>

      {/* Digest Preview Modal */}
      {digestPreview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setDigestPreview(null)}>
          <div className="bg-[#1a2035] rounded-xl max-w-2xl w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--b)]">
              <h3 className="font-bold text-[var(--t)] text-sm">Weekly Analytics Digest Preview</h3>
              <button onClick={() => setDigestPreview(null)} className="text-[var(--t5)] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4" dangerouslySetInnerHTML={{ __html: digestPreview }} />
          </div>
        </div>
      )}
    </div>
  );
};
