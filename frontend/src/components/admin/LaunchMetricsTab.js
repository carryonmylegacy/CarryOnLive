import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, UserPlus, ArrowRight, TrendingUp, Clock, CreditCard, Loader2, RefreshCw } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const LaunchMetricsTab = ({ getAuthHeaders }) => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const headers = getAuthHeaders()?.headers || {};

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/admin/launch-metrics`, { headers });
      setMetrics(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMetrics(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  const MetricCard = ({ icon: Icon, color, value, label, sub }) => (
    <div className="glass-card p-4 text-center">
      <Icon className="w-5 h-5 mx-auto mb-2" style={{ color }} />
      <div className="text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>{value}</div>
      <div className="text-xs font-bold text-[var(--t4)] mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-[var(--t5)] mt-1">{sub}</div>}
    </div>
  );

  const RateBar = ({ label, rate, color }) => (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-[var(--t4)]">{label}</span>
        <span className="text-lg font-bold" style={{ color, fontFamily: 'Outfit, sans-serif' }}>{rate}%</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--s)]">
        <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${Math.min(rate, 100)}%`, background: color }} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Launch Metrics</h3>
        <button onClick={fetchMetrics} className="text-[var(--t5)] active:scale-90 transition-transform">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Signups */}
      <div>
        <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">New Benefactor Signups</p>
        <div className="grid grid-cols-4 gap-2">
          <MetricCard icon={UserPlus} color="#22C993" value={metrics.signups.today} label="Today" />
          <MetricCard icon={UserPlus} color="#3B82F6" value={metrics.signups.last_7d} label="7 Days" />
          <MetricCard icon={UserPlus} color="#8B5CF6" value={metrics.signups.last_30d} label="30 Days" />
          <MetricCard icon={Users} color="#d4af37" value={metrics.signups.all_time} label="All Time" />
        </div>
      </div>

      {/* Viral Metrics */}
      <div>
        <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">Viral Growth</p>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard icon={Users} color="#d4af37" value={metrics.avg_beneficiaries_invited} label="Avg Invited / Benefactor" />
          <MetricCard icon={ArrowRight} color="#22C993" 
            value={`${metrics.activation.total_accepted}/${metrics.activation.total_invited}`} 
            label="Activated" 
            sub={`${metrics.activation.rate}% activation rate`} />
        </div>
      </div>

      {/* Rates */}
      <div>
        <p className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2">Conversion & Retention</p>
        <div className="space-y-2">
          <RateBar label="Trial → Paid Conversion" rate={metrics.conversion.rate} color="#22C993" />
          <div className="grid grid-cols-3 gap-2">
            <MetricCard icon={Clock} color="#F59E0B" value={metrics.conversion.trialing} label="In Trial" />
            <MetricCard icon={CreditCard} color="#22C993" value={metrics.conversion.paid} label="Paid" />
            <MetricCard icon={Clock} color="#EF4444" value={metrics.conversion.expired} label="Expired" />
          </div>
          <RateBar label="Day-7 Retention" rate={metrics.retention.day_7} color="#3B82F6" />
          <RateBar label="Day-30 Retention" rate={metrics.retention.day_30} color="#8B5CF6" />
        </div>
      </div>
    </div>
  );
};
