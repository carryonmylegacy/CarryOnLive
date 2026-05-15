import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth, useBrand } from '../contexts/AuthContext';
import { useLabelCleaner } from '../utils/brandLabel';
import { cachedGet } from '../utils/apiCache';
import { isFeatureKeyEnabled, isFeatureEnabled } from '../utils/featureGates';
import { SpeedometerGauge, StatCard } from '../components/dashboard/DashboardWidgets';
import { ReadinessDial } from '../components/dashboard/ReadinessDial';
import { useDashboardPrefs } from '../hooks/useDashboardPrefs';
import { 
  FolderLock, 
  MessageSquare, 
  Users, 
  CheckSquare,
  ChevronRight,
  Clock,
  CheckCircle2,
  Circle,
  X,
  Sparkles,
  KeyRound,
  ArrowLeftRight,
  Loader2,
  DollarSign,
  Receipt,
  TrendingUp,
  ShieldAlert
} from 'lucide-react';
import TrialBanner from '../components/TrialBanner';
import BillingStatusBanner from '../components/BillingStatusBanner';
import OnboardingWizard from '../components/OnboardingWizard';
import ShareYourCarryOn from '../components/ShareYourCarryOn';
import OfflineStorageWidget from '../components/dashboard/OfflineStorageWidget';
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

