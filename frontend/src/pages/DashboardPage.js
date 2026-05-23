import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import apiClient from '../utils/apiClient';
import { useAuth, useBrand } from '../contexts/AuthContext';
import { useLabelCleaner, useBrandedLabelBuilder, joinBrandSuffix } from '../utils/brandLabel';
import { cachedGet } from '../utils/apiCache';
import { isFeatureKeyEnabled, isFeatureEnabled } from '../utils/featureGates';
import { SpeedometerGauge, StatCard, SectionStatCard } from '../components/dashboard/DashboardWidgets';
import { ReadinessDial } from '../components/dashboard/ReadinessDial';
import { useDashboardPrefs } from '../hooks/useDashboardPrefs';
import { 
  FolderLock, 
  MessageSquare, 
  Users, 
  CheckSquare,
  ChevronRight, ChevronDown,
  Clock,
  CheckCircle2,
  Circle,
  X,
  Sparkles,
  KeyRound,
  ArrowLeftRight,
  Loader2,
  Play,
  DollarSign,
  Receipt,
  TrendingUp,
  ShieldAlert,
  Landmark, Lock, Heart,
} from 'lucide-react';
import TrialBanner from '../components/TrialBanner';
import BillingStatusBanner from '../components/BillingStatusBanner';
import OnboardingWizard from '../components/OnboardingWizard';
import ShareYourCarryOn from '../components/ShareYourCarryOn';
import TileErrorBoundary from '../components/TileErrorBoundary';
import { API_URL } from '../config';
import { toast } from '../utils/toast';
import { getOfflineMode } from '../offline/featureFlag';
import { getLocalEstates, upsertLocalEstates } from '../offline/repos/estatesRepo';
import {
  getLocalDashboardTile,
  upsertLocalDashboardTile,
  upsertLocalReadiness,
} from '../offline/repos/dashboardRepo';

import PushPrompt from '../components/PushPrompt';
import EstateBinderButton from '../components/EstateBinderButton';
import EgaQuickLink from '../components/EgaQuickLink';
import useIacTaskStream from '../hooks/useIacTaskStream';

