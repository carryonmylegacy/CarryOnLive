import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ChevronRight, Lock } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { BENEFACTOR_SECTIONS, sectionRgb } from '../config/benefactorSections';
import { isFeatureKeyEnabled } from '../utils/featureGates';
import { isFeatureKeyLocked } from '../utils/lockdown';

/**
 * SectionLandingPage — one of four benefactor-section landing pages
 * (Estate, Vault, Financial, Preparedness). Mounted at
 * `/section/:sectionKey`. Each tile in the dashboard's rollup grid
 * navigates here, then the user picks a specific feature to dive
 * into.
 *
 * Layout (matches the rest of the benefactor portal visual cadence):
 *   • Gradient section header (radial-gradient + icon chip + serif
 *     title) — identical pattern to `EntitiesPage.js` and admin
 *     `AdminSectionLayout.js`.
 *   • A short paragraph that explains what the section covers.
 *   • A grid of feature cards — one per feature in the section, only
 *     rendering the cards whose feature is enabled for the user's
 *     current tier. Each card shows the feature name + abbreviation,
 *     a one-line description, a status line ("N items · NN%
 *     readiness"), and a chevron CTA → routes to the feature page.
 *
 * Created May 22 2026 — Dashboard 4-section rollup follow-up.
 */
const SECTION_BLURBS = {
  estate: "Who inherits what, who gets notified, and who can act on your behalf. Beneficiaries are the foundation; everything else in this section flows from them.",
  vault: "The encrypted documents and digital credentials that survive you, plus the AI gap-finder that audits them while you build.",
  financial: "Your money picture — what's earning, what's owed, what's owned, and the trust / LLC / charity structures that hold it all.",
  preparedness: "What survivors do the day everything changes — the immediate action checklist, your household disaster protocols, and the family hotline that runs through it.",
};

const FEATURE_DESCRIPTIONS = {
  beneficiaries: "Designate every person who inherits or gets notified, and map their relationships.",
  mm: "Pre-record milestone messages — text, audio, or video — for birthdays, graduations, weddings, and the day-after.",
  ffn: "The notification tree: who gets called when, with what message, in what order.",
  dts: "Designate a professional trustee, attorney, or fiduciary with structured access.",
  ept: "Full audit history of every change made to your estate plan.",
  sdv: "Wills, trusts, deeds, certificates, insurance — encrypted AES-256, beneficiary-accessible at transition.",
  dav: "Passwords, account credentials, two-factor seed phrases, crypto keys — your digital life.",
  ega: "Estate Guardian AI reads your vault and surfaces gaps in your plan before they matter.",
  cfp: "Bills, debts, accounts, properties — the complete financial picture survivors need.",
  ces: "Trusts, LLCs, charities, properties, and the people who hold them — visual org chart.",
  iac: "The day-after playbook — exactly what to do, in what order, with the documents already attached.",
  ccp: "Disaster response protocols for the household while you're still alive — wildfire, earthquake, active shooter, more.",
  ect: "Family hotline — secure in-platform chat that runs during any crisis.",
};

