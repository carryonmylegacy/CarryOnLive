import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { cachedGet } from '../utils/apiCache';
import { isFeatureKeyEnabled, isFeatureEnabled } from '../utils/featureGates';
import { SpeedometerGauge, StatCard } from '../components/dashboard/DashboardWidgets';
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
  TrendingUp
} from 'lucide-react';
import TrialBanner from '../components/TrialBanner';
import BillingStatusBanner from '../components/BillingStatusBanner';
import OnboardingWizard from '../components/OnboardingWizard';
import ShareYourCarryOn from '../components/ShareYourCarryOn';
import { API_URL } from '../config';

import PushPrompt from '../components/PushPrompt';

const DashboardPage = () => {
  const { user, getAuthHeaders, enabledFeatures, refreshEnabledFeatures } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [estates, setEstates] = useState([]);
  const [estate, setEstate] = useState(null);
  const [checklists, setChecklists] = useState([]);
  const [stats, setStats] = useState({ documents: 0, messages: 0, beneficiaries: 0 });
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
    } catch (error) { console.error('Fetch estates error:', error); setLoading(false); }
  };

  const fetchEstateData = async (estateId) => {
    try {
      // Always fetch estate data AND onboarding progress in parallel
      const [docsRes, msgsRes, bensRes, checklistRes, readinessRes, progressRes] = await Promise.all([
        axios.get(`${API_URL}/documents/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/messages/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/beneficiaries/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/checklists/${estateId}`, getAuthHeaders()),
        axios.get(`${API_URL}/estate/${estateId}/readiness`, getAuthHeaders()).catch(() => null),
        axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders()).catch(() => null),
      ]);
      setStats({ documents: docsRes.data.length, messages: msgsRes.data.length, beneficiaries: bensRes.data.length });
      setChecklists(checklistRes.data);
      if (readinessRes) {
        setReadiness(readinessRes.data);
        setEstate(prev => prev ? { ...prev, readiness_score: readinessRes.data.overall_score } : prev);
      }
      // Fetch financial summary (non-blocking)
      axios.get(`${API_URL}/financial/summary/${estateId}`, getAuthHeaders())
        .then(res => setFinancialSummary(res.data)).catch(() => {});

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
          // Only refresh data when a new completion is detected
          if (lastCompletedAtRef.current && lastCompletedAtRef.current !== task.completed_at) {
            fetchEstateDataRef.current?.(estate.id);
          }
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
  const readinessScore = estate?.readiness_score || 0;

  // Use real readiness breakdown from API
  const docsPercent = readiness?.documents?.score ?? 0;
  const msgsPercent = readiness?.messages?.score ?? 0;
  const checklistPercent = readiness?.checklist?.score ?? 0;
  const financialsPercent = readiness?.financials?.score ?? 0;

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
    <div className="p-4 lg:p-8 pt-2 lg:pt-6 pb-24 lg:pb-8" data-testid="benefactor-dashboard"
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
              ? <>{getUserFirstName()}, let's continue exploring CarryOn</>
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
      <OnboardingWizard onAllComplete={() => {
        // Celebration is handled by fetchEstateData via backend flag — no-op here
      }} />

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

      {/* Estate Readiness Score — Single Gauge */}
      <div className="glass-card p-5 lg:p-8 mb-4" data-testid="readiness-card">
        {/* Title — always centered */}
        <h2 className="text-base lg:text-3xl font-bold text-[var(--t)] uppercase tracking-wider mb-4 lg:mb-5 text-center" style={{ fontFamily: 'var(--sans)' }}>
          Estate Readiness
        </h2>
        {/* Desktop: key box upper right, gauge below */}
        <div className="hidden lg:flex lg:justify-end lg:mb-4 lg:px-4">
          <div className="flex flex-col gap-1.5 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {isFeatureKeyEnabled('mm', enabledFeatures) && (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] flex-shrink-0" />
              <span className="text-[var(--t4)] text-sm font-medium">{msgsPercent}% Messages</span>
            </div>
            )}
            {isFeatureKeyEnabled('iac', enabledFeatures) && (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f97316] flex-shrink-0" />
              <span className="text-[var(--t4)] text-sm font-medium">{checklistPercent}% Checklist</span>
            </div>
            )}
            {isFeatureKeyEnabled('sdv', enabledFeatures) && (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2563eb] flex-shrink-0" />
              <span className="text-[var(--t4)] text-sm font-medium">{docsPercent}% Docs</span>
            </div>
            )}
            {isFeatureKeyEnabled('cfp', enabledFeatures) && (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] flex-shrink-0" />
              <span className="text-[var(--t4)] text-sm font-medium">{financialsPercent}% Financials</span>
            </div>
            )}
          </div>
        </div>
        {/* Mobile/PWA key — split two-and-two in corners */}
        <div className="flex justify-between mb-3 px-2 lg:hidden">
          <div className="flex flex-col gap-1">
            {isFeatureKeyEnabled('mm', enabledFeatures) && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#8b5cf6] flex-shrink-0" />
              <span className="text-[var(--t4)] text-[11px] font-medium">{msgsPercent}% Messages</span>
            </div>
            )}
            {isFeatureKeyEnabled('iac', enabledFeatures) && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#f97316] flex-shrink-0" />
              <span className="text-[var(--t4)] text-[11px] font-medium">{checklistPercent}% Checklist</span>
            </div>
            )}
          </div>
          <div className="flex flex-col gap-1 items-end">
            {isFeatureKeyEnabled('sdv', enabledFeatures) && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#2563eb] flex-shrink-0" />
              <span className="text-[var(--t4)] text-[11px] font-medium">{docsPercent}% Docs</span>
            </div>
            )}
            {isFeatureKeyEnabled('cfp', enabledFeatures) && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10b981] flex-shrink-0" />
              <span className="text-[var(--t4)] text-[11px] font-medium">{financialsPercent}% Financials</span>
            </div>
            )}
          </div>
        </div>
        {/* Gauge */}
        <SpeedometerGauge score={readinessScore} id="readiness" labelText={scoreInfo.label} labelColor={scoreInfo.color} />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4 mb-4">
        {isFeatureKeyEnabled('mm', enabledFeatures) && (
        <StatCard 
          icon={MessageSquare}
          value={stats.messages}
          label="Milestone Messages (MM)"
          cardClass="stat-card-messages"
          onClick={() => navigate('/messages')}
          sectionKey="messages"
        />
        )}
        {isFeatureKeyEnabled('iac', enabledFeatures) && (
        <StatCard 
          icon={CheckSquare}
          value={totalTasks}
          label="Immediate Action Checklist (IAC)"
          cardClass="stat-card-checklist"
          onClick={() => navigate('/checklist')}
          sectionKey="checklist"
        />
        )}
        {isFeatureKeyEnabled('sdv', enabledFeatures) && (
        <StatCard 
          icon={FolderLock}
          value={stats.documents}
          label="Secure Document Vault (SDV)"
          cardClass="stat-card-vault"
          onClick={() => navigate('/vault')}
          sectionKey="vault"
        />
        )}
        {isFeatureKeyEnabled('cfp', enabledFeatures) && (
        <StatCard 
          icon={DollarSign}
          value={(financialSummary?.bills_count || 0) + (financialSummary?.debts_count || 0) + (financialSummary?.accounts_count || 0) + (financialSummary?.property_count || 0)}
          label="Financial Picture"
          cardClass="stat-card-financial"
          onClick={() => navigate('/financial')}
          sectionKey="financial_portal"
        />
        )}
        {egaRunning && isFeatureKeyEnabled('ega', enabledFeatures) && (
          <div className="col-span-3 lg:col-span-4 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)', color: '#d4af37' }}
            data-testid="ega-running-banner">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Estate Guardian is generating IAC items — counts will update automatically
          </div>
        )}
        {isFeatureKeyEnabled('beneficiaries', enabledFeatures) && (
        <StatCard 
          icon={Users}
          value={stats.beneficiaries}
          label="Beneficiaries"
          cardClass="stat-card-beneficiaries"
          onClick={() => navigate('/beneficiaries')}
          className="hidden lg:block lg:col-span-full"
          sectionKey="beneficiaries"
        />
        )}
      </div>

      {/* Mobile only - Beneficiaries full width */}
      {isFeatureKeyEnabled('beneficiaries', enabledFeatures) && (
      <div className="lg:hidden mb-4">
        <div 
          className="stat-card-beneficiaries rounded-2xl p-4 cursor-pointer transition-transform duration-150 active:scale-[0.96] lg:hover:scale-[1.02] flex flex-col items-center justify-center"
          onClick={() => navigate('/beneficiaries')}
          data-testid="stat-card-beneficiaries-mobile"
        >
          <Users className="stat-icon w-8 h-8 opacity-70 mb-2" />
          <span className="text-3xl font-bold mb-1">
            {stats.beneficiaries}
          </span>
          <span className="opacity-80 text-base lg:text-lg font-bold text-center">Beneficiaries</span>
        </div>
      </div>
      )}

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
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--t)]">Milestone Messages (MM)</h3>
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
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--t)]">Secure Document Vault (SDV)</h3>
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
              <h3 className="text-lg lg:text-xl font-semibold text-[var(--t)]">Financial Picture</h3>
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

        {/* Share your CarryOn — gold pill button at the bottom of the dashboard */}
        <div className="mt-8 mb-2 px-1" data-testid="dashboard-share-tile">
          <ShareYourCarryOn variant="pill" />
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
              You have completed the initial creation of your estate plan. Welcome to CarryOn — continue exploring and building the security your family deserves!
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
