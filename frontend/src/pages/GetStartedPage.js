import { FlagBackdrop } from '../components/FlagBackdrop';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import SEO from '../components/SEO';
import PublicFooter from '../components/PublicFooter';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, ArrowRight, ChevronRight, Check, X, Users, Shield, FileText, Heart, Key, UserCheck, Send, Sparkles } from 'lucide-react';
import { initFirebase, trackEvent, trackPixel } from '../services/firebase';
import { API_URL } from '../config';
import apiClient from '../utils/apiClient';
import useTrialDays, { trialDaysLabel } from '../hooks/useTrialDays';
import confetti from 'canvas-confetti';

const INTERESTS = [
  { id: 'protect_family', label: 'Protect my family', icon: Shield },
  { id: 'organize_docs', label: 'Organize documents', icon: FileText },
  { id: 'plan_unexpected', label: 'Plan for the unexpected', icon: Heart },
  { id: 'guide_beneficiaries', label: 'Guide my beneficiaries', icon: Users },
  { id: 'digital_credentials', label: 'Secure digital credentials', icon: Key },
  { id: 'im_beneficiary', label: "I'm a beneficiary", icon: UserCheck },
];

const FAMILY_SIZES = ['Just me', 'Partner + me', 'Family with kids', 'Extended family'];
const ESTATE_STATUS = ['Nothing planned yet', 'Some documents', 'Complex estate'];
const URGENCY = ['Just exploring', 'Planning ahead', 'Need help now'];

const FEATURES = [
  { id: 'vault', title: 'Secure Document Vault', desc: 'AES-256 encrypted storage for wills, deeds, insurance, and financial documents.', for: ['organize_docs', 'protect_family'] },
  { id: 'messages', title: 'Milestone Messages', desc: 'Record video, audio, or written messages delivered to loved ones at the right time.', for: ['protect_family', 'guide_beneficiaries'] },
  { id: 'guardian', title: 'AI Estate Guardian', desc: 'AI-powered guidance that analyzes your documents and generates custom action checklists.', for: ['plan_unexpected', 'organize_docs'] },
  { id: 'checklist', title: 'Action Checklists', desc: 'Step-by-step guidance for beneficiaries when the time comes. No guesswork.', for: ['guide_beneficiaries', 'plan_unexpected'] },
  { id: 'wallet', title: 'Digital Credential Vault', desc: 'Securely store passwords, accounts, and digital access credentials for your family.', for: ['digital_credentials', 'organize_docs'] },
  { id: 'transition', title: 'Transition Verification', desc: 'Dignified, multi-step verification process to activate estate access.', for: ['protect_family', 'guide_beneficiaries'] },
];

const _STEP_NAMES = ['interests', 'family', 'plan', 'cta', 'referral'];

/* Shared frosted glass panel style */
const glassPanel = {
  background: 'rgba(255, 255, 255, 0.82)',
  backdropFilter: 'blur(20px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
  borderRadius: '1.75rem',
  border: '1px solid rgba(255,255,255,0.7)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.03)',
};

/* 3D gold button style */
const goldBtn = {
  background: 'linear-gradient(180deg, #f0d860 0%, #e0c040 30%, #d4af37 60%, #b8962e 100%)',
  color: '#1a1200',
  borderRadius: '0.875rem',
  fontWeight: 800,
  fontSize: '0.9375rem',
  letterSpacing: '0.01em',
  border: '1px solid rgba(180,140,40,0.4)',
  boxShadow: '0 6px 16px rgba(180,140,40,0.4), 0 3px 6px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,240,160,0.7), inset 0 -2px 0 rgba(140,100,20,0.2)',
  transition: 'all 0.15s ease',
  textShadow: '0 1px 0 rgba(255,255,255,0.3)',
};

const goldBtnDisabled = {
  ...goldBtn,
  opacity: 0.4,
  cursor: 'not-allowed',
  boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
  textShadow: 'none',
};

