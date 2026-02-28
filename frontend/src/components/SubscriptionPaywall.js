import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Crown, Shield, Check, Star, ChevronRight, Loader2,
  Upload, Clock, AlertTriangle, Users, X, Heart, Award
} from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIER_ICONS = {
  premium: Crown,
  standard: Star,
  base: Shield,
  new_adult: Award,
  military: Shield,
  hospice: Heart,
};

const TIER_COLORS = {
  premium: { border: '#d4af37', bg: 'rgba(212,175,55,0.08)', accent: '#d4af37' },
  standard: { border: '#60A5FA', bg: 'rgba(96,165,250,0.08)', accent: '#60A5FA' },
  base: { border: '#22C993', bg: 'rgba(34,201,147,0.08)', accent: '#22C993' },
  new_adult: { border: '#B794F6', bg: 'rgba(183,148,246,0.08)', accent: '#B794F6' },
  military: { border: '#F59E0B', bg: 'rgba(245,158,11,0.08)', accent: '#F59E0B' },
  hospice: { border: '#ec4899', bg: 'rgba(236,72,153,0.08)', accent: '#ec4899' },
};

export default function SubscriptionPaywall({ onDismiss }) {
  const { token, refreshSubscription } = useAuth();
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState('monthly');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [subStatus, setSubStatus] = useState(null);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationTier, setVerificationTier] = useState('');
  const [verificationFile, setVerificationFile] = useState(null);
  const [verificationDocType, setVerificationDocType] = useState('');
  const [uploadingVerification, setUploadingVerification] = useState(false);
  const [showFamilyInfo, setShowFamilyInfo] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  // Handle post-payment redirect — check session_id in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (sessionId && token) {
      setConfirmingPayment(true);
      axios.get(`${API_URL}/subscriptions/checkout-status/${sessionId}`, { headers })
        .then(async (res) => {
          if (res.data?.payment_status === 'paid' || res.data?.payment_status === 'complete') {
            toast.success('Payment confirmed! Activating your subscription...');
            // Clean up URL
            window.history.replaceState({}, '', window.location.pathname);
            // Refresh subscription status to dismiss paywall
            if (refreshSubscription) await refreshSubscription();
          } else {
            toast.info('Payment is being processed. Please wait a moment...');
            // Retry after a few seconds
            setTimeout(async () => {
              try {
                const retry = await axios.get(`${API_URL}/subscriptions/checkout-status/${sessionId}`, { headers });
                if (retry.data?.payment_status === 'paid' || retry.data?.payment_status === 'complete') {
                  toast.success('Subscription activated!');
                  window.history.replaceState({}, '', window.location.pathname);
                  if (refreshSubscription) await refreshSubscription();
                }
              } catch (e) { /* ignore retry errors */ }
              setConfirmingPayment(false);
            }, 5000);
            return;
          }
          setConfirmingPayment(false);
        })
        .catch(() => {
          toast.error('Could not confirm payment. Please contact support.');
          setConfirmingPayment(false);
        });
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async () => {
    try {
      const [plansRes, statusRes] = await Promise.all([
        axios.get(`${API_URL}/subscriptions/plans`),
        axios.get(`${API_URL}/subscriptions/status`, { headers }),
      ]);
      setPlans(plansRes.data.plans || []);
      setSubStatus(statusRes.data);
    } catch (err) {
      console.error('Failed to load subscription data:', err);
    }
    setLoading(false);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  const getPrice = (plan) => {
    if (plan.price === 0) return 'Free';
    if (billing === 'quarterly') return `$${plan.quarterly_price?.toFixed(2) || (plan.price * 0.9).toFixed(2)}`;
    if (billing === 'annual') return `$${plan.annual_price?.toFixed(2) || (plan.price * 0.8).toFixed(2)}`;
    return `$${plan.price.toFixed(2)}`;
  };

  const getBillingLabel = () => {
    if (billing === 'quarterly') return '/mo (billed quarterly)';
    if (billing === 'annual') return '/mo (billed annually)';
    return '/month';
  };

  const getSavingsLabel = () => {
    if (billing === 'quarterly') return 'Save 10%';
    if (billing === 'annual') return 'Save 20%';
    return null;
  };

  const handleCheckout = async (plan) => {
    if (plan.requires_verification && plan.id !== 'new_adult') {
      setVerificationTier(plan.id);
      setShowVerification(true);
      return;
    }

    setCheckoutLoading(true);
    try {
      const res = await axios.post(`${API_URL}/subscriptions/checkout`, {
        plan_id: plan.id,
        billing_cycle: billing,
        origin_url: window.location.origin,
      }, { headers });

      if (res.data.free) {
        toast.success(res.data.message);
        fetchData();
      } else if (res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start checkout');
    }
    setCheckoutLoading(false);
  };

  const handleVerificationUpload = async () => {
    if (!verificationFile || !verificationDocType) {
      toast.error('Please select a document type and file');
      return;
    }

    setUploadingVerification(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        const formData = new FormData();
        formData.append('tier_requested', verificationTier);
        formData.append('doc_type', verificationDocType);
        formData.append('file_data', base64);
        formData.append('file_name', verificationFile.name);

        try {
          const res = await axios.post(`${API_URL}/verification/upload`, formData, { headers });
          toast.success(res.data.message);
          setShowVerification(false);
          setVerificationFile(null);
          setVerificationDocType('');
          fetchData();
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Upload failed');
        }
        setUploadingVerification(false);
      };
      reader.readAsDataURL(verificationFile);
    } catch (err) {
      toast.error('Failed to process file');
      setUploadingVerification(false);
    }
  };

  // Filter plans based on eligibility
  const visiblePlans = plans.filter(p => {
    if (p.id === 'new_adult') {
      return subStatus?.eligible_tiers?.includes('new_adult');
    }
    return true;
  });

  const trial = subStatus?.trial || {};

  if (loading || confirmingPayment) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0a0e1a]/95 flex items-center justify-center flex-col gap-4" data-testid="paywall-loading">
        <Loader2 className="w-10 h-10 text-[#d4af37] animate-spin" />
        {confirmingPayment && <p className="text-[var(--t4)] text-sm">Confirming your payment...</p>}
      </div>
    );
  }

  // Verification Upload Modal
  if (showVerification) {
    const docOptions = verificationTier === 'military'
      ? ['Military ID', 'First Responder Badge']
      : ['Hospice enrollment documentation'];

    return (
      <div className="fixed inset-0 z-[9999] bg-[#0a0e1a]/95 flex items-center justify-center p-4" data-testid="verification-modal">
        <div className="w-full max-w-md glass-card p-6 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {verificationTier === 'military' ? 'Military / First Responder' : 'Hospice'} Verification
            </h2>
            <button onClick={() => setShowVerification(false)} className="text-[var(--t5)] hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-[var(--t4)]">
            Please upload one of the following documents to verify your eligibility:
          </p>

          <div className="space-y-3">
            <label className="text-sm text-[var(--t4)]">Document Type</label>
            <div className="flex flex-col gap-2">
              {docOptions.map(doc => (
                <button
                  key={doc}
                  onClick={() => setVerificationDocType(doc)}
                  className={`p-3 rounded-xl text-sm text-left transition-all ${
                    verificationDocType === doc
                      ? 'bg-[#d4af37]/10 border border-[#d4af37] text-[#d4af37]'
                      : 'bg-[var(--s)] border border-[var(--b)] text-[var(--t3)] hover:border-[var(--t5)]'
                  }`}
                  data-testid={`doc-type-${doc.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {doc}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-[var(--t4)]">Upload Document</label>
            <label className="flex items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-[var(--b)] hover:border-[#d4af37]/50 cursor-pointer transition-colors" data-testid="verification-file-input">
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => setVerificationFile(e.target.files[0])}
              />
              <Upload className="w-5 h-5 text-[var(--t5)]" />
              <span className="text-sm text-[var(--t4)]">
                {verificationFile ? verificationFile.name : 'Click to select file'}
              </span>
            </label>
          </div>

          <Button
            onClick={handleVerificationUpload}
            disabled={uploadingVerification || !verificationFile || !verificationDocType}
            className="gold-button w-full"
            data-testid="submit-verification-btn"
          >
            {uploadingVerification ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Upload className="w-5 h-5 mr-2" />}
            Submit for Review
          </Button>

          <p className="text-xs text-[var(--t5)] text-center">
            Documents are reviewed within 24-48 hours. You'll be notified once approved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[var(--bg)]/98 overflow-y-auto" data-testid="subscription-paywall">
      <div className="min-h-screen flex flex-col items-center justify-center py-8 px-4">
        {/* Header */}
        <div className="text-center mb-8 max-w-lg animate-fade-in">
          <img src="/carryon-logo.jpg" alt="CarryOn" className="w-[120px] h-auto mx-auto mb-4" />

          {trial.trial_expired ? (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Your Free Trial Has Ended
              </h1>
              <p className="text-[var(--t4)] text-sm">
                Choose a plan to continue protecting your family's legacy with CarryOn.
              </p>
            </>
          ) : trial.trial_active ? (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Choose Your Plan
              </h1>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-[#d4af37]" />
                <span className="text-[#d4af37] text-sm font-medium">
                  {trial.days_remaining} days left in your free trial
                </span>
              </div>
              <p className="text-[var(--t4)] text-sm">
                Select a plan now to ensure uninterrupted access when your trial ends.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Choose Your Plan
              </h1>
              <p className="text-[var(--t4)] text-sm">
                Subscribe to access the full CarryOn platform.
              </p>
            </>
          )}

          {/* Verification pending notice */}
          {subStatus?.verification?.status === 'pending' && (
            <div className="mt-4 p-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20">
              <div className="flex items-center gap-2 text-[#F59E0B] text-sm">
                <Clock className="w-4 h-4" />
                Your {subStatus.verification.tier_requested} verification is under review
              </div>
            </div>
          )}
        </div>

        {/* Billing Cycle Toggle */}
        <div className="flex items-center gap-2 mb-6 animate-fade-in" data-testid="billing-toggle">
          {['monthly', 'quarterly', 'annual'].map((b) => (
            <button
              key={b}
              onClick={() => setBilling(b)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all capitalize relative ${
                billing === b
                  ? 'bg-[#d4af37] text-[#0F1629]'
                  : 'bg-[var(--s)] text-[var(--t5)] hover:text-[var(--t)] border border-[var(--b)]'
              }`}
              data-testid={`paywall-billing-${b}`}
            >
              {b}
              {b !== 'monthly' && billing === b && (
                <span className="absolute -top-2 -right-2 text-[10px] bg-[#22C993] text-white px-1.5 py-0.5 rounded-full font-bold">
                  {getSavingsLabel()}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Plan Cards — 6 tiles (3x2) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl w-full mb-8 animate-fade-in">
          {visiblePlans.filter(p => !['hospice'].includes(p.id) || p.price === 0).map((plan) => {
            const Icon = TIER_ICONS[plan.id] || Shield;
            const colors = TIER_COLORS[plan.id] || TIER_COLORS.base;
            const isSelected = selectedPlan === plan.id;
            const isPremium = plan.id === 'premium';
            const eligibleTiers = subStatus?.eligible_tiers || [];
            const eligible = plan.id !== 'new_adult' || eligibleTiers.includes('new_adult');

            return (
              <div
                key={plan.id}
                onClick={() => eligible && setSelectedPlan(plan.id)}
                className={`relative rounded-2xl overflow-hidden transition-all duration-300 group ${
                  !eligible ? 'opacity-45 cursor-default' : 'cursor-pointer'
                } ${
                  eligible && isPremium ? 'hover:-translate-y-2 sm:scale-[1.03]' : eligible ? 'hover:-translate-y-1' : ''
                }`}
                style={{
                  background: isPremium 
                    ? `linear-gradient(168deg, rgba(212,175,55,0.15) 0%, var(--card-bg) 40%)`
                    : isSelected 
                      ? `linear-gradient(168deg, ${colors.bg} 0%, var(--card-bg) 100%)`
                      : 'var(--card-bg)',
                  border: isPremium 
                    ? '2px solid rgba(212,175,55,0.4)'
                    : isSelected 
                      ? `2px solid ${colors.border}` 
                      : '1px solid var(--card-border)',
                  boxShadow: isPremium 
                    ? '0 12px 48px -8px rgba(212,175,55,0.3), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                    : isSelected
                      ? `0 8px 32px -6px ${colors.accent}44, 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)`
                      : '0 4px 16px -4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                }}
                data-testid={`paywall-plan-${plan.id}`}
              >
                {/* Premium shimmer line */}
                {isPremium && (
                  <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.6), transparent)' }} />
                )}

                {isPremium && (
                  <div className="absolute -top-0 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1.5 rounded-b-xl"
                    style={{ background: 'linear-gradient(180deg, #d4af37, #b8962e)', color: '#0F1629', boxShadow: '0 4px 16px rgba(212,175,55,0.4)' }}>
                    Most Popular
                  </div>
                )}

                <div className="p-5 pt-6">
                  {/* Tier icon + name */}
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" 
                      style={{ background: `${colors.accent}18`, border: `1px solid ${colors.accent}30` }}>
                      <Icon className="w-5 h-5" style={{ color: colors.accent }} />
                    </div>
                    <h3 className="font-bold text-lg text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>{plan.name}</h3>
                  </div>

                  {/* Price — hero element */}
                  <div className="mb-1">
                    <span className="text-4xl font-bold tracking-tight" style={{ color: isPremium ? '#d4af37' : colors.accent, fontFamily: 'Outfit, sans-serif' }}>
                      {getPrice(plan)}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-xs text-[var(--t5)] ml-1.5">{getBillingLabel()}</span>
                    )}
                  </div>

                  {plan.ben_price !== undefined && (
                    <p className="text-xs text-[var(--t5)] mb-4">
                      Beneficiary: <span className="text-[var(--t5)]">${plan.ben_price.toFixed(2)}/mo</span>
                    </p>
                  )}

                  {/* Divider */}
                  <div className="h-px mb-4" style={{ background: `linear-gradient(90deg, transparent, ${colors.accent}30, transparent)` }} />

                  {/* Features */}
                  <div className="space-y-2.5 mb-5">
                    {(plan.features || []).map((f, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-sm">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" 
                          style={{ background: `${colors.accent}15` }}>
                          <Check className="w-3 h-3" style={{ color: colors.accent }} />
                        </div>
                        <span className="text-[var(--t4)]">{f}</span>
                      </div>
                    ))}
                  </div>

                  {plan.note && (
                    <p className="text-xs text-[var(--t5)] italic mb-4">{plan.note}</p>
                  )}

                  {/* CTA Button */}
                  {!eligible ? (
                    <div className="w-full text-center text-xs font-medium py-3 rounded-xl text-[var(--t5)]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      Ages 18–25 only
                    </div>
                  ) : (
                    <Button
                      onClick={(e) => { e.stopPropagation(); handleCheckout(plan); }}
                      disabled={checkoutLoading}
                      className={`w-full text-sm font-bold py-5 transition-all duration-300 ${
                        isPremium
                          ? 'gold-button shadow-[0_4px_20px_rgba(212,175,55,0.3)]'
                          : isSelected
                            ? 'gold-button'
                            : 'bg-transparent border-2 hover:bg-white/[0.04]'
                      }`}
                      style={!isPremium && !isSelected ? { borderColor: `${colors.accent}40`, color: colors.accent } : {}}
                      data-testid={`paywall-select-${plan.id}`}
                    >
                      {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      {plan.requires_verification && plan.id !== 'new_adult' ? 'Verify & Subscribe' : 'Subscribe'}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Family Plan — special tile */}
          <div
            className="relative rounded-2xl cursor-pointer transition-all duration-300 hover:-translate-y-1 flex flex-col overflow-hidden group"
            style={{
              background: selectedPlan === 'family' 
                ? 'linear-gradient(168deg, rgba(212,175,55,0.12) 0%, rgba(20,28,51,0.95) 100%)' 
                : 'linear-gradient(168deg, rgba(26,36,64,0.8) 0%, rgba(20,28,51,0.95) 100%)',
              border: `${selectedPlan === 'family' ? '2px' : '1px'} solid ${selectedPlan === 'family' ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.07)'}`,
              boxShadow: selectedPlan === 'family' 
                ? '0 8px 32px -6px rgba(212,175,55,0.2), inset 0 1px 0 rgba(255,255,255,0.06)' 
                : '0 4px 16px -4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
            onClick={() => setSelectedPlan('family')}
            data-testid="paywall-plan-family"
          >
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" 
                  style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)' }}>
                  <Users className="w-5 h-5 text-[#d4af37]" />
                </div>
                <h3 className="font-bold text-lg text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Family Plan</h3>
              </div>

              <div className="mb-1">
                <span className="text-2xl font-bold text-[#d4af37]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Bundle & Save
                </span>
              </div>
              <p className="text-xs text-[var(--t5)] mb-4">All beneficiaries: <span className="text-[var(--t5)]">flat $3.49/mo</span></p>

              <div className="h-px mb-4" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.2), transparent)' }} />

              <div className="space-y-2.5 mb-5 flex-1">
                {['Owner pays standard tier rate', 'Added benefactors save $1/mo', 'Successor inherits ownership', 'Floor tiers exempt from discount'].map((f, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(212,175,55,0.12)' }}>
                      <Check className="w-3 h-3 text-[#d4af37]" />
                    </div>
                    <span className="text-[var(--t4)]">{f}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-[var(--t5)] italic mb-4">Subscribe individually, then add family from Settings</p>

              <Button
                onClick={(e) => { e.stopPropagation(); setShowFamilyInfo(!showFamilyInfo); }}
                className="w-full text-sm font-bold py-5 bg-transparent border-2 hover:bg-white/[0.04]"
                style={{ borderColor: 'rgba(212,175,55,0.35)', color: '#d4af37' }}
                data-testid="paywall-select-family"
              >
                Learn More <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>

        {/* Family Plan Details (expanded) */}
        {showFamilyInfo && (
          <div className="max-w-5xl w-full mb-8 animate-fade-in">
            <div className="rounded-2xl p-5" style={{
              background: 'rgba(212,175,55,0.04)',
              border: '2px solid rgba(212,175,55,0.15)',
            }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[var(--t)] text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#d4af37]" />
                  Family Plan Details
                </h3>
                <button onClick={() => setShowFamilyInfo(false)} className="text-[var(--t5)] hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-xl bg-[#1a2035]">
                  <p className="text-[#d4af37] font-bold">Plan Owner</p>
                  <p className="text-[var(--t4)]">Pays standard tier rate. Sets the plan anchor.</p>
                </div>
                <div className="p-3 rounded-xl bg-[#1a2035]">
                  <p className="text-[#60A5FA] font-bold">Added Benefactors</p>
                  <p className="text-[var(--t4)]">$1/mo discount off their individual tier rate</p>
                </div>
                <div className="p-3 rounded-xl bg-[#1a2035]">
                  <p className="text-[#22C993] font-bold">All Beneficiaries</p>
                  <p className="text-[var(--t4)]">Flat $3.49/mo regardless of tier</p>
                </div>
              </div>
              <p className="text-xs text-[var(--t5)] mt-3">
                Subscribe to any individual plan first, then set up your Family Plan from Settings. Designate a successor who inherits ownership upon transition.
              </p>
            </div>
          </div>
        )}

        {/* Dismiss button (if trial is still active) */}
        {trial.trial_active && onDismiss && (
          <button
            onClick={onDismiss}
            className="text-[var(--t5)] text-sm hover:text-white transition-colors mb-4"
            data-testid="paywall-dismiss"
          >
            Continue with free trial ({trial.days_remaining} days remaining)
          </button>
        )}

        {/* Footer */}
        <div className="text-center mb-4 animate-fade-in">
          <p className="text-[var(--t5)] text-xs">
            AES-256 Encrypted · Zero-Knowledge Architecture · All plans include full security
          </p>
          <p className="text-[var(--t5)] text-xs mt-1">
            Cancel anytime · No long-term commitment
          </p>
        </div>
      </div>
    </div>
  );
}
