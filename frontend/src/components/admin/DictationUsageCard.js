import React, { useEffect, useState } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import apiClient from '../../utils/apiClient';
import { API_URL } from '../../config';
import { Card, CardContent } from '../ui/card';

const usd = (v) => `$${Number(v || 0).toFixed(v >= 1 ? 2 : 4)}`;

// Admin → Finance → Revenue: minutes dictated per day + what the AI Builders cost, from the LLM cost ledger.
export const DictationUsageCard = ({ headers }) => {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    apiClient.get(`${API_URL}/admin/dictation-usage?days=${days}`, { headers })
      .then((r) => alive && setData(r.data))
      .catch(() => alive && setError('Could not load dictation usage.'));
    return () => { alive = false; };
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = data ? [
    { label: 'Minutes dictated', value: data.totals.minutes.toFixed(1), sub: `${data.totals.dictations} dictation${data.totals.dictations === 1 ? '' : 's'}` },
    { label: 'Dictation cost', value: usd(data.totals.cost_usd), sub: `$${data.stt_usd_per_hour.toFixed(2)}/hour · ${data.stt_model}` },
    { label: 'Builder drafts', value: data.builders.reduce((n, b) => n + b.calls, 0), sub: `${data.builders.reduce((n, b) => n + b.errors, 0)} failed` },
    { label: 'Builder cost', value: usd(data.builders_cost_usd), sub: `last ${data.window_days} days` },
  ] : [];

  return (
    <Card className="glass-card" data-testid="dictation-usage-card">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h3 className="text-sm font-bold text-[var(--t)] flex items-center gap-2"><Mic className="w-4 h-4 text-[var(--gold)]" /> Dictation &amp; AI Builders</h3>
          <div className="flex gap-1" data-testid="dictation-usage-window">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} data-testid={`dictation-usage-days-${d}`}
                className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ border: `1px solid ${days === d ? 'var(--gold)' : 'var(--b)'}`, color: days === d ? 'var(--gold)' : 'var(--t4)', background: days === d ? 'rgba(var(--gold-rgb), 0.12)' : 'transparent' }}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-[#ef4444]" data-testid="dictation-usage-error">{error}</p>}
        {!data && !error && <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-[var(--gold)]" /></div>}
        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {kpis.map((k) => (
                <div key={k.label} className="rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--b)' }} data-testid={`dictation-kpi-${k.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  <p className="text-[11px] text-[var(--t5)] font-bold uppercase tracking-wider">{k.label}</p>
                  <p className="text-xl font-bold text-[var(--t)] tabular-nums">{k.value}</p>
                  <p className="text-[11px] text-[var(--t5)]">{k.sub}</p>
                </div>
              ))}
            </div>
            <div style={{ width: '100%', height: 180 }} data-testid="dictation-usage-chart">
              <ResponsiveContainer minWidth={1} minHeight={1}>
                <BarChart data={data.days}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" />
                  <XAxis dataKey="date" tick={{ fill: '#525C72', fontSize: 11 }} interval="preserveStartEnd" tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fill: '#525C72', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v, name) => [name === 'minutes' ? `${v} min` : v, name]} labelStyle={{ color: '#0f172a' }} />
                  <Bar dataKey="minutes" fill="#d4af37" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="w-full text-xs mt-4" data-testid="dictation-builders-table">
              <thead>
                <tr className="text-[11px] text-[var(--t5)] uppercase tracking-wider">
                  <th className="text-left font-bold py-1.5">Builder</th><th className="text-right font-bold">Drafts</th><th className="text-right font-bold">People</th><th className="text-right font-bold">Tokens</th><th className="text-right font-bold">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.builders.map((b) => (
                  <tr key={b.endpoint} className="border-t border-[var(--b)]" data-testid={`dictation-builder-${b.endpoint}`}>
                    <td className="py-1.5 font-bold text-[var(--t)]">{b.label}{b.errors ? <span className="ml-1 text-[#ef4444]">· {b.errors} failed</span> : null}</td>
                    <td className="text-right tabular-nums text-[var(--t)]">{b.calls}</td>
                    <td className="text-right tabular-nums text-[var(--t4)]">{b.users}</td>
                    <td className="text-right tabular-nums text-[var(--t4)]">{b.tokens.toLocaleString()}</td>
                    <td className="text-right tabular-nums text-[var(--t)]">{usd(b.cost_usd)}</td>
                  </tr>
                ))}
                {data.builders.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-[var(--t5)]">No AI Builder drafts in this window.</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DictationUsageCard;
