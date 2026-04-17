import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Users, FileUp, MessageSquare, CheckSquare,
  ChevronRight, X, Sparkles, Check, KeyRound, ArrowLeftRight,
  AlertTriangle, Settings
} from 'lucide-react';
import { Progress } from '../components/ui/progress';
import { API_URL } from '../config';
import { isFeatureEnabled } from '../utils/featureGates';

const STEP_CONFIG = {
  add_beneficiary: { icon: Users, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', route: '/beneficiaries', label: 'Add Someone You Love', desc: 'Just a name and relationship to get started' },
  create_message: { icon: MessageSquare, color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.2)', route: '/messages', label: 'Write a Short Message', desc: 'A title and a few words from the heart' },
  upload_document: { icon: FileUp, color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', route: '/vault', label: 'Upload a Document', desc: 'Pick a file and give it a name' },
  review_readiness: { icon: Sparkles, color: '#d4af37', bg: 'rgba(212,175,55,0.08)', border: 'rgba(212,175,55,0.2)', route: '/guardian', label: 'Check Your Readiness', desc: 'Get your personalized readiness score' },
  customize_checklist: { icon: CheckSquare, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', route: '/checklist', label: 'Review Your Checklist', desc: 'See the steps your loved ones will follow' },
  designate_primary: { icon: ArrowLeftRight, color: '#06b6d4', bg: 'rgba(6,182,212,0.08)', border: 'rgba(6,182,212,0.2)', route: '/beneficiaries', label: 'Set Succession Order', desc: 'Arrange your beneficiary order (optional)' },
  add_credential: { icon: KeyRound, color: '#ec4899', bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.2)', route: '/digital-wallet', label: 'Save a Digital Login', desc: 'Store an account login for your loved ones (optional)' },
};

const OnboardingWizard = ({ onAllComplete }) => {
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
  const [showAll, setShowAll] = useState(false);
  const [popping, setPopping] = useState({});
  const [dismissPhase, setDismissPhase] = useState('idle'); // 'idle' | 'confirm' | 'info'
  const prevCompleted = useRef({});
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (user?.role === 'benefactor' || user?.is_also_benefactor) fetchProgress();
    else setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProgress = async () => {
    try {
      const res = await axios.get(`${API_URL}/onboarding/progress`, getAuthHeaders());

      // Process everything before setting state (single render)
      const steps = res.data.steps || [];
      const hasIncomplete = steps.some(s => !s.completed);

      if (hasIncomplete && !res.data.all_complete && !res.data.manually_dismissed) {
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
    try { await axios.post(`${API_URL}/onboarding/dismiss`, {}, getAuthHeaders()); }
    catch (err) { console.error(err); }
  };

  const handleStepClick = async (step) => {
    const config = STEP_CONFIG[step.key];
    if (!config) return;
    if (step.key === 'review_readiness' && !step.completed) {
      try { await axios.post(`${API_URL}/onboarding/complete-step/review_readiness`, {}, getAuthHeaders()); }
      catch (err) { console.error(err); }
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
  const incompleteSteps = allSteps.filter(s => !s.completed || popping[s.key]);
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

  // After celebration has been shown (persisted on backend), hide the wizard permanently
  if (allComplete && progress.celebration_shown) {
    return null;
  }

  // Also hide if all complete — celebration is handled by DashboardPage
  if (allComplete) {
    return null;
  }

  if (stepsToShow.length === 0 && !allComplete) return null;

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
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--guided-desc, #94a3b8)' }}
              data-testid="onboarding-dismiss-cancel">
              Cancel
            </button>
            <button onClick={async () => {
              await handleDismiss();
              setManuallyDismissed(false);
              setDismissPhase('info');
            }}
              className="px-8 py-4 rounded-2xl text-base font-bold transition-transform active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', boxShadow: '0 8px 32px rgba(212,175,55,0.3)' }}
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
            0% { box-shadow: 0 0 0 0 rgba(212,175,55,0.25); }
            70% { box-shadow: 0 0 0 20px rgba(212,175,55,0); }
            100% { box-shadow: 0 0 0 0 rgba(212,175,55,0); }
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
              background: 'radial-gradient(circle, rgba(212,175,55,0.2) 0%, rgba(212,175,55,0.08) 70%)',
              border: '2px solid rgba(212,175,55,0.35)',
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
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a', boxShadow: '0 8px 32px rgba(212,175,55,0.3)' }}
            data-testid="onboarding-dismiss-proceed">
            Proceed
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 overflow-hidden" data-testid="onboarding-wizard">
      <div style={{
        animation: 'wizardSlideIn 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        opacity: 0,
        transform: 'translateY(-30px)',
      }}>
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
          0% { box-shadow: 0 0 0 0 rgba(212,175,55,0.4); }
          70% { box-shadow: 0 0 0 15px rgba(212,175,55,0); }
          100% { box-shadow: 0 0 0 0 rgba(212,175,55,0); }
        }
        .tile-pop { animation: waterBalloonPop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), ripplePulse 1s ease-out; }
      `}</style>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.2)' }}>
            <Sparkles className="w-6 h-6 text-[#d4af37]" />
          </div>
          <div>
            <h3 className="text-[var(--t)] font-bold text-xl lg:text-2xl" style={{ fontFamily: 'var(--sans)' }}>Get Started with CarryOn</h3>
            <p className="text-[var(--t5)] text-base">{progress.completed_count} of {progress.total_steps} complete</p>
          </div>
        </div>
        <button onClick={() => setDismissPhase('confirm')} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform" data-testid="onboarding-dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>

      <Progress value={progress.progress_pct} className="h-2.5 mb-5 bg-[var(--s)]" />

      {/* Step Tiles */}
      <div className="space-y-3">
        {/* Welcome tile for beneficiaries who just created their own estate */}
        {user?.is_also_benefactor && !welcomeDismissed && (
          <div className="rounded-2xl p-5 flex items-center gap-4 text-left"
            style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(96,165,250,0.08))', border: '1px solid rgba(212,175,55,0.2)' }}>
            <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)' }}>
              <ArrowLeftRight className="w-7 h-7 text-[#d4af37]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-[var(--t)]">Welcome to Your Estate</p>
              <p className="text-base text-[var(--t4)]">You now have both views — switch between your <strong style={{ color: '#d4af37' }}>Benefactor</strong> estate and your <strong style={{ color: '#60A5FA' }}>Beneficiary</strong> access anytime using the <strong>Switch View</strong> section {window.innerWidth >= 1024 ? 'in the menu on the left' : 'in the hamburger menu'}.</p>
            </div>
            <button onClick={() => { localStorage.setItem('carryon_welcome_tile_dismissed', 'true'); setWelcomeDismissed(true); }}
              className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform flex-shrink-0"
              data-testid="welcome-tile-dismiss">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
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
                className="w-full rounded-2xl p-5 flex items-center gap-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] cursor-pointer"
                style={{
                  background: isComplete ? 'var(--s)' : config.bg,
                  border: `1px solid ${isComplete ? 'var(--b)' : config.border}`,
                  boxShadow: isComplete ? 'none' : `0 4px 16px -4px ${config.color}20`,
                  opacity: isComplete ? 0.5 : 1,
                }}
                data-testid={`onboarding-step-${step.key}`}
              >
                <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: isComplete ? 'rgba(16,185,129,0.1)' : `${config.color}15`,
                    border: `1px solid ${isComplete ? 'rgba(16,185,129,0.2)' : `${config.color}30`}`,
                  }}>
                  {isComplete ? (
                    <Check className="w-7 h-7 text-[#22C993]" />
                  ) : (
                    <Icon className="w-7 h-7" style={{ color: config.color }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-lg font-bold ${isComplete ? 'text-[var(--t5)] line-through' : 'text-[var(--t)]'}`}>
                    {label}
                    {step.optional && !isComplete && <span className="text-xs font-normal text-[var(--t5)] ml-2">(optional)</span>}
                  </p>
                  <p className={`text-base ${isComplete ? 'text-[var(--t5)]' : 'text-[var(--t4)]'}`}>{config.desc}</p>
                </div>
                {isComplete ? (
                  <span className="text-sm text-[#22C993] font-bold flex-shrink-0">Done</span>
                ) : (
                  <ChevronRight className="w-6 h-6 flex-shrink-0" style={{ color: config.color }} />
                )}
              </button>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