const DashboardPage = () => {
  const { user, getAuthHeaders, enabledFeatures, refreshEnabledFeatures } = useAuth();
  const brand = useBrand();
  const cleanLabel = useLabelCleaner();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [estates, setEstates] = useState([]);
  const [estate, setEstate] = useState(null);
  const [checklists, setChecklists] = useState([]);
  const [stats, setStats] = useState({ documents: 0, messages: 0, beneficiaries: 0, ccp_plans: 0 });
  const [readiness, setReadiness] = useState({ documents: { score: 0 }, messages: { score: 0 }, checklist: { score: 0 } });
  const [financialSummary, setFinancialSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);
  const [justCompletedActivation, setJustCompletedActivation] = useState(false);
  const [showGuidedFlow, setShowGuidedFlow] = useState(false);
  const [guidedStep, setGuidedStep] = useState(null);
  const [showWelcomeStep, setShowWelcomeStep] = useState(false);
  const [showOptionalSkipInfo, setShowOptionalSkipInfo] = useState(false);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [egaRunning, setEgaRunning] = useState(false);
  const guidedDismissedRef = useRef(false);
  const lastCompletedAtRef = useRef(null);

  const handleCelebrationDismiss = () => {
    setShowCelebration(false);
    setJustCompletedActivation(true);
    setTimeout(() => sessionStorage.setItem('carryon_first_explore', 'done'), 100);
  };

  useEffect(() => { fetchEstates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (estate?.id) fetchEstateData(estate.id); }, [estate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Fix: hold the reveal until the network fetch completes (or a 2s
    // safety timeout fires for genuinely-slow networks). Cache values
    // are still applied to state immediately so the dashboard is
    // already rendered to its final tiles when reveal fires.
    let revealedFromCache = false;
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
        // Note: do NOT call setLoading(false) here — we keep the splash
        // up until the network fetch lands so we don't get a blank
        // window between "splash gone" and "dashboard revealed".
        // Safety timer: if the network fetch is still in flight after
        // 2s, reveal with the cached values rather than block the user
        // staring at a splash on slow connections.
        if (!revealedFromCache) {
          revealedFromCache = true;
          setTimeout(() => {
            setLoading(false);
            requestAnimationFrame(() => requestAnimationFrame(() => setDashboardReady(true)));
          }, 2000);
        }
      }
    } catch { /* non-fatal */ }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Genuinely offline — reveal with cached values now since no
      // network update is coming. (The 2s safety timer would also
      // fire, but doing it eagerly avoids a needless 2s splash hold.)
      setLoading(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setDashboardReady(true)));
      return;
    }
    try {
      // Read the prior cached ccp_plans count BEFORE we touch the
      // network. Used as a fallback when /ccp/plans fails — guarantees
      // we don't overwrite a previously-known real count (e.g. 1) with
      // 0 just because the request hiccuped.
      let priorCcpCount = 0;
      try {
        const prior = await getLocalDashboardTile(estateId);
        if (typeof prior?.stats?.ccp_plans === 'number') priorCcpCount = prior.stats.ccp_plans;
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
      // a tick later — previously it fired on a separate axios.get().
      // Without this, CFP visibly jumped from 0 → real *after* the
      // dashboard had already faded in.
      const [docsRes, msgsRes, bensRes, checklistRes, readinessRes, progressRes, ccpRes, financialRes] = await Promise.all([
        axios.get(`${API_URL}/documents/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/messages/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/beneficiaries/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/checklists/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/estate/${estateId}/readiness`, getAuthHeaders()).catch(() => null),
        axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders()).catch(() => null),
        axios.get(`${API_URL}/ccp/plans/${estateId}`, getAuthHeaders()).catch((err) => {
          // Surface the failure so we can debug "ccp tile stuck at 0"
          // bugs without silent log loss. Returning null lets ccpCount
          // below fall back to the cached count instead of 0.
          console.warn('[dashboard] /ccp/plans fetch failed:', err?.response?.status || err?.message);
          return null;
        }),
        axios.get(`${API_URL}/financial/summary/${estateId}`, getAuthHeaders()).catch((err) => {
          // Same protection as ccp_plans: do NOT collapse a transient
          // network failure into a `0` CFP tile. Return null so the
          // fallback below preserves the prior cached summary.
          console.warn('[dashboard] /financial/summary fetch failed:', err?.response?.status || err?.message);
          return null;
        }),
      ]);
      // Preserve the previously-known count when the request failed.
      // Reading from the cache (priorCcpCount) is the right fallback —
      // the React-state closure is stale (initial useState default of
      // 0) at this point in fetchEstateData.
      const ccpCount = Array.isArray(ccpRes?.data) ? ccpRes.data.length : priorCcpCount;
      const statsPayload = {
        documents: docsRes.data.length,
        messages: msgsRes.data.length,
        beneficiaries: bensRes.data.length,
        ccp_plans: ccpCount,
      };
      const financialPayload = financialRes?.data ?? priorFinancial;
      // ── Single batched render so every tile (Beneficiaries, IAC,
      // MM, SDV, CCP, CFP) updates in the same tick. Eliminates the
      // visible "0 → real" jump on CFP/CCP that the user reported.
      setStats(statsPayload);
      setFinancialSummary(financialPayload);
      setChecklists(checklistRes.data);
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
      }).catch(() => {});
      // Also mirror the readiness scorecard into its own singleton table.
      if (readinessRes) {
        upsertLocalReadiness(estateId, readinessRes.data).catch(() => {});
      }

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
            try { axios.post(`${API_URL}/onboarding/celebration-shown`, {}, getAuthHeaders()); } catch {}
            setTimeout(() => setShowCelebration(true), 600);
          }
        }
      }
    } catch (error) { console.error('Fetch estate data error:', error); }
    finally {
      setLoading(false);
      // Delay reveal until overlay is rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setDashboardReady(true));
      });
    }
  };

  // Update ref after fetchEstateData is defined
  fetchEstateDataRef.current = fetchEstateData;

  // Poll for EGA IAC generation task status (real-time updates)
  useEffect(() => {
    if (!estate?.id) return;
    // Skip polling when EGA is gated for this user's tier
    if (!isFeatureKeyEnabled('ega', enabledFeatures)) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await axios.get(`${API_URL}/guardian/iac-task-status`, getAuthHeadersRef.current());
        if (!active) return;
        const task = res.data;
        if (task.status === 'running') {
          setEgaRunning(true);
        } else if (task.status === 'completed' && task.completed_at) {
          setEgaRunning(false);
          // Only refresh + toast when a new completion is detected.
          // We DON'T toast on the very first poll of a user's session
          // (lastCompletedAtRef.current is null), because that would
          // surface a stale "X items added!" notice for a run that
          // finished hours ago and the user already moved on from.
          if (lastCompletedAtRef.current && lastCompletedAtRef.current !== task.completed_at) {
            fetchEstateDataRef.current?.(estate.id);
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
      } catch { /* silent */ }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => { active = false; clearInterval(interval); };
  }, [estate?.id, enabledFeatures]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // CCP: 100% if at least one Emergency Plan exists, else 0%.
  // Both heuristics intentionally simple — they reward the user for
  // *having configured anything at all*, not for sophistication.
  const beneficiariesPercent = Math.min(100, Math.round(((stats.beneficiaries || 0) / 3) * 100));
  const ccpPercent = (stats.ccp_plans || 0) > 0 ? 100 : 0;

  // Weighted overall readiness — priority order (Beneficiaries → IAC →
  // MM → SDV → CFP → CCP) maps to weights 6..1. Total weight = 21.
  // We override the backend's `overall_score` so the gauge always
  // reflects all six tiles even before the backend learns about
  // beneficiaries + CCP. The colored chips beside the gauge use the
  // same per-category percents, so the math is fully transparent.
  const READINESS_WEIGHTS = {
    beneficiaries: 6,
    checklist: 5,
    messages: 4,
    documents: 3,
    financials: 2,
    ccp: 1,
  };
  const weightedSum =
    beneficiariesPercent * READINESS_WEIGHTS.beneficiaries +
    checklistPercent * READINESS_WEIGHTS.checklist +
    msgsPercent * READINESS_WEIGHTS.messages +
    docsPercent * READINESS_WEIGHTS.documents +
    financialsPercent * READINESS_WEIGHTS.financials +
    ccpPercent * READINESS_WEIGHTS.ccp;
  const totalWeight = Object.values(READINESS_WEIGHTS).reduce((a, b) => a + b, 0);
  const readinessScore = Math.round(weightedSum / totalWeight);

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
      create_message: { title: 'Write a Short Message', desc: "You'll give your message a simple title like \"To My Family,\" then write a few words from the heart. That's all — just two easy steps.", step: 2 },
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
        await axios.post(`${API_URL}/onboarding/complete-step/${guidedStep.key}`, {}, getAuthHeaders());
      } catch {}
      setShowOptionalSkipInfo(false);
      // Advance to the next step instead of dismissing entirely
      if (estate?.id) {
        try {
          const progressRes = await axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders());
          const steps = progressRes.data?.steps || [];
          const nextIncomplete = steps.find(s => !s.completed);
          if (nextIncomplete && !progressRes.data?.all_complete) {
            setGuidedStep({ ...nextIncomplete, beneficiary_names: progressRes.data?.beneficiary_names || [] });
            return; // Stay in guided flow with the next step
          } else if (progressRes.data?.all_complete && !progressRes.data?.celebration_shown) {
            guidedDismissedRef.current = true;
            setShowGuidedFlow(false);
            try { axios.post(`${API_URL}/onboarding/celebration-shown`, {}, getAuthHeaders()); } catch {}
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
                background: 'radial-gradient(circle, rgba(212,175,55,0.2) 0%, rgba(96,165,250,0.08) 70%)',
                border: '2px solid rgba(212,175,55,0.35)',
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
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: 'var(--bg)', boxShadow: '0 8px 32px rgba(212,175,55,0.3)' }}
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

      {/* "Storage used offline" — only renders when the user has pinned docs */}
      <div className="mb-5">
        <OfflineStorageWidget />
      </div>

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

      {/* Onboarding Wizard — shown early so it's visible on mobile */}
      <TileErrorBoundary name="onboarding-wizard">
        <OnboardingWizard onAllComplete={() => {
          // Celebration is handled by fetchEstateData via backend flag — no-op here
        }} />
      </TileErrorBoundary>

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
        const ENTRIES = [
          // Order = displayed order = priority order. Beneficiaries first.
          isFeatureKeyEnabled('beneficiaries', enabledFeatures) && {
            key: 'beneficiaries',
            chipColor: '#22c55e',
            chipPercent: beneficiariesPercent,
            chipLabel: 'Beneficiaries',
            tile: (
              <StatCard
                icon={Users}
                value={stats.beneficiaries}
                label="Beneficiaries"
                cardClass="stat-card-beneficiaries"
                onClick={() => navigate('/beneficiaries')}
                sectionKey="beneficiaries"
              />
            ),
          },
          isFeatureKeyEnabled('iac', enabledFeatures) && {
            key: 'iac',
            chipColor: '#f97316',
            chipPercent: checklistPercent,
            chipLabel: 'Checklist',
            tile: (
              <StatCard
                icon={CheckSquare}
                value={totalTasks}
                label={cleanLabel("Immediate Action Checklist (IAC)")}
                cardClass="stat-card-checklist"
                onClick={() => navigate('/checklist')}
                sectionKey="checklist"
              />
            ),
          },
          isFeatureKeyEnabled('mm', enabledFeatures) && {
            key: 'mm',
            chipColor: '#8b5cf6',
            chipPercent: msgsPercent,
            chipLabel: 'Messages',
            tile: (
              <StatCard
                icon={MessageSquare}
                value={stats.messages}
                label={cleanLabel("Milestone Messages (MM)")}
                cardClass="stat-card-messages"
                onClick={() => navigate('/messages')}
                sectionKey="messages"
              />
            ),
          },
          isFeatureKeyEnabled('sdv', enabledFeatures) && {
            key: 'sdv',
            chipColor: '#2563eb',
            chipPercent: docsPercent,
            chipLabel: 'Docs',
            tile: (
              <StatCard
                icon={FolderLock}
                value={stats.documents}
                label={cleanLabel("Secure Document Vault (SDV)")}
                cardClass="stat-card-vault"
                onClick={() => navigate('/vault')}
                sectionKey="vault"
              />
            ),
          },
          isFeatureKeyEnabled('cfp', enabledFeatures) && {
            key: 'cfp',
            chipColor: '#10b981',
            chipPercent: financialsPercent,
            chipLabel: 'Financials',
            tile: (
              <StatCard
                icon={DollarSign}
                value={(financialSummary?.bills_count || 0) + (financialSummary?.debts_count || 0) + (financialSummary?.accounts_count || 0) + (financialSummary?.property_count || 0)}
                label={cleanLabel(`${brand} Financial Picture (CFP)`)}
                cardClass="stat-card-financial"
                onClick={() => navigate('/financial')}
                sectionKey="financial_portal"
              />
            ),
          },
          isFeatureKeyEnabled('ccp', enabledFeatures) && {
            key: 'ccp',
            chipColor: '#ef4444',
            chipPercent: ccpPercent,
            chipLabel: 'CCP',
            tile: (
              <StatCard
                icon={ShieldAlert}
                value={stats.ccp_plans}
                label={cleanLabel("Contingency Protocols (CCP)")}
                cardClass="stat-card-ccp"
                onClick={() => navigate('/connected-protocol')}
                sectionKey="connected_protocol"
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
                  <span className="rounded-full flex-shrink-0" style={{ background: e.chipColor, width: cfg.dot, height: cfg.dot }} />
                  <span
                    className="text-[var(--t4)] font-bold whitespace-nowrap"
                    // Fluid: scales between the static cfg.font floor
                    // and a viewport-proportional ceiling so the key
                    // grows with iPad-and-above viewports instead of
                    // staying pinned at the discrete sm/md/lg jump.
                    style={{ fontSize: `clamp(${cfg.font}px, calc(var(--app-100vw, 100vw) * 0.011), ${cfg.font + 8}px)` }}
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
            <h2 className={`${dense ? 'text-base lg:text-4xl xl:text-5xl 2xl:text-6xl mb-2 lg:mb-3' : 'text-base lg:text-3xl xl:text-4xl 2xl:text-5xl mb-4 lg:mb-5'} whitespace-nowrap font-bold text-[var(--t)] uppercase tracking-wider text-center`} style={{ fontFamily: 'var(--sans)' }}>
              Estate Readiness
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
            {/* Mobile/PWA key — always two-and-two split-corner layout. */}
            <div className="flex justify-between mb-3 px-2 lg:hidden">
              <div className="flex flex-col gap-1">
                {ENTRIES.slice(0, 3).map((e) => (
                  <div key={e.key} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.chipColor }} />
                    <span className="text-[var(--t4)] font-bold" style={{ fontSize: 'clamp(12px, calc(var(--app-100vw, 100vw) * 0.032), 14px)' }}>{e.chipPercent}% {e.chipLabel}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1 items-end">
                {ENTRIES.slice(3, 6).map((e) => (
                  <div key={e.key} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.chipColor }} />
                    <span className="text-[var(--t4)] font-bold" style={{ fontSize: 'clamp(12px, calc(var(--app-100vw, 100vw) * 0.032), 14px)' }}>{e.chipPercent}% {e.chipLabel}</span>
                  </div>
                ))}
              </div>
            </div>
            <ReadinessDial score={readinessScore} id="readiness" labelText={scoreInfo.label} labelColor={scoreInfo.color} />
          </div>
        );

        const TilesGrid = ({ chiclet = false }) => (
          <div
            className={
              chiclet
                ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4'
                : 'grid grid-cols-3 gap-3 mb-4'
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
              style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.20)', color: '#d4af37' }}
              data-testid="ega-running-banner"
            >
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">
                <div>Estate Guardian is generating IAC items — counts will update automatically.</div>
                <div className="font-normal text-[var(--t4)] mt-1">This usually takes 1–3 minutes (occasionally longer if xAI is busy). Feel free to navigate to another tab — we'll keep working and notify you when it's done.</div>
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
          const tiles = (
            <div className="lg:col-span-1">
              <div className="glass-card p-4 lg:p-5 h-full flex flex-col" data-testid="core-pillars-card">
                <h2
                  className="text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl whitespace-nowrap font-semibold text-[var(--t)] mb-4 text-center tracking-tight"
                  style={{ fontFamily: 'var(--serif)' }}
                >
                  {brand} Core Pillars
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
                  className="grid grid-cols-3 gap-4 flex-1"
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
              <div className="glass-card p-4 lg:p-5 h-full flex flex-col" data-testid="readiness-card-side">
                <h2
                  className="text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl whitespace-nowrap font-semibold text-[var(--t)] mb-4 text-center tracking-tight"
                  style={{ fontFamily: 'var(--serif)' }}
                >
                  Estate Readiness
                </h2>
                <div className="flex-1 flex items-center justify-center">
                  <ReadinessDial score={readinessScore} id="readiness-side" labelText={scoreInfo.label} labelColor={scoreInfo.color} />
                </div>
                <div className="mt-3 flex justify-center">
                  <KeyChips size="md" columns={2} />
                </div>
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
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--t)]">{cleanLabel(`${brand} Financial Picture (CFP)`)}</h3>
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
              background: 'radial-gradient(ellipse at center, rgba(212,175,55,0.08) 0%, transparent 70%)',
              border: '1px solid rgba(212,175,55,0.15)',
            }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: 'rgba(212,175,55,0.12)', border: '2px solid rgba(212,175,55,0.3)' }}>
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
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: 'var(--bg)', boxShadow: '0 8px 32px rgba(212,175,55,0.3)' }}
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
