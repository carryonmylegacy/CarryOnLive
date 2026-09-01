/**
 * AIAlertingCard — founder-portal surface for the daily xAI alerting job
 * (Admin → Platform → Integrations). Edits the three alert thresholds
 * (daily spend $, model-substitution share %, AI-fallback count) and runs
 * all four checks on demand, bypassing the per-day email dedup so alerting
 * can be verified end-to-end from production.
 *
 * Alerts email founder@carryon.us and contain model names, counts, and
 * dollar figures only — never user content.
 */
import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { BellRing, Loader2, PlayCircle, CheckCircle2, AlertTriangle, Save } from 'lucide-react';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';

const authHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('carryon_token')}` },
});

const FIELDS = [
  { key: 'xai_spend_alert_usd', label: 'Daily spend threshold ($)', step: '0.5', min: '0.5' },
  { key: 'xai_substitution_alert_pct', label: 'Model substitution share (%)', step: '1', min: '1' },
  { key: 'ai_fallback_alert_count', label: 'Fallback events per day', step: '1', min: '1' },
];

export const AIAlertingCard = () => {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiClient.get(`${API_URL}/admin/xai-alerting/config`, authHeaders());
        setConfig(r.data);
        setDraft(r.data);
      } catch {
        setConfig({ error: true });
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body = {};
      FIELDS.forEach(({ key }) => { body[key] = draft[key]; });
      const r = await apiClient.put(`${API_URL}/admin/xai-alerting/config`, body, authHeaders());
      setConfig(r.data);
      setDraft(r.data);
      toast.success('Alert thresholds saved');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save thresholds');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await apiClient.post(`${API_URL}/admin/xai-alerting/run-now`, {}, authHeaders());
      setResult(r.data);
      const tripped = r.data.checks.filter((c) => c.status === 'alert').length;
      if (tripped > 0) toast.success(`${tripped} check(s) tripped — alert emailed to ${r.data.recipient}`);
      else toast.success('All four checks passed — no alert needed');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Check run failed');
    } finally {
      setRunning(false);
    }
  };

  if (!config) {
    return (
      <div className="rounded-xl p-6 flex items-center gap-3" style={{ background: 'var(--card)', border: '1px solid var(--b)' }} data-testid="ai-alerting-loading">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--gold)' }} />
        <span className="text-sm" style={{ color: 'var(--t3)' }}>Loading AI alerting…</span>
      </div>
    );
  }
  if (config.error) return null;

  const dirty = FIELDS.some(({ key }) => String(draft[key]) !== String(config[key]));

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--b)' }} data-testid="ai-alerting-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <BellRing className="w-4 h-4" style={{ color: 'var(--gold)' }} />
          <h3 className="text-sm font-bold" style={{ color: 'var(--t)' }}>AI Alerting</h3>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          style={{ background: 'rgba(var(--gold-rgb), 0.1)', color: 'var(--gold)' }}
          data-testid="ai-alerting-run-now"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
          {running ? 'Running…' : 'Run checks now'}
        </button>
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--t5)' }}>
        Daily checks: key health, spend, silent model substitution, and AI fallback rate. Tripped
        checks email <strong style={{ color: 'var(--t3)' }}>{config.recipient}</strong> — model
        names, counts, and dollar figures only, never user content.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {FIELDS.map(({ key, label, step, min }) => (
          <div key={key}>
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--t5)' }}>{label}</label>
            <input
              type="number"
              step={step}
              min={min}
              value={draft[key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--s)', border: '1px solid var(--b)', color: 'var(--t)' }}
              data-testid={`ai-alert-input-${key}`}
            />
          </div>
        ))}
      </div>
      {dirty && (
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 mb-3"
          style={{ background: 'var(--gold)', color: '#0F1629' }}
          data-testid="ai-alerting-save"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {saving ? 'Saving…' : 'Save thresholds'}
        </button>
      )}

      {result && (
        <div className="mt-1" data-testid="ai-alerting-results">
          {result.checks.map((c) => {
            const ok = c.status === 'ok';
            const Icon = ok ? CheckCircle2 : AlertTriangle;
            const color = ok ? '#10b981' : '#f59e0b';
            return (
              <div key={c.check} className="flex items-start gap-3 py-2.5" style={{ borderTop: '1px solid var(--b)' }} data-testid={`ai-alerting-result-${c.check}`}>
                <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold" style={{ color: 'var(--t)' }}>{c.label}</span>
                    <span className="text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: `${color}1a`, color, border: `1px solid ${color}33` }}>
                      {ok ? 'OK' : 'ALERT'}
                    </span>
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: 'var(--t3)' }}>{c.summary}</div>
                </div>
              </div>
            );
          })}
          <div className="text-[11px] mt-2" style={{ color: 'var(--t5)' }}>
            Ran {new Date(result.ran_at).toLocaleString()} — {result.alerts_sent > 0 ? `alert email sent to ${result.recipient}` : 'no alert email needed'}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIAlertingCard;
