import React, { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../../utils/apiClient';
import { Loader2, Download, RefreshCw, Smartphone, Monitor, Tablet, Apple } from 'lucide-react';
import { Button } from '../ui/button';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';

const PLATFORM_LABEL = {
  'ios': { label: 'iOS Safari', icon: Apple },
  'ios-pwa': { label: 'iOS PWA', icon: Apple },
  'android': { label: 'Android', icon: Smartphone },
  'android-pwa': { label: 'Android PWA', icon: Smartphone },
  'web': { label: 'Desktop Web', icon: Monitor },
  'capacitor': { label: 'Native (Capacitor)', icon: Tablet },
  'unknown': { label: 'Unknown', icon: Monitor },
};

const ACTION_LABEL = {
  cfp_handoff: 'CFP Hand-off PDF',
  ega_todo: 'EGA To-Do List',
  ega_iac_report: 'EGA IAC Report',
  ega_iac: 'EGA IAC Report',
  ega_transcript: 'EGA Transcript',
  ega_plan: 'EGA Plan of Action',
  beneficiary_iac: 'Beneficiary IAC',
  ect_file: 'Estate Chat File',
  mm_attachment: 'MM Attachment',
  beneficiary_vault_doc: 'Beneficiary Vault Doc',
  audit_csv: 'Audit Trail CSV',
  voices_csv: 'Voices CSV',
  soc2_report: 'SOC 2 Report',
  privacy_data_export: 'Data Export',
};

const OUTCOME_COLOR = {
  saved:       '#22C993',
  downloaded:  '#22C993',
  shared:      '#22C993',
  opened:      '#fbbf24',
  cancelled:   '#7B879E',
  failed:      '#ef4444',
};

const successOutcomes = ['saved', 'downloaded', 'shared'];

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('carryon_token')}` },
});

const DownloadDiagnosticsTab = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (d = days) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_URL}/admin/download-diagnostics?days=${d}`, getAuthHeaders());
      setData(res.data);
    } catch {
      toast.error('Failed to load diagnostics');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(days); }, [days, fetchData]);

  const summary = useMemo(() => {
    if (!data) return null;
    const events = data.totals?.events || 0;
    const byOutcome = data.totals?.by_outcome || {};
    const successCount = successOutcomes.reduce((s, k) => s + (byOutcome[k] || 0), 0);
    const cancelCount = byOutcome.cancelled || 0;
    const failedCount = byOutcome.failed || 0;
    const openedCount = byOutcome.opened || 0;
    return { events, successCount, cancelCount, failedCount, openedCount, successRate: data.success_rate || 0 };
  }, [data]);

  const allPlatforms = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.totals?.by_platform || {}).sort();
  }, [data]);

  return (
    <div className="space-y-5" data-testid="download-diagnostics-tab">
      {/* Header + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'var(--sans)' }}>
            Download Diagnostics
          </h2>
          <p className="text-[var(--t5)] text-sm">
            Per-action × per-platform success / cancel / fail rates. Anonymous beacon — fire-and-forget after every download attempt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              data-testid={`dd-days-${d}`}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: days === d ? 'rgba(var(--gold-rgb), 0.15)' : 'transparent',
                border: `1px solid ${days === d ? 'rgba(var(--gold-rgb), 0.4)' : 'var(--b)'}`,
                color: days === d ? 'var(--gold)' : 'var(--t4)',
              }}
            >
              {d}d
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchData(days)}
            disabled={loading}
            className="hover:bg-[var(--s)] hover:text-current text-[var(--t4)] h-8 w-8 p-0"
            data-testid="dd-refresh"
            title="Refresh"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--gold)]" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="dd-summary-cards">
            <SummaryCard label="Total events" value={summary?.events || 0} />
            <SummaryCard label="Success rate" value={`${summary?.successRate || 0}%`} accent="#22C993" />
            <SummaryCard label="Cancelled" value={summary?.cancelCount || 0} accent="#7B879E" />
            <SummaryCard label="Failed" value={summary?.failedCount || 0} accent={(summary?.failedCount || 0) > 0 ? '#ef4444' : '#7B879E'} />
          </div>

          {(summary?.events || 0) === 0 ? (
            <EmptyState />
          ) : (
            <>
              <PlatformBreakdown totals={data.totals} />

              {/* Per-action grid */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)', background: 'var(--card)' }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--b)' }}>
                  <h3 className="text-white font-semibold text-sm">Per-action breakdown</h3>
                  <p className="text-[var(--t5)] text-xs">Each row shows the outcome distribution for that action across all platforms.</p>
                </div>
                <div className="divide-y" style={{ '--tw-divide-opacity': 1 }}>
                  {data.actions.map((a) => (
                    <ActionRow key={a.action} action={a} allPlatforms={allPlatforms} />
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, accent = 'var(--gold)' }) => (
  <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--b)' }}>
    <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--t5)' }}>{label}</div>
    <div className="text-2xl font-bold" style={{ color: accent }}>{value}</div>
  </div>
);

