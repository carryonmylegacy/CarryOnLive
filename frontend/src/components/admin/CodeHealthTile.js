import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Activity, Database, Zap, Shield, Clock, AlertTriangle,
  CheckCircle2, RefreshCw, Loader2, TrendingUp
} from 'lucide-react';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const CodeHealthTile = ({ getAuthHeaders }) => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = async (showRefresh) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await axios.get(`${API_URL}/admin/code-health`, getAuthHeaders());
      setHealth(res.data);
    } catch {
      if (showRefresh) toast.error('Failed to load code health');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchHealth(false); }, []); // eslint-disable-line

  if (loading) return (
    <div className="glass-card p-4 animate-pulse">
      <div className="h-4 bg-[var(--s)] rounded w-1/3 mb-3" />
      <div className="h-20 bg-[var(--s)] rounded" />
    </div>
  );

  if (!health) return null;

  const gradeGlow = `0 0 20px ${health.grade_color}20, 0 0 40px ${health.grade_color}08`;

  return (
    <div className="glass-card overflow-hidden" data-testid="code-health-tile">
      {/* Header */}
      <div
        className="p-4 cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black"
            style={{
              background: `${health.grade_color}15`,
              border: `2px solid ${health.grade_color}40`,
              color: health.grade_color,
              boxShadow: gradeGlow,
            }}
          >
            {health.grade}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--t)]">Code Health</h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${health.grade_color}15`, color: health.grade_color }}>
                {health.score}/100
              </span>
            </div>
            <p className="text-[10px] text-[var(--t5)]">
              {health.api.uptime_formatted} uptime · {health.api.total_requests.toLocaleString()} requests tracked
            </p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); fetchHealth(true); }}
          disabled={refreshing}
          className="p-1.5 rounded-lg hover:bg-[var(--s)] transition-colors"
          data-testid="refresh-code-health"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[var(--t5)] ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Quick Stats Row */}
      <div className="px-4 pb-3 grid grid-cols-4 gap-2">
        <div className="text-center p-2 rounded-lg" style={{ background: 'var(--s)' }}>
          <Zap className="w-3.5 h-3.5 mx-auto mb-0.5 text-[#22C993]" />
          <div className="text-sm font-bold text-[var(--t)]">{health.api.avg_response_ms}ms</div>
          <div className="text-[9px] text-[var(--t5)]">Avg Response</div>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: health.api.error_5xx > 0 ? 'rgba(239,68,68,0.06)' : 'var(--s)' }}>
          <Shield className="w-3.5 h-3.5 mx-auto mb-0.5" style={{ color: health.api.error_rate_pct > 1 ? '#EF4444' : '#22C993' }} />
          <div className="text-sm font-bold" style={{ color: health.api.error_rate_pct > 1 ? '#EF4444' : 'var(--t)' }}>
            {health.api.error_rate_pct}%
          </div>
          <div className="text-[9px] text-[var(--t5)]">Error Rate</div>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: 'var(--s)' }}>
          <Database className="w-3.5 h-3.5 mx-auto mb-0.5 text-[#3B82F6]" />
          <div className="text-sm font-bold text-[var(--t)]">
            <CheckCircle2 className="w-3 h-3 inline text-[#22C993]" />
          </div>
          <div className="text-[9px] text-[var(--t5)]">{health.database.status === 'connected' ? 'DB Online' : 'DB Error'}</div>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ background: 'var(--s)' }}>
          <Activity className="w-3.5 h-3.5 mx-auto mb-0.5 text-[#8B5CF6]" />
          <div className="text-sm font-bold text-[var(--t)]">{health.last_test_pass_rate}</div>
          <div className="text-[9px] text-[var(--t5)]">Tests Pass</div>
        </div>
      </div>

      {/* Expandable Details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--b)] pt-3 animate-fade-in">
          {/* Performance Details */}
          <div>
            <h4 className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" /> API Performance
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-lg text-center" style={{ background: 'var(--s)' }}>
                <div className="text-sm font-bold text-[var(--t)]">{health.api.avg_response_ms}ms</div>
                <div className="text-[9px] text-[var(--t5)]">Average</div>
              </div>
              <div className="p-2 rounded-lg text-center" style={{ background: 'var(--s)' }}>
                <div className="text-sm font-bold text-[#F59E0B]">{health.api.p95_response_ms}ms</div>
                <div className="text-[9px] text-[var(--t5)]">P95</div>
              </div>
              <div className="p-2 rounded-lg text-center" style={{ background: 'var(--s)' }}>
                <div className="text-sm font-bold text-[#EF4444]">{health.api.p99_response_ms}ms</div>
                <div className="text-[9px] text-[var(--t5)]">P99</div>
              </div>
            </div>
          </div>

          {/* Error Breakdown */}
          <div>
            <h4 className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> Errors
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg flex items-center justify-between" style={{ background: health.api.error_4xx > 0 ? 'rgba(245,158,11,0.06)' : 'var(--s)' }}>
                <span className="text-[10px] text-[var(--t5)]">4xx Client</span>
                <span className="text-xs font-bold" style={{ color: health.api.error_4xx > 0 ? '#F59E0B' : 'var(--t)' }}>{health.api.error_4xx}</span>
              </div>
              <div className="p-2 rounded-lg flex items-center justify-between" style={{ background: health.api.error_5xx > 0 ? 'rgba(239,68,68,0.06)' : 'var(--s)' }}>
                <span className="text-[10px] text-[var(--t5)]">5xx Server</span>
                <span className="text-xs font-bold" style={{ color: health.api.error_5xx > 0 ? '#EF4444' : 'var(--t)' }}>{health.api.error_5xx}</span>
              </div>
            </div>
          </div>

          {/* Slowest Endpoints */}
          {health.api.slowest_endpoints?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Slowest Endpoints
              </h4>
              <div className="space-y-1">
                {health.api.slowest_endpoints.map((ep, i) => (
                  <div key={i} className="flex items-center justify-between p-1.5 rounded text-[10px]" style={{ background: 'var(--s)' }}>
                    <span className="text-[var(--t4)] truncate flex-1 mr-2 font-mono">{ep.path}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[var(--t5)]">{ep.calls} calls</span>
                      <span className="font-bold" style={{ color: ep.avg_ms > 500 ? '#EF4444' : ep.avg_ms > 200 ? '#F59E0B' : '#22C993' }}>
                        {ep.avg_ms}ms
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Database */}
          <div>
            <h4 className="text-[10px] font-bold text-[var(--t5)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Database className="w-3 h-3" /> Database
            </h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-lg text-center" style={{ background: 'var(--s)' }}>
                <div className="text-sm font-bold text-[var(--t)]">{health.database.collections}</div>
                <div className="text-[9px] text-[var(--t5)]">Collections</div>
              </div>
              <div className="p-2 rounded-lg text-center" style={{ background: 'var(--s)' }}>
                <div className="text-sm font-bold text-[var(--t)]">{health.database.data_size_mb}MB</div>
                <div className="text-[9px] text-[var(--t5)]">Data Size</div>
              </div>
              <div className="p-2 rounded-lg text-center" style={{ background: 'var(--s)' }}>
                <div className="text-sm font-bold text-[var(--t)]">{health.database.indexes}</div>
                <div className="text-[9px] text-[var(--t5)]">Indexes</div>
              </div>
            </div>
          </div>

          {/* Code Quality */}
          <div className="p-2.5 rounded-lg flex items-center justify-between" style={{ background: 'var(--s)' }}>
            <span className="text-[10px] text-[var(--t5)]">ESLint Warnings</span>
            <span className="text-xs font-bold text-[#F59E0B]">{health.eslint_warnings}</span>
          </div>

          {/* Uptime */}
          <div className="text-[9px] text-[var(--t5)] text-center pt-1">
            Server started: {new Date(health.api.started_at).toLocaleString()} · Sample: {health.api.sample_size} requests
          </div>
        </div>
      )}
    </div>
  );
};