const SectionLandingPage = () => {
  const { sectionKey } = useParams();
  const navigate = useNavigate();
  const { user: _user, enabledFeatures, subscriptionStatus: lockSub } = useAuth();
  // Greyed-but-visible feature cards: SDV-only lockdown + trustee MM boundary.
  const lockCtx = {
    lockdown: lockSub?.sdv_only_lockdown === true,
    trusteeMode: !!_user?.trustee_mode,
  };
  const [estate, setEstate] = useState(null);
  const [stats, setStats] = useState({});

  const section = useMemo(
    () => BENEFACTOR_SECTIONS.find((s) => s.key === sectionKey),
    [sectionKey]
  );

  // Pull the currently-active estate so we can fetch per-estate counts.
  const loadEstate = useCallback(async () => {
    try {
      const token = localStorage.getItem('carryon_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await apiClient.get(`${API_URL}/estates`, { headers });
      const list = Array.isArray(res.data) ? res.data : (res.data?.estates || []);
      const selectedId = localStorage.getItem('selected_estate_id');
      const e = (selectedId && list.find((x) => x.id === selectedId)) || list[0] || null;
      if (e) {
        setEstate(e);
        try { localStorage.setItem('selected_estate_id', e.id); } catch {}
      }
    } catch { /* non-fatal */ }
  }, []);

  // Fetch every count this section's feature cards display, in
  // parallel. Each individual fetch tolerates a network blip with
  // null so one transient failure can't blank out the whole landing.
  const loadStats = useCallback(async (estateId) => {
    if (!estateId) return;
    const token = localStorage.getItem('carryon_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const auth = { headers };
    const get = (path) => apiClient.get(`${API_URL}${path}`, auth).catch(() => null);
    const [bens, msgs, ffn, sdv, dav, cfp, ces, iac, ccp] = await Promise.all([
      get(`/beneficiaries/${estateId}`),
      get(`/messages/${estateId}`),
      get(`/ffn/${estateId}`),
      get(`/documents/${estateId}`),
      get(`/digital-wallet/${estateId}`),
      get(`/financial/summary/${estateId}`),
      get(`/financial/entities/${estateId}`),
      get(`/checklists/${estateId}`),
      get(`/ccp/plans/${estateId}`),
    ]);
    const len = (r) => (Array.isArray(r?.data) ? r.data.length : (r?.data?.entries?.length || 0));
    const cfpTotal = ((cfp?.data?.bills_count || 0)
      + (cfp?.data?.debts_count || 0)
      + (cfp?.data?.accounts_count || 0)
      + (cfp?.data?.property_count || 0));
    setStats({
      beneficiaries: len(bens),
      mm: len(msgs),
      ffn: len(ffn),
      sdv: len(sdv),
      dav: len(dav),
      cfp: cfpTotal,
      ces: Array.isArray(ces?.data?.entities) ? ces.data.entities.length : 0,
      iac: len(iac),
      ccp: len(ccp),
    });
  }, []);

  useEffect(() => { loadEstate(); }, [loadEstate]);
  useEffect(() => { loadStats(estate?.id); }, [estate?.id, loadStats]);

  // Bad section key → bounce to dashboard.
  if (!section) return <Navigate to="/dashboard" replace />;

  const accent = section.color;
  const rgb = sectionRgb(accent);
  const Icon = section.icon;
  const enabledTabs = section.tabs.filter((t) => isFeatureKeyEnabled(t.featureKey, enabledFeatures));

  // Compose the "Title - value · Title - value" status line for each
  // card. Falls back to a single descriptor when no metric exists
  // for the feature.
  const statusLine = (featureKey) => {
    const v = stats[featureKey];
    if (v === undefined) return null;
    if (featureKey === 'beneficiaries') return `Beneficiaries - ${v}`;
    if (featureKey === 'mm') return `Messages - ${v}`;
    if (featureKey === 'ffn') return `Entries - ${v} (100% at 3)`;
    if (featureKey === 'sdv') return `Documents - ${v}`;
    if (featureKey === 'dav') return `Credentials - ${v} (100% at 5)`;
    if (featureKey === 'cfp') return `Financial items - ${v}`;
    if (featureKey === 'ces') return `Entities - ${v} (100% with any tree)`;
    if (featureKey === 'iac') return `Checklist - ${v}`;
    if (featureKey === 'ccp') return `CCP plans - ${v}`;
    return null;
  };

  return (
    <div
      className="p-4 lg:p-8 pt-4 lg:pt-8 pb-24 lg:pb-8 space-y-6 animate-fade-in max-w-full overflow-x-hidden"
      data-testid={`section-landing-${section.key}`}
      style={{
        background: `radial-gradient(ellipse at top left, rgba(${rgb}, 0.18), transparent 55%), radial-gradient(ellipse at bottom right, rgba(${rgb}, 0.07), transparent 55%)`,
        minHeight: '100%',
      }}
    >
      {/* Section header — gradient icon chip + serif title + blurb */}
      <div className="flex items-start gap-3" data-testid={`section-landing-${section.key}-header`}>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, rgba(${rgb}, 0.22), rgba(${rgb}, 0.10))`,
            border: `1px solid rgba(${rgb}, 0.25)`,
          }}
        >
          <Icon className="w-6 h-6" style={{ color: accent }} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
            {section.label}
          </h1>
          <p className="text-sm text-[var(--t4)] mt-1 leading-relaxed max-w-3xl">
            {SECTION_BLURBS[section.key]}
          </p>
        </div>
      </div>

      {/* Feature grid — 2-col on desktop, 1-col on mobile. Each card
          is itself a navigation target (clicking anywhere on the
          card routes to the feature page). */}
      {enabledTabs.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'var(--s)',
            border: '1px solid var(--b)',
            color: 'var(--t4)',
          }}
          data-testid={`section-landing-${section.key}-empty`}
        >
          <Lock className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--t5)' }} />
          <p className="font-bold text-[var(--t)] mb-1">Not on your plan</p>
          <p className="text-sm">None of the features in this section are enabled for your current tier.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {enabledTabs.map((tab) => {
            const TabIcon = tab.icon;
            const status = statusLine(tab.featureKey);
            const cardLocked = isFeatureKeyLocked(tab.featureKey, lockCtx);
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => navigate(tab.path)}
                data-testid={`section-landing-${section.key}-card-${tab.key}`}
                className={`glass-card text-left p-5 lg:p-6 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer${cardLocked ? ' opacity-40' : ''}`}
                style={{
                  borderColor: `rgba(${rgb}, 0.18)`,
                }}
              >
                <div className="flex items-start gap-4 mb-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, rgba(${rgb}, 0.22), rgba(${rgb}, 0.10))`,
                      border: `1px solid rgba(${rgb}, 0.25)`,
                    }}
                  >
                    <TabIcon className="w-5 h-5" style={{ color: accent }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base lg:text-lg font-bold text-[var(--t)] leading-tight" style={{ fontFamily: 'var(--sans)' }}>
                      {tab.label}
                    </h2>
                  </div>
                  {cardLocked
                    ? <Lock className="w-5 h-5 flex-shrink-0 mt-1" style={{ color: accent }} data-testid={`section-card-locked-${tab.key}`} />
                    : <ChevronRight className="w-5 h-5 flex-shrink-0 mt-1" style={{ color: accent }} />}
                </div>
                <p className="text-sm text-[var(--t4)] leading-relaxed mb-3">
                  {FEATURE_DESCRIPTIONS[tab.featureKey] || ''}
                </p>
                {status && (
                  <div
                    className="font-bold whitespace-nowrap"
                    style={{ fontSize: 13, color: 'var(--t)' }}
                    data-testid={`section-landing-${section.key}-status-${tab.key}`}
                  >
                    {status}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SectionLandingPage;
