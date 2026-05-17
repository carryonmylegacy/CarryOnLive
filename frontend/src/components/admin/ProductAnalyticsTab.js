import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import apiClient from '../../utils/apiClient';
import {
  Loader2, RefreshCw, TrendingUp, Users as UsersIcon,
  MousePointerClick, CreditCard, Apple, Smartphone, Monitor, Tablet,
} from 'lucide-react';
import { Button } from '../ui/button';
import { API_URL } from '../../config';
import { toast } from '../../utils/toast';

const PLATFORM_LABEL = {
  ios: { label: 'iOS', icon: Apple },
  'ios-pwa': { label: 'iOS PWA', icon: Apple },
  android: { label: 'Android', icon: Smartphone },
  'android-pwa': { label: 'Android PWA', icon: Smartphone },
  web: { label: 'Desktop Web', icon: Monitor },
  capacitor: { label: 'Native App', icon: Tablet },
  unknown: { label: 'Unknown', icon: Monitor },
};

const EVENT_LABEL = {
  landing_view: 'Landing views',
  landing_cta_click: 'Landing CTA clicks',
  signup_step_view: 'Signup step views',
  signup_step_complete: 'Signup step completions',
  signup_completed: 'Signup completed',
  login_success: 'Successful logins',
  login_failed: 'Failed logins',
  feature_view: 'Feature page views',
  feature_action: 'Feature actions',
  vault_doc_added: 'Vault docs added',
  message_created: 'Milestone messages created',
  message_scheduled: 'Milestone messages scheduled',
  ega_session_started: 'EGA sessions started',
  ega_message_sent: 'EGA messages sent',
  subscription_view: 'Subscription views',
  subscription_upgraded: 'Subscriptions upgraded',
  trial_expired: 'Trials expired',
  referral_share: 'Referral shares',
  referral_signup: 'Referral signups',
  onboarding_step_complete: 'Onboarding step done',
  onboarding_dismissed: 'Onboarding dismissed',
};

const getAuthHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('carryon_token')}` } });

export const ProductAnalyticsTab = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (d) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`${API_URL}/admin/funnel-analytics?days=${d}`, getAuthHeaders());
      setData(res.data);
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(days); }, [days, fetchData]);

  const total = data?.totals?.events || 0;

  return (
    <div className="space-y-5" data-testid="product-analytics-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-white text-lg sm:text-xl font-semibold mb-1" style={{ fontFamily: 'var(--sans)' }}>
            Product Analytics
          </h2>
          <p className="text-[var(--t5)] text-sm">
            Marketing → signup → trial → paid funnel. Self-hosted, anonymous, GDPR-clean. (Distinct from the Marketing Funnel tab which covers waitlist & referral signup.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} data-testid={`pa-days-${d}`}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: days === d ? 'rgba(212,175,55,0.15)' : 'transparent',
                border: `1px solid ${days === d ? 'rgba(212,175,55,0.4)' : 'var(--b)'}`,
                color: days === d ? 'var(--gold)' : 'var(--t4)',
              }}>{d}d</button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => fetchData(days)} disabled={loading}
            className="hover:bg-[var(--s)] hover:text-current text-[var(--t4)] h-8 w-8 p-0" data-testid="pa-refresh">
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="pa-summary">
            <Stat label="Unique actors" value={data?.totals?.unique_actors || 0} icon={UsersIcon} />
            <Stat label="Total events" value={total} icon={TrendingUp} />
            <Stat label="CTA → Signup rate" value={`${data?.funnel?.signup_rate || 0}%`} icon={MousePointerClick} accent="#22C993" />
            <Stat label="Trial → Paid rate" value={`${data?.funnel?.trial_to_paid_rate || 0}%`} icon={CreditCard} accent="#22C993" />
          </div>

          {total === 0 ? (
            <div className="rounded-xl p-10 text-center" style={{ background: 'var(--card)', border: '1px solid var(--b)' }}>
              <TrendingUp className="w-10 h-10 mx-auto mb-3 text-[var(--t5)]" />
              <p className="text-[var(--t3)] text-sm font-medium">No funnel events yet for this window.</p>
              <p className="text-[var(--t5)] text-xs mt-1">Beacons fire from the marketing landing, signup, and key product surfaces. Real traffic populates here once the build is deployed.</p>
            </div>
          ) : (
            <>
              <FunnelStrip funnel={data?.funnel || {}} />
              <PlatformChips byPlatform={data?.totals?.by_platform || {}} total={total} />
              <EventTable byEvent={data?.totals?.by_event || {}} total={total} />
            </>
          )}
        </>
      )}
    </div>
  );
};

const Stat = ({ label, value, icon: Icon, accent = 'var(--gold)' }) => (
  <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--b)' }}>
    <div className="flex items-center gap-2 mb-1">
      <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
      <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--t5)' }}>{label}</span>
    </div>
    <div className="text-2xl font-bold" style={{ color: accent }}>{value}</div>
  </div>
);

const FunnelStrip = ({ funnel }) => {
  const steps = [
    { label: 'Landing views', value: funnel.landing_view || 0 },
    { label: 'CTA clicks', value: funnel.landing_cta_click || 0, rate: funnel.cta_rate },
    { label: 'Signups', value: funnel.signup_completed || 0, rate: funnel.signup_rate },
    { label: 'Paid upgrades', value: funnel.subscription_upgraded || 0, rate: funnel.trial_to_paid_rate },
  ];
  const max = Math.max(...steps.map(s => s.value), 1);
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--b)' }} data-testid="pa-funnel-strip">
      <h3 className="text-white font-semibold text-sm mb-4">Conversion funnel</h3>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={s.label} data-testid={`pa-funnel-step-${i}`}>
            <div className="flex items-baseline justify-between mb-1.5 text-xs">
              <span className="text-[var(--t3)] font-medium">{s.label}</span>
              <span className="text-white font-semibold">
                {s.value}{i > 0 && s.rate != null ? <span className="text-[var(--t5)] font-normal ml-2">({s.rate}% conv.)</span> : null}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="h-full" style={{ width: `${(s.value / max) * 100}%`, background: 'var(--gold)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PlatformChips = ({ byPlatform, total }) => {
  const platforms = Object.keys(byPlatform).sort((a, b) => byPlatform[b] - byPlatform[a]);
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--b)' }} data-testid="pa-platforms">
      <h3 className="text-white font-semibold text-sm mb-3">By platform</h3>
      <div className="flex flex-wrap gap-2">
        {platforms.map(p => {
          const meta = PLATFORM_LABEL[p] || PLATFORM_LABEL.unknown;
          const Icon = meta.icon;
          const pct = total ? Math.round((byPlatform[p] / total) * 100) : 0;
          return (
            <div key={p} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
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

const EventTable = ({ byEvent, total }) => {
  const rows = Object.keys(byEvent).sort((a, b) => byEvent[b] - byEvent[a]);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--b)', background: 'var(--card)' }} data-testid="pa-events">
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--b)' }}>
        <h3 className="text-white font-semibold text-sm">All events</h3>
      </div>
      <div>
        {rows.map(ev => {
          const pct = total ? (byEvent[ev] / total) * 100 : 0;
          return (
            <div key={ev} className="px-4 py-2.5 flex items-center justify-between gap-3 border-t"
              style={{ borderColor: 'var(--b)' }} data-testid={`pa-event-${ev}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white">{EVENT_LABEL[ev] || ev}</div>
                <div className="text-[11px] text-[var(--t5)] font-mono">{ev}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 h-1.5 rounded-full overflow-hidden hidden sm:block" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="h-full" style={{ width: `${pct}%`, background: 'var(--gold)' }} />
                </div>
                <span className="text-xs text-white font-semibold w-10 text-right">{byEvent[ev]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProductAnalyticsTab;
