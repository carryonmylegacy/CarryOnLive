import React, { useEffect, useState } from 'react';
import { BellRing, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { API_URL } from '../../config';

const Stat = ({ label, value, testId }) => (
  <div className="rounded-lg px-3 py-2 min-w-[84px]" style={{ background: 'var(--bg)', border: '1px solid var(--b)' }}>
    <div className="text-lg font-bold text-[var(--t)] leading-tight" data-testid={testId}>{value?.toLocaleString?.() ?? value}</div>
    <div className="text-xs text-[var(--t5)]">{label}</div>
  </div>
);

export const SignupAlertMeter = ({ getAuthHeaders }) => {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);

  const headersOf = () => { const h = getAuthHeaders(); return h.headers || h; };

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/signup-alerts`, { headers: headersOf() });
      if (res.ok) setData(await res.json());
    } catch {}
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changeMode = async (mode) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/signup-alerts`, {
        method: 'PUT', headers: { ...headersOf(), 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Save failed');
      const next = await res.json();
      setData(next);
      toast.success(`Signup alerts: ${next.modes[next.mode]}`);
    } catch (e) {
      toast.error(`Could not update signup alerts — ${e.message}`);
    } finally { setSaving(false); }
  };

  if (!data) return null;
  const isDigest = data.mode === 'hourly' || data.mode === 'daily';
  const nextIn = isDigest && data.last_digest_at
    ? Math.max(0, Math.round(((new Date(data.last_digest_at).getTime() + (data.mode === 'hourly' ? 3600e3 : 86400e3)) - Date.now()) / 60000))
    : null;

  return (
    <div data-testid="signup-alert-meter" className="rounded-xl p-5 space-y-4" style={{ background: 'var(--s)', border: '1px solid rgba(var(--gold-rgb), 0.35)' }}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(var(--gold-rgb), 0.12)' }}>
          <BellRing className="w-4.5 h-4.5" style={{ color: '#d4af37' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[var(--t)]">New Signup Alerts</h3>
          <p className="text-xs text-[var(--t5)] mt-0.5">How often you and the admin team get pinged when someone joins. Every signup is still counted — only the pings are metered.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label htmlFor="signup-alert-mode" className="text-xs font-bold text-[var(--t4)] sm:w-24">Ping me</label>
        <div className="relative flex-1">
          <select
            id="signup-alert-mode"
            data-testid="signup-alert-mode-select"
            value={data.mode}
            disabled={saving}
            onChange={(e) => changeMode(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 pr-10 appearance-none font-semibold"
            style={{ background: 'var(--bg)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: '16px' }}
          >
            {Object.entries(data.modes).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#d4af37' }} />
            : <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--t5)' }} />}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Stat label="last hour" value={data.stats.last_hour} testId="signup-stat-last-hour" />
        <Stat label="today" value={data.stats.today} testId="signup-stat-today" />
        <Stat label="members total" value={data.stats.total} testId="signup-stat-total" />
        {data.mode.startsWith('every_') && <Stat label="counter" value={data.counter} testId="signup-stat-counter" />}
      </div>

      <p className="text-xs text-[var(--t5)]" data-testid="signup-alert-mode-hint">
        {data.mode === 'each' && 'Jackpot mode — one ping per signup, as it happens.'}
        {data.mode.startsWith('every_') && `One ping every ${data.mode.split('_')[1]} signups, with the latest name.`}
        {isDigest && `One summary per ${data.mode === 'hourly' ? 'hour' : 'day'}${nextIn !== null ? ` — next in about ${nextIn} min` : ''}. Quiet when nobody joined.`}
        {data.mode === 'off' && 'No signup pings. The counters above keep running.'}
      </p>
    </div>
  );
};
