import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Users, FileUp, MessageSquare, CheckSquare,
  ChevronRight, ChevronDown, X, Sparkles, Check, Circle, KeyRound, ArrowLeftRight,
  AlertTriangle, Settings, WifiOff, ListChecks, DollarSign
} from 'lucide-react';
import { Progress } from '../components/ui/progress';
import { API_URL } from '../config';
import { isFeatureEnabled } from '../utils/featureGates';
import {
  isPlatformOfflineVisible,
  PLATFORM_OFFLINE_FLAG_EVENT,
} from '../utils/platformOfflineFlag';

const STEP_CONFIG = {
  add_beneficiary: { icon: Users, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', route: '/beneficiaries', label: 'Add Someone You Love', desc: 'Just a name and relationship to get started' },
  create_message: { icon: MessageSquare, color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.2)', route: '/messages', label: 'Leave a Milestone Message', desc: 'Use the Milestone Messages tool to record one' },
  upload_document: { icon: FileUp, color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', route: '/vault', label: 'Upload a Document', desc: 'Pick a file and give it a name' },
  review_readiness: { icon: Sparkles, color: '#d4af37', bg: 'rgba(var(--gold-rgb), 0.08)', border: 'rgba(var(--gold-rgb), 0.2)', route: '/guardian', label: 'Check Your Readiness', desc: 'Get your personalized readiness score' },
  customize_checklist: { icon: CheckSquare, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', route: '/checklist', label: 'Review Your Checklist', desc: 'See the steps your loved ones will follow' },
  designate_primary: { icon: ArrowLeftRight, color: '#06b6d4', bg: 'rgba(6,182,212,0.08)', border: 'rgba(6,182,212,0.2)', route: '/beneficiaries', label: 'Set Succession Order', desc: 'Arrange your beneficiary order (optional)' },
  add_credential: { icon: KeyRound, color: '#ec4899', bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.2)', route: '/digital-wallet', label: 'Save a Digital Login', desc: 'Store an account login for your loved ones (optional)' },
  build_financial_picture: { icon: DollarSign, color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', route: '/financial', label: 'Build Your Financial Picture', desc: 'Bills, debts, accounts, and property — get started' },
  review_settings: { icon: Settings, color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)', route: '/settings', label: 'Review Your Settings', desc: 'Open Settings and Security Settings to customize your portal' },
};

const OnboardingWizard = ({ onAllComplete, onContentChange }) => {
  const { user, getAuthHeaders, enabledFeatures } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manuallyDismissed, setManuallyDismissed] = useState(() => {
    return localStorage.getItem('carryon_onboarding_dismissed') === 'true';
  });
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    return localStorage.getItem('carryon_welcome_tile_dismissed') === 'true';
  });
  // Single coaching tile that explains how Offline Mode works in a few
  // bullet points. Dismissed permanently once the user closes it.
  const [offlineCoachDismissed, setOfflineCoachDismissed] = useState(() => {
    return localStorage.getItem('carryon_offline_coach_dismissed') === 'true';
  });
  // Mirror the founder's master Offline-Mode platform switch — when
  // OFF, this whole tile is never rendered (Feb 26 2026 founder
  // direction). Re-reads live on every flag-change broadcast so
  // toggling in the Admin sidebar makes the tile vanish without a
  // page reload.
  const [offlinePlatformVisible, setOfflinePlatformVisible] = useState(() => isPlatformOfflineVisible());
  useEffect(() => {
    const onChange = () => setOfflinePlatformVisible(isPlatformOfflineVisible());
    window.addEventListener(PLATFORM_OFFLINE_FLAG_EVENT, onChange);
    return () => window.removeEventListener(PLATFORM_OFFLINE_FLAG_EVENT, onChange);
  }, []);

  const [showAll, setShowAll] = useState(false);
  // Collapsible "all steps" disclosure beneath the active next-step
  // CTA — lets the user see every step's ✓ / ○ status at a glance
  // without leaving the dashboard (founder Feb 26 2026 mandate).
  // Persists across reloads via localStorage. Default: collapsed.
  const [allStepsExpanded, setAllStepsExpanded] = useState(() => {
    try { return localStorage.getItem('carryon_setup_guide_all_expanded') === '1'; }
    catch { return false; }
  });
  const toggleAllSteps = () => {
    setAllStepsExpanded((v) => {
      const next = !v;
      try { localStorage.setItem('carryon_setup_guide_all_expanded', next ? '1' : '0'); }
      catch { /* ignore */ }
      return next;
    });
  };
  const [popping, setPopping] = useState({});
  const [dismissPhase, setDismissPhase] = useState('idle'); // 'idle' | 'confirm' | 'info'
  const prevCompleted = useRef({});
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (user?.role === 'benefactor' || user?.is_also_benefactor) fetchProgress();
    else setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for the Settings → Appearance → Welcome Tile toggle so the
  // tile can re-appear immediately without a page reload (Feb 26 2026
  // founder mandate — Settings should offer toggles for every
  // onboarding tile that can show on the dashboard).
  useEffect(() => {
    const onWelcomeVis = (e) => {
      const visible = !!(e && e.detail && e.detail.visible);
      setWelcomeDismissed(!visible);
    };
    window.addEventListener('carryon:welcome-tile-visibility-changed', onWelcomeVis);
    return () => window.removeEventListener('carryon:welcome-tile-visibility-changed', onWelcomeVis);
  }, []);

  // Re-render when the full-screen guided overlay marks a step
  // complete via "I'll do this on my own later" (Feb 27 2026). The
  // overlay broadcasts the refreshed `/onboarding/progress` payload
  // so the Setup Guide tile's active next-step CTA + progress bar +
  // collapsible all-steps list all reflect the new state without a
  // page reload.
  useEffect(() => {
    const onRefreshed = (e) => {
      const next = e && e.detail;
      if (next && typeof next === 'object') {
        setProgress(next);
      } else {
        fetchProgress();
      }
    };
    window.addEventListener('carryon:onboarding-progress-refreshed', onRefreshed);
    return () => window.removeEventListener('carryon:onboarding-progress-refreshed', onRefreshed);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute "would the wizard render?" + how many discrete inner
  // artifacts it would render (welcome tile + offline coach + the
  // active step nudge OR the full step list when showAll). Both fire
  // via `onContentChange(hasContent, count)` so the parent dashboard
  // can (a) decide whether to render its outer "Getting Started"
  // wrapper around us and (b) auto-collapse the wrapper when the
  // total tile count crosses the 3+ threshold.
  const wouldRender = (() => {
    if (loading || !progress) return { ok: false, count: 0 };
    if (!(user?.role === 'benefactor' || user?.is_also_benefactor)) return { ok: false, count: 0 };
    if (manuallyDismissed && !showAll) return { ok: false, count: 0 };
    const visibleSteps = (progress.steps || []).filter(s => {
      const cfg = STEP_CONFIG[s.key];
      return !cfg || isFeatureEnabled(cfg.route, enabledFeatures);
    });
    const incomplete = visibleSteps.filter(s => !s.completed && !s.skipped);
    // "All truly done" means every step is genuinely COMPLETED — a
    // skipped step is acknowledged-but-not-done and the user might
    // still want to revisit it from the all-steps disclosure. So
    // skipped does NOT count toward this gate (May 26 2026 founder
    // report: "After QW auto-completed most steps and I skipped the
    // last one, the entire Onboarding tile vanished. I want to keep
    // seeing it.")
    const completedCount = visibleSteps.filter(s => s.completed).length;
    const allDone = completedCount === visibleSteps.length && visibleSteps.length > 0;
    if (allDone && progress.celebration_shown) return { ok: false, count: 0 };
    if (allDone) return { ok: false, count: 0 };
    const hasWelcome = user?.is_also_benefactor && !welcomeDismissed;
    const hasOffline = !offlineCoachDismissed && offlinePlatformVisible;
    // Step display mirrors the render path below: showAll → every
    // step; otherwise → 1 next step (or 0 if every incomplete step
    // is skipped — but the all-steps disclosure still adds 1 tile
    // so the user can re-engage with the skipped rows).
    const stepRenderCount = showAll
      ? visibleSteps.length
      : (incomplete.length > 0 ? 1 : (visibleSteps.length > 0 ? 1 : 0));
    const count = (hasWelcome ? 1 : 0) + (hasOffline ? 1 : 0) + stepRenderCount;
    return { ok: count > 0, count };
  })();
  useEffect(() => {
    if (typeof onContentChange === 'function') onContentChange(wouldRender.ok, wouldRender.count);
  }, [wouldRender.ok, wouldRender.count, onContentChange]);

  const fetchProgress = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/onboarding/progress`, getAuthHeaders());

      // Process everything before setting state (single render)
      const steps = res.data.steps || [];
      const hasIncomplete = steps.some(s => !s.completed);

      // ── Sync local dismissal state with the backend's authoritative
      // `manually_dismissed` flag. Without this, a device where
      // localStorage is empty (new browser, cleared storage, fresh PWA
      // install, cross-device login) would happily show the wizard even
      // though the user explicitly turned it off in Settings on another
      // device. The Settings toggle writes to both localStorage AND the
      // backend via /onboarding/dismiss — here we read back from the
      // backend and let it override local state.
      if (res.data.manually_dismissed === true) {
        localStorage.setItem('carryon_onboarding_dismissed', 'true');
        setManuallyDismissed(true);
      } else if (hasIncomplete && !res.data.all_complete) {
        // Backend says NOT manually dismissed and there's still work to
        // do → user-facing wizard should reappear. Clear local flag.
        localStorage.removeItem('carryon_onboarding_dismissed');
        setManuallyDismissed(false);
      }

      if (!hasIncomplete && localStorage.getItem('carryon_onboarding_dismissed') !== 'true') {
        setShowAll(true);
      }

      // Pop animation only on return visits (not initial load)
      if (initialLoadDone.current) {
        const newPops = {};
        steps.forEach(step => {
          if (step.completed && !prevCompleted.current[step.key]) {
            newPops[step.key] = true;
          }
        });
        if (Object.keys(newPops).length > 0) {
          setPopping(prev => ({ ...prev, ...newPops }));
          setTimeout(() => {
            setPopping(prev => {
              const next = { ...prev };
              Object.keys(newPops).forEach(k => delete next[k]);
              return next;
            });
          }, 800);
        }
      }

      const completed = {};
      steps.forEach(s => { if (s.completed) completed[s.key] = true; });
      prevCompleted.current = completed;
      initialLoadDone.current = true;

      setProgress(res.data);
    } catch (err) { console.error('Onboarding fetch error:', err); }
    finally { setLoading(false); }
  };

  const handleDismiss = async () => {
    setManuallyDismissed(true);
    setShowAll(false);
    setDismissPhase('idle');
    localStorage.setItem('carryon_onboarding_dismissed', 'true');
    try { await apiClient.post(`${API_URL}/onboarding/dismiss`, {}, getAuthHeaders()); }
    catch (err) { console.error(err); }
  };

  const handleStepClick = async (step) => {
    const config = STEP_CONFIG[step.key];
    if (!config) return;
    if (step.key === 'review_readiness' && !step.completed) {
      try { await apiClient.post(`${API_URL}/onboarding/complete-step/review_readiness`, {}, getAuthHeaders()); }
      catch (err) { console.error(err); }
    }
    if (step.key === 'review_settings' && !step.completed) {
      // Mark complete the moment the user clicks through. Visiting the
      // Settings page is the goal — exhaustive interaction is up to them.
      try { await apiClient.post(`${API_URL}/onboarding/complete-step/review_settings`, {}, getAuthHeaders()); }
      catch (err) { console.error(err); }
    }
    // If the user already seeded beneficiary stubs in the QuickStart
    // Wizard, (1) record the visit so step 1 auto-completes once the
    // user returns to the dashboard (Feb 26 2026 founder direction —
    // "tour-then-complete"), and (2) send them straight into the
    // first incomplete seeded stub rather than dropping them on the
    // empty list. Users who skipped QW entirely fall through to the
    // standard navigation and still need a real beneficiary on file
    // before step 1 will flip ✓.
    if (step.key === 'add_beneficiary' && !step.completed) {
      try {
        const qs = await apiClient.get(`${API_URL}/quickstart/progress`, getAuthHeaders());
        const seededBens = qs?.data?.data?.beneficiaries?.beneficiaries || [];
        if (seededBens.length > 0) {
          apiClient.post(
            `${API_URL}/onboarding/mark-visited/beneficiaries`,
            {},
            getAuthHeaders(),
          ).catch(() => { /* non-fatal — auto-detect on next dashboard fetch */ });
          if (seededBens[0]?.beneficiary_id) {
            navigate(`/beneficiaries?seed_id=${encodeURIComponent(seededBens[0].beneficiary_id)}`);
            return;
          }
        }
      } catch { /* non-fatal — fall through to normal route */ }
    }
    navigate(config.route, { state: config.route === '/checklist' ? { fromGettingStarted: true } : undefined });
  };

  if (loading || !progress) return null;
  if (manuallyDismissed && !showAll) return null;

  // Determine which steps to show
  const allSteps = (progress.steps || []).filter(s => {
    const config = STEP_CONFIG[s.key];
    return !config || isFeatureEnabled(config.route, enabledFeatures);
  });
  // Active-CTA candidates: a step is eligible to be the "next step"
  // button only when it is NEITHER completed NOR skipped (Feb 27 2026).
  // Skipped steps count toward progress but never re-surface as the
  // active CTA — the user explicitly told us not to walk them
  // through it.
  const incompleteSteps = allSteps.filter(s => (!s.completed && !s.skipped) || popping[s.key]);
  // "All truly done" mirrors the wouldRender gate above — skipped
  // doesn't count toward completion, so the tile stays visible
  // when the only remaining items are merely skipped. The user can
  // still re-engage them from the all-steps disclosure.
  const completedAllSteps = allSteps.filter(s => s.completed).length;
  const allTrulyComplete = completedAllSteps === allSteps.length && allSteps.length > 0;
  // "All done" for celebration purposes still means every step is in
  // some terminal state (completed OR skipped). The progress bar uses
  // `progress.completed_count` from the backend, which already counts
  // both.
  const allComplete = incompleteSteps.length === 0 && allSteps.length > 0;

  // Always show ONE step at a time until all are complete
  const nextStep = incompleteSteps[0];
  const stepsToShow = showAll ? allSteps : allComplete ? allSteps : (nextStep ? [nextStep] : []);

  // Personalize with beneficiary names
  const benNames = (progress.beneficiary_names || []).slice(0, 3);
  const benLabel = benNames.length > 0 ? benNames.join(', ') : 'your loved ones';

  if (allComplete && !progress.celebration_shown) {
    if (onAllComplete) onAllComplete();
  }

  // After celebration has been shown (persisted on backend), hide the
  // wizard permanently — but ONLY when every step is genuinely
  // completed. Skipped-but-not-completed steps keep the tile alive
  // so the user can revisit them from the all-steps disclosure.
  if (allTrulyComplete && progress.celebration_shown) {
    return null;
  }

  // Also hide when truly complete — celebration is handled by DashboardPage.
  if (allTrulyComplete) {
    return null;
  }

  // Tile still renders when only skipped steps remain — the all-steps
  // disclosure surfaces them. Only bail out when we have neither an
  // active next step NOR any all-steps content to show.
  if (stepsToShow.length === 0 && allSteps.length === 0) return null;

  // Dismiss confirm — full-screen frosted glass overlay matching guided flow
  if (dismissPhase === 'confirm') {
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto"
        data-testid="onboarding-dismiss-confirm">
        <style>{`
          @keyframes dismissBubbleIn {
            0% { opacity: 0; transform: scale(0.85) translateY(40px); }
            60% { transform: scale(1.02) translateY(-4px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes dismissPulseConfirm {
            0% { box-shadow: 0 0 0 0 rgba(245,158,11,0.25); }
            70% { box-shadow: 0 0 0 20px rgba(245,158,11,0); }
            100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
          }
        `}</style>
        <div className="absolute inset-0" style={{
          backdropFilter: 'blur(20px) saturate(130%)',
          WebkitBackdropFilter: 'blur(20px) saturate(130%)',
          background: 'var(--guided-overlay-bg, rgba(8,14,26,0.75))',
        }} />
        <div className="relative max-w-md w-full mx-6 text-center"
          style={{ animation: 'dismissBubbleIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both' }}>
          <div className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{
              background: 'radial-gradient(circle, rgba(245,158,11,0.2) 0%, rgba(245,158,11,0.08) 70%)',
              border: '2px solid rgba(245,158,11,0.35)',
              animation: 'dismissPulseConfirm 2.5s ease-in-out infinite',
            }}>
            <AlertTriangle className="w-14 h-14" style={{ color: '#F59E0B' }} />
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold mb-3"
            style={{ fontFamily: 'var(--sans)', color: 'var(--guided-title, #ffffff)' }}>
            Close Getting Started?
          </h1>
          <p className="text-sm lg:text-base mb-8 max-w-sm mx-auto leading-relaxed"
            style={{ color: 'var(--guided-desc, #94a3b8)' }}>
            This will hide the Getting Started guide. You won&apos;t see it again unless you re-enable it in Settings.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setDismissPhase('idle')}
              className="px-8 py-4 rounded-2xl text-base font-bold transition-transform active:scale-[0.97]"
              style={{ background: 'var(--b)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--guided-desc, #94a3b8)' }}
              data-testid="onboarding-dismiss-cancel">
              Cancel
            </button>
            <button onClick={async () => {
              await handleDismiss();
              setManuallyDismissed(false);
              setDismissPhase('info');
            }}
              className="px-8 py-4 rounded-2xl text-base font-bold transition-transform active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: 'var(--bg)', boxShadow: '0 8px 32px rgba(var(--gold-rgb), 0.3)' }}
              data-testid="onboarding-dismiss-confirm-btn">
              Yes, Close It
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dismiss info — full-screen frosted glass overlay matching guided flow
  if (dismissPhase === 'info') {
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto"
        data-testid="onboarding-dismiss-info">
        <style>{`
          @keyframes dismissBubbleIn {
            0% { opacity: 0; transform: scale(0.85) translateY(40px); }
            60% { transform: scale(1.02) translateY(-4px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes dismissPulseInfo {
            0% { box-shadow: 0 0 0 0 rgba(var(--gold-rgb), 0.25); }
            70% { box-shadow: 0 0 0 20px rgba(var(--gold-rgb), 0); }
            100% { box-shadow: 0 0 0 0 rgba(var(--gold-rgb), 0); }
          }
        `}</style>
        <div className="absolute inset-0" style={{
          backdropFilter: 'blur(20px) saturate(130%)',
          WebkitBackdropFilter: 'blur(20px) saturate(130%)',
          background: 'var(--guided-overlay-bg, rgba(8,14,26,0.75))',
        }} />
        <div className="relative max-w-md w-full mx-6 text-center"
          style={{ animation: 'dismissBubbleIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both' }}>
          <div className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{
              background: 'radial-gradient(circle, rgba(var(--gold-rgb), 0.2) 0%, rgba(var(--gold-rgb), 0.08) 70%)',
              border: '2px solid rgba(var(--gold-rgb), 0.35)',
              animation: 'dismissPulseInfo 2.5s ease-in-out infinite',
            }}>
            <Settings className="w-14 h-14" style={{ color: '#d4af37' }} />
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold mb-3"
            style={{ fontFamily: 'var(--sans)', color: 'var(--guided-title, #ffffff)' }}>
            Guide Hidden
          </h1>
          <p className="text-sm lg:text-base mb-8 max-w-sm mx-auto leading-relaxed"
            style={{ color: 'var(--guided-desc, #94a3b8)' }}>
            To see the Getting Started guide again, go to <strong style={{ color: '#d4af37' }}>Settings</strong> and toggle it back on.
          </p>
          <button onClick={() => {
            setDismissPhase('idle');
            setManuallyDismissed(true);
          }}
            className="w-full max-w-xs mx-auto py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: 'var(--bg)', boxShadow: '0 8px 32px rgba(var(--gold-rgb), 0.3)' }}
            data-testid="onboarding-dismiss-proceed">
            Proceed
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="onboarding-wizard">
      <div
        className="space-y-4"
        style={{
          animation: 'wizardSlideIn 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards',
          opacity: 0,
          transform: 'translateY(-30px)',
        }}
      >
      <style>{`
        @keyframes wizardSlideIn {
          0% { opacity: 0; transform: translateY(-30px); }
          50% { opacity: 0.5; }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes waterBalloonPop {
          0% { transform: scale(1); }
          15% { transform: scale(1.15) rotate(-2deg); }
          30% { transform: scale(0.95) rotate(1deg); }
          45% { transform: scale(1.08); }
          60% { transform: scale(0.98); }
          100% { transform: scale(1); }
        }
        @keyframes ripplePulse {
          0% { box-shadow: 0 0 0 0 rgba(var(--gold-rgb), 0.4); }
          70% { box-shadow: 0 0 0 15px rgba(var(--gold-rgb), 0); }
          100% { box-shadow: 0 0 0 0 rgba(var(--gold-rgb), 0); }
        }
        .tile-pop { animation: waterBalloonPop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), ripplePulse 1s ease-out; }
      `}</style>

      {/* ─────────── Setup Guide tile (was "Get Started with CarryOn") ───────────
          Single glass-card shell with a blue left border, matching the
          QuickStart Wizard tile in DashboardPage. Header + progress +
          the active next-step CTA are all *inside* this one tile so the
          eye never has to jump back and forth to figure out what to do
          next. Per Feb 26 founder mandate: visual cohesion + "Setup
          Guide" is the new name (replaces "Get Started with
          CarryOn" / "Getting Started Guide" / "Setup Checklist" — the
          user wants "Setup Guide" universally). */}
      <div className="glass-card relative w-full p-4 lg:p-5 border-l-4 border-l-[#60A5FA]" data-testid="setup-guide-tile">
        <button
          onClick={() => setDismissPhase('confirm')}
          className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 lg:hover:scale-110 z-10"
          style={{
            background: 'rgba(255,255,255,0.10)',
            border: '1.5px solid rgba(255,255,255,0.30)',
            color: 'var(--t)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.30)',
          }}
          data-testid="onboarding-dismiss"
          aria-label="Hide Setup Guide"
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>

        <div className="flex items-center gap-3 min-w-0 pr-12 mb-3">
          <div
            className="flex-shrink-0 w-10 h-10 lg:w-11 lg:h-11 rounded-full flex items-center justify-center"
            style={{
              background: 'radial-gradient(circle, rgba(96,165,250,0.22) 0%, rgba(96,165,250,0.08) 70%)',
              border: '1px solid rgba(96,165,250,0.35)',
            }}
          >
            <ListChecks className="w-5 h-5" style={{ color: '#60A5FA' }} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base lg:text-lg font-semibold text-[var(--t)]">Setup Guide</h3>
            <p className="text-xs lg:text-sm text-[var(--t4)]">{progress.completed_count} of {progress.total_steps} done</p>
          </div>
        </div>

        <Progress value={progress.progress_pct} className="h-2 mb-3 bg-[var(--s)]" />

        {/* Active next-step CTA — inline, right where the user's eye is. */}
        {stepsToShow.map((step) => {
          const config = STEP_CONFIG[step.key];
          if (!config) return null;
          const Icon = config.icon;
          const isPop = popping[step.key];
          const isComplete = step.completed && !isPop;
          const label = step.key === 'create_message' && benNames.length > 0
            ? `Leave a message for ${benLabel}!`
            : config.label;
          return (
            <div
              key={step.key}
              className={`transition-all duration-500 ${isPop ? 'tile-pop' : ''}`}
              style={{
                opacity: isPop ? 0 : 1,
                transform: isPop ? 'scale(1.15)' : 'scale(1)',
                maxHeight: isPop ? '0px' : '140px',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => handleStepClick(step)}
                className="w-full rounded-xl p-3 flex items-center gap-3 text-left transition-all duration-200 active:scale-[0.98] cursor-pointer"
                style={{
                  background: isComplete ? 'var(--s)' : `${config.color}10`,
                  border: `1px solid ${isComplete ? 'var(--b)' : `${config.color}30`}`,
                  opacity: isComplete ? 0.5 : 1,
                }}
                data-testid={`onboarding-step-${step.key}`}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: isComplete ? 'rgba(16,185,129,0.1)' : `${config.color}20`,
                    border: `1px solid ${isComplete ? 'rgba(16,185,129,0.2)' : `${config.color}30`}`,
                  }}>
                  {isComplete ? (
                    <Check className="w-5 h-5 text-[#22C993]" />
                  ) : (
                    <Icon className="w-5 h-5" style={{ color: config.color }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm lg:text-base font-semibold ${isComplete ? 'text-[var(--t5)] line-through' : 'text-[var(--t)]'}`}>
                    {label}
                    {step.optional && !isComplete && <span className="text-xs font-normal text-[var(--t5)] ml-2">(optional)</span>}
                  </p>
                  <p className={`text-xs ${isComplete ? 'text-[var(--t5)]' : 'text-[var(--t4)]'}`}>{config.desc}</p>
                </div>
                {isComplete ? (
                  <span className="text-xs text-[#22C993] font-bold flex-shrink-0">Done</span>
                ) : (
                  <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: config.color }} />
                )}
              </button>
            </div>
          );
        })}

        {/* ─────────── All-steps disclosure ───────────
            Collapsible list showing every step in the Setup Guide.
            TWO indicator columns (Feb 27 2026 founder mandate):
              • Left  — ✓ complete  / ○ not complete
              • Right — ⊘ skipped   / ○ not skipped
            The two states are mutually exclusive on the backend (skip
            clears complete and vice versa) so the user can tell
            genuine completion apart from "I'll do this later".
            Skipped steps still count toward the progress bar. */}
        {!showAll && allSteps.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--b)' }}>
            <button
              type="button"
              onClick={toggleAllSteps}
              aria-expanded={allStepsExpanded || stepsToShow.length === 0}
              aria-controls="setup-guide-all-steps-list"
              data-testid="setup-guide-toggle-all-steps"
              className="w-full flex items-center justify-between gap-2 text-xs lg:text-sm font-semibold text-[var(--t4)] lg:hover:text-[var(--t)] active:text-[var(--t)] transition-colors cursor-pointer"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <span>{(allStepsExpanded || stepsToShow.length === 0) ? 'Hide all steps' : 'View all steps'}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${(allStepsExpanded || stepsToShow.length === 0) ? 'rotate-180' : ''}`}
                strokeWidth={2.5}
              />
            </button>
            {(allStepsExpanded || stepsToShow.length === 0) && (
              <div data-testid="setup-guide-all-steps-list" id="setup-guide-all-steps-list" className="mt-2">
                {/* Column headers — tiny uppercase labels so the user
                    knows which column is which without hovering. */}
                <div className="flex items-center gap-2 px-2 pb-1 text-[11px] lg:text-xs uppercase tracking-wider text-[var(--t5)] font-bold">
                  <span className="w-5 flex-shrink-0 text-center" aria-hidden="true">Done</span>
                  <span className="w-5 flex-shrink-0 text-center" aria-hidden="true">Skip</span>
                  <span className="flex-1">Step</span>
                </div>
                <ul className="space-y-1">
                  {allSteps.map((s, i) => {
                    const cfg = STEP_CONFIG[s.key];
                    const stepLabel = cfg?.label || s.label || s.key;
                    const accentColor = cfg?.color || 'var(--gold)';
                    const isDone = !!s.completed;
                    const isSkip = !!s.skipped;
                    return (
                      <li key={s.key}>
                        <button
                          type="button"
                          onClick={() => handleStepClick(s)}
                          data-testid={`setup-guide-step-row-${s.key}`}
                          data-state={isDone ? 'done' : isSkip ? 'skipped' : 'open'}
                          className="w-full flex items-center gap-2 text-left text-xs lg:text-sm px-2 py-1.5 rounded-md transition-colors lg:hover:bg-[var(--s)] active:bg-[var(--s)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)] focus:ring-offset-1 focus:ring-offset-transparent cursor-pointer"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          {/* Done column */}
                          <span className="w-5 flex-shrink-0 flex items-center justify-center" aria-label={isDone ? 'Completed' : 'Not completed'}>
                            {isDone ? (
                              <Check
                                className="w-4 h-4"
                                style={{ color: '#22C993' }}
                                strokeWidth={3}
                                data-testid={`setup-guide-step-icon-${s.key}-done`}
                              />
                            ) : (
                              <Circle
                                className="w-4 h-4 text-[var(--t5)]"
                                strokeWidth={2}
                                data-testid={`setup-guide-step-icon-${s.key}-open`}
                              />
                            )}
                          </span>
                          {/* Skip column */}
                          <span className="w-5 flex-shrink-0 flex items-center justify-center" aria-label={isSkip ? 'Skipped' : 'Not skipped'}>
                            {isSkip ? (
                              <Check
                                className="w-4 h-4"
                                style={{ color: '#F59E0B' }}
                                strokeWidth={3}
                                data-testid={`setup-guide-step-icon-${s.key}-skipped`}
                              />
                            ) : (
                              <Circle
                                className="w-4 h-4 text-[var(--t5)]"
                                strokeWidth={2}
                                data-testid={`setup-guide-step-icon-${s.key}-skip-open`}
                              />
                            )}
                          </span>
                          <span className={`flex-1 ${isDone ? 'text-[var(--t5)] line-through' : isSkip ? 'text-[var(--t4)] italic' : 'text-[var(--t)]'}`}>
                            <span className="text-[var(--t5)] font-medium mr-1">{i + 1}.</span>
                            {stepLabel}
                            {s.optional && !isDone && !isSkip && (
                              <span className="text-[var(--t5)] ml-1">(optional)</span>
                            )}
                          </span>
                          <ChevronRight
                            className="w-4 h-4 flex-shrink-0"
                            style={{ color: isDone || isSkip ? 'var(--t5)' : accentColor }}
                            strokeWidth={2.5}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─────────── Welcome — Two Views tile (dual-role users only) ───────────
          Same glass-card shell, purple left border (info, not an action). */}
      {user?.is_also_benefactor && !welcomeDismissed && (
        <div className="glass-card relative w-full p-4 lg:p-5 border-l-4 border-l-[#a78bfa]" data-testid="welcome-two-views-tile">
          <button
            onClick={() => { localStorage.setItem('carryon_welcome_tile_dismissed', 'true'); setWelcomeDismissed(true); }}
            className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 lg:hover:scale-110 z-10"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1.5px solid rgba(255,255,255,0.30)',
              color: 'var(--t)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.30)',
            }}
            data-testid="welcome-tile-dismiss"
            aria-label="Hide Welcome tip"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <div className="flex items-start gap-3 min-w-0 pr-12">
            <div
              className="flex-shrink-0 w-10 h-10 lg:w-11 lg:h-11 rounded-full flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle, rgba(167,139,250,0.22) 0%, rgba(167,139,250,0.08) 70%)',
                border: '1px solid rgba(167,139,250,0.35)',
              }}
            >
              <ArrowLeftRight className="w-5 h-5" style={{ color: '#a78bfa' }} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base lg:text-lg font-semibold text-[var(--t)]">Welcome — Two Views</h3>
              <p className="text-xs lg:text-sm text-[var(--t4)]">
                Switch between your <strong style={{ color: '#d4af37' }}>Benefactor</strong> estate and <strong style={{ color: '#60A5FA' }}>Beneficiary</strong> access anytime via <strong>Switch View</strong> in the {window.innerWidth >= 1024 ? 'left menu' : 'hamburger menu'}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── Offline Mode tile ───────────
          Same shell, cyan left border. Hidden when the founder's
          master Offline switch is OFF (see /utils/platformOfflineFlag.js)
          so users don't see a coaching tile for a feature that's been
          disabled platform-wide. The user's per-device dismiss
          preference is still honored — when the founder turns the
          flag back ON, the tile only re-appears for users who never
          dismissed it. */}
      {!offlineCoachDismissed && offlinePlatformVisible && (
        <div className="glass-card relative w-full p-4 lg:p-5 border-l-4 border-l-[#0EA5E9]" data-testid="onboarding-offline-coach">
          <button
            onClick={() => { localStorage.setItem('carryon_offline_coach_dismissed', 'true'); setOfflineCoachDismissed(true); }}
            className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 lg:hover:scale-110 z-10"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1.5px solid rgba(255,255,255,0.30)',
              color: 'var(--t)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.30)',
            }}
            data-testid="onboarding-offline-coach-dismiss"
            aria-label="Hide Offline Mode tip"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <div className="flex items-start gap-3 min-w-0 pr-12">
            <div
              className="flex-shrink-0 w-10 h-10 lg:w-11 lg:h-11 rounded-full flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle, rgba(14,165,233,0.22) 0%, rgba(14,165,233,0.08) 70%)',
                border: '1px solid rgba(14,165,233,0.35)',
              }}
            >
              <WifiOff className="w-5 h-5" style={{ color: '#0EA5E9' }} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base lg:text-lg font-semibold text-[var(--t)] mb-1.5">Offline Mode — Quick Setup</h3>
              <ul className="text-xs lg:text-sm text-[var(--t4)] space-y-1 list-disc pl-5">
                <li>Install CarryOn to your <strong style={{ color: '#0EA5E9' }}>home screen</strong> (PWA only).</li>
                <li>Sign in once while <strong style={{ color: '#0EA5E9' }}>online</strong> and wait ~30s for sync.</li>
                <li>Enable in <strong style={{ color: '#d4af37' }}>Settings → Offline</strong>. Stays 90 days; revoke anytime.</li>
                <li>Your password is <strong style={{ color: '#0EA5E9' }}>never stored</strong> — only an encrypted credential.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default OnboardingWizard;
