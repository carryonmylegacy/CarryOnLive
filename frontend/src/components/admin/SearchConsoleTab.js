import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, ExternalLink, RefreshCw, Search, XCircle } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from '../../utils/toast';

/* Marketing → Search Console: Google's own verdict for every public page, plus 28-day clicks/impressions.
   Read-only; auto-refreshes when the snapshot is older than 24 h. Until GSC_* env vars exist on the API,
   the card shows the exact setup steps instead. */

const verdictOf = (p) => {
  if (p.error) return { tone: 'muted', label: `Couldn’t check (${p.error})`, Icon: CircleDashed };
  if (p.verdict === 'PASS') return { tone: 'ok', label: p.coverage_state || 'Indexed', Icon: CheckCircle2 };
  if (p.verdict === 'NEUTRAL') return { tone: 'warn', label: p.coverage_state || 'Not indexed', Icon: CircleDashed };
  if (p.verdict === 'FAIL') return { tone: 'bad', label: p.coverage_state || 'Blocked', Icon: XCircle };
  return { tone: 'muted', label: p.coverage_state || 'Google has never seen this URL', Icon: CircleDashed };
};
const TONE = { ok: '#34d399', warn: '#fbbf24', bad: '#f87171', muted: 'rgba(255,255,255,0.4)' };
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export const SearchConsoleTab = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const r = await apiClient.post(`${API_URL}/admin/seo/index-status/refresh`, {}, getAuthHeaders());
      setData(r.data); toast.success('Search Console refreshed');
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Refresh failed';
      setError(msg); toast.error(msg);
    } finally { setBusy(false); }
  }, [getAuthHeaders]);

  useEffect(() => {
    apiClient.get(`${API_URL}/admin/seo/index-status`, getAuthHeaders()).then(r => {
      setData(r.data);
      if (r.data.configured && (!r.data.refreshed_at || r.data.stale)) refresh();
    }).catch(() => setError('Could not load Search Console status'));
  }, [getAuthHeaders, refresh]);

  if (!data) return <div className="text-white/50 text-sm p-6" data-testid="search-console-loading">Loading…</div>;

  if (!data.configured) {
    return (
      <Card className="bg-white/[0.03] border-white/10" data-testid="search-console-setup">
        <CardContent className="p-6">
          <h3 className="text-white font-bold flex items-center gap-2 mb-2"><Search size={16} style={{ color: '#d4af37' }} /> Search Console — not connected yet</h3>
          <p className="text-sm text-white/60 mb-4">Five steps, done once. Nothing on the public site changes; this only lets the portal read Google’s index report.</p>
          <ol className="space-y-2 text-sm text-white/80 list-decimal pl-5" data-testid="search-console-steps">
            {data.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </CardContent>
      </Card>
    );
  }

  const pages = data.pages || [];
  const indexed = pages.filter(p => p.verdict === 'PASS').length;
  return (
    <div className="space-y-4" data-testid="search-console-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-bold flex items-center gap-2"><Search size={16} style={{ color: '#d4af37' }} /> Google index — {indexed} of {pages.length} public pages indexed</h3>
          <p className="text-xs text-white/45 mt-1">
            Property <span className="font-mono">{data.site_url}</span> · Google’s data as of {fmtDate(data.refreshed_at)}
            {data.window ? ` · clicks/impressions ${fmtDate(data.window.start)} – ${fmtDate(data.window.end)}` : ''} · Google lags 1–3 days behind reality.
          </p>
        </div>
        <Button onClick={refresh} disabled={busy} size="sm" className="gap-2" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="search-console-refresh">
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Asking Google…' : 'Refresh now'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-300" data-testid="search-console-error">{error}</p>}
      <Card className="bg-white/[0.03] border-white/10">
        <CardContent className="p-0">
          <table className="w-full text-sm" data-testid="search-console-table">
            <thead>
              <tr className="text-left text-xs text-white/45 border-b border-white/10">
                <th className="px-4 py-3 font-medium">Page</th>
                <th className="px-4 py-3 font-medium">Google says</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Last crawl</th>
                <th className="px-4 py-3 font-medium text-right">Clicks</th>
                <th className="px-4 py-3 font-medium text-right">Impressions</th>
                <th className="px-4 py-3 font-medium text-right">Avg. pos.</th>
              </tr>
            </thead>
            <tbody>
              {pages.map(p => {
                const v = verdictOf(p);
                return (
                  <tr key={p.path} className="border-b border-white/5" data-testid={`search-console-row-${p.path.replace(/\W+/g, '-') || 'home'}`}>
                    <td className="px-4 py-2.5 font-mono text-white/85">
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#d4af37] inline-flex items-center gap-1">{p.path} <ExternalLink size={11} className="opacity-40" /></a>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5" style={{ color: TONE[v.tone] }}><v.Icon size={14} /> {v.label}</span>
                      {p.inspection_link && <a href={p.inspection_link} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-white/40 hover:text-[#d4af37]">details</a>}
                    </td>
                    <td className="px-4 py-2.5 text-white/60 whitespace-nowrap">{fmtDate(p.last_crawl)}</td>
                    <td className="px-4 py-2.5 text-right text-white/85">{p.clicks}</td>
                    <td className="px-4 py-2.5 text-right text-white/85">{p.impressions}</td>
                    <td className="px-4 py-2.5 text-right text-white/60">{p.position ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SearchConsoleTab;