const EmptyState = () => (
  <div className="rounded-xl p-10 text-center" style={{ background: 'var(--card)', border: '1px solid var(--b)' }}>
    <Download className="w-10 h-10 mx-auto mb-3 text-[var(--t5)]" />
    <p className="text-[var(--t3)] text-sm font-medium">No download events recorded yet for this period.</p>
    <p className="text-[var(--t5)] text-xs mt-1">Telemetry beacons fire after each user-triggered download; come back once real traffic flows in.</p>
  </div>
);

const PlatformBreakdown = ({ totals }) => {
  const byPlatform = totals?.by_platform || {};
  const total = totals?.events || 0;
  const platforms = Object.keys(byPlatform).sort((a, b) => byPlatform[b] - byPlatform[a]);
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--b)' }} data-testid="dd-platform-breakdown">
      <h3 className="text-white font-semibold text-sm mb-3">By platform</h3>
      <div className="flex flex-wrap gap-2">
        {platforms.map((p) => {
          const pct = total ? Math.round((byPlatform[p] / total) * 100) : 0;
          const meta = PLATFORM_LABEL[p] || PLATFORM_LABEL.unknown;
          const Icon = meta.icon;
          return (
            <div
              key={p}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(var(--gold-rgb), 0.06)', border: '1px solid rgba(var(--gold-rgb), 0.15)' }}
              data-testid={`dd-platform-${p}`}
            >
              <Icon className="w-3.5 h-3.5 text-[var(--gold)]" />
              <span className="text-xs text-[var(--t3)]">{meta.label}</span>
              <span className="text-xs font-semibold text-white">{byPlatform[p]}</span>
              <span className="text-[11px] text-[var(--t5)]">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ActionRow = ({ action, allPlatforms }) => {
  const label = ACTION_LABEL[action.action] || action.action;
  const platformsUsed = Object.keys(action.platforms);
  const aggregateOutcomes = useMemo(() => {
    const agg = {};
    platformsUsed.forEach((p) => {
      const outs = action.platforms[p].outcomes;
      Object.keys(outs).forEach((o) => { agg[o] = (agg[o] || 0) + outs[o]; });
    });
    return agg;
  }, [action, platformsUsed]);

  return (
    <div className="px-4 py-3" data-testid={`dd-action-row-${action.action}`}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div>
          <div className="text-sm text-white font-semibold">{label}</div>
          <div className="text-[11px] text-[var(--t5)] font-mono">{action.action}</div>
        </div>
        <div className="text-xs text-[var(--t4)]">{action.total} events</div>
      </div>

      <OutcomeBar outcomes={aggregateOutcomes} />

      {/* Per-platform mini-rows for actions with mixed platform usage */}
      {platformsUsed.length > 1 && (
        <div className="mt-3 pl-3 border-l space-y-1.5" style={{ borderColor: 'var(--b)' }}>
          {platformsUsed
            .sort((a, b) => action.platforms[b].total - action.platforms[a].total)
            .map((p) => {
              const meta = PLATFORM_LABEL[p] || PLATFORM_LABEL.unknown;
              const ent = action.platforms[p];
              return (
                <div key={p} className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider w-28 flex-shrink-0" style={{ color: 'var(--t5)' }}>
                    {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <OutcomeBar outcomes={ent.outcomes} compact />
                  </div>
                  <span className="text-[11px] text-[var(--t4)] w-10 text-right">{ent.total}</span>
                </div>
              );
            })}
        </div>
      )}

      {/* Hint about platforms with no events */}
      {allPlatforms.length > platformsUsed.length && (
        <div className="mt-2 text-[11px] text-[var(--t5)]">
          No events from: {allPlatforms.filter((p) => !platformsUsed.includes(p)).map((p) => (PLATFORM_LABEL[p] || PLATFORM_LABEL.unknown).label).join(', ')}
        </div>
      )}
    </div>
  );
};

const OutcomeBar = ({ outcomes, compact }) => {
  const total = Object.values(outcomes).reduce((s, n) => s + n, 0);
  if (total === 0) return null;
  const order = ['saved', 'downloaded', 'shared', 'opened', 'cancelled', 'failed'];
  const segments = order.filter((o) => outcomes[o]).map((o) => ({ outcome: o, count: outcomes[o], pct: (outcomes[o] / total) * 100 }));
  const h = compact ? 6 : 8;
  return (
    <div>
      <div className="flex w-full rounded-full overflow-hidden" style={{ height: h, background: 'rgba(255,255,255,0.05)' }}>
        {segments.map((s) => (
          <div
            key={s.outcome}
            title={`${s.outcome}: ${s.count} (${s.pct.toFixed(0)}%)`}
            style={{ width: `${s.pct}%`, background: OUTCOME_COLOR[s.outcome] || '#7B879E' }}
          />
        ))}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {segments.map((s) => (
            <div key={s.outcome} className="flex items-center gap-1 text-[11px]">
              <span className="w-2 h-2 rounded-full" style={{ background: OUTCOME_COLOR[s.outcome] || '#7B879E' }} />
              <span style={{ color: 'var(--t4)' }}>{s.outcome}</span>
              <span className="text-white font-medium">{s.count}</span>
              <span style={{ color: 'var(--t5)' }}>({s.pct.toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export { DownloadDiagnosticsTab };
export default DownloadDiagnosticsTab;
