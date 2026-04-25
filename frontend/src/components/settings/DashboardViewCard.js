import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Layout, Gauge as GaugeIcon } from 'lucide-react';
import { useDashboardPrefs } from '../../hooks/useDashboardPrefs';
import { ReadinessDial } from '../dashboard/ReadinessDial';

/**
 * DashboardViewCard — Settings → Appearance tile that controls the
 * desktop dashboard's main-surface layout AND the readiness gauge
 * graphic used on every form factor.
 *
 * Both options persist to localStorage via `useDashboardPrefs` and
 * dispatch a CustomEvent so the Dashboard re-renders live (no reload
 * required).
 *
 * Mobile/PWA users still get the layout default — the layout picker
 * is desktop-only because the side-by-side modes don't fit a phone-
 * narrow viewport. The gauge picker DOES apply on mobile.
 */
const LAYOUT_CHOICES = [
  {
    value: 'tiles-left',
    title: 'Tiles Left, Readiness Right',
    sub: 'Default — gauge sticky on the right.',
    diagram: (
      <div className="flex gap-1.5 w-full">
        <div className="flex-1 grid grid-cols-2 gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="h-3 rounded" style={{ background: 'rgba(212,175,55,0.35)' }} />
          ))}
        </div>
        <div className="w-10 rounded" style={{ background: 'rgba(212,175,55,0.65)' }} />
      </div>
    ),
  },
  {
    value: 'tiles-right',
    title: 'Tiles Right, Readiness Left',
    sub: 'Mirror — gauge sticky on the left.',
    diagram: (
      <div className="flex gap-1.5 w-full">
        <div className="w-10 rounded" style={{ background: 'rgba(212,175,55,0.65)' }} />
        <div className="flex-1 grid grid-cols-2 gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="h-3 rounded" style={{ background: 'rgba(212,175,55,0.35)' }} />
          ))}
        </div>
      </div>
    ),
  },
  {
    value: 'readiness-top',
    title: 'Readiness Top, Tiles Below',
    sub: 'Single column — gauge above a row of 6 chiclets.',
    diagram: (
      <div className="flex flex-col gap-1.5 w-full">
        <div className="h-7 rounded w-full" style={{ background: 'rgba(212,175,55,0.65)' }} />
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="h-3 rounded" style={{ background: 'rgba(212,175,55,0.35)' }} />
          ))}
        </div>
      </div>
    ),
  },
];

const GAUGE_CHOICES = [
  { value: 'speedometer', title: 'Speedometer', sub: 'Colored arc + needle.' },
  { value: 'circle', title: 'Circle', sub: 'Slim gold-arc with serif score.' },
];

const ChoiceTile = ({ active, onClick, title, sub, children, testId }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testId}
    className="text-left rounded-2xl p-4 transition-all"
    style={{
      background: active ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${active ? 'var(--gold)' : 'rgba(255,255,255,0.08)'}`,
      cursor: 'pointer',
    }}
  >
    <div className="mb-3">{children}</div>
    <div className="text-[var(--t)] text-sm font-bold">{title}</div>
    <div className="text-[var(--t4)] text-xs mt-1 leading-snug">{sub}</div>
  </button>
);

export default function DashboardViewCard() {
  const { layout, gauge, setLayout, setGauge } = useDashboardPrefs();

  return (
    <Card className="glass-card" data-testid="settings-dashboard-view-card">
      <CardContent className="pt-5 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layout className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            <h3 className="text-[var(--t)] font-bold">Dashboard View</h3>
          </div>
          <p className="text-[var(--t4)] text-xs leading-snug">
            Customize how the dashboard arranges your readiness gauge and the six
            feature tiles on desktop. Mobile keeps its compact vertical layout.
          </p>
        </div>

        {/* Layout picker — desktop layout only. */}
        <div>
          <div className="text-[var(--t4)] text-[11px] font-bold uppercase tracking-wider mb-2">
            Desktop layout
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {LAYOUT_CHOICES.map((c) => (
              <ChoiceTile
                key={c.value}
                active={layout === c.value}
                onClick={() => setLayout(c.value)}
                title={c.title}
                sub={c.sub}
                testId={`dashboard-view-layout-${c.value}`}
              >
                {c.diagram}
              </ChoiceTile>
            ))}
          </div>
        </div>

        {/* Gauge graphic picker — applies on desktop AND mobile. */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <GaugeIcon className="w-3.5 h-3.5" style={{ color: 'var(--t4)' }} />
            <span className="text-[var(--t4)] text-[11px] font-bold uppercase tracking-wider">
              Readiness gauge (applies everywhere)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GAUGE_CHOICES.map((c) => (
              <ChoiceTile
                key={c.value}
                active={gauge === c.value}
                onClick={() => setGauge(c.value)}
                title={c.title}
                sub={c.sub}
                testId={`dashboard-view-gauge-${c.value}`}
              >
                <div className="flex justify-center" style={{ minHeight: 110 }}>
                  <div style={{ width: 140, transform: 'scale(0.8)', transformOrigin: 'top center' }}>
                    <ReadinessDial
                      score={72}
                      id={`pref-preview-${c.value}`}
                      labelText="Preview"
                      labelColor="var(--gold)"
                      variant={c.value}
                    />
                  </div>
                </div>
              </ChoiceTile>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
