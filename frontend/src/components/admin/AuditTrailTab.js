import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Shield, Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SEVERITY_STYLE = {
  info: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', color: '#60A5FA' },
  warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', color: '#F59E0B' },
  critical: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', color: '#EF4444' },
};

export const AuditTrailTab = ({ getAuthHeaders }) => {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const limit = 50;

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit, offset });
      if (categoryFilter) params.set('category', categoryFilter);
      if (severityFilter) params.set('severity', severityFilter);
      const res = await axios.get(`${API_URL}/founder/audit-trail?${params}`, getAuthHeaders());
      setEntries(res.data.entries);
      setTotal(res.data.total);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEntries(); }, [offset, categoryFilter, severityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = searchQuery
    ? entries.filter(e => e.actor_email?.includes(searchQuery) || e.action?.includes(searchQuery) || e.resource_type?.includes(searchQuery))
    : entries;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-[var(--t)] uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--gold)]" /> SOC 2 Audit Trail
        </h3>
        <span className="text-xs text-[var(--t5)]">{total} events logged</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t5)]" />
          <Input placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 bg-[var(--s)] border-[var(--b)] text-[var(--t)] h-9 text-xs" />
        </div>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setOffset(0); }}
          className="h-9 px-3 rounded-lg text-xs bg-[var(--s)] border border-[var(--b)] text-[var(--t)]">
          <option value="">All categories</option>
          <option value="auth">Auth</option>
          <option value="tvt">TVT</option>
          <option value="dts">DTS</option>
          <option value="support">Support</option>
          <option value="user_mgmt">User Mgmt</option>
          <option value="system">System</option>
        </select>
        <select value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setOffset(0); }}
          className="h-9 px-3 rounded-lg text-xs bg-[var(--s)] border border-[var(--b)] text-[var(--t)]">
          <option value="">All severity</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" /></div>
      ) : filtered.length === 0 ? (
        <Card className="glass-card"><CardContent className="p-6 text-center text-[var(--t4)] text-sm">No audit events found</CardContent></Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((e, i) => {
            const style = SEVERITY_STYLE[e.severity] || SEVERITY_STYLE.info;
            return (
              <div key={i} className="rounded-lg p-3 text-xs" style={{ background: style.bg, border: `1px solid ${style.border}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[var(--t)]">{e.action}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: style.border, color: style.color }}>{e.severity}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--s)] text-[var(--t5)]">{e.category}</span>
                    </div>
                    <div className="mt-1 text-[var(--t4)]">
                      {e.actor_email && <span>by <strong className="text-[var(--t3)]">{e.actor_email}</strong></span>}
                      {e.resource_type && <span> on {e.resource_type}{e.resource_id ? `:${e.resource_id.slice(0, 8)}` : ''}</span>}
                      {e.ip_address && <span> from {e.ip_address}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--t5)] flex-shrink-0 whitespace-nowrap">
                    {new Date(e.timestamp).toLocaleString()}
                  </span>
                </div>
                {e.integrity_hash && (
                  <div className="mt-1 text-[9px] text-[var(--t5)] font-mono truncate" title={`Integrity: ${e.integrity_hash}`}>
                    SHA-256: {e.integrity_hash.slice(0, 16)}...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="text-xs border-[var(--b)] text-[var(--t)]">
            <ChevronLeft className="w-3 h-3 mr-1" /> Previous
          </Button>
          <span className="text-xs text-[var(--t5)]">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
          <Button size="sm" variant="outline" disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="text-xs border-[var(--b)] text-[var(--t)]">
            Next <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
};