const DashboardPage = () => {
  const { user, getAuthHeaders, enabledFeatures, refreshEnabledFeatures } = useAuth();
  const brand = useBrand();
  const cleanLabel = useLabelCleaner();
  const buildBrandedLabel = useBrandedLabelBuilder();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [estates, setEstates] = useState([]);
  const [estate, setEstate] = useState(null);
  const [checklists, setChecklists] = useState([]);
  const [stats, setStats] = useState({
    documents: 0, messages: 0, beneficiaries: 0,
    ccp_plans: 0, ccp_drilled: 0,
    ffn: 0, dav: 0, ces: 0,
  });
  const [readiness, setReadiness] = useState({ documents: { score: 0 }, messages: { score: 0 }, checklist: { score: 0 } });
  const [financialSummary, setFinancialSummary] = useState(null);
  // Freshness stamps for the bottom BNDR + EGA pills. Hoisted out
  // of those child components so the timestamps land in the same
  // render tick as the rest of the dashboard — used to pop in ~1 s
  // after the tile grid because each pill ran its own useEffect
  // fetch on mount (May 22, 2026 user report).
  const [lastBinderAt, setLastBinderAt] = useState(null);
  const [lastEgaAt, setLastEgaAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);
  const [justCompletedActivation, setJustCompletedActivation] = useState(false);
  const [showGuidedFlow, setShowGuidedFlow] = useState(false);
  const [guidedStep, setGuidedStep] = useState(null);
  const [showWelcomeStep, setShowWelcomeStep] = useState(false);
  const [showOptionalSkipInfo, setShowOptionalSkipInfo] = useState(false);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [egaRunning, setEgaRunning] = useState(false);
  // Latest onboarding progress snapshot — used to render the
  // "Pick Up Where You Left Off" resume button when the user has
  // manually dismissed the wizard but still has incomplete steps.
  const [onboardingProgress, setOnboardingProgress] = useState(null);
  // QuickStart Wizard progress — drives the "Resume QuickStart" CTA
  // above the GS CTA when the user has session-skipped the wizard but
  // hasn't finished it. Independent of the GS (`onboarding`) flow.
  const [quickstartProgress, setQuickstartProgress] = useState(null);
  // Per-user dismissal of the "Your QuickStart Guide is ready" tile.
  // localStorage (not sessionStorage) so closing it sticks across
  // refreshes — the user can re-show it via Settings → Appearance →
  // QuickStart Tile on Dashboard toggle.
  const [quickstartTileDismissed, setQuickstartTileDismissed] = useState(() => {
    try { return localStorage.getItem('carryon_quickstart_tile_dismissed') === '1'; }
    catch { return false; }
  });
  // Session-only dismissal of the "Resume QuickStart Wizard" tile —
  // sticks for the tab only. Re-appears on next page load if the user
  // still has incomplete QW progress. (Mirrors the X dismiss pattern
  // across every dashboard onboarding tile per Feb 26 2026 mandate.)
  const [resumeQwTileDismissed, setResumeQwTileDismissed] = useState(() => {
    try { return sessionStorage.getItem('carryon_resume_qw_tile_dismissed') === '1'; }
    catch { return false; }
  });
  // Session-only dismissal of the "Pick Up Where You Left Off" GS
  // resume tile. Re-appears on next page load if GS still has work
  // remaining and the user hasn't disabled GS in Settings.
  const [resumeGsTileDismissed, setResumeGsTileDismissed] = useState(() => {
    try { return sessionStorage.getItem('carryon_resume_gs_tile_dismissed') === '1'; }
    catch { return false; }
  });
  // Listen for the Settings toggle (or any future re-open path) — when
  // the user flips the "QuickStart Tile on Dashboard" toggle, sync the
  // tile visibility immediately. Also legacy: the `resume-quickstart`
  // event clears the dismissal so the tile reappears on next regen.
  useEffect(() => {
    const onResume = () => {
      try { localStorage.removeItem('carryon_quickstart_tile_dismissed'); } catch { /* ignore */ }
      setQuickstartTileDismissed(false);
    };
    const onVisibilityChanged = (e) => {
      const visible = !!(e && e.detail && e.detail.visible);
      setQuickstartTileDismissed(!visible);
    };
    window.addEventListener('carryon:resume-quickstart', onResume);
    window.addEventListener('carryon:quickstart-tile-visibility-changed', onVisibilityChanged);
    return () => {
      window.removeEventListener('carryon:resume-quickstart', onResume);
      window.removeEventListener('carryon:quickstart-tile-visibility-changed', onVisibilityChanged);
    };
  }, []);

  // "Hide all Getting Started prompts for today" — single master gate
  // covering the QuickStart Complete / Resume QuickStart / Pick Up
  // Where You Left Off tiles. Persisted in localStorage as an ISO
  // timestamp of the next local-midnight; auto-clears when that
  // moment passes. Independent from each tile's own X-dismiss so all
  // existing individual flows continue to work.
  const isOnboardingHiddenForToday = useCallback(() => {
    try {
      const until = localStorage.getItem('carryon_onboarding_hidden_until');
      if (!until) return false;
      const untilMs = new Date(until).getTime();
      return Number.isFinite(untilMs) && untilMs > Date.now();
    } catch { return false; }
  }, []);
  const [onboardingHiddenForToday, setOnboardingHiddenForToday] = useState(isOnboardingHiddenForToday);
  // OnboardingWizard child reports its visibility + the number of
  // discrete tiles it would render (welcome + offline coach + step
  // nudge) via callback so we know whether to render the outer
  // "Getting Started" wrapper around it AND when to auto-collapse
  // that wrapper (3+ total tiles → collapsed by default).
  const [onboardingWizardHasContent, setOnboardingWizardHasContent] = useState(false);
  const [onboardingWizardTileCount, setOnboardingWizardTileCount] = useState(0);
  const handleOnboardingWizardContent = useCallback((hasContent, count) => {
    setOnboardingWizardHasContent(hasContent);
    setOnboardingWizardTileCount(typeof count === 'number' ? count : (hasContent ? 1 : 0));
  }, []);
  // User-overridable collapse preference for the Getting Started
  // group wrapper. localStorage values: '1' = always collapsed,
  // '0' = always expanded, missing = auto (collapsed if 3+ tiles).
  const [groupCollapseOverride, setGroupCollapseOverride] = useState(() => {
    try { return localStorage.getItem('carryon_onboarding_group_collapsed'); }
    catch { return null; }
  });
  // Re-check the gate when the tab regains focus — covers the
  // "user left the laptop open overnight" case so the tiles
  // reappear after local midnight without a manual refresh.
  useEffect(() => {
    const recheck = () => setOnboardingHiddenForToday(isOnboardingHiddenForToday());
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    window.addEventListener('carryon:onboarding-hidden-changed', recheck);
    // Schedule a one-shot timer to flip the gate at local midnight if
    // the tab stays open (no user interaction needed).
    let timerId = null;
    try {
      const until = localStorage.getItem('carryon_onboarding_hidden_until');
      if (until) {
        const ms = new Date(until).getTime() - Date.now();
        if (ms > 0 && ms < 24 * 60 * 60 * 1000) {
          timerId = setTimeout(recheck, ms + 500);
        }
      }
    } catch { /* ignore */ }
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
      window.removeEventListener('carryon:onboarding-hidden-changed', recheck);
      if (timerId) clearTimeout(timerId);
    };
  }, [onboardingHiddenForToday, isOnboardingHiddenForToday]);

  const hideAllOnboardingForToday = () => {
    // Compute next local midnight (Date components honor the runtime
    // timezone so this naturally resets at midnight wherever the
    // platform is being accessed).
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    try { localStorage.setItem('carryon_onboarding_hidden_until', midnight.toISOString()); } catch { /* ignore */ }
    setOnboardingHiddenForToday(true);
    try { window.dispatchEvent(new CustomEvent('carryon:onboarding-hidden-changed', { detail: { hidden: true, until: midnight.toISOString() } })); } catch { /* ignore */ }
    toast.success('Onboarding prompts hidden — they\'ll reappear tomorrow.');
  };

  const guidedDismissedRef = useRef(false);
  const lastCompletedAtRef = useRef(null);

  const handleCelebrationDismiss = () => {
    setShowCelebration(false);
    setJustCompletedActivation(true);
    setTimeout(() => sessionStorage.setItem('carryon_first_explore', 'done'), 100);
  };

  useEffect(() => { fetchEstates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (estate?.id) fetchEstateData(estate.id); }, [estate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch QuickStart progress once per dashboard mount so the resume
  // CTA renders if the user session-skipped the wizard but hasn't
  // finished it.
  useEffect(() => {
    const eligible = user?.role === 'benefactor' || user?.is_also_benefactor;
    if (!eligible) return;
    let cancelled = false;
    const refetch = () => {
      apiClient
        .get(`${API_URL}/quickstart/progress`, getAuthHeaders())
        .then((res) => { if (!cancelled) setQuickstartProgress(res.data); })
        .catch(() => { /* non-fatal */ });
    };
    refetch();
    // The wizard fires this event whenever progress changes
    // (completion, reopen, skip-familiar) so the dashboard can swap
    // between the Resume CTA, the complete tile, and nothing.
    window.addEventListener('carryon:quickstart-progress-changed', refetch);
    return () => {
      cancelled = true;
      window.removeEventListener('carryon:quickstart-progress-changed', refetch);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch likely next routes after dashboard loads
  useEffect(() => {
    if (!loading) {
      import('./VaultPage').catch(() => {});
      import('./MessagesPage').catch(() => {});
    }
  }, [loading]);

  // Ref to hold fetchEstateData for polling effect (initialized after function definition)
  const fetchEstateDataRef = useRef(null);
  const getAuthHeadersRef = useRef(getAuthHeaders);
  getAuthHeadersRef.current = getAuthHeaders;

  const fetchEstates = async () => {
    try {
      const mode = getOfflineMode();
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      // Offline-first paint: if we have a local estate list, seed the
      // switcher immediately so the user sees something before the server
      // responds. We only CHOOSE an estate from the local list when we're
      // truly offline — otherwise the server call below is authoritative.
      // Flag-agnostic rescue: fires whenever offline mode is enabled OR
      // the device reports offline. The `=== 'on'`-only gate silently
      // excluded default-off users, leaving airplane-mode users staring
      // at the "no estates yet" empty dashboard.
      if (mode !== 'off' || isOffline) {
        const localEstates = await getLocalEstates();
        const localOwned = localEstates.filter(
          e => e.user_role_in_estate === 'owner' || (!e.user_role_in_estate && !e.is_beneficiary_estate)
        );
        if (localOwned.length > 0) {
          setEstates(localOwned);
          if (isOffline) {
            // Offline: pick an estate from the local list and short-circuit.
            const savedEstateId = localStorage.getItem('selected_estate_id');
            const primaryEstateId = user?.primary_estate_id;
            const selectedEstate = (savedEstateId && localOwned.find(e => e.id === savedEstateId))
              || (primaryEstateId && localOwned.find(e => e.id === primaryEstateId))
              || localOwned[0];
            localStorage.setItem('selected_estate_id', selectedEstate.id);
            setEstate(selectedEstate);
            return;
          }
        } else if (isOffline) {
          // No local mirror + offline = nothing we can do; stop gracefully
          // so the UI keeps its existing state instead of throwing below.
          return;
        }
      }
      const response = await cachedGet(axios, `${API_URL}/estates`, getAuthHeaders());
      // In dashboard (benefactor) view, only show estates the user OWNS
      const ownedEstates = response.data.filter(
        e => e.user_role_in_estate === 'owner' || (!e.user_role_in_estate && !e.is_beneficiary_estate)
      );
      setEstates(ownedEstates);
      if (ownedEstates.length > 0) {
        const savedEstateId = localStorage.getItem('selected_estate_id');
        const primaryEstateId = user?.primary_estate_id;
        const selectedEstate = (savedEstateId && ownedEstates.find(e => e.id === savedEstateId))
          || (primaryEstateId && ownedEstates.find(e => e.id === primaryEstateId))
          || ownedEstates[0];
        localStorage.setItem('selected_estate_id', selectedEstate.id);
        setEstate(selectedEstate);
        refreshEnabledFeatures(selectedEstate.id);
      }
      // Always mirror the estates list so airplane-mode re-mounts can
      // rehydrate the estate switcher.
      upsertLocalEstates(response.data).catch(() => {});
    } catch (error) { console.error('Fetch estates error:', error); setLoading(false); }
  };

  const fetchEstateData = async (estateId) => {
    // Offline-first paint: seed stats + readiness from the local dashboard
    // tile snapshot so the page renders instantly. Flag-agnostic now —
    // always try local first. When fully offline we short-circuit and
    // never attempt the server fetch.
    //
    // Reveal-timing rule (May 6 2026 user report):
    //   "CFP, CCP and the readiness meter still update a tick after the
    //    other 4 tiles on initial load."
    // Root cause: dashboardReady was flipping true here (right after the
    // cache paint) and AGAIN in the finally block after the network
    // fetch. The cache often has stale ccp_plans or no financialSummary
    // at all, so the reveal shows zeros/old values for those three —
    // then the network response updates them visibly a moment later.
    // Fix: hold the reveal until the network fetch completes (or a
    // 1500 ms safety timeout fires for genuinely-slow networks). Cache
    // values are still applied to state immediately so the dashboard
    // is already rendered to its final tiles when reveal fires.
    //
    // Perf rescue (Feb 26 2026 user report — "dashboard takes 4-5 s
    // every time"): the strict `cacheComplete` gate was punishing
    // users whose financial summary or freshness stamps are
    // legitimately `null` — the splash held for the full network
    // round-trip every visit. The gate now treats nullable fields as
    // "complete when the key is present" and the safety timer below
    // caps splash time at 1500 ms regardless of cache shape.
    let revealedFromCache = false;
    let safetyRevealTimer = null;
    const revealDashboard = () => {
      if (revealedFromCache) return;
      revealedFromCache = true;
      setLoading(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setDashboardReady(true)));
    };
    try {
      const tile = await getLocalDashboardTile(estateId);
      if (tile) {
        if (tile.stats) setStats(tile.stats);
        if (tile.readiness) {
          setReadiness(tile.readiness);
          setEstate(prev => prev ? { ...prev, readiness_score: tile.readiness.overall_score } : prev);
        }
        if (tile.checklists) setChecklists(tile.checklists);
        if (tile.financialSummary) setFinancialSummary(tile.financialSummary);
        // Sticky freshness stamps for the BNDR + EGA pills. Without
        // these in the cache snapshot, the two pill labels would still
        // pop in ~1 s after the tile grid (because each component
        // hydrates from its own /pdfs/latest + /guardian/iac-task-status
        // useEffect on mount).
        if (tile.lastBinderAt) setLastBinderAt(tile.lastBinderAt);
        if (tile.lastEgaAt) setLastEgaAt(tile.lastEgaAt);
        // Cache-first reveal (Feb 16, 2026 user-perf report): we used
        // to hold the splash up until the network call returned so
        // CFP/CCP values never jumped from 0 → real. The compromise:
        // reveal IMMEDIATELY when the cached snapshot has been
        // populated by a prior successful fetch — checked by
        // confirming the *keys* exist on the tile, not that their
        // values are truthy. `financialSummary: null` is a legitimate
        // shape for users with no financial data and used to falsely
        // gate the reveal off, holding the splash for 4-5 s every
        // visit (Feb 26 2026 founder report).
        const cacheComplete = !!(
          tile.stats
          && typeof tile.stats.ccp_plans === 'number'
          && typeof tile.stats.ccp_drilled === 'number'
          && tile.readiness
          && 'financialSummary' in tile
          && 'lastBinderAt' in tile
          && 'lastEgaAt' in tile
        );
        if (cacheComplete) {
          revealDashboard();
        }
      }
    } catch { /* non-fatal */ }
    // Safety net: even if the cache shape is unusual or the user is
    // brand-new (no cache row yet), never hold the splash longer than
    // 1500 ms. The network fetch keeps running in the background and
    // silently updates each tile when it returns.
    safetyRevealTimer = setTimeout(revealDashboard, 1500);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Genuinely offline — reveal with cached values now since no
      // network update is coming. Clears the safety timer so we
      // don't double-fire the reveal.
      if (safetyRevealTimer) clearTimeout(safetyRevealTimer);
      revealDashboard();
      return;
    }
    try {
      // Read the prior cached ccp_plans count BEFORE we touch the
      // network. Used as a fallback when /ccp/plans fails — guarantees
      // we don't overwrite a previously-known real count (e.g. 1) with
      // 0 just because the request hiccuped.
      let priorCcpCount = 0;
      let priorDrilledCount = 0;
      try {
        const prior = await getLocalDashboardTile(estateId);
        if (typeof prior?.stats?.ccp_plans === 'number') priorCcpCount = prior.stats.ccp_plans;
        if (typeof prior?.stats?.ccp_drilled === 'number') priorDrilledCount = prior.stats.ccp_drilled;
      } catch { /* non-fatal */ }
      // Read the prior cached financialSummary BEFORE the network so
      // we can preserve it on a transient /financial/summary failure
      // (overwriting it with null causes the CFP tile to flash to 0).
      let priorFinancial = null;
      try {
        const prior = await getLocalDashboardTile(estateId);
        priorFinancial = prior?.financialSummary ?? null;
      } catch { /* non-fatal */ }
      // Always fetch estate data AND onboarding progress in parallel.
      // financial/summary is now part of the same Promise.all so the
      // CFP tile updates in lockstep with the other tiles instead of
      // a tick later — previously it fired on a separate apiClient.get().
      // Without this, CFP visibly jumped from 0 → real *after* the
      // dashboard had already faded in.
      const [docsRes, msgsRes, bensRes, checklistRes, readinessRes, progressRes, ccpRes, financialRes, pdfsRes, egaTaskRes, ffnRes, davRes, cesRes] = await Promise.all([
        apiClient.get(`${API_URL}/documents/${estateId}`, getAuthHeaders()),
        apiClient.get(`${API_URL}/messages/${estateId}`, getAuthHeaders()),
        apiClient.get(`${API_URL}/beneficiaries/${estateId}`, getAuthHeaders()),
        apiClient.get(`${API_URL}/checklists/${estateId}`, getAuthHeaders()),
        apiClient.get(`${API_URL}/estate/${estateId}/readiness`, getAuthHeaders()).catch(() => null),
        apiClient.get(`${API_URL}/onboarding/progress`, getAuthHeaders()).catch(() => null),
        apiClient.get(`${API_URL}/ccp/plans/${estateId}`, getAuthHeaders()).catch((err) => {
          // Surface the failure so we can debug "ccp tile stuck at 0"
          // bugs without silent log loss. Returning null lets ccpCount
          // below fall back to the cached count instead of 0.
          console.warn('[dashboard] /ccp/plans fetch failed:', err?.response?.status || err?.message);
          return null;
        }),
        apiClient.get(`${API_URL}/financial/summary/${estateId}`, getAuthHeaders()).catch((err) => {
          // Same protection as ccp_plans: do NOT collapse a transient
          // network failure into a `0` CFP tile. Return null so the
          // fallback below preserves the prior cached summary.
          console.warn('[dashboard] /financial/summary fetch failed:', err?.response?.status || err?.message);
          return null;
        }),
        // BNDR + EGA freshness stamps batched into the SAME Promise.all
        // so the bottom pill labels land in the same render tick as the
        // tile grid (otherwise their child-level useEffect fetches
        // produced a visible 1 s pop-in below the BNDR/EGA buttons).
        apiClient.get(`${API_URL}/pdfs/latest`, getAuthHeaders()).catch(() => null),
        apiClient.get(`${API_URL}/guardian/iac-task-status`, getAuthHeaders()).catch(() => null),
        // FFN / DAV / CES counts — feed the new section-rollup
        // readiness algorithm (May 22 2026). All three tolerate a
        // network blip with `null` so a single failure can't flash
        // their section tile to 0%.
        apiClient.get(`${API_URL}/ffn/${estateId}`, getAuthHeaders()).catch(() => null),
        apiClient.get(`${API_URL}/digital-wallet/${estateId}`, getAuthHeaders()).catch(() => null),
        apiClient.get(`${API_URL}/financial/entities/${estateId}`, getAuthHeaders()).catch(() => null),
      ]);
      // Preserve the previously-known count when the request failed.
      // Reading from the cache (priorCcpCount) is the right fallback —
      // the React-state closure is stale (initial useState default of
      // 0) at this point in fetchEstateData.
      const ccpPlansArr = Array.isArray(ccpRes?.data) ? ccpRes.data : [];
      const ccpCount = ccpRes?.data ? ccpPlansArr.length : priorCcpCount;
      // Count plans drilled at least once (drill_count field is attached
      // by the backend /ccp/plans endpoint). The readiness gauge uses
      // this alongside the plan count to compute the CCP slice.
      const ccpDrilledCount = ccpRes?.data
        ? ccpPlansArr.filter(p => (p?.drill_count || 0) > 0).length
        : priorDrilledCount;
      const statsPayload = {
        documents: docsRes.data.length,
        messages: msgsRes.data.length,
        beneficiaries: bensRes.data.length,
        ccp_plans: ccpCount,
        ccp_drilled: ccpDrilledCount,
        // FFN: list response { entries: [...] } or array — handle both.
        ffn: Array.isArray(ffnRes?.data) ? ffnRes.data.length : (ffnRes?.data?.entries?.length || 0),
        // DAV: list endpoint returns { entries: [...] } in current shape.
        dav: Array.isArray(davRes?.data) ? davRes.data.length : (davRes?.data?.entries?.length || 0),
        // CES: entities count (people are not entities; only the
        // first-class trust/LLC/charity/property tiles count toward
        // "has a tree" per user spec May 22 2026).
        ces: Array.isArray(cesRes?.data?.entities) ? cesRes.data.entities.length : 0,
      };
      const financialPayload = financialRes?.data ?? priorFinancial;
      // Extract the BNDR + EGA freshness stamps from the parallel
      // responses. Both are nullable — if the user has never
      // generated a binder or run EGA, the corresponding pill simply
      // shows no "Built X ago" / "Analyzed X ago" tail (graceful).
      const binderHit = (pdfsRes?.data?.pdfs || []).find((p) => p.pdf_type === 'estate_binder');
      const nextBinderAt = binderHit?.updated_at || null;
      const egaTask = egaTaskRes?.data;
      const nextEgaAt = (egaTask?.status === 'completed' && egaTask?.completed_at)
        ? egaTask.completed_at : null;
      // ── Single batched render so every tile (Beneficiaries, IAC,
      // MM, SDV, CCP, CFP) AND the bottom BNDR + EGA freshness pills
      // update in the same tick. Eliminates the visible "0 → real"
      // jump on CFP/CCP that the user reported.
      setStats(statsPayload);
      setFinancialSummary(financialPayload);
      setChecklists(checklistRes.data);
      setLastBinderAt(nextBinderAt);
      setLastEgaAt(nextEgaAt);
      if (readinessRes) {
        setReadiness(readinessRes.data);
        setEstate(prev => prev ? { ...prev, readiness_score: readinessRes.data.overall_score } : prev);
      }
      // Persist the freshest snapshot. We always write CCP+stats; we
      // only write financialSummary when the network actually returned
      // a value so a single transient blip can't blank out the cache.
      upsertLocalDashboardTile(estateId, {
        stats: statsPayload,
        readiness: readinessRes ? readinessRes.data : null,
        checklists: checklistRes.data,
        financialSummary: financialPayload,
        lastBinderAt: nextBinderAt,
        lastEgaAt: nextEgaAt,
      }).catch(() => {});
      // Also mirror the readiness scorecard into its own singleton table.
      if (readinessRes) {
        upsertLocalReadiness(estateId, readinessRes.data).catch(() => {});
      }

      // Persist the latest onboarding snapshot so the "Pick Up Where You
      // Left Off" resume button can render conditionally on the dashboard.
      if (progressRes?.data) setOnboardingProgress(progressRes.data);

      // Show guided flow overlay if there are incomplete steps and user hasn't dismissed this visit
      if (!guidedDismissedRef.current && progressRes?.data) {
        // If user already graduated (celebration shown before), skip all guided flow
        if (progressRes.data?.already_graduated) {
          guidedDismissedRef.current = true;
        } else if (progressRes.data?.manually_dismissed) {
          // User permanently dismissed Getting Started — don't show guided overlay
          guidedDismissedRef.current = true;
        } else {
          const steps = progressRes.data?.steps || [];
          const triggerStepKey = searchParams.get('triggerStep');
          // If returning from Settings address flow, force-show the triggered step
          const nextIncomplete = triggerStepKey
            ? steps.find(s => s.key === triggerStepKey) || steps.find(s => !s.completed)
            : steps.find(s => !s.completed);
          if (triggerStepKey) setSearchParams({}, { replace: true });
          if (nextIncomplete && !progressRes.data?.all_complete) {
            setGuidedStep({ ...nextIncomplete, beneficiary_names: progressRes.data?.beneficiary_names || [] });
            // Show welcome step for multi-role users (beneficiary who also has own estate)
            if (user?.is_also_benefactor && user?.role === 'beneficiary' && !localStorage.getItem('carryon_welcome_guided_shown')) {
              setShowWelcomeStep(true);
            }
            setShowGuidedFlow(true);
          } else if (progressRes.data?.all_complete && !progressRes.data?.celebration_shown) {
            // All steps complete — show celebration (one-time, persisted on backend)
            guidedDismissedRef.current = true;
            try { apiClient.post(`${API_URL}/onboarding/celebration-shown`, {}, getAuthHeaders()); } catch {}
            setTimeout(() => setShowCelebration(true), 600);
          }
        }
      }
    } catch (error) { console.error('Fetch estate data error:', error); }
    finally {
      if (safetyRevealTimer) clearTimeout(safetyRevealTimer);
      setLoading(false);
      // Delay reveal until overlay is rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setDashboardReady(true));
      });
    }
  };

  // Update ref after fetchEstateData is defined
  fetchEstateDataRef.current = fetchEstateData;

  // EGA IAC task status — SSE-first (production-scale audit P0.3) with
  // polling fallback inside the hook. Replaces the legacy 4s/30s
  // adaptive polling loop: at 1,000 concurrent users this collapses
  // ~250 req/sec into ~1,000 idle long-lived connections AND surfaces
  // status changes within milliseconds instead of up to 4s late.
  useIacTaskStream({
    enabled: !!estate?.id && isFeatureKeyEnabled('ega', enabledFeatures),
    onUpdate: useCallback((task) => {
      if (task.status === 'running') {
        setEgaRunning(true);
      } else if (task.status === 'completed' && task.completed_at) {
        setEgaRunning(false);
        // Only refresh + toast when a new completion is detected.
        // We DON'T toast on the very first event of a user's session
        // (lastCompletedAtRef.current is null), because that would
        // surface a stale "X items added!" notice for a run that
        // finished hours ago and the user already moved on from.
        if (lastCompletedAtRef.current && lastCompletedAtRef.current !== task.completed_at) {
          fetchEstateDataRef.current?.(estate?.id);
          const added = task.items_added || 0;
          const dupes = task.duplicates_skipped || 0;
          if (added > 0 && dupes > 0) {
            toast.success(`IAC updated — ${added} new item${added > 1 ? 's' : ''} added (${dupes} duplicate${dupes > 1 ? 's' : ''} skipped)`);
          } else if (added > 0) {
            toast.success(`IAC updated — ${added} new item${added > 1 ? 's' : ''} added by Estate Guardian`);
          } else if (task.error) {
            toast.error(task.error);
          } else if (dupes > 0) {
            toast.success(`Estate Guardian found ${dupes} relevant action${dupes > 1 ? 's' : ''} — all already in your checklist.`);
          } else {
            toast.success('Estate Guardian finished generating — no new items this round.');
          }
        }
        lastCompletedAtRef.current = task.completed_at;
      } else if (task.status === 'error' && lastCompletedAtRef.current !== task.completed_at && task.completed_at) {
        // Background error surfaced from a different page — let the
        // user know without forcing them to navigate to /checklist.
        setEgaRunning(false);
        toast.error(task.error || 'Estate Guardian run failed — please try again from the Checklist page.');
        lastCompletedAtRef.current = task.completed_at;
      } else {
        setEgaRunning(false);
      }
    }, [estate?.id]),
  });

  const completedTasks = checklists.filter(c => c.is_completed).length;
  const totalTasks = checklists.length || 5;

  // Use real readiness breakdown from API for the four backend categories.
  const docsPercent = readiness?.documents?.score ?? 0;
  const msgsPercent = readiness?.messages?.score ?? 0;
  const checklistPercent = readiness?.checklist?.score ?? 0;
  const financialsPercent = readiness?.financials?.score ?? 0;

  // Two new client-derived categories — Beneficiaries and CCP — feed
  // the unified Readiness Score alongside the four server-side ones.
  // Beneficiaries: linear ramp 0..3 → 0..100% (3+ beneficiaries = full).
  // CCP: see the inline comment below — 100% requires 5 plans drilled.
  // Both heuristics intentionally simple — they reward the user for
  // *having configured anything at all*, not for sophistication.
  // CCP scoring (Feb 16, 2026 — per user spec):
  //   100% requires 5 plans AND every plan drilled ≥1 time. Scales
  //   linearly below that. Each "plan exists" earns up to 10% (max 5
  //   plans = 50%), each "plan drilled at least once" earns another
  //   up to 10% (max 5 drilled = 50%). Total ceiling is 100%; counts
  //   above 5 plans/drills are still 100%.
  const beneficiariesPercent = Math.min(100, Math.round(((stats.beneficiaries || 0) / 3) * 100));
  const planCountForCcp = Math.min(5, stats.ccp_plans || 0);
  const drilledCountForCcp = Math.min(planCountForCcp, stats.ccp_drilled || 0);
  const ccpPercent = (planCountForCcp * 10) + (drilledCountForCcp * 10);

  // New per-feature percents (May 22 2026 — per founder spec):
  //   FFN: linear ramp 0..3 → 0..100% (3+ entries = full).
  //   DAV: linear ramp 0..5 → 0..100% (5+ entries = full).
  //   CES: binary — 100% if at least one entity exists in the tree.
  const ffnPercent = Math.min(100, Math.round(((stats.ffn || 0) / 3) * 100));
  const davPercent = Math.min(100, Math.round(((stats.dav || 0) / 5) * 100));
  const cesPercent = (stats.ces || 0) > 0 ? 100 : 0;

  // ── Section-rollup readiness (May 22 2026) ────────────────────────
  // The 6 dashboard tiles consolidated into the 4 menu sections. Each
  // section's percent is a weighted mean of its component features'
  // percents, using the same per-feature weights that drove the
  // pre-rollup gauge (so the gauge total stays mathematically
  // continuous with what users were seeing before). Features with no
  // scoring metric today (DTS, EPT, EGA, ECT) are NOT in the weight
  // table — they don't drag the score down for users who haven't
  // configured them.
  const FEATURE_WEIGHTS = {
    beneficiaries: 6,
    mm: 4,
    ffn: 2,
    sdv: 3,
    dav: 2,
    cfp: 2,
    ces: 1,
    iac: 5,
    ccp: 1,
  };
  const FEATURE_PERCENTS = {
    beneficiaries: beneficiariesPercent,
    mm: msgsPercent,
    ffn: ffnPercent,
    sdv: docsPercent,
    dav: davPercent,
    cfp: financialsPercent,
    ces: cesPercent,
    iac: checklistPercent,
    ccp: ccpPercent,
  };
  // Section → feature keys. Mirrors `benefactorSections.js` exactly,
  // restricted to features that have a readiness metric today.
  const SECTION_FEATURES = {
    estate: ['beneficiaries', 'mm', 'ffn'],
    vault: ['sdv', 'dav'],
    financial: ['cfp', 'ces'],
    preparedness: ['iac', 'ccp'],
  };
  // For each section, compute the weighted-mean percent across the
  // features that (a) appear in that section AND (b) are enabled for
  // the user's current tier. If a section has zero tier-enabled
  // scoreable features, its percent is null → tile + key chip both
  // vanish from the dashboard.
  const sectionPercents = {};
  const sectionWeights = {};
  Object.entries(SECTION_FEATURES).forEach(([sec, feats]) => {
    const enabledFeats = feats.filter((f) => isFeatureKeyEnabled(f, enabledFeatures));
    if (enabledFeats.length === 0) {
      sectionPercents[sec] = null;
      sectionWeights[sec] = 0;
      return;
    }
    const w = enabledFeats.reduce((acc, f) => acc + FEATURE_WEIGHTS[f], 0);
    const ws = enabledFeats.reduce((acc, f) => acc + FEATURE_PERCENTS[f] * FEATURE_WEIGHTS[f], 0);
    sectionPercents[sec] = Math.round(ws / w);
    sectionWeights[sec] = w;
  });

  // Overall gauge — weighted mean of the section percents, weighted by
  // the SUM of feature weights inside each section. Tier-aware: a
  // section that's entirely OFF for the tier contributes nothing
  // (neither to numerator nor denominator) so the gauge always
  // reflects the tier's actual scope of features.
  const overallNum = Object.entries(sectionPercents).reduce((acc, [sec, p]) => acc + (p == null ? 0 : p * sectionWeights[sec]), 0);
  const overallDen = Object.values(sectionWeights).reduce((acc, w) => acc + w, 0);
  const readinessScore = overallDen > 0 ? Math.round(overallNum / overallDen) : 0;

  // Dashboard layout/gauge preferences (per-device).
  const { layout: dashboardLayout } = useDashboardPrefs();

  // Get score label and color
  const getScoreLabel = (score) => {
    if (score >= 80) return { label: 'Protected', color: '#14B8A6' };
    if (score >= 60) return { label: 'Strong', color: '#2DD4BF' };
    if (score >= 40) return { label: 'Building', color: '#FBBF24' };
    return { label: 'Getting Started', color: '#F59E0B' };
  };

  const scoreInfo = getScoreLabel(readinessScore);

  const getUserFirstName = () => {
    if (user?.first_name) return user.first_name;
    if (user?.name) return user.name.split(' ')[0];
    return 'there';
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-8 pt-4 lg:pt-8 animate-fade-in">
        <div className="h-8 w-64 bg-[var(--s)] rounded-lg mb-4 animate-pulse" />
        <div className="h-5 w-80 bg-[var(--s)] rounded-lg mb-6 animate-pulse" />
        <div className="h-48 bg-[var(--s)] rounded-2xl mb-4 animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-28 bg-[var(--s)] rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!estate && estates.length === 0) {
    return (
      <div className="p-4 lg:p-8 pt-4 lg:pt-8 animate-fade-in">
        <div className="glass-card max-w-lg mx-auto mt-8 p-8 lg:p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--gold)]/20 flex items-center justify-center">
            <FolderLock className="w-8 h-8 text-[var(--gold)]" />
          </div>
          <h2 className="text-xl lg:text-2xl font-bold text-[var(--t)] mb-3">Create Your First Estate</h2>
          <p className="text-[var(--t4)] mb-6 text-sm lg:text-base">Start organizing your estate plan by creating an estate.</p>
          <button onClick={() => navigate('/create-estate')} className="gold-button px-6 py-3 rounded-xl font-bold" data-testid="create-first-estate">Create Estate</button>
        </div>
      </div>
    );
  }

  // Guided activation — frosted glass overlay on top of the dashboard
  const renderGuidedOverlay = () => {
    if (!showGuidedFlow || !guidedStep) return null;

    const STEP_ROUTES = {
      add_beneficiary: '/beneficiaries',
      create_message: '/messages',
      upload_document: '/vault',
      review_readiness: '/guardian',
      customize_checklist: '/checklist',
      designate_primary: '/beneficiaries',
      add_credential: '/digital-wallet',
    };

    // Skip guided step if the feature is gated for the user's tier
    const stepRoute = STEP_ROUTES[guidedStep.key];
    if (stepRoute && !isFeatureEnabled(stepRoute, enabledFeatures)) return null;

    const STEP_ICONS = {
      add_beneficiary: Users,
      create_message: MessageSquare,
      upload_document: FolderLock,
      review_readiness: Sparkles,
      customize_checklist: CheckSquare,
      designate_primary: ArrowLeftRight,
      add_credential: KeyRound,
    };
    const STEP_COLORS = {
      add_beneficiary: '#3b82f6',
      create_message: '#8b5cf6',
      upload_document: '#10b981',
      review_readiness: '#d4af37',
      customize_checklist: '#f59e0b',
      designate_primary: '#06b6d4',
      add_credential: '#ec4899',
    };
    const STEP_LABELS = {
      add_beneficiary: { title: 'Add Someone You Love', desc: "Let's start by adding a family member or loved one. You just need their first name and your relationship — that's it! You can add details later.", step: 1 },
      create_message: { title: 'Leave a Milestone Message', desc: "We'll open the Milestone Messages tool so you can record a real milestone-triggered message for your loved ones — pick the moment it should be delivered, who receives it, and add text or video.", step: 2 },
      upload_document: { title: 'Upload an Important Document', desc: "Pick a document from your device — like a will, insurance policy, or any important paper. Just select the file and give it a name.", step: 3 },
      review_readiness: { title: 'Check Your Readiness Score', desc: "Let our AI assistant look over your progress and give you a simple readiness score. Tip: Set your address in Settings first for the best results.", step: 4 },
      customize_checklist: { title: 'Review Your Action Checklist', desc: 'Take a look at the step-by-step checklist your loved ones will follow. You can customize it to fit your family.', step: 5 },
      designate_primary: { title: 'Set Your Succession Order', desc: 'Arrange the order your beneficiaries inherit responsibilities. This is optional — you can always do it later.', step: 6, optional: true },
      add_credential: { title: 'Save a Digital Account Login', desc: 'Store one account login (like email or banking) so your beneficiaries can access it when needed. This is optional.', step: 7, optional: true },
    };
    const OPTIONAL_SKIP_INFO = {
      designate_primary: {
        title: 'No Problem!',
        desc: 'You can set your succession order anytime from the Beneficiaries page. Just drag the beneficiary tiles up or down to change their relative hierarchy and succession order.',
        route: '/beneficiaries',
        routeLabel: 'Go to Beneficiaries',
      },
      add_credential: {
        title: 'No Problem!',
        desc: 'You can store digital account credentials anytime from the Digital Access Vault. Just tap "Add Credential" to securely save a login and password for your beneficiaries.',
        route: '/digital-wallet',
        routeLabel: 'Go to Digital Vault',
      },
    };
    const stepInfo = STEP_LABELS[guidedStep.key] || STEP_LABELS.add_beneficiary;
    const route = STEP_ROUTES[guidedStep.key];
    const StepIcon = STEP_ICONS[guidedStep.key] || Sparkles;
    const stepColor = STEP_COLORS[guidedStep.key] || '#d4af37';
    const totalSteps = 7;
    const isOptional = guidedStep.optional || stepInfo.optional;

    // Personalize beneficiary step with beneficiary names
    let title = stepInfo.title;
    if (guidedStep.key === 'create_message') {
      const benNames = guidedStep.beneficiary_names || [];
      if (benNames.length === 1) {
        title = `Leave a Message for ${benNames[0]}`;
      } else if (benNames.length === 2) {
        title = `Leave a Message for ${benNames[0]} and/or ${benNames[1]}`;
      } else if (benNames.length >= 3) {
        title = `Leave a Message for ${benNames[0]}, ${benNames[1]}, and/or ${benNames[2]}`;
      }
    }

    const dismissOverlay = () => {
      // Session-only dismiss — guide will return on next login
      if (showWelcomeStep) {
        localStorage.setItem('carryon_welcome_guided_shown', 'true');
        setShowWelcomeStep(false);
      }
      guidedDismissedRef.current = true;
      setShowGuidedFlow(false);
    };

    // Handle optional step skip — show info pane then mark complete
    const handleOptionalSkip = async () => {
      setShowOptionalSkipInfo(true);
    };

    const confirmOptionalSkip = async () => {
      try {
        await apiClient.post(`${API_URL}/onboarding/complete-step/${guidedStep.key}`, {}, getAuthHeaders());
      } catch {}
      setShowOptionalSkipInfo(false);
      // Advance to the next step instead of dismissing entirely
      if (estate?.id) {
        try {
          const progressRes = await apiClient.get(`${API_URL}/onboarding/progress`, getAuthHeaders());
          const steps = progressRes.data?.steps || [];
          const nextIncomplete = steps.find(s => !s.completed);
          if (nextIncomplete && !progressRes.data?.all_complete) {
            setGuidedStep({ ...nextIncomplete, beneficiary_names: progressRes.data?.beneficiary_names || [] });
            return; // Stay in guided flow with the next step
          } else if (progressRes.data?.all_complete && !progressRes.data?.celebration_shown) {
            guidedDismissedRef.current = true;
            setShowGuidedFlow(false);
            try { apiClient.post(`${API_URL}/onboarding/celebration-shown`, {}, getAuthHeaders()); } catch {}
            setTimeout(() => setShowCelebration(true), 600);
            return;
          }
        } catch {}
      }
      guidedDismissedRef.current = true;
      setShowGuidedFlow(false);
    };

    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto" data-testid="guided-overlay"
        style={{ animation: 'guidedOverlayIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
        <style>{`
          @keyframes guidedOverlayIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes bubbleIn {
            0% { opacity: 0; transform: scale(0.85) translateY(40px); }
            60% { transform: scale(1.02) translateY(-4px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes pulseRing {
            0% { box-shadow: 0 0 0 0 ${stepColor}40; }
            70% { box-shadow: 0 0 0 20px ${stepColor}00; }
            100% { box-shadow: 0 0 0 0 ${stepColor}00; }
          }
        `}</style>

        {/* Frosted glass backdrop — theme-aware */}
        <div className="absolute inset-0" style={{
          backdropFilter: 'blur(20px) saturate(130%)',
          WebkitBackdropFilter: 'blur(20px) saturate(130%)',
          background: 'var(--guided-overlay-bg, rgba(8,14,26,0.75))',
        }} />

        {/* Close X button — upper right (session-only dismiss) */}
        <button onClick={dismissOverlay}
          className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all"
          style={{ color: 'var(--guided-muted, rgba(255,255,255,0.4))' }}
          data-testid="guided-close-btn">
          <X className="w-5 h-5" />
        </button>

        {/* Welcome step for multi-role users — shown before Step 1 */}
        {showWelcomeStep ? (
          <div className="relative max-w-md w-full mx-6 text-center"
            data-testid="welcome-step"
            style={{ animation: 'bubbleIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}>
            <div className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{
                background: 'radial-gradient(circle, rgba(var(--gold-rgb), 0.2) 0%, rgba(96,165,250,0.08) 70%)',
                border: '2px solid rgba(var(--gold-rgb), 0.35)',
                animation: 'pulseRing 2.5s ease-in-out infinite',
              }}>
              <ArrowLeftRight className="w-14 h-14 text-[var(--gold)]" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold mb-3"
              style={{ fontFamily: 'var(--sans)', color: '#ffffff' }}>
              Welcome to Your Estate
            </h1>
            <p className="text-sm lg:text-base mb-8 max-w-sm mx-auto leading-relaxed" style={{ color: '#94a3b8' }}>
              You now have both views — switch between your <strong style={{ color: 'var(--gold)' }}>Benefactor</strong> estate and your <strong style={{ color: '#60A5FA' }}>Beneficiary</strong> access anytime using the switcher in the sidebar.
            </p>
            <button onClick={() => { localStorage.setItem('carryon_welcome_guided_shown', 'true'); setShowWelcomeStep(false); }}
              className="w-full max-w-xs mx-auto py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: 'var(--bg)', boxShadow: '0 8px 32px rgba(var(--gold-rgb), 0.3)' }}
              data-testid="welcome-step-continue">
              Let's Get Started <ChevronRight className="w-5 h-5" />
            </button>
            <button onClick={() => { localStorage.setItem('carryon_welcome_guided_shown', 'true'); guidedDismissedRef.current = true; setShowWelcomeStep(false); setShowGuidedFlow(false); }}
              className="mt-4 text-sm font-medium transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
              data-testid="welcome-step-silence">
              Don't show this again
            </button>
            <p className="mt-5 text-xs max-w-xs mx-auto leading-relaxed" style={{ color: 'rgba(255,255,255,0.25)' }}>
              (You can bring this back anytime from Settings under the Getting Started Guide toggle.)
            </p>
          </div>
        ) : (
        /* Center bubble — regular step */
        <div className="relative max-w-md w-full mx-6 text-center"
          style={{ animation: 'bubbleIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}>

          {/* Optional skip explanation pane */}
          {showOptionalSkipInfo && OPTIONAL_SKIP_INFO[guidedStep.key] ? (
            <>
              <div className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-6"
                style={{
                  background: `radial-gradient(circle, ${stepColor}20 0%, ${stepColor}08 70%)`,
                  border: `2px solid ${stepColor}35`,
                }}>
                <CheckCircle2 className="w-14 h-14" style={{ color: stepColor }} />
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold mb-3"
                style={{ fontFamily: 'var(--sans)', color: 'var(--guided-title, #ffffff)' }}>
                {OPTIONAL_SKIP_INFO[guidedStep.key].title}
              </h1>
              <p className="text-sm lg:text-base mb-8 max-w-sm mx-auto leading-relaxed"
                style={{ color: 'var(--guided-desc, #94a3b8)' }}>
                {OPTIONAL_SKIP_INFO[guidedStep.key].desc}
              </p>
              <button onClick={confirmOptionalSkip}
                className="w-full max-w-xs mx-auto py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
                style={{ background: `linear-gradient(135deg, ${stepColor}, ${stepColor}cc)`, color: 'var(--bg)', boxShadow: `0 8px 32px ${stepColor}30` }}
                data-testid="guided-optional-confirm-btn">
                Got It <ChevronRight className="w-5 h-5" />
              </button>
            </>
          ) : (
          <>
          {/* Step counter */}
          <p className="text-xl lg:text-2xl font-bold uppercase tracking-[0.2em] mb-6"
            style={{ color: stepColor }}>
            Step {stepInfo.step} of {totalSteps}{isOptional ? ' (Optional)' : ''}
          </p>

          {/* Large icon bubble */}
          <div className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{
              background: `radial-gradient(circle, ${stepColor}20 0%, ${stepColor}08 70%)`,
              border: `2px solid ${stepColor}35`,
              animation: 'pulseRing 2.5s ease-in-out infinite',
            }}>
            <StepIcon className="w-14 h-14" style={{ color: stepColor }} />
          </div>

          {/* Title and description */}
          <h1 className="text-2xl lg:text-3xl font-bold mb-3"
            style={{ fontFamily: 'var(--sans)', color: 'var(--guided-title, #ffffff)' }}>
            {title}
          </h1>
          <p className="text-sm lg:text-base mb-8 max-w-sm mx-auto leading-relaxed"
            style={{ color: 'var(--guided-desc, #94a3b8)' }}>
            {stepInfo.desc}
          </p>

          {/* CTA button */}
          <button onClick={() => { setShowGuidedFlow(false); navigate(route, { state: { fromGettingStarted: true } }); }}
            className="w-full max-w-xs mx-auto py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
            style={{ background: `linear-gradient(135deg, ${stepColor}, ${stepColor}cc)`, color: 'var(--bg)', boxShadow: `0 8px 32px ${stepColor}30` }}
            data-testid="guided-cta-btn">
            Show Me How <ChevronRight className="w-5 h-5" />
          </button>

          {/* Skip link — different behavior for optional steps */}
          <button onClick={isOptional ? handleOptionalSkip : dismissOverlay}
            className="mt-8 px-5 py-2 rounded-full text-xs transition-colors"
            style={{ color: 'var(--guided-skip, #64748b)', background: 'var(--guided-skip-bg, rgba(255,255,255,0.04))', border: '1px solid var(--guided-skip-border, rgba(255,255,255,0.06))' }}
            data-testid="guided-skip-btn">
            {isOptional ? 'Skip — I\'ll do this later' : 'I\'ll do this on my own later'}
          </button>
          </>
          )}
        </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 lg:p-8 pt-2 lg:pt-6 pb-24 lg:pb-8" data-testid="benefactor-dashboard"
      style={{
        opacity: dashboardReady ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}>
      {/* Trial Banner */}
      <div className="mb-5">
        <TrialBanner onUpgrade={() => navigate('/subscription')} />
      </div>
      {/* Billing Status Banner — Grace Period or Dormant */}
      <BillingStatusBanner onUpdatePayment={() => navigate('/settings')} />

      {/* Header + Estate Selector */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
        <div>
          <h1 className="text-2xl lg:text-4xl font-semibold text-[var(--t)] mb-1 tracking-tight" style={{ fontFamily: 'var(--serif)' }}>
            {justCompletedActivation
              ? <>{getUserFirstName()}, let's continue exploring {brand}</>
              : <>Welcome back, <span className="italic text-[var(--gold)]">{getUserFirstName()}</span></>}
          </h1>
          <p className="text-[var(--t4)] text-base lg:text-xl">
            {justCompletedActivation
              ? 'Click anywhere and have fun securing your family\'s future!'
              : 'Your estate plan is taking shape. Here\'s your overview.'}
          </p>
        </div>
        <div className="sm:mt-1">
        </div>
      </div>

      {/* ── Getting Started Prompts Group ─────────────────────────────
          Master wrapper enclosing the three dashboard onboarding tiles
          ("Resume the QuickStart Wizard", "Your QuickStart Guide is
          ready", "Pick Up Where You Left Off"). The wrapper enlarges
          to fit whichever 1-3 tiles happen to be present, and a
          single prominent gold pill at the bottom hides the entire
          group until the next local-midnight (Feb 26 2026 founder
          mandate). Each inner tile's own X dismiss still works
          independently so per-tile flows are preserved.

          NOTE: the inner-tile JSX kept its original visibility
          conditions verbatim — `anyOnboardingVisible` is the OR of
          the same booleans, so any tile that would have rendered
          before still renders here, just inside the wrapper. */}
      {!onboardingHiddenForToday && (() => {
        const eligible = user?.role === 'benefactor' || user?.is_also_benefactor;
        const qwIncompleteVisible = eligible && quickstartProgress && !quickstartProgress.complete && !resumeQwTileDismissed;
        const qwCompleteVisible = eligible && quickstartProgress && quickstartProgress.complete && !quickstartTileDismissed;
        const gsResumeVisible = eligible
          && onboardingProgress?.manually_dismissed === true
          && onboardingProgress?.resume_banner_hidden !== true
          && !onboardingProgress?.all_complete
          && !resumeGsTileDismissed
          && (onboardingProgress?.steps || []).some(s => !s.completed);
        return qwIncompleteVisible || qwCompleteVisible || gsResumeVisible || onboardingWizardHasContent;
      })() && (() => {
        // Total artifact count drives the auto-collapse default.
        const eligible = user?.role === 'benefactor' || user?.is_also_benefactor;
        const qwIncompleteVisible = eligible && quickstartProgress && !quickstartProgress.complete && !resumeQwTileDismissed;
        const qwCompleteVisible = eligible && quickstartProgress && quickstartProgress.complete && !quickstartTileDismissed;
        const gsResumeVisible = eligible
          && onboardingProgress?.manually_dismissed === true
          && onboardingProgress?.resume_banner_hidden !== true
          && !onboardingProgress?.all_complete
          && !resumeGsTileDismissed
          && (onboardingProgress?.steps || []).some(s => !s.completed);
        const totalCount = (qwIncompleteVisible ? 1 : 0)
          + (qwCompleteVisible ? 1 : 0)
          + (gsResumeVisible ? 1 : 0)
          + onboardingWizardTileCount;
        // Collapse decision: user preference wins; otherwise auto-collapse
        // when 3+ tiles are stacked (per founder Feb 26 mandate — less
        // verbose, less scrolling).
        const isCollapsed = groupCollapseOverride === '1'
          ? true
          : groupCollapseOverride === '0'
          ? false
          : totalCount >= 3;
        const setCollapsed = (next) => {
          try { localStorage.setItem('carryon_onboarding_group_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
          setGroupCollapseOverride(next ? '1' : '0');
        };
        return (
      <div
        data-testid="onboarding-prompts-group"
        data-collapsed={isCollapsed ? 'true' : 'false'}
        className="mb-4 rounded-2xl relative p-3 lg:p-4"
        style={{
          border: '1px solid rgba(212, 175, 55, 0.18)',
          background: 'linear-gradient(180deg, rgba(212, 175, 55, 0.04), rgba(212, 175, 55, 0.01))',
        }}
      >
        {/* Header — clickable disclosure when 3+ tiles are stacked.
            Collapsed state surfaces a tiny X next to the chevron so the
            "Hide all for today" escape hatch is always one tap away
            without expanding the group. */}
        <div className="flex items-center justify-between gap-2 px-1 mb-3 lg:mb-4">
          <button
            type="button"
            data-testid="onboarding-prompts-group-toggle"
            onClick={() => setCollapsed(!isCollapsed)}
            className="flex-1 flex items-center gap-2 text-sm lg:text-base font-bold uppercase tracking-[0.15em] text-[var(--t)] transition-colors hover:text-[var(--gold)]"
            aria-expanded={!isCollapsed}
            aria-controls="onboarding-prompts-group-body"
          >
            <span data-testid="onboarding-prompts-group-label">Onboarding</span>
            {totalCount > 0 && (
              <span className="text-[var(--t4)] normal-case tracking-normal font-medium">
                — {totalCount} {totalCount === 1 ? 'prompt' : 'prompts'}
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 lg:w-5 lg:h-5 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
              strokeWidth={2.5}
            />
          </button>
          {/* Tiny X — only when collapsed, mirrors the gold-pill behavior
              at the bottom of the expanded view. */}
          {isCollapsed && (
            <button
              type="button"
              data-testid="onboarding-hide-all-today-mini"
              aria-label="Hide all onboarding prompts for today"
              title="Hide all for today"
              onClick={hideAllOnboardingForToday}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 lg:hover:scale-110"
              style={{
                background: 'rgba(255,255,255,0.10)',
                border: '1.5px solid rgba(255,255,255,0.30)',
                color: 'var(--t)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              }}
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Body — kept mounted always (display:none when collapsed)
            so per-tile dismiss flags + OnboardingWizard's
            `onContentChange` callback keep firing accurately. Uses
            `space-y-4` to enforce uniform 16px vertical gaps between
            EVERY tile inside the wrapper (QW, Pick Up, OnboardingWizard
            children, gold pill). */}
        <div id="onboarding-prompts-group-body" className="space-y-4" style={{ display: isCollapsed ? 'none' : 'block' }}>

      {/* QuickStart — two states:
          (1) Not yet complete: Resume CTA opens the modal at the last step.
          (2) Complete: shows a status tile with View PDF + Edit & regenerate.
          Both rely on the dashboard listening for the `carryon:resume-quickstart`
          event the DashboardLayout wires up to the QuickStartWizard modal. */}
      {(user?.role === 'benefactor' || user?.is_also_benefactor)
        && quickstartProgress
        && !quickstartProgress.complete
        && !resumeQwTileDismissed && (
        <div
          role="button"
          tabIndex={0}
          data-testid="resume-quickstart-btn"
          onClick={() => {
            try { sessionStorage.removeItem('carryon_quickstart_skipped_session'); } catch { /* ignore */ }
            window.dispatchEvent(new CustomEvent('carryon:resume-quickstart'));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              try { sessionStorage.removeItem('carryon_quickstart_skipped_session'); } catch { /* ignore */ }
              window.dispatchEvent(new CustomEvent('carryon:resume-quickstart'));
            }
          }}
          className="glass-card relative w-full p-4 lg:p-5 border-l-4 border-l-[#d4af37] text-left transition-transform duration-150 active:scale-[0.98] lg:hover:scale-[1.01] lg:hover:shadow-[0_12px_36px_-6px_rgba(var(--gold-rgb), 0.25)]"
          style={{ cursor: 'pointer' }}
        >
          {/* Prominent circle-X dismiss — session-scoped. Same look as the
              QuickStart-complete and Pick-Up-Where-You-Left-Off tiles. */}
          <button
            type="button"
            data-testid="resume-quickstart-tile-dismiss"
            aria-label="Hide this tile"
            onClick={(e) => {
              e.stopPropagation();
              try { sessionStorage.setItem('carryon_resume_qw_tile_dismissed', '1'); } catch { /* ignore */ }
              setResumeQwTileDismissed(true);
              toast.success('Hidden for this session. It will reappear next visit if the wizard is still incomplete.');
            }}
            className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 lg:hover:scale-110 z-10"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1.5px solid rgba(255,255,255,0.30)',
              color: 'var(--t)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.30)',
            }}
          ><X className="w-5 h-5" strokeWidth={2.5} /></button>

          <div className="flex items-center justify-between gap-3 pr-12">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex-shrink-0 w-10 h-10 lg:w-11 lg:h-11 rounded-full flex items-center justify-center"
                style={{
                  background: 'radial-gradient(circle, rgba(var(--gold-rgb), 0.22) 0%, rgba(var(--gold-rgb), 0.08) 70%)',
                  border: '1px solid rgba(var(--gold-rgb), 0.35)',
                }}
              >
                <Sparkles className="w-5 h-5" style={{ color: '#d4af37' }} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base lg:text-lg font-semibold text-[var(--t)] truncate">
                  Resume QuickStart Wizard
                </h3>
                <p className="text-xs lg:text-sm text-[var(--t4)] truncate">
                  {(() => {
                    const idx = Math.max(0, ['gate','welcome','residence','household','beneficiaries','properties','life_insurance','business','existing_documents','generate'].indexOf(quickstartProgress.current_step || 'gate'));
                    const total = 10;
                    return `${total - idx} step${total - idx === 1 ? '' : 's'} to your guide`;
                  })()}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 flex-shrink-0 text-[var(--t5)]" />
          </div>
        </div>
      )}

      {/* QuickStart complete — shows the guide-ready tile with two
          actions: open the PDF in the same preview portal the rest of
          the platform uses, and edit answers + regenerate without
          losing prior inputs.
          Layout: on narrow viewports (PWA / tablet) the headline +
          subtitle sit ABOVE the action buttons so the text never gets
          squeezed; from `lg:` up the original side-by-side row returns. */}
      {(user?.role === 'benefactor' || user?.is_also_benefactor)
        && quickstartProgress
        && quickstartProgress.complete
        && !quickstartTileDismissed && (
        <div
          data-testid="quickstart-complete-tile"
          className="glass-card w-full p-4 lg:p-5 border-l-4 border-l-[#d4af37] relative"
        >
          {/* Dismiss X — absolute top-right so the responsive
              column-stack never has to make room for it. Prominent
              circle-X style (Feb 26 2026) mirrored across every
              onboarding tile on the dashboard. */}
          <button
            type="button"
            data-testid="quickstart-tile-dismiss"
            aria-label="Hide this tile"
            title="Hide. Re-open from Settings → Appearance → QuickStart Tile on Dashboard."
            onClick={() => {
              try { localStorage.setItem('carryon_quickstart_tile_dismissed', '1'); } catch { /* ignore */ }
              setQuickstartTileDismissed(true);
              try { window.dispatchEvent(new CustomEvent('carryon:quickstart-tile-visibility-changed', { detail: { visible: false } })); } catch { /* ignore */ }
              toast.success('Tile hidden. Re-open it from Settings → Appearance → QuickStart Tile on Dashboard.');
            }}
            className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 lg:hover:scale-110 z-10"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1.5px solid rgba(255,255,255,0.30)',
              color: 'var(--t)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.30)',
            }}
          ><X className="w-5 h-5" strokeWidth={2.5} /></button>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:pr-14">
            {/* Headline + subtitle block. Sits ABOVE the buttons on
                narrow viewports; collapses to the left of the buttons
                from `lg:` up. `pr-12` reserves room for the absolute X. */}
            <div className="flex items-start gap-3 min-w-0 flex-1 pr-12 lg:pr-0">
              <div
                className="flex-shrink-0 w-10 h-10 lg:w-11 lg:h-11 rounded-full flex items-center justify-center"
                style={{
                  background: 'radial-gradient(circle, rgba(var(--gold-rgb), 0.22) 0%, rgba(var(--gold-rgb), 0.08) 70%)',
                  border: '1px solid rgba(var(--gold-rgb), 0.35)',
                }}
              >
                <Sparkles className="w-5 h-5" style={{ color: '#d4af37' }} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base lg:text-lg font-semibold text-[var(--t)]">
                  Your QuickStart Guide is ready
                </h3>
                <p className="text-xs lg:text-sm text-[var(--t4)]">
                  Saved to your Vault. Update anytime.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 self-end lg:self-auto">
              <button
                type="button"
                data-testid="quickstart-view-pdf-btn"
                onClick={async () => {
                  try {
                    const { openPdfPreview } = await import('../utils/openPdfPreview');
                    const apiClientMod = await import('../utils/apiClient');
                    await openPdfPreview({
                      pdfType: 'quickstart_guide',
                      title: 'QuickStart Estate Plan Guide',
                      subtitle: quickstartProgress?.data?.residence?.state || '',
                      filename: 'CarryOn_QuickStart_Guide.pdf',
                      blobFetcher: async () => {
                        const headers = getAuthHeaders().headers || {};
                        const res = await apiClientMod.default.get(
                          `${API_URL}/pdfs/latest/quickstart_guide`,
                          { headers, responseType: 'blob' },
                        );
                        return new Blob([res.data], { type: 'application/pdf' });
                      },
                    });
                  } catch (e) { console.error('QuickStart preview failed', e); }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs lg:text-sm font-bold transition-all active:scale-[0.97]"
                style={{ background: 'linear-gradient(135deg,#d4af37,#b8962e)', color: '#181818', boxShadow: '0 6px 18px rgba(var(--gold-rgb),0.25)' }}
              >View PDF</button>
              <button
                type="button"
                data-testid="quickstart-edit-btn"
                onClick={async () => {
                  try {
                    const apiClientMod = await import('../utils/apiClient');
                    await apiClientMod.default.post(`${API_URL}/quickstart/reopen`, {}, getAuthHeaders());
                    try { sessionStorage.removeItem('carryon_quickstart_skipped_session'); } catch { /* ignore */ }
                    window.dispatchEvent(new CustomEvent('carryon:quickstart-progress-changed'));
                    window.dispatchEvent(new CustomEvent('carryon:resume-quickstart'));
                  } catch (e) { console.error('QuickStart reopen failed', e); }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs lg:text-sm font-bold transition-all active:scale-[0.97]"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--t)', border: '1px solid rgba(255,255,255,0.15)' }}
              >Edit &amp; Regenerate</button>
            </div>
          </div>
        </div>
      )}

      {/* Pick Up Where You Left Off — visible when the wizard has been
          manually dismissed but the user still has incomplete onboarding
          steps. Re-opens the same guided overlay at the next step.
          Hidden entirely when the user has explicitly turned the
          Getting Started Guide OFF in Settings (`resume_banner_hidden`). */}
      {(user?.role === 'benefactor' || user?.is_also_benefactor) &&
       onboardingProgress?.manually_dismissed === true &&
       onboardingProgress?.resume_banner_hidden !== true &&
       !onboardingProgress?.all_complete &&
       !resumeGsTileDismissed &&
       (onboardingProgress?.steps || []).some(s => !s.completed) && (
        <div
          role="button"
          tabIndex={0}
          data-testid="resume-getting-started-btn"
          onClick={async () => {
            // Re-fetch progress to be safe — state may be stale if the
            // user completed a step in another tab/device.
            let prog = onboardingProgress;
            try {
              const res = await apiClient.get(`${API_URL}/onboarding/progress`, getAuthHeaders());
              prog = res.data;
              setOnboardingProgress(prog);
            } catch { /* fall back to cached progress */ }
            const steps = prog?.steps || [];
            const next = steps.find(s => !s.completed);
            if (!next) return;
            guidedDismissedRef.current = false;
            setGuidedStep({ ...next, beneficiary_names: prog?.beneficiary_names || [] });
            setShowGuidedFlow(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
          className="glass-card relative w-full p-4 lg:p-5 border-l-4 border-l-[#d4af37] text-left transition-transform duration-150 active:scale-[0.98] lg:hover:scale-[1.01] lg:hover:shadow-[0_12px_36px_-6px_rgba(var(--gold-rgb), 0.25)]"
          style={{ cursor: 'pointer' }}
        >
          {/* Prominent circle-X dismiss — session-scoped. */}
          <button
            type="button"
            data-testid="resume-getting-started-tile-dismiss"
            aria-label="Hide this tile"
            onClick={(e) => {
              e.stopPropagation();
              try { sessionStorage.setItem('carryon_resume_gs_tile_dismissed', '1'); } catch { /* ignore */ }
              setResumeGsTileDismissed(true);
              toast.success('Hidden for this session. To stop showing it permanently, toggle off the Getting Started Guide in Settings.');
            }}
            className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 lg:hover:scale-110 z-10"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1.5px solid rgba(255,255,255,0.30)',
              color: 'var(--t)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.30)',
            }}
          ><X className="w-5 h-5" strokeWidth={2.5} /></button>

          <div className="flex items-center justify-between gap-3 pr-12">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex-shrink-0 w-10 h-10 lg:w-11 lg:h-11 rounded-full flex items-center justify-center"
                style={{
                  background: 'radial-gradient(circle, rgba(var(--gold-rgb), 0.22) 0%, rgba(var(--gold-rgb), 0.08) 70%)',
                  border: '1px solid rgba(var(--gold-rgb), 0.35)',
                }}
              >
                <Play className="w-5 h-5" style={{ color: '#d4af37', fill: '#d4af37' }} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base lg:text-lg font-semibold text-[var(--t)] truncate">
                  Resume Setup Checklist
                </h3>
                <p className="text-xs lg:text-sm text-[var(--t4)] truncate">
                  {(() => {
                    const remaining = (onboardingProgress?.steps || []).filter(s => !s.completed).length;
                    return `${remaining} step${remaining === 1 ? '' : 's'} remaining`;
                  })()}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 flex-shrink-0 text-[var(--t5)]" />
          </div>
        </div>
      )}

        {/* OnboardingWizard children — main 8-step "Get Started",
            Welcome to Your Estate, How Offline Mode Works,
            Add Someone You Love. Kept mounted inside the body div
            (display:none when collapsed) so its `onContentChange`
            callback keeps firing and the disclosure count stays
            accurate. */}
        <TileErrorBoundary name="onboarding-wizard">
          <OnboardingWizard
            onAllComplete={() => { /* celebration handled by fetchEstateData via backend flag */ }}
            onContentChange={handleOnboardingWizardContent}
          />
        </TileErrorBoundary>

        {/* Gold pill — hides the whole group until next local midnight. */}
        <div className="flex justify-center pt-2">
          <button
            type="button"
            data-testid="onboarding-hide-all-today"
            onClick={hideAllOnboardingForToday}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs lg:text-sm font-bold transition-all active:scale-[0.96] lg:hover:scale-[1.03]"
            style={{
              background: 'linear-gradient(135deg, #d4af37, #b8962e)',
              color: '#181818',
              border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 6px 18px rgba(var(--gold-rgb), 0.30)',
              letterSpacing: '0.02em',
            }}
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
            Hide all for today
          </button>
        </div>
        </div>
      </div>
        );
      })()}

      {/* (Onboarding Wizard is rendered INSIDE the wrapper above — see "Getting Started Prompts Group") */}

      {/* CarryOn Financial Picture — Guide Tile (above gauge, only when empty & feature enabled) */}
      {isFeatureKeyEnabled('cfp', enabledFeatures) && financialSummary && (financialSummary.bills_count === 0 && financialSummary.debts_count === 0 && financialSummary.accounts_count === 0 && (financialSummary.property_count || 0) === 0) && (
      <div
        className="glass-card p-4 lg:p-6 mb-4 border-l-4 border-l-[#10b981] transition-transform duration-150 cursor-pointer active:scale-[0.98] lg:hover:scale-[1.01] lg:hover:shadow-[0_12px_36px_-6px_rgba(16,185,129,0.2)]"
        data-testid="cfp-guide-tile"
        onClick={() => navigate('/financial')}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-[#10b981]" />
            <div>
              <h3 className="text-base lg:text-lg font-semibold text-[var(--t)]">Build Your Financial Picture</h3>
              <p className="text-xs text-[var(--t4)]">Bills, debts, accounts, and property — get started now</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--t5)]" />
        </div>
      </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          Readiness + Stat Tiles surface
          User-customizable via Settings → Appearance → Dashboard View.
          Three desktop layouts: tiles-left (default), tiles-right,
          readiness-top. Mobile/PWA always uses the compact vertical
          flow regardless of `dashboardLayout` — too narrow to
          benefit from the side-by-side grid.

          The 6 readiness categories (in priority order Beneficiaries
          → IAC → MM → SDV → CFP → CCP) feed the same gauge AND the
          same key chips. Each tile maps 1:1 to a category. The
          gauge graphic respects `dashboardGauge` ('speedometer' or
          'circle').
          ════════════════════════════════════════════════════════════ */}
      {(() => {
        // Section-rollup ENTRIES (May 22 2026). Each entry = one of
        // the four benefactor menu sections; section vanishes from
        // the grid AND the key chips if its `chipPercent` is null
        // (= no tier-enabled scoreable features in that section).
        // Stats list rendered inside each tile uses the founder's
        // "Title - number" format (smaller, bold, no-wrap, one per
        // line). Each stat row is independently tier-gated against
        // its own feature key so users only see counts for features
        // they actually have.
        const billsN = financialSummary?.bills_count || 0;
        const debtsN = financialSummary?.debts_count || 0;
        const acctsN = financialSummary?.accounts_count || 0;
        const propN = financialSummary?.property_count || 0;
        const cfpN = billsN + debtsN + acctsN + propN;
        const buildStats = (rows) =>
          rows.filter((r) => r && isFeatureKeyEnabled(r.featureKey, enabledFeatures))
            .map((r) => ({ title: r.title, value: r.value }));
        const ENTRIES = [
          sectionPercents.estate !== null && {
            key: 'estate',
            chipColor: '#3B82F6',
            chipPercent: sectionPercents.estate,
            chipLabel: 'Legacy',
            tile: (
              <SectionStatCard
                icon={Heart}
                title="Legacy"
                accent="#3B82F6"
                stats={buildStats([
                  { featureKey: 'beneficiaries', title: 'Beneficiaries', value: stats.beneficiaries },
                  { featureKey: 'mm', title: 'Messages', value: stats.messages },
                  { featureKey: 'ffn', title: 'FFN', value: stats.ffn },
                ])}
                onClick={() => navigate('/section/estate')}
                sectionKey="estate"
              />
            ),
          },
          sectionPercents.vault !== null && {
            key: 'vault',
            chipColor: '#d4af37',
            chipPercent: sectionPercents.vault,
            chipLabel: 'Vault',
            tile: (
              <SectionStatCard
                icon={Lock}
                title="Vault"
                accent="#d4af37"
                stats={buildStats([
                  { featureKey: 'sdv', title: 'Documents', value: stats.documents },
                  { featureKey: 'dav', title: 'Digital', value: stats.dav },
                ])}
                onClick={() => navigate('/section/vault')}
                sectionKey="vault"
              />
            ),
          },
          sectionPercents.financial !== null && {
            key: 'financial',
            chipColor: '#22C993',
            chipPercent: sectionPercents.financial,
            chipLabel: 'Financial',
            tile: (
              <SectionStatCard
                icon={Landmark}
                title="Financial"
                accent="#22C993"
                stats={buildStats([
                  { featureKey: 'cfp', title: 'Financials', value: cfpN },
                  { featureKey: 'ces', title: 'Entities', value: stats.ces },
                ])}
                onClick={() => navigate('/section/financial')}
                sectionKey="financial"
              />
            ),
          },
          sectionPercents.preparedness !== null && {
            key: 'preparedness',
            chipColor: '#B794F6',
            chipPercent: sectionPercents.preparedness,
            chipLabel: 'Preparedness',
            tile: (
              <SectionStatCard
                icon={Clock}
                title="Preparedness"
                accent="#B794F6"
                stats={buildStats([
                  { featureKey: 'iac', title: 'Checklist', value: totalTasks },
                  { featureKey: 'ccp', title: 'CCP plans', value: stats.ccp_plans },
                ])}
                onClick={() => navigate('/section/preparedness')}
                sectionKey="preparedness"
              />
            ),
          },
        ].filter(Boolean);

        // Compact key chips (used in side-by-side layouts where
        // horizontal real-estate beside the gauge is tight).
        // size === 'lg' is used by the Readiness Top layout where the
        // chips are absolutely positioned in the empty corner beside
        // the gauge — roughly 2x the default font for legibility.
        const CHIP_SIZES = {
          sm: { dot: 8, font: 12, gap: 6,  pad: 'px-3 py-2' },
          md: { dot: 10, font: 14, gap: 6,  pad: 'px-4 py-3' },
          lg: { dot: 14, font: 24, gap: 10, pad: 'px-5 py-4' },
        };
        // `columns` lets the dial card lay out the 6 entries in a
        // 2-col × 3-row grid instead of a single tall column, which
        // is critical for matching the chiclet grid's height in the
        // 50/50 side-by-side desktop layout.
        const KeyChips = ({ size = 'md', columns = 1 }) => {
          const cfg = CHIP_SIZES[size] || CHIP_SIZES.md;
          return (
            <div
              className={`rounded-xl ${cfg.pad}`}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                columnGap: 24,
                rowGap: cfg.gap,
              }}
            >
              {ENTRIES.map((e) => (
                <div key={e.key} className="flex items-center gap-2">
                  <span
                    className="rounded-full flex-shrink-0"
                    style={{
                      background: e.chipColor,
                      // Dot tracks the chip-text clamp above so the
                      // dot and label scale together.
                      width: `clamp(${Math.max(8, cfg.dot - 2)}px, calc(var(--app-100vw, 100vw) * 0.007), ${cfg.dot + 4}px)`,
                      height: `clamp(${Math.max(8, cfg.dot - 2)}px, calc(var(--app-100vw, 100vw) * 0.007), ${cfg.dot + 4}px)`,
                    }}
                  />
                  <span
                    className="text-[var(--t4)] font-bold whitespace-nowrap"
                    // Tighter clamp — the chips have to fit between
                    // the BNDR + EGA corner buttons in the side
                    // layout, so we shrink eagerly. Floor cfg.font−1,
                    // viewport multiplier 0.010, ceiling cfg.font+6.
                    // Bumped tighter May 22 2026 per founder mandate
                    // ("shrink to accommodate the buttons").
                    style={{ fontSize: `clamp(${Math.max(10, cfg.font - 1)}px, calc(var(--app-100vw, 100vw) * 0.010), ${cfg.font + 6}px)` }}
                  >
                    {e.chipPercent}% {e.chipLabel}
                  </span>
                </div>
              ))}
            </div>
          );
        };

        // The readiness card shell — gauge + responsive heading. Used
        // by all three layouts; the variant just controls the wrap.
        // For the `dense` (Readiness Top) layout we float the key
        // chips into the empty top-right corner, bump the title size
        // and tighten vertical padding so the box stays proportional
        // to the gauge inside it.
        const ReadinessCard = ({ keyChipsPosition = 'top-right', dense = false }) => (
          <div className={`glass-card relative ${dense ? 'p-4 lg:px-6 lg:py-4' : 'p-5 lg:p-8'} mb-4`} data-testid="readiness-card">
            <h2 className={`${dense ? 'text-lg sm:text-xl md:text-2xl lg:text-4xl xl:text-5xl 2xl:text-6xl mb-2 lg:mb-3' : 'text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl mb-4 lg:mb-5'} whitespace-nowrap font-bold text-[var(--t)] uppercase tracking-wider text-center`} style={{ fontFamily: 'var(--sans)' }}>
              Total Estate Readiness
            </h2>
            {keyChipsPosition === 'top-right' && !dense && (
              <div className="hidden lg:flex lg:justify-end lg:mb-4 lg:px-2">
                <KeyChips />
              </div>
            )}
            {/* Dense layout: chips float in the empty corner beside the
                gauge so they don't add to the box height. */}
            {keyChipsPosition === 'top-right' && dense && (
              <div className="hidden lg:block absolute top-6 right-6 z-10">
                <KeyChips size="lg" />
              </div>
            )}
            {/* Mobile/PWA key — split-corner layout. With at most 4
                section entries it's a clean 2-and-2 split (was 3-and-3
                when there were 6 per-feature entries). When the user's
                tier disables a whole section, that section quietly
                drops out and the remaining entries reflow. */}
            <div className="flex justify-between mb-3 px-2 lg:hidden">
              <div className="flex flex-col gap-1">
                {ENTRIES.slice(0, 2).map((e) => (
                  <div key={e.key} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.chipColor }} />
                    <span className="text-[var(--t4)] font-bold" style={{ fontSize: 'clamp(12px, calc(var(--app-100vw, 100vw) * 0.032), 14px)' }}>{e.chipPercent}% {e.chipLabel}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1 items-end">
                {ENTRIES.slice(2, 4).map((e) => (
                  <div key={e.key} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.chipColor }} />
                    <span className="text-[var(--t4)] font-bold" style={{ fontSize: 'clamp(12px, calc(var(--app-100vw, 100vw) * 0.032), 14px)' }}>{e.chipPercent}% {e.chipLabel}</span>
                  </div>
                ))}
              </div>
            </div>
            <ReadinessDial score={readinessScore} id="readiness" labelText={scoreInfo.label} labelColor={scoreInfo.color} />
            {/* Bottom-right EGA + bottom-left BNDR pills. Each owns a
                tiny freshness stamp under the icon. */}
            <EgaQuickLink testId="readiness-ega-quicklink" lastAnalyzedAt={lastEgaAt} />
            <EstateBinderButton lastGeneratedAt={lastBinderAt} />
          </div>
        );

        const TilesGrid = ({ chiclet = false }) => (
          <div
            className={
              chiclet
                ? 'grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4'
                : 'grid grid-cols-2 gap-3 mb-4'
            }
            data-testid="dashboard-stat-grid"
          >
            {ENTRIES.map((e) => (
              <React.Fragment key={e.key}>{e.tile}</React.Fragment>
            ))}
          </div>
        );

        // Full-width banner shown ABOVE the readiness dial whenever
        // Estate Guardian is generating in the background. Stretches
        // across the dashboard so the user instantly sees the live
        // status without scrolling past the tiles.
        const EgaBanner = () => (
          egaRunning && isFeatureKeyEnabled('ega', enabledFeatures) ? (
            <div
              className="flex items-start gap-2.5 w-full px-4 py-3 rounded-xl text-sm font-bold mb-4"
              style={{ background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.20)', color: '#d4af37' }}
              data-testid="ega-running-banner"
            >
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">
                <div>Estate Guardian is generating IAC items — counts will update automatically.</div>
                <div className="font-normal text-[var(--t4)] mt-1">This usually takes 1–3 minutes. Your documents never leave your AES-256 encrypted vault — feel free to navigate to another tab and we'll notify you when it's done.</div>
              </div>
            </div>
          ) : null
        );

        // Mobile/PWA: always vertical readiness-top → 2-col tiles.
        const mobileBlock = (
          <div className="lg:hidden">
            <EgaBanner />
            <ReadinessCard />
            <TilesGrid />
          </div>
        );

        // Desktop: switch on user pref.
        let desktopBlock = null;
        if (dashboardLayout === 'readiness-top') {
          desktopBlock = (
            <div className="hidden lg:block">
              <EgaBanner />
              <ReadinessCard dense />
              <TilesGrid chiclet />
            </div>
          );
        } else {
          // Side-by-side layouts. tiles-left puts the tile grid on the
          // LEFT and the readiness card on the RIGHT (default). tiles-
          // right reverses it. The 380-col reservation for the dial is
          // wide enough to never clip the 6 chips at 13" laptop widths.
          const _coreTitle = joinBrandSuffix(brand, 'Core Pillars');
          // Scale font + allow wrap when the branded title is long
          // (e.g., "The People's Insurance Co. Core Pillars" was
          // getting clipped at the right edge of the card).
          const _coreLong = _coreTitle.length > 22;
          const tiles = (
            <div className="lg:col-span-1">
              <div className="glass-card p-4 lg:p-5 h-full flex flex-col" data-testid="core-pillars-card">
                <h2
                  className={`${_coreLong ? 'text-xl sm:text-2xl lg:text-3xl' : 'text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl whitespace-nowrap'} font-semibold text-[var(--t)] mb-4 text-center tracking-tight break-words`}
                  style={{ fontFamily: 'var(--serif)' }}
                >
                  {_coreTitle}
                </h2>
                {/*
                  Uniform cells via flex-1 grid + auto-rows 1fr:
                  - Chiclet card matches the gauge card's height via the
                    outer grid's `align-items: stretch`.
                  - `flex-1` lets this grid take all remaining card
                    height after the header.
                  - `gridAutoRows: minmax(0, 1fr)` forces both rows to
                    share that height EQUALLY regardless of which label
                    wraps to more lines.
                  - StatCards use `h-full w-full overflow-hidden` so no
                    tile can grow taller than its neighbour or spill
                    content into adjacent tiles.
                */}
                <div
                  className="grid grid-cols-2 gap-4 flex-1"
                  style={{ gridAutoRows: 'minmax(0, 1fr)' }}
                  data-testid="dashboard-stat-grid"
                >
                  {ENTRIES.map((e) => (
                    <React.Fragment key={e.key}>{e.tile}</React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          );
          const dial = (
            <div className="lg:col-span-1">
              <div className="glass-card relative p-4 lg:p-5 h-full flex flex-col" data-testid="readiness-card-side">
                <h2
                  className="text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl whitespace-nowrap font-semibold text-[var(--t)] mb-4 text-center tracking-tight"
                  style={{ fontFamily: 'var(--serif)' }}
                >
                  Total Estate Readiness
                </h2>
                <div className="flex-1 flex items-center justify-center">
                  <ReadinessDial score={readinessScore} id="readiness-side" labelText={scoreInfo.label} labelColor={scoreInfo.color} />
                </div>
                <div
                  className="mt-3 flex justify-center w-full"
                  // Sandwich the key between the fixed-size 56×56 px
                  // BNDR (bottom-left) and EGA (bottom-right) buttons
                  // that float over this card. Padding = button width
                  // (56) + breathing room (16) so the chips can never
                  // overlap the corner buttons. Per founder mandate
                  // May 22 2026: key SHRINKS to fit, buttons stay put.
                  style={{ paddingLeft: 72, paddingRight: 72 }}
                  data-testid="readiness-key-sandwich"
                >
                  <KeyChips size="md" columns={2} />
                </div>
                {/* Bottom-right EGA + bottom-left BNDR pills (side
                    layout). Each owns its own freshness stamp. */}
                <EgaQuickLink testId="readiness-ega-quicklink-side" />
                <EstateBinderButton />
              </div>
            </div>
          );
          desktopBlock = (
            <div className="hidden lg:block">
              <EgaBanner />
              <div className="grid grid-cols-2 gap-4 mb-4">
                {dashboardLayout === 'tiles-right' ? <>{dial}{tiles}</> : <>{tiles}{dial}</>}
              </div>
            </div>
          );
        }

        return (
          <>
            {desktopBlock}
            {mobileBlock}
          </>
        );
      })()}

      {/* Bottom Section - Messages, Checklist, Vault & Financial Previews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Milestone Messages Preview - Purple */}
        {isFeatureKeyEnabled('mm', enabledFeatures) && (
        <div 
          className="glass-card p-4 lg:p-6 border-l-4 border-l-[#8b5cf6] transition-transform duration-150 cursor-pointer active:scale-[0.98] lg:hover:scale-[1.02] lg:hover:shadow-[0_12px_36px_-6px_rgba(139,92,246,0.3)]"
          data-testid="preview-messages"
          onClick={() => navigate('/messages')}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#8b5cf6]" />
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--t)]">{cleanLabel("Milestone Messages (MM)")}</h3>
            </div>
            <span className="text-[var(--t4)] text-sm">
              {stats.messages} message{stats.messages !== 1 ? 's' : ''}
            </span>
          </div>
          {stats.messages > 0 ? (
            <div className="flex items-center gap-3 p-3 bg-[#8b5cf6]/10 rounded-lg">
              <MessageSquare className="w-5 h-5 text-[#8b5cf6]" />
              <span className="text-[var(--t3)] text-sm">Messages ready for your loved ones</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-[var(--s)] rounded-lg">
              <Clock className="w-5 h-5 text-[var(--t5)]" />
              <span className="text-[var(--t4)] text-sm">No messages yet</span>
            </div>
          )}
          <button 
            onClick={() => navigate('/messages')}
            className="mt-2 text-[#8b5cf6] hover:text-[#a78bfa] text-base font-medium flex items-center gap-1"
            data-testid="preview-messages-link"
          >
            Create Message <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        )}

        {/* Immediate Action Checklist Preview - Orange */}
        {isFeatureKeyEnabled('iac', enabledFeatures) && (
        <div 
          className="glass-card p-4 lg:p-6 border-l-4 border-l-[#f97316] transition-transform duration-150 cursor-pointer active:scale-[0.98] lg:hover:scale-[1.02] lg:hover:shadow-[0_12px_36px_-6px_rgba(249,115,22,0.3)]"
          data-testid="preview-checklist"
          onClick={() => navigate('/checklist')}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-[#f97316]" />
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--t)]">Action Checklist</h3>
            </div>
            <span className="text-[var(--t4)] text-sm">
              {completedTasks}/{totalTasks} done
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-[var(--b)] rounded-full overflow-hidden mb-3">
            <div 
              className="h-full rounded-full transition-all"
              style={{ 
                background: 'linear-gradient(90deg, #f97316, #ea580c)',
                width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%` 
              }}
            />
          </div>
          {/* Recent checklist items */}
          <div className="space-y-1.5">
            {checklists.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                {item.is_completed ? (
                  <CheckCircle2 className="w-4 h-4 text-[#f97316] flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-[var(--t5)] flex-shrink-0" />
                )}
                <span className={`truncate ${item.is_completed ? 'text-[var(--t4)] line-through' : 'text-[var(--t3)]'}`}>
                  {item.title}
                </span>
              </div>
            ))}
            {checklists.length === 0 && (
              <div className="flex items-center gap-3 p-3 bg-[var(--s)] rounded-lg">
                <Clock className="w-5 h-5 text-[var(--t5)]" />
                <span className="text-[var(--t4)] text-sm">No checklist items yet</span>
              </div>
            )}
          </div>
          <button 
            onClick={() => navigate('/checklist')}
            className="mt-2 text-[#f97316] hover:text-[#fb923c] text-base font-medium flex items-center gap-1"
            data-testid="preview-checklist-link"
          >
            View Full Checklist <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        )}

        {/* Secure Document Vault Preview - Blue */}
        {isFeatureKeyEnabled('sdv', enabledFeatures) && (
        <div 
          className="glass-card p-4 lg:p-6 border-l-4 border-l-[#2563eb] transition-transform duration-150 cursor-pointer active:scale-[0.98] lg:hover:scale-[1.02] lg:hover:shadow-[0_12px_36px_-6px_rgba(37,99,235,0.3)]"
          data-testid="preview-vault"
          onClick={() => navigate('/vault')}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderLock className="w-5 h-5 text-[#2563eb]" />
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--t)]">{cleanLabel("Secure Document Vault (SDV)")}</h3>
            </div>
            <span className="text-[var(--t4)] text-sm">
              {stats.documents > 0 ? `${(stats.documents * 0.5).toFixed(0)} MB` : '0 MB'} / 10 GB
            </span>
          </div>
          <div className="h-2 bg-[var(--b)] rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all"
              style={{ 
                background: 'linear-gradient(90deg, #2563eb, #1e3a8a)',
                width: `${Math.min(100, (stats.documents * 0.5 / 10000) * 100)}%` 
              }}
            />
          </div>
          <p className="text-[var(--t4)] text-sm mt-2">{stats.documents} document{stats.documents !== 1 ? 's' : ''} encrypted</p>
          <button 
            onClick={() => navigate('/vault')}
            className="mt-2 text-[#2563eb] hover:text-[#3b82f6] text-base font-medium flex items-center gap-1"
            data-testid="preview-vault-link"
          >
            View All Documents <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        )}

        {/* Financial Picture Preview - Green */}
        {isFeatureKeyEnabled('cfp', enabledFeatures) && (
        <div 
          className="glass-card p-4 lg:p-6 border-l-4 border-l-[#10b981] transition-transform duration-150 cursor-pointer active:scale-[0.98] lg:hover:scale-[1.02] lg:hover:shadow-[0_12px_36px_-6px_rgba(16,185,129,0.3)]"
          data-testid="preview-financial"
          onClick={() => navigate('/financial')}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#10b981]" />
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--t)]">{buildBrandedLabel(brand, 'Financial Picture (CFP)')}</h3>
            </div>
            <span className="text-[var(--t4)] text-sm">
              {financialSummary ? `${(financialSummary.bills_count || 0) + (financialSummary.debts_count || 0) + (financialSummary.accounts_count || 0) + (financialSummary.property_count || 0)} items` : '0 items'}
            </span>
          </div>
          {financialSummary && (financialSummary.bills_count > 0 || financialSummary.debts_count > 0 || financialSummary.accounts_count > 0 || (financialSummary.property_count || 0) > 0) ? (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <div className="text-sm font-bold text-[var(--t)]">${(financialSummary.monthly_total || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo</div>
                  <div className="text-[11px] text-[var(--t5)]">{financialSummary.bills_count} Bills</div>
                </div>
                <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                  <div className="text-sm font-bold text-[var(--t)]">${(financialSummary.total_assets || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                  <div className="text-[11px] text-[var(--t5)]">Total Assets</div>
                </div>
              </div>
              {financialSummary.upcoming_bills?.length > 0 && (
                <div className="space-y-1">
                  {financialSummary.upcoming_bills.slice(0, 2).map(bill => (
                    <div key={bill.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Receipt className="w-3 h-3 text-[#10b981] flex-shrink-0" />
                        <span className="text-[var(--t3)] truncate">{bill.name}</span>
                      </div>
                      <span className="text-[var(--t5)] flex-shrink-0">{bill.days_until === 0 ? 'Today' : `${bill.days_until}d`}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-[var(--s)] rounded-lg">
              <Clock className="w-5 h-5 text-[var(--t5)]" />
              <span className="text-[var(--t4)] text-sm">No financial data yet</span>
            </div>
          )}
          <button 
            onClick={() => navigate('/financial')}
            className="mt-2 text-[#10b981] hover:text-[#34d399] text-base font-medium flex items-center gap-1"
            data-testid="preview-financial-link"
          >
            View Financial Picture <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        )}

        {/* Share your CarryOn — gold pill button at the bottom of the dashboard.
            `lg:col-span-2` makes the pill span the FULL width of the 2-column
            dashboard grid on desktop (otherwise it would sit in a single
            grid cell and appear left-justified). Inside that full span
            `flex justify-center` + `lg:max-w-md` caps the pill's width
            and centers it horizontally across the full dashboard content. */}
        <div className="mt-4 mb-2 px-1 lg:col-span-2 lg:flex lg:justify-center" data-testid="dashboard-share-tile">
          <div className="w-full lg:max-w-md">
            <TileErrorBoundary name="share-your-carryon">
              <ShareYourCarryOn variant="pill" />
            </TileErrorBoundary>
          </div>
        </div>
      </div>
      {showCelebration && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto" data-testid="celebration-overlay"
          style={{ animation: 'guidedOverlayIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
          <style>{`
            @keyframes celebrationBounce {
              0% { opacity: 0; transform: scale(0.7) translateY(40px); }
              50% { transform: scale(1.05) translateY(-10px); }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
          <div className="absolute inset-0" style={{
            backdropFilter: 'blur(20px) saturate(130%)',
            WebkitBackdropFilter: 'blur(20px) saturate(130%)',
            background: 'var(--guided-overlay-bg, rgba(8,14,26,0.75))',
          }} />
          <button onClick={handleCelebrationDismiss}
            className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all"
            style={{ color: 'var(--guided-muted, rgba(255,255,255,0.4))' }}
            data-testid="celebration-close-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="relative max-w-lg w-full mx-6 text-center p-8 rounded-3xl"
            style={{
              animation: 'celebrationBounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both',
              background: 'radial-gradient(ellipse at center, rgba(var(--gold-rgb), 0.08) 0%, transparent 70%)',
              border: '1px solid rgba(var(--gold-rgb), 0.15)',
            }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '2px solid rgba(var(--gold-rgb), 0.3)' }}>
              <Sparkles className="w-10 h-10 text-[var(--gold)]" />
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold mb-4"
              style={{ fontFamily: 'var(--sans)', color: 'var(--guided-title, #ffffff)' }}>
              Congratulations!
            </h1>
            <p className="text-base lg:text-lg mb-2 max-w-sm mx-auto leading-relaxed"
              style={{ color: 'var(--guided-desc, #94a3b8)' }}>
              You have completed the initial creation of your estate plan. Welcome to {brand} — continue exploring and building the security your family deserves!
            </p>
            <p className="text-xs mb-8 max-w-sm mx-auto"
              style={{ color: 'var(--guided-skip, #64748b)' }}>
              If you wish to view the Getting Started steps again, you can re-enable it in Settings.
            </p>
            <button onClick={handleCelebrationDismiss}
              className="w-full max-w-xs mx-auto py-4 rounded-2xl text-base font-bold transition-transform active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: 'var(--bg)', boxShadow: '0 8px 32px rgba(var(--gold-rgb), 0.3)' }}
              data-testid="celebration-explore-btn">
              Explore Your Dashboard
            </button>
          </div>
        </div>
      )}
      {renderGuidedOverlay()}
      <PushPrompt getAuthHeaders={getAuthHeaders} />
    </div>
  );
};

export default DashboardPage;
