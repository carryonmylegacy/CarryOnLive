import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, ArrowRight, ChevronRight, Check, X, Users, Shield, FileText, Heart, Key, UserCheck, Send, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { initFirebase, trackEvent, trackPixel } from '../services/firebase';
import { API_URL } from '../config';
import axios from 'axios';

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

const STEP_NAMES = ['interests', 'family', 'plan', 'cta', 'referral'];

export default function GetStartedPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
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

  // Redirect logged-in users
  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  // Check returning visitor
  useEffect(() => {
    const completed = localStorage.getItem('carryon_funnel_completed');
    const hasToken = localStorage.getItem('carryon_token');
    if (hasToken) {
      navigate('/dashboard', { replace: true });
      return;
    }
    // Returning visitor who completed funnel but didn't sign up — jump to CTA
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
        const resp = await axios.post(`${API_URL}/funnel/start`, {
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

  // Relevant features based on interests
  const relevantFeatures = FEATURES.filter(f =>
    f.for.some(tag => selectedInterests.includes(tag))
  );
  const featuresToShow = relevantFeatures.length > 0 ? relevantFeatures : FEATURES;

  const recordStep = useCallback(async (stepNum, name, selections) => {
    trackEvent(`funnel_step_${stepNum}_complete`, { step_name: name, ...selections });
    if (!sessionId) return;
    try {
      await axios.post(`${API_URL}/funnel/step`, {
        session_id: sessionId,
        step: stepNum,
        name,
        selections,
      });
    } catch (e) {
      console.warn('[Funnel] Step record failed');
    }
  }, [sessionId]);

  const handleNext = async () => {
    if (step === 1 && selectedInterests.length === 0) return;
    if (step === 2 && (!familySize || !estateStatus || !urgency)) return;

    // Record current step
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
        await axios.post(`${API_URL}/funnel/complete`, {
          session_id: sessionId,
          referral_email: refEmail,
        });
      } catch (e) {
        console.warn('[Funnel] Complete failed');
      }
    }

    localStorage.setItem('carryon_funnel_completed', Date.now().toString());
    // Navigate to signup with funnel context
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
    if (keep) setKeptFeatures(prev => [...prev, featureId]);
    // Always advance to next feature (or past the end to show Continue button)
    setCurrentFeatureIdx(i => i + 1);
  };

  // Progress bar
  const progress = (step / 5) * 100;

  return (
    <div className="min-h-screen bg-[#080e1a] text-white flex flex-col" data-testid="get-started-page">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2">
          {step > 1 && (
            <button onClick={handleBack} className="p-2 rounded-lg hover:bg-white/5 transition-colors" data-testid="funnel-back-btn">
              <ArrowLeft className="w-5 h-5 text-[#94a3b8]" />
            </button>
          )}
          <span className="text-sm text-[#94a3b8] font-medium">Step {step} of 5</span>
        </div>
        <button onClick={() => navigate('/login')} className="text-sm text-[#94a3b8] hover:text-white transition-colors" data-testid="funnel-login-link">
          Already have an account?
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 sm:px-6 pb-4">
        <div className="h-1 bg-[#1a2744] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#d4af37] to-[#f0d060] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
            data-testid="funnel-progress-bar"
          />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 pb-8">
        <div className="w-full max-w-lg">

          {/* STEP 1: Interests */}
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in duration-500" data-testid="funnel-step-1">
              <div className="text-center space-y-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">What matters most to you?</h1>
                <p className="text-[#94a3b8] text-sm sm:text-base">Select everything that applies. We'll personalize your experience.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {INTERESTS.map(item => {
                  const selected = selectedInterests.includes(item.id);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleInterest(item.id)}
                      data-testid={`interest-${item.id}`}
                      className={`flex flex-col items-center gap-2 p-4 sm:p-5 rounded-xl border transition-all duration-200 text-center ${
                        selected
                          ? 'border-[#d4af37] bg-[#d4af37]/10 text-white shadow-[0_0_20px_rgba(212,175,55,0.15)]'
                          : 'border-[#1e293b] bg-[#0f1729] text-[#94a3b8] hover:border-[#2a3c55] hover:bg-[#111f34]'
                      }`}
                    >
                      <Icon className={`w-6 h-6 ${selected ? 'text-[#d4af37]' : 'text-[#475569]'}`} />
                      <span className="text-xs sm:text-sm font-medium leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                onClick={handleNext}
                disabled={selectedInterests.length === 0}
                className="w-full h-12 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#d4af37] to-[#b8962e] text-[#080e1a] hover:from-[#e0c050] hover:to-[#c8a63e] disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="funnel-next-btn"
              >
                Continue <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* STEP 2: Family */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-500" data-testid="funnel-step-2">
              <div className="text-center space-y-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tell us about your family</h1>
                <p className="text-[#94a3b8] text-sm sm:text-base">This helps us tailor your estate readiness plan.</p>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs text-[#94a3b8] font-medium uppercase tracking-wider">Family Size</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FAMILY_SIZES.map(s => (
                      <button key={s} onClick={() => setFamilySize(s)} data-testid={`family-${s.replace(/\s/g, '-').toLowerCase()}`}
                        className={`px-3 py-3 rounded-lg text-sm font-medium border transition-all ${familySize === s ? 'border-[#d4af37] bg-[#d4af37]/10 text-white' : 'border-[#1e293b] bg-[#0f1729] text-[#94a3b8] hover:border-[#2a3c55]'}`}
                      >{s}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-[#94a3b8] font-medium uppercase tracking-wider">Estate Planning Status</label>
                  <div className="flex flex-col gap-2">
                    {ESTATE_STATUS.map(s => (
                      <button key={s} onClick={() => setEstateStatus(s)} data-testid={`estate-${s.replace(/\s/g, '-').toLowerCase()}`}
                        className={`px-4 py-3 rounded-lg text-sm font-medium border text-left transition-all ${estateStatus === s ? 'border-[#d4af37] bg-[#d4af37]/10 text-white' : 'border-[#1e293b] bg-[#0f1729] text-[#94a3b8] hover:border-[#2a3c55]'}`}
                      >{s}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-[#94a3b8] font-medium uppercase tracking-wider">How urgent?</label>
                  <div className="flex flex-col gap-2">
                    {URGENCY.map(s => (
                      <button key={s} onClick={() => setUrgency(s)} data-testid={`urgency-${s.replace(/\s/g, '-').toLowerCase()}`}
                        className={`px-4 py-3 rounded-lg text-sm font-medium border text-left transition-all ${urgency === s ? 'border-[#d4af37] bg-[#d4af37]/10 text-white' : 'border-[#1e293b] bg-[#0f1729] text-[#94a3b8] hover:border-[#2a3c55]'}`}
                      >{s}</button>
                    ))}
                  </div>
                </div>
              </div>

              <Button
                onClick={handleNext}
                disabled={!familySize || !estateStatus || !urgency}
                className="w-full h-12 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#d4af37] to-[#b8962e] text-[#080e1a] hover:from-[#e0c050] hover:to-[#c8a63e] disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="funnel-next-btn"
              >
                See My Plan <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* STEP 3: Feature cards */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-500" data-testid="funnel-step-3">
              <div className="text-center space-y-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Your Estate Readiness Plan</h1>
                <p className="text-[#94a3b8] text-sm sm:text-base">
                  {currentFeatureIdx < featuresToShow.length
                    ? `Feature ${currentFeatureIdx + 1} of ${featuresToShow.length} — interested?`
                    : 'Review complete!'}
                </p>
              </div>

              {currentFeatureIdx < featuresToShow.length ? (
                <div className="relative">
                  <div className="bg-[#0f1729] border border-[#1e293b] rounded-2xl p-6 sm:p-8 space-y-4" data-testid={`feature-card-${featuresToShow[currentFeatureIdx].id}`}>
                    <h3 className="text-lg sm:text-xl font-bold text-white">{featuresToShow[currentFeatureIdx].title}</h3>
                    <p className="text-[#94a3b8] text-sm sm:text-base leading-relaxed">{featuresToShow[currentFeatureIdx].desc}</p>
                    <div className="flex gap-3 pt-2">
                      <Button
                        onClick={() => handleFeatureDecision(featuresToShow[currentFeatureIdx].id, false)}
                        variant="outline"
                        className="flex-1 h-11 rounded-xl border-[#1e293b] bg-transparent text-[#94a3b8] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400"
                        data-testid="feature-skip-btn"
                      >
                        <X className="w-4 h-4 mr-2" /> Skip
                      </Button>
                      <Button
                        onClick={() => handleFeatureDecision(featuresToShow[currentFeatureIdx].id, true)}
                        className="flex-1 h-11 rounded-xl bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/30 hover:bg-[#d4af37]/30"
                        data-testid="feature-keep-btn"
                      >
                        <Check className="w-4 h-4 mr-2" /> I want this
                      </Button>
                    </div>
                  </div>
                  {/* Card stack visual */}
                  {currentFeatureIdx < featuresToShow.length - 1 && (
                    <div className="absolute -bottom-2 left-2 right-2 h-4 bg-[#0f1729]/60 border border-[#1e293b]/50 rounded-b-2xl -z-10" />
                  )}
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="text-5xl">
                    <Sparkles className="w-12 h-12 mx-auto text-[#d4af37]" />
                  </div>
                  <p className="text-[#94a3b8]">
                    You kept <span className="text-white font-semibold">{keptFeatures.length}</span> features.
                    Your personalized plan is ready.
                  </p>
                </div>
              )}

              {currentFeatureIdx >= featuresToShow.length && (
                <Button
                  onClick={handleNext}
                  className="w-full h-12 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#d4af37] to-[#b8962e] text-[#080e1a] hover:from-[#e0c050] hover:to-[#c8a63e]"
                  data-testid="funnel-next-btn"
                >
                  Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          )}

          {/* STEP 4: CTA */}
          {step === 4 && (
            <div className="space-y-8 animate-in fade-in duration-500" data-testid="funnel-step-4">
              <div className="text-center space-y-4">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  Every American Family.
                  <br />
                  <span className="text-[#d4af37]">Ready.</span>
                </h1>
                <p className="text-[#94a3b8] text-sm sm:text-base max-w-md mx-auto">
                  Join families across the country who are securing their legacy with CarryOn.
                  Start your free 30-day trial today.
                </p>
              </div>

              {/* Social proof */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: '130+', label: 'Families Protected' },
                  { value: 'AES-256', label: 'Bank-Grade Encryption' },
                  { value: '30 days', label: 'Free Trial' },
                ].map(stat => (
                  <div key={stat.label} className="bg-[#0f1729] border border-[#1e293b] rounded-xl p-3 sm:p-4 text-center">
                    <div className="text-lg sm:text-xl font-bold text-[#d4af37]">{stat.value}</div>
                    <div className="text-[10px] sm:text-xs text-[#94a3b8] mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* What's included */}
              <div className="bg-[#0f1729] border border-[#1e293b] rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider">Your trial includes</h3>
                {['Secure document vault', 'Milestone messages', 'AI estate guardian', 'Action checklists', 'Digital credential vault', 'Up to 3 beneficiaries'].map(item => (
                  <div key={item} className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-[#d4af37] flex-shrink-0" />
                    <span className="text-sm text-white">{item}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleStartTrial}
                disabled={loading}
                className="w-full h-14 rounded-xl font-bold text-base bg-gradient-to-r from-[#d4af37] to-[#b8962e] text-[#080e1a] hover:from-[#e0c050] hover:to-[#c8a63e] shadow-[0_4px_20px_rgba(212,175,55,0.3)]"
                data-testid="funnel-start-trial-btn"
              >
                Start My Free Trial <ChevronRight className="w-5 h-5 ml-1" />
              </Button>

              <p className="text-center text-[10px] sm:text-xs text-[#475569]">
                No credit card required. Cancel anytime.
              </p>
            </div>
          )}

          {/* STEP 5: Referral */}
          {step === 5 && (
            <div className="space-y-8 animate-in fade-in duration-500" data-testid="funnel-step-5">
              <div className="text-center space-y-4">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Bring Your Family Along</h1>
                <p className="text-[#94a3b8] text-sm sm:text-base max-w-md mx-auto">
                  Invite a family member and you'll <span className="text-white font-semibold">both</span> get
                  <span className="text-[#d4af37] font-semibold"> +7 bonus days</span> on your trial.
                </p>
              </div>

              <div className="bg-[#0f1729] border border-[#1e293b] rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3 text-[#d4af37]">
                  <Send className="w-5 h-5" />
                  <span className="text-sm font-semibold">Send an invite</span>
                </div>
                <Input
                  type="email"
                  placeholder="Family member's email"
                  value={referralEmail}
                  onChange={e => setReferralEmail(e.target.value)}
                  className="h-12 bg-[#080e1a] border-[#1e293b] text-white placeholder:text-[#475569] rounded-xl focus:border-[#d4af37] focus:ring-[#d4af37]/20"
                  data-testid="referral-email-input"
                />
                <Button
                  onClick={handleReferral}
                  disabled={!referralEmail || !referralEmail.includes('@') || loading}
                  className="w-full h-12 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#d4af37] to-[#b8962e] text-[#080e1a] hover:from-[#e0c050] hover:to-[#c8a63e] disabled:opacity-40"
                  data-testid="referral-send-btn"
                >
                  Send Invite & Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              <button
                onClick={handleSkipReferral}
                className="w-full text-center text-sm text-[#475569] hover:text-[#94a3b8] transition-colors py-2"
                data-testid="referral-skip-btn"
              >
                Skip for now — I'll invite them later
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Bottom branding */}
      <div className="text-center pb-6">
        <span className="text-xs text-[#1e293b]">CarryOn™ · Every American Family. Ready.</span>
      </div>
    </div>
  );
}