/* Option pill (unselected) */
const pillBase = {
  background: 'rgba(255,255,255,0.75)',
  border: '1.5px solid rgba(0,0,0,0.07)',
  borderRadius: '0.875rem',
  color: '#334155',
  fontWeight: 700,
  fontSize: '0.875rem',
  boxShadow: '0 3px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.02)',
  transition: 'all 0.15s ease',
};

const pillSelected = {
  background: 'linear-gradient(135deg, rgba(240,216,96,0.2), rgba(var(--gold-rgb), 0.1))',
  border: '2.5px solid #d4af37',
  borderRadius: '0.875rem',
  color: '#1a1200',
  fontWeight: 800,
  fontSize: '0.875rem',
  boxShadow: '0 4px 14px rgba(var(--gold-rgb), 0.25), 0 2px 4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,240,160,0.4), inset 0 -1px 0 rgba(140,100,20,0.05)',
  transition: 'all 0.15s ease',
};

export default function GetStartedPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const trialDays = useTrialDays();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState(1);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [selectedInterests, setSelectedInterests] = useState([]);
  // Step 2
  const [familySize, setFamilySize] = useState('');
  const [estateStatus, setEstateStatus] = useState('');
  const [urgency, setUrgency] = useState('');
  // Step 3
  const [keptFeatures, setKeptFeatures] = useState([]);
  const [currentFeatureIdx, setCurrentFeatureIdx] = useState(0);
  const [featureDecisions, setFeatureDecisions] = useState({});
  // Step 5
  const [referralEmail, setReferralEmail] = useState('');
  const confettiFired = useRef(false);

  // Fireworks celebration when user reaches the CTA screen
  useEffect(() => {
    if (step === 4 && !confettiFired.current) {
      confettiFired.current = true;
      const palettes = [
        ['#ffffff', '#e8e8e8', '#f5f5f5'],
        ['#b22234', '#d4364a', '#ff4d63'],
        ['#3c3b6e', '#4a4d9e', '#5e62c4'],
        ['#d4af37', '#e8c84a', '#f0d860'],
      ];
      const burst = (x, y) => {
        const colors = palettes[Math.floor(Math.random() * palettes.length)];
        confetti({ particleCount: 60, spread: 360, startVelocity: 30, origin: { x, y }, colors, ticks: 160, gravity: 1.2, scalar: 0.9, shapes: ['circle'] });
        confetti({ particleCount: 20, spread: 360, startVelocity: 15, origin: { x, y }, colors, ticks: 120, gravity: 1.0, scalar: 0.6, shapes: ['circle'] });
      };
      const schedule = [
        [200, 0.25, 0.2], [400, 0.75, 0.15], [700, 0.5, 0.25],
        [1000, 0.3, 0.3], [1200, 0.7, 0.2], [1500, 0.5, 0.15],
        [1800, 0.2, 0.25], [2000, 0.8, 0.3],
      ];
      schedule.forEach(([delay, x, y]) => setTimeout(() => burst(x, y), delay));
    }
  }, [step]);

  // Redirect logged-in users
  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  // Check returning visitor
  useEffect(() => {
    const hasToken = localStorage.getItem('carryon_token');
    if (hasToken) {
      navigate('/dashboard', { replace: true });
      return;
    }
    const completed = localStorage.getItem('carryon_funnel_completed');
    if (completed) {
      const completedAt = parseInt(completed, 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - completedAt < sevenDays) {
        setStep(4);
      } else {
        localStorage.removeItem('carryon_funnel_completed');
      }
    }
  }, [navigate]);

  // Init Firebase + create session
  useEffect(() => {
    initFirebase();
    trackPixel('ViewContent', { content_name: 'Funnel Start' });

    const startSession = async () => {
      try {
        const resp = await apiClient.post(`${API_URL}/funnel/start`, {
          utm_source: searchParams.get('utm_source') || '',
          utm_medium: searchParams.get('utm_medium') || '',
          utm_campaign: searchParams.get('utm_campaign') || '',
          utm_content: searchParams.get('utm_content') || '',
          utm_term: searchParams.get('utm_term') || '',
          referrer_url: document.referrer || '',
          landing_url: window.location.href,
        });
        setSessionId(resp.data.session_id);
        localStorage.setItem('carryon_funnel_session', resp.data.session_id);
      } catch (e) {
        console.warn('[Funnel] Session start failed:', e.message);
      }
    };

    const existingSession = localStorage.getItem('carryon_funnel_session');
    if (existingSession && step > 1) {
      setSessionId(existingSession);
    } else {
      startSession();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const featuresToShow = FEATURES;

  const recordStep = useCallback(async (stepNum, name, selections) => {
    trackEvent(`funnel_step_${stepNum}_complete`, { step_name: name, ...selections });
    if (!sessionId) return;
    try {
      await apiClient.post(`${API_URL}/funnel/step`, {
        session_id: sessionId,
        step: stepNum,
        name,
        selections,
      });
    } catch (_e) {
      console.warn('[Funnel] Step record failed');
    }
  }, [sessionId]);

  const handleNext = async () => {
    if (step === 1 && selectedInterests.length === 0) return;
    if (step === 2 && (!familySize || !estateStatus || !urgency)) return;

    if (step === 1) {
      await recordStep(1, 'interests', selectedInterests);
    } else if (step === 2) {
      await recordStep(2, 'family', { familySize, estateStatus, urgency });
    } else if (step === 3) {
      await recordStep(3, 'plan', { kept: keptFeatures, decisions: featureDecisions });
    }

    setStep(s => Math.min(s + 1, 5));
  };

  const handleBack = () => setStep(s => Math.max(s - 1, 1));

  const handleStartTrial = async () => {
    setLoading(true);
    await recordStep(4, 'cta', { action: 'start_trial' });
    trackEvent('funnel_cta_click');
    trackPixel('Lead', { content_name: 'Funnel CTA' });
    setStep(5);
    setLoading(false);
  };

  const handleSkipReferral = async () => {
    await completeFunnel(null);
  };

  const handleReferral = async () => {
    if (!referralEmail || !referralEmail.includes('@')) return;
    await completeFunnel(referralEmail);
  };

  const completeFunnel = async (refEmail) => {
    setLoading(true);
    await recordStep(5, 'referral', { referral_email: refEmail || 'skipped' });
    trackEvent('funnel_complete', { has_referral: !!refEmail });
    trackPixel('CompleteRegistration');

    if (sessionId) {
      try {
        await apiClient.post(`${API_URL}/funnel/complete`, {
          session_id: sessionId,
          referral_email: refEmail,
        });
      } catch (_e) {
        console.warn('[Funnel] Complete failed');
      }
    }

    localStorage.setItem('carryon_funnel_completed', Date.now().toString());
    navigate('/signup', {
      state: {
        from_funnel: true,
        funnel_session_id: sessionId,
        referral_email: refEmail,
        interests: selectedInterests,
      },
    });
    setLoading(false);
  };

  const toggleInterest = (id) => {
    setSelectedInterests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleFeatureDecision = (featureId, keep) => {
    setFeatureDecisions(prev => ({ ...prev, [featureId]: keep }));
    if (keep) {
      setKeptFeatures(prev => prev.includes(featureId) ? prev : [...prev, featureId]);
    } else {
      setKeptFeatures(prev => prev.filter(id => id !== featureId));
    }
    setCurrentFeatureIdx(i => i + 1);
  };

  const handleFeatureBack = () => {
    if (currentFeatureIdx <= 0) return;
    const prevIdx = currentFeatureIdx - 1;
    const prevFeature = featuresToShow[prevIdx];
    // Undo the previous decision
    setFeatureDecisions(prev => {
      const next = { ...prev };
      delete next[prevFeature.id];
      return next;
    });
    setKeptFeatures(prev => prev.filter(id => id !== prevFeature.id));
    setCurrentFeatureIdx(prevIdx);
  };

  const progress = (step / 5) * 100;

  return (
    <div className="min-h-screen relative overflow-hidden" data-testid="get-started-page" style={{ fontFamily: "'Nunito', 'Segoe UI', system-ui, -apple-system, sans-serif" }}>
      <SEO title="Get Started — CarryOn" description="Find your starting point: a guided path to organizing your family’s documents, people, and plan." path="/get-started" />

      {/* Google Font */}
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* American flag background — brighter, more vivid */}
      <div className="fixed inset-0 z-0">
        <FlagBackdrop style={{ opacity: 1, filter: 'brightness(1.3) contrast(1.05) saturate(1.1)' }} />
      </div>
      {/* Minimal gradient — just enough to anchor the bottom, much lighter overall */}
      <div className="fixed inset-0 z-[1]" style={{ background: 'linear-gradient(180deg, rgba(11,18,33,0.0) 0%, rgba(11,18,33,0.05) 50%, rgba(14,24,41,0.25) 100%)' }} />
      {/* Lift the left side and bottom — counterbalance the upper-right light source */}
      <div className="fixed inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 90% 80% at 20% 80%, rgba(255,255,255,0.12) 0%, transparent 60%)' }} />
      <div className="fixed inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 60% at 10% 50%, rgba(255,255,255,0.08) 0%, transparent 50%)' }} />
      {/* Lift the bottom right */}
      <div className="fixed inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 80% 70% at 85% 85%, rgba(255,255,255,0.14) 0%, transparent 55%)' }} />
      {/* Gold accent */}
      <div className="fixed inset-0 z-[2]" style={{ background: 'radial-gradient(ellipse 70% 50% at 35% 50%, rgba(var(--gold-rgb), 0.04) 0%, transparent 70%)' }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col" style={{ minHeight: '100dvh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-8 pb-2" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top, 1.25rem))' }}>
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button onClick={handleBack} data-testid="funnel-back-btn"
                style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                className="p-2.5 hover:bg-white/80 transition-colors">
                <ArrowLeft className="w-5 h-5 text-[#334155]" />
              </button>
            )}
            <span style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', borderRadius: '2rem', padding: '0.375rem 1rem', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', fontWeight: 700, fontSize: '0.8125rem', color: 'var(--t5)' }}>
              Step {step} of 5
            </span>
          </div>
          <button onClick={() => navigate('/login')} data-testid="funnel-login-link"
            style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', borderRadius: '2rem', padding: '0.375rem 1rem', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', fontWeight: 700, fontSize: '0.8125rem', color: 'var(--t5)', transition: 'all 0.2s' }}
            className="hover:bg-white/80">
            Already have an account?
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 sm:px-8 pb-5 pt-1">
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.5)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)', border: '1px solid rgba(255,255,255,0.4)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #d4af37, #e8c84a, #d4af37)', boxShadow: '0 0 8px rgba(var(--gold-rgb), 0.4)' }}
              data-testid="funnel-progress-bar"
            />
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex items-center justify-center px-4 sm:px-8 pb-6 overflow-y-auto">
          <div className="w-full max-w-lg">

            {/* STEP 1: Interests */}
            {step === 1 && (
              <div style={glassPanel} className="p-6 sm:p-8 animate-in fade-in duration-500" data-testid="funnel-step-1">
                <div className="text-center space-y-2 mb-6">
                  <h1 style={{ fontWeight: 900, fontSize: '1.625rem', color: '#1e293b', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                    What matters most to you?
                  </h1>
                  <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#64748b' }}>
                    Select everything that applies. We'll personalize your experience.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {INTERESTS.map(item => {
                    const selected = selectedInterests.includes(item.id);
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleInterest(item.id)}
                        data-testid={`interest-${item.id}`}
                        style={selected ? pillSelected : pillBase}
                        className="flex flex-col items-center gap-2 p-4 sm:p-5 text-center cursor-pointer hover:shadow-md active:scale-[0.97]"
                      >
                        <Icon className="w-6 h-6" style={{ color: selected ? '#b8962e' : '#94a3b8' }} />
                        <span style={{ fontSize: '0.8125rem', lineHeight: 1.3 }}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={handleNext}
                  disabled={selectedInterests.length === 0}
                  style={selectedInterests.length === 0 ? goldBtnDisabled : goldBtn}
                  className="w-full h-12 flex items-center justify-center gap-2 active:scale-[0.98] hover:brightness-105"
                  data-testid="funnel-next-btn"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP 2: Family */}
            {step === 2 && (
              <div style={glassPanel} className="p-6 sm:p-8 animate-in fade-in duration-500" data-testid="funnel-step-2">
                <div className="text-center space-y-2 mb-6">
                  <h1 style={{ fontWeight: 900, fontSize: '1.625rem', color: '#1e293b', letterSpacing: '-0.01em' }}>
                    Tell us about your family
                  </h1>
                  <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#64748b' }}>
                    This helps us tailor your estate readiness plan.
                  </p>
                </div>

                <div className="space-y-5 mb-6">
                  <div className="space-y-2">
                    <label style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Family Size</label>
                    <div className="grid grid-cols-2 gap-2">
                      {FAMILY_SIZES.map(s => (
                        <button key={s} onClick={() => setFamilySize(s)} data-testid={`family-${s.replace(/\s/g, '-').toLowerCase()}`}
                          style={familySize === s ? pillSelected : pillBase}
                          className="px-3 py-3 text-center cursor-pointer hover:shadow-md active:scale-[0.97]"
                        >{s}</button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Estate Planning Status</label>
                    <div className="flex flex-col gap-2">
                      {ESTATE_STATUS.map(s => (
                        <button key={s} onClick={() => setEstateStatus(s)} data-testid={`estate-${s.replace(/\s/g, '-').toLowerCase()}`}
                          style={estateStatus === s ? pillSelected : pillBase}
                          className="px-4 py-3 text-left cursor-pointer hover:shadow-md active:scale-[0.97]"
                        >{s}</button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>How urgent?</label>
                    <div className="flex flex-col gap-2">
                      {URGENCY.map(s => (
                        <button key={s} onClick={() => setUrgency(s)} data-testid={`urgency-${s.replace(/\s/g, '-').toLowerCase()}`}
                          style={urgency === s ? pillSelected : pillBase}
                          className="px-4 py-3 text-left cursor-pointer hover:shadow-md active:scale-[0.97]"
                        >{s}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleNext}
                  disabled={!familySize || !estateStatus || !urgency}
                  style={(!familySize || !estateStatus || !urgency) ? goldBtnDisabled : goldBtn}
                  className="w-full h-12 flex items-center justify-center gap-2 active:scale-[0.98] hover:brightness-105"
                  data-testid="funnel-next-btn"
                >
                  See My Plan <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP 3: Feature cards */}
            {step === 3 && (
              <div style={glassPanel} className="p-6 sm:p-8 animate-in fade-in duration-500" data-testid="funnel-step-3">
                <div className="text-center space-y-2 mb-6">
                  <h1 style={{ fontWeight: 900, fontSize: '1.625rem', color: '#1e293b' }}>
                    Your Estate Readiness Plan
                  </h1>
                  <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#64748b' }}>
                    {currentFeatureIdx < featuresToShow.length
                      ? `Feature ${currentFeatureIdx + 1} of ${featuresToShow.length} — interested?`
                      : 'Review complete!'}
                  </p>
                </div>

                {currentFeatureIdx < featuresToShow.length ? (
                  <div className="relative mb-6">
                    <div data-testid={`feature-card-${featuresToShow[currentFeatureIdx].id}`}
                      style={{
                        background: 'rgba(255,255,255,0.95)',
                        borderRadius: '1.25rem',
                        border: '1px solid rgba(0,0,0,0.06)',
                        boxShadow: '0 6px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
                      }}
                      className="p-6 sm:p-8 space-y-4"
                    >
                      {currentFeatureIdx > 0 && (
                        <button
                          onClick={handleFeatureBack}
                          data-testid="feature-back-btn"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                            fontSize: '0.8125rem', fontWeight: 700, color: '#94a3b8',
                            transition: 'color 0.15s',
                          }}
                          className="hover:text-slate-600 cursor-pointer active:text-slate-700"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" /> Change previous answer
                        </button>
                      )}
                      <h3 style={{ fontWeight: 800, fontSize: '1.25rem', color: '#1e293b' }}>{featuresToShow[currentFeatureIdx].title}</h3>
                      <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#64748b', lineHeight: 1.6 }}>{featuresToShow[currentFeatureIdx].desc}</p>
                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() => handleFeatureDecision(featuresToShow[currentFeatureIdx].id, false)}
                          data-testid="feature-skip-btn"
                          style={{
                            flex: 1, height: '2.75rem', borderRadius: '0.875rem',
                            background: '#ffffff', border: '1.5px solid rgba(0,0,0,0.08)',
                            color: '#64748b', fontWeight: 700, fontSize: '0.875rem',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
                            transition: 'transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease',
                          }}
                          className="flex items-center justify-center gap-2 cursor-pointer hover:-translate-y-[1px] hover:shadow-[0_6px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] hover:bg-white active:translate-y-[2px] active:shadow-[0_1px_1px_rgba(0,0,0,0.04),inset_0_2px_4px_rgba(0,0,0,0.08)] active:bg-[#f1f5f9]"
                        >
                          <X className="w-4 h-4" /> Not for me
                        </button>
                        <button
                          onClick={() => handleFeatureDecision(featuresToShow[currentFeatureIdx].id, true)}
                          data-testid="feature-keep-btn"
                          style={{
                            flex: 1, height: '2.75rem', borderRadius: '0.875rem',
                            background: 'linear-gradient(180deg, #f0d860 0%, #e0c040 40%, #d4af37 100%)',
                            border: '1.5px solid rgba(180,140,40,0.3)',
                            color: '#1a1200', fontWeight: 700, fontSize: '0.875rem',
                            boxShadow: '0 4px 6px rgba(180,140,40,0.2), 0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,240,160,0.6)',
                            transition: 'transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease',
                          }}
                          className="flex items-center justify-center gap-2 cursor-pointer hover:-translate-y-[1px] hover:shadow-[0_6px_12px_rgba(180,140,40,0.25),0_2px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,240,160,0.6)] hover:brightness-105 active:translate-y-[2px] active:shadow-[0_1px_1px_rgba(0,0,0,0.04),inset_0_2px_4px_rgba(140,100,20,0.2)] active:brightness-95"
                        >
                          <Check className="w-4 h-4" /> I want this
                        </button>
                      </div>
                    </div>
                    {currentFeatureIdx < featuresToShow.length - 1 && (
                      <div className="absolute -bottom-2 left-3 right-3 h-4 rounded-b-2xl -z-10" style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.3)' }} />
                    )}
                  </div>
                ) : (() => {
                  const kept = featuresToShow.filter(f => keptFeatures.includes(f.id));
                  const skipped = featuresToShow.filter(f => !keptFeatures.includes(f.id));
                  return (
                    <div className="space-y-5 mb-6 animate-in fade-in duration-500">
                      {/* Features they chose */}
                      {kept.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-5 h-5" style={{ color: '#d4af37' }} />
                            <h3 style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}>
                              Your plan is built around {kept.length === 1 ? 'this' : 'these'}
                            </h3>
                          </div>
                          <div className="space-y-2">
                            {kept.map(f => (
                              <div key={f.id} className="flex items-center gap-3 py-2.5 px-3.5" style={{
                                background: 'linear-gradient(135deg, rgba(var(--gold-rgb), 0.1), rgba(var(--gold-rgb), 0.04))',
                                borderRadius: '0.75rem', border: '1px solid rgba(var(--gold-rgb), 0.2)',
                              }}>
                                <div style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: 'linear-gradient(135deg, #d4af37, #e8c84a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 4px rgba(var(--gold-rgb), 0.3)' }}>
                                  <Check className="w-3.5 h-3.5 text-white" />
                                </div>
                                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>{f.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Separator + skipped features */}
                      {skipped.length > 0 && (
                        <div>
                          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', margin: '0.5rem 0' }} />
                          <p style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#94a3b8', marginTop: '0.75rem', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                            {kept.length > 0
                              ? "And just in case you change your mind, these are included free during your trial — so you can experience them firsthand."
                              : "All of our features are included free during your trial — explore everything and decide what fits."}
                          </p>
                          <div className="space-y-1.5">
                            {skipped.map(f => (
                              <div key={f.id} className="flex items-center gap-3 py-2 px-3.5" style={{
                                background: 'rgba(255,255,255,0.5)', borderRadius: '0.75rem',
                              }}>
                                <div style={{ width: '1.25rem', height: '1.25rem', borderRadius: '50%', background: 'rgba(148,163,184,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Check className="w-3 h-3" style={{ color: '#94a3b8' }} />
                                </div>
                                <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b' }}>{f.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {currentFeatureIdx >= featuresToShow.length && (
                  <button
                    onClick={handleNext}
                    style={goldBtn}
                    className="w-full h-12 flex items-center justify-center gap-2 active:scale-[0.98] hover:brightness-105 cursor-pointer"
                    data-testid="funnel-next-btn"
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* STEP 4: CTA */}
            {step === 4 && (
              <div style={glassPanel} className="p-6 sm:p-8 animate-in fade-in duration-500" data-testid="funnel-step-4">
                <div className="text-center space-y-3 mb-6">
                  <h1 style={{ fontWeight: 900, fontSize: '2rem', color: '#1e293b', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                    Every American Family.
                    <br />
                    <span style={{ color: '#b8962e' }}>Ready.</span>
                  </h1>
                  <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#64748b', maxWidth: '28rem', margin: '0 auto' }}>
                    Join families across the country building lasting continuity with CarryOn.
                    Start your free {trialDays}-day trial today.
                  </p>
                </div>

                {/* Social proof */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {[
                    { value: 'AES-256', label: 'Encryption Standard' },
                    { value: trialDaysLabel(trialDays), label: 'Free Trial' },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      background: 'rgba(255,255,255,0.7)', borderRadius: '1rem',
                      border: '1px solid rgba(0,0,0,0.05)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
                    }} className="p-3 sm:p-4 text-center">
                      <div style={{ fontWeight: 900, fontSize: '1.125rem', color: '#b8962e' }}>{stat.value}</div>
                      <div style={{ fontWeight: 600, fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.25rem' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                <p className="text-center mb-6" style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 600, lineHeight: 1.6 }} data-testid="get-started-trust-line">
                  Built by a 24-year military veteran. Bootstrapped and independent. Backed by a{' '}
                  <a href="/wind-down-promise" style={{ color: '#b8962e', textDecoration: 'underline' }} data-testid="trust-line-winddown-link">binding wind-down promise</a>.
                </p>

                {/* What's included — personalized */}
                <div style={{
                  background: 'rgba(255,255,255,0.7)', borderRadius: '1rem',
                  border: '1px solid rgba(0,0,0,0.05)', padding: '1.25rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }} className="space-y-2.5 mb-6">
                  {keptFeatures.length > 0 && (
                    <>
                      <h3 style={{ fontWeight: 800, fontSize: '0.6875rem', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your picks</h3>
                      {FEATURES.filter(f => keptFeatures.includes(f.id)).map(f => (
                        <div key={f.id} className="flex items-center gap-3">
                          <div style={{ width: '1.25rem', height: '1.25rem', borderRadius: '50%', background: 'linear-gradient(135deg, #d4af37, #e8c84a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 4px rgba(var(--gold-rgb), 0.3)' }}>
                            <Check className="w-3 h-3 text-white" />
                          </div>
                          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#334155' }}>{f.title}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {FEATURES.filter(f => !keptFeatures.includes(f.id)).length > 0 && (
                    <>
                      {keptFeatures.length > 0 && <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', margin: '0.25rem 0' }} />}
                      <h3 style={{ fontWeight: 800, fontSize: '0.6875rem', color: '#cbd5e1', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {keptFeatures.length > 0 ? 'Also included' : 'Your trial includes'}
                      </h3>
                      {FEATURES.filter(f => !keptFeatures.includes(f.id)).map(f => (
                        <div key={f.id} className="flex items-center gap-3">
                          <div style={{ width: '1.25rem', height: '1.25rem', borderRadius: '50%', background: 'rgba(148,163,184,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Check className="w-3 h-3" style={{ color: '#94a3b8' }} />
                          </div>
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#94a3b8' }}>{f.title}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                <button
                  onClick={handleStartTrial}
                  disabled={loading}
                  style={{ ...goldBtn, height: '3.25rem', fontSize: '1rem', boxShadow: '0 6px 20px rgba(180,140,40,0.35), 0 3px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,230,130,0.5)' }}
                  className="w-full flex items-center justify-center gap-2 active:scale-[0.98] hover:brightness-105 cursor-pointer"
                  data-testid="funnel-start-trial-btn"
                >
                  Start My Free Trial <ChevronRight className="w-5 h-5" />
                </button>

                <p style={{ fontWeight: 600, fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.75rem' }}>
                  No credit card required. Cancel anytime.
                </p>
              </div>
            )}

            {/* STEP 5: Referral */}
            {step === 5 && (
              <div style={glassPanel} className="p-6 sm:p-8 animate-in fade-in duration-500" data-testid="funnel-step-5">
                <div className="text-center space-y-3 mb-6">
                  <h1 style={{ fontWeight: 900, fontSize: '1.625rem', color: '#1e293b' }}>
                    Bring Your Family Along
                  </h1>
                  <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#64748b', maxWidth: '28rem', margin: '0 auto' }}>
                    Invite a family member and you'll <span style={{ color: '#1e293b', fontWeight: 800 }}>both</span> get
                    <span style={{ color: '#b8962e', fontWeight: 800 }}> +7 bonus days</span> on your trial.
                  </p>
                </div>

                <div style={{
                  background: 'rgba(255,255,255,0.7)', borderRadius: '1rem',
                  border: '1px solid rgba(0,0,0,0.05)', padding: '1.5rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }} className="space-y-4 mb-4">
                  <div className="flex items-center gap-3">
                    <Send className="w-5 h-5" style={{ color: '#b8962e' }} />
                    <span style={{ fontWeight: 800, fontSize: '0.875rem', color: '#334155' }}>Send an invite</span>
                  </div>
                  <input
                    type="email"
                    placeholder="Family member's email"
                    value={referralEmail}
                    onChange={e => setReferralEmail(e.target.value)}
                    data-testid="referral-email-input"
                    style={{
                      width: '100%', height: '3rem', borderRadius: '0.875rem',
                      background: 'rgba(255,255,255,0.8)', border: '1.5px solid rgba(0,0,0,0.08)',
                      padding: '0 1rem', fontWeight: 600, fontSize: '0.9375rem', color: '#334155',
                      outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={e => e.target.style.borderColor = '#d4af37'}
                    onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                  />
                  <button
                    onClick={handleReferral}
                    disabled={!referralEmail || !referralEmail.includes('@') || loading}
                    style={(!referralEmail || !referralEmail.includes('@') || loading) ? goldBtnDisabled : goldBtn}
                    className="w-full h-12 flex items-center justify-center gap-2 active:scale-[0.98] hover:brightness-105 cursor-pointer"
                    data-testid="referral-send-btn"
                  >
                    Send Invite & Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={handleSkipReferral}
                  data-testid="referral-skip-btn"
                  style={{ fontWeight: 700, fontSize: '0.875rem', color: '#94a3b8', transition: 'color 0.2s' }}
                  className="w-full text-center py-2 hover:text-[#64748b] cursor-pointer"
                >
                  Skip for now — I'll invite them later
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Bottom branding */}
        <div className="text-center pb-6">
          <span style={{ fontWeight: 700, fontSize: '0.6875rem', color: 'rgba(255,255,255,0.5)' }}>
            CarryOn &mdash; Every American Family. Ready.
          </span>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
