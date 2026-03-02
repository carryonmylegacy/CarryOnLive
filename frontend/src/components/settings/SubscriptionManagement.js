import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  CreditCard, Loader2, Clock, ChevronRight, Zap, Shield, X, Check,
  Crown, Star, Heart, Award, ArrowRight, Users, Mail, Sparkles, Upload
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIER_STYLES = {
  ben_premium: { accent: '#d4af37', icon: Crown, label: 'Best Value' },
  ben_standard: { accent: '#60A5FA', icon: Star, label: null },
  ben_base: { accent: '#22C993', icon: Shield, label: null },
  ben_military: { accent: '#F59E0B', icon: Shield, label: 'Flat Rate' },
  ben_hospice: { accent: '#ec4899', icon: Heart, label: 'Post-Transition' },
  ben_veteran: { accent: '#059669', icon: Award, label: 'Flat Rate' },
  premium: { accent: '#d4af37', icon: Crown, label: 'Most Popular' },
  standard: { accent: '#60A5FA', icon: Star, label: null },
  base: { accent: '#22C993', icon: Shield, label: null },
  new_adult: { accent: '#B794F6', icon: Award, label: 'Ages 18-25' },
  military: { accent: '#F59E0B', icon: Shield, label: 'Verified' },
  hospice: { accent: '#ec4899', icon: Heart, label: 'Free' },
  veteran: { accent: '#059669', icon: Award, label: 'Verified' },
  enterprise: { accent: '#8B5CF6', icon: Zap, label: 'B2B Partner' },
};

const BeneficiaryBillingToggle = ({ billing, onChange }) => {
  const cycles = [
    { id: 'monthly', label: 'Monthly', save: null },
    { id: 'quarterly', label: 'Quarterly', save: '10%' },
    { id: 'annual', label: 'Annual', save: '20%' },
  ];

  return (
    <div className="flex justify-center mb-8" data-testid="billing-toggle">
      <div className="inline-flex p-1 rounded-2xl" style={{
        background: 'var(--s)',
        border: '1px solid var(--b)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
      }}>
        {cycles.map((c) => (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className="relative px-6 py-2.5 rounded-xl text-xs font-bold transition-all duration-300"
            style={{
              background: billing === c.id ? 'linear-gradient(135deg, #d4af37, #c9a033)' : 'transparent',
              color: billing === c.id ? '#0F1629' : 'var(--t5)',
              boxShadow: billing === c.id ? '0 4px 16px rgba(212,175,55,0.35)' : 'none',
            }}
            data-testid={`billing-${c.id}`}
          >
            {c.label}
            {c.save && (
              <span className="absolute -top-2 -right-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: '#22C993', color: '#fff', boxShadow: '0 2px 8px rgba(34,201,147,0.4)' }}>
                -{c.save}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

const PriceDisplay = ({ plan, billing }) => {
  const basePrice = plan.price || 0;
  if (basePrice === 0) return <span className="text-3xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Free</span>;

  let displayPrice = basePrice;
  if (billing === 'quarterly') displayPrice = plan.quarterly_price || basePrice * 0.9;
  else if (billing === 'annual') displayPrice = plan.annual_price || basePrice * 0.8;

  const periodLabel = billing === 'annual' ? '/mo billed annually' : billing === 'quarterly' ? '/mo billed quarterly' : '/month';

  return (
    <div className="flex items-baseline gap-1">
      <span className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
        ${displayPrice.toFixed(2)}
      </span>
      <span className="text-sm text-[var(--t4)]">{periodLabel}</span>
    </div>
  );
};

export const SubscriptionManagement = ({
  subscriptionStatus,
  refreshSubscription,
  getAuthHeaders,
  onShowPaywall,
}) => {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [beneficiaryPlans, setBeneficiaryPlans] = useState([]);
  const [billing, setBilling] = useState('monthly');
  const [subscribing, setSubscribing] = useState(null);
  const [cancellingPlan, setCancellingPlan] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showFamilyRequest, setShowFamilyRequest] = useState(false);
  const [familyEmail, setFamilyEmail] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);
  // Verification state
  const [showVerification, setShowVerification] = useState(false);
  const [verificationTier, setVerificationTier] = useState('');
  const [verificationFile, setVerificationFile] = useState(null);
  const [verificationDocType, setVerificationDocType] = useState('');
  const [uploadingVerification, setUploadingVerification] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [changingBilling, setChangingBilling] = useState(false);

  const isBeneficiary = user?.role === 'beneficiary';
  const currentSub = subscriptionStatus?.subscription;
  const currentPlanId = currentSub?.plan_id;
  const currentBilling = currentSub?.billing_cycle || 'monthly';
  const isBeta = subscriptionStatus?.beta_mode;
  const lockedTier = subscriptionStatus?.beneficiary_locked_tier;
  const estateTransitioned = subscriptionStatus?.estate_transitioned || false;
  const benCanSubscribe = !isBeneficiary || estateTransitioned;

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await axios.get(`${API_URL}/subscriptions/plans`);
        setPlans(res.data.plans || []);
        setBeneficiaryPlans(res.data.beneficiary_plans || []);
      } catch (e) { /* fallback empty */ }
    };
    const fetchVerification = async () => {
      try {
        const res = await axios.get(`${API_URL}/verification/status`, getAuthHeaders());
        setVerificationStatus(res.data);
      } catch (e) { /* ignore */ }
    };
    fetchPlans();
    fetchVerification();
    if (currentBilling) setBilling(currentBilling);
  }, [currentBilling]); // eslint-disable-line react-hooks/exhaustive-deps

  // For beneficiaries: show only their locked-in tier (determined by benefactor's majority plan)
  // If no locked tier yet, show nothing — they can't choose
  // For under-18 beneficiaries: no charge tier at all
  const isMinorBeneficiary = isBeneficiary && subscriptionStatus?.is_minor;
  const displayPlans = isBeneficiary
    ? (isMinorBeneficiary ? [] : (lockedTier ? beneficiaryPlans.filter(p => p.id === lockedTier) : []))
    : plans;

  // Determine auto-selected tier from eligible_tiers / special_status
  const eligibleTiers = subscriptionStatus?.eligible_tiers || [];
  const specialStatus = subscriptionStatus?.special_status || [];
  const hasSpecialStatus = specialStatus.length > 0;
  const isNewAdult = eligibleTiers.includes('new_adult') && !hasSpecialStatus;
  const autoTier = hasSpecialStatus
    ? (specialStatus.includes('hospice') ? 'hospice' : specialStatus.includes('veteran') ? 'veteran' : specialStatus.includes('enterprise') ? 'enterprise' : 'military')
    : (isNewAdult ? 'new_adult' : null);

  const handleVerifyB2bCode = async () => {
    if (!b2bCode.trim()) { toast.error('Please enter your partner code'); return; }
    setVerifyingCode(true);
    try {
      const res = await axios.post(`${API_URL}/subscriptions/verify-b2b-code`, { code: b2bCode }, getAuthHeaders());
      if (res.data.verified) {
        refreshSubscription?.();
        setB2bCode('');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid code');
    } finally {
      setVerifyingCode(false);
    }
  };

  // Should a plan be greyed out (not selectable)?
  const isPlanLocked = (planId) => {
    if (!autoTier) return false;
    return planId !== autoTier;
  };

  // Check if beneficiary's locked plan allows billing toggle (military does not)
  const lockedPlan = lockedTier ? beneficiaryPlans.find(p => p.id === lockedTier) : null;
  const showBillingToggle = !isBeneficiary || (lockedPlan && lockedPlan.allows_billing_toggle !== false);
  const beneficiaryNoTierYet = isBeneficiary && !lockedTier;

  const requiresVerification = (planId) => ['military', 'hospice', 'veteran', 'enterprise'].includes(planId);

  // Check if user is already verified for a tier
  const isVerifiedFor = (planId) => {
    return subscriptionStatus?.verification?.status === 'approved' &&
      subscriptionStatus?.verification?.tier_requested === planId;
  };

  const VERIFICATION_DOCS = {
    military: ['Military ID', 'Active Duty Orders', 'First Responder Badge'],
    hospice: ['Hospice Enrollment Documentation'],
    veteran: ['DD214', 'Veterans Administration Benefits Letter'],
    enterprise: ['Partner access code'],
  };

  // B2B code verification state
  const [b2bCode, setB2bCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);

  // Detect if a plan/billing change is a downgrade (would require refund)
  const PLAN_RANK = { base: 1, new_adult: 2, veteran: 3, military: 3, enterprise: 3, standard: 4, premium: 5, hospice: 0 };
  const CYCLE_RANK = { monthly: 1, quarterly: 2, annual: 3 };

  const isDowngrade = (newPlanId, newCycle) => {
    if (!currentSub) return false;
    const oldPlanRank = PLAN_RANK[currentPlanId] || 0;
    const newPlanRank = PLAN_RANK[newPlanId] || 0;
    const oldCycleRank = CYCLE_RANK[currentBilling] || 1;
    const newCycleRank = CYCLE_RANK[newCycle] || 1;
    // Downgrade if moving to a lower tier, OR same tier but shorter billing cycle
    return newPlanRank < oldPlanRank || (newPlanRank === oldPlanRank && newCycleRank < oldCycleRank);
  };

  const handleVerificationUpload = async () => {
    if (!verificationFile || !verificationDocType) {
      toast.error('Please select a document type and upload a file');
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
          const res = await axios.post(`${API_URL}/verification/upload`, formData, getAuthHeaders());
          // toast removed
          setShowVerification(false);
          setVerificationFile(null);
          setVerificationDocType('');
          setVerificationStatus({ status: 'pending', tier_requested: verificationTier });
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Verification upload failed');
        }
        setUploadingVerification(false);
      };
      reader.readAsDataURL(verificationFile);
    } catch (err) {
      toast.error('Failed to process file');
      setUploadingVerification(false);
    }
  };

  const handleSubscribe = async (planId) => {
    // Gate verification-required plans
    if (requiresVerification(planId) && !isVerifiedFor(planId)) {
      if (verificationStatus?.status === 'pending') {
        // toast removed
        return;
      }
      setVerificationTier(planId);
      setShowVerification(true);
      return;
    }

    setSubscribing(planId);
    try {
      const res = await axios.post(`${API_URL}/subscriptions/checkout`, {
        plan_id: planId,
        billing_cycle: billing,
        origin_url: window.location.origin,
      }, getAuthHeaders());
      if (res.data.url) {
        window.location.href = res.data.url;
      } else if (res.data.free) {
        // toast removed
        if (refreshSubscription) await refreshSubscription();
      }
    } catch (e) {
      const detail = e.response?.data?.detail || 'Failed to start checkout';
      if (detail.includes('beta')) {
        // toast removed
      } else {
        toast.error(detail);
      }
    }
    setSubscribing(null);
  };

  const handleChangePlan = async (planId) => {
    if (planId === currentPlanId && billing === currentBilling) return;

    // Downgrade → send to customer service
    if (isDowngrade(planId, billing)) {
      try {
        await axios.post(`${API_URL}/support/messages`, {
          content: `I'd like to change my subscription from ${currentSub?.plan_name || currentPlanId} (${currentBilling}) to ${planId} (${billing}). Since this is a downgrade, please process the refund for the unused portion and switch my plan. Thank you.`,
        }, getAuthHeaders());
        // toast removed
      } catch (e) {
        toast.error('Failed to send request. Please go to Customer Service directly.');
      }
      return;
    }

    // Upgrade → proceed with Stripe
    setSubscribing(planId);
    try {
      const res = await axios.post(`${API_URL}/subscriptions/change-plan`, {
        plan_id: planId,
        billing_cycle: billing,
        origin_url: window.location.origin,
      }, getAuthHeaders());
      if (res.data.url) {
        window.location.href = res.data.url;
      } else if (res.data.success) {
        // toast removed
        if (refreshSubscription) await refreshSubscription();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to change plan');
    }
    setSubscribing(null);
  };

  const handleChangeBilling = async () => {
    // Downgrading billing cycle (e.g., annual → quarterly) → customer service
    if (isDowngrade(currentPlanId, billing)) {
      try {
        await axios.post(`${API_URL}/support/messages`, {
          content: `I'd like to change my billing cycle from ${currentBilling} to ${billing} on my ${currentSub?.plan_name || currentPlanId} plan. Since this is a downgrade, please process the refund for the unused portion and update my billing. Thank you.`,
        }, getAuthHeaders());
        // toast removed
      } catch (e) {
        toast.error('Failed to send request. Please go to Customer Service directly.');
      }
      setChangingBilling(false);
      return;
    }

    // Upgrade billing cycle → proceed normally
    setChangingBilling(true);
    try {
      const res = await axios.post(`${API_URL}/subscriptions/change-billing`, {
        billing_cycle: billing,
        origin_url: window.location.origin,
      }, getAuthHeaders());
      if (res.data.url) {
        window.location.href = res.data.url;
      } else if (res.data.success) {
        // toast removed
        if (refreshSubscription) await refreshSubscription();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to change billing cycle');
    }
    setChangingBilling(false);
  };


  const handleCancelSubscription = async () => {
    setCancellingPlan(true);
    try {
      await axios.post(`${API_URL}/subscriptions/cancel`, {}, getAuthHeaders());
      // toast removed
      setShowCancelConfirm(false);
      if (refreshSubscription) await refreshSubscription();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to cancel');
    }
    setCancellingPlan(false);
  };

  const handleFamilyPlanRequest = async () => {
    if (!familyEmail.trim()) {
      toast.error('Please enter the benefactor\'s email');
      return;
    }
    setSendingRequest(true);
    try {
      await axios.post(`${API_URL}/subscriptions/family-plan-request`, {
        benefactor_email: familyEmail.trim(),
      }, getAuthHeaders());
      // toast removed
      setShowFamilyRequest(false);
      setFamilyEmail('');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to send request');
    }
    setSendingRequest(false);
  };

  return (
    <Card className="glass-card overflow-hidden" data-testid="subscription-management">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[var(--t)] flex items-center gap-2.5" style={{ fontFamily: 'Outfit, sans-serif' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))', border: '1px solid rgba(212,175,55,0.2)' }}>
              <CreditCard className="w-4.5 h-4.5 text-[var(--gold)]" />
            </div>
            {isBeneficiary ? 'Your Plan' : 'Subscription'}
          </CardTitle>
          {currentSub?.status === 'active' && (
            <button onClick={() => setShowCancelConfirm(true)} className="text-[10px] text-[var(--t5)] hover:text-red-400 transition-colors px-3 py-1 rounded-lg hover:bg-red-500/5" data-testid="cancel-sub-btn">
              Cancel Plan
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Status Banner */}
        {subscriptionStatus && (
          <div className="mb-6 p-4 rounded-xl relative overflow-hidden" style={{
            background: isBeta
              ? 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.05))'
              : currentSub?.status === 'active'
                ? 'linear-gradient(135deg, rgba(34,201,147,0.08), rgba(34,201,147,0.02))'
                : 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.02))',
            border: `1px solid ${isBeta ? 'rgba(139,92,246,0.15)' : currentSub?.status === 'active' ? 'rgba(34,201,147,0.15)' : 'rgba(212,175,55,0.15)'}`,
          }}>
            <div className="flex items-center gap-2.5">
              {isBeta ? (
                <Sparkles className="w-4 h-4 text-purple-400" />
              ) : currentSub?.status === 'active' ? (
                <Zap className="w-4 h-4 text-[#22C993]" />
              ) : (
                <Clock className="w-4 h-4 text-[var(--gold)]" />
              )}
              <div>
                <span className="text-sm font-semibold text-[var(--t)]">
                  {isBeta ? 'Beta Access — All features unlocked' :
                   currentSub?.status === 'active'
                    ? `${currentSub.plan_name} · ${currentSub.billing_cycle}`
                    : subscriptionStatus.trial?.trial_active
                      ? `Free Trial · ${subscriptionStatus.trial.days_remaining} days left`
                      : 'Choose a plan to get started'}
                </span>
                {isBeta && (
                  <p className="text-[10px] text-[var(--t5)] mt-0.5">No payment required during beta period</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cancel Confirm */}
        {showCancelConfirm && (
          <div className="mb-5 p-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="text-sm text-[var(--t3)] mb-3">Cancel your subscription? Access continues until the end of your billing period.</p>
            <div className="flex gap-2">
              <Button onClick={handleCancelSubscription} disabled={cancellingPlan}
                className="text-xs px-4 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                data-testid="confirm-cancel-btn">
                {cancellingPlan ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Yes, Cancel
              </Button>
              <Button onClick={() => setShowCancelConfirm(false)} className="text-xs px-4 py-2 bg-[var(--s)] text-[var(--t4)] border border-[var(--b)]">Keep Plan</Button>
            </div>
          </div>
        )}

        {/* Billing Toggle — hidden for military beneficiaries (flat rate) */}
        {showBillingToggle && <BeneficiaryBillingToggle billing={billing} onChange={setBilling} />}

        {/* Locked tier info for beneficiaries */}
        {isBeneficiary && lockedPlan && (
          <div className="mb-5 p-4 rounded-xl" style={{ background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)' }}>
            <p className="text-xs text-[var(--t4)] leading-relaxed">
              Your tier was set by your benefactor based on the plan they held for the majority of their subscription period.
              {!lockedPlan.allows_billing_toggle && ' This plan has flat-rate pricing with no quarterly or annual discounts.'}
            </p>
          </div>
        )}

        {/* Beneficiary: no tier determined yet */}
        {beneficiaryNoTierYet && !isMinorBeneficiary && (
          <div className="p-6 rounded-2xl text-center" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <CreditCard className="w-10 h-10 mx-auto text-[var(--gold)] mb-3 opacity-50" />
            <h4 className="text-sm font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Your Plan Is Determined by Your Benefactor</h4>
            <p className="text-xs text-[var(--t4)] leading-relaxed max-w-md mx-auto mb-4">
              Your beneficiary tier is automatically set based on the plan your benefactor held for the majority of their subscription period with CarryOn. You do not need to select a plan — it will appear here once determined.
            </p>
            <p className="text-[10px] text-[var(--t5)]">
              Beneficiary pricing does not begin until a verified transition event occurs. Minor beneficiaries (under 18) are free.
            </p>
          </div>
        )}

        {/* Minor beneficiary: no charge */}
        {isMinorBeneficiary && (
          <div className="p-6 rounded-2xl text-center" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
            <Users className="w-10 h-10 mx-auto text-[#22C993] mb-3 opacity-50" />
            <h4 className="text-sm font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>No Subscription Required</h4>
            <p className="text-xs text-[var(--t4)] leading-relaxed max-w-md mx-auto">
              Beneficiaries under 18 have full access at no charge. Your access is managed through your benefactor's estate plan.
            </p>
          </div>
        )}

        {/* Auto-tier info banner */}
        {autoTier && !isBeneficiary && (
          <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <p className="text-xs text-[var(--yw)] leading-relaxed">
              {isNewAdult
                ? 'Based on your age (18-25), you qualify for the New Adult tier. No verification required.'
                : autoTier === 'enterprise'
                ? 'You selected Enterprise / B2B Partner. Enter your partner code below to activate your access.'
                : `Based on your special eligibility, you qualify for the ${autoTier === 'military' ? 'Military / First Responder' : autoTier === 'veteran' ? 'Veteran' : 'Hospice'} tier. Verification is required after subscribing.`}
            </p>
          </div>
        )}

        {/* Plan Cards */}
        <div className={`grid gap-4 ${displayPlans.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' : displayPlans.length <= 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`} data-testid="plan-grid">
          {displayPlans.map((plan) => {
            const style = TIER_STYLES[plan.id] || TIER_STYLES.base;
            const Icon = style.icon;
            const isCurrent = currentPlanId === plan.id;
            const isRecommended = plan.id === 'ben_premium' || plan.id === 'premium';
            const locked = isPlanLocked(plan.id);
            const isAutoSelected = autoTier === plan.id;

            return (
              <div key={plan.id} className={`relative rounded-2xl overflow-hidden transition-all duration-300 group ${locked ? 'opacity-40 pointer-events-none' : 'hover:-translate-y-1'}`} style={{
                background: isAutoSelected
                  ? `linear-gradient(168deg, ${style.accent}15, ${style.accent}06)`
                  : isCurrent
                  ? `linear-gradient(168deg, ${style.accent}12, ${style.accent}04)`
                  : 'var(--s)',
                border: isAutoSelected
                  ? `2px solid ${style.accent}`
                  : isCurrent
                  ? `2px solid ${style.accent}`
                  : isRecommended
                    ? `2px solid ${style.accent}50`
                    : '1px solid var(--b)',
                boxShadow: isAutoSelected
                  ? `0 8px 32px ${style.accent}25`
                  : isCurrent
                  ? `0 8px 32px ${style.accent}20`
                  : isRecommended
                    ? `0 8px 32px ${style.accent}15`
                    : '0 2px 8px rgba(0,0,0,0.05)',
              }} data-testid={`plan-${plan.id}`}>
                {/* Label badges */}
                {(style.label || isCurrent || isAutoSelected) && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[9px] font-bold px-3 py-0.5 rounded-b-lg z-10"
                    style={{ background: style.accent, color: '#0F1629' }}>
                    {isCurrent ? 'Current Plan' : isAutoSelected ? 'Your Tier' : style.label}
                  </div>
                )}

                <div className="p-5 pt-7 flex flex-col h-full">
                  {/* Plan header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                      style={{ background: `${style.accent}12`, border: `1px solid ${style.accent}25` }}>
                      <Icon className="w-4 h-4" style={{ color: style.accent }} />
                    </div>
                    <h3 className="font-bold text-base text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>{plan.name}</h3>
                  </div>

                  {/* Price — animates on billing change */}
                  <div className="mb-4" style={{ color: style.accent }}>
                    <PriceDisplay plan={plan} billing={billing} />
                  </div>

                  {/* Beneficiary price — only on benefactor side */}
                  {!isBeneficiary && plan.ben_price !== undefined && (
                    <div className="mb-4 -mt-2 text-[var(--t4)] text-sm">
                      Beneficiary: <span className="font-bold text-[var(--t3)]">${plan.ben_price.toFixed(2)}/mo</span>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="h-px mb-4" style={{ background: `linear-gradient(90deg, transparent, ${style.accent}20, transparent)` }} />

                  {/* Features */}
                  <div className="space-y-2 mb-5 flex-1">
                    {(plan.features || []).map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-[var(--t3)]">
                        <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: `${style.accent}12` }}>
                          <Check className="w-2.5 h-2.5" style={{ color: style.accent }} />
                        </div>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>

                  {plan.note && <p className="text-sm text-[var(--t4)] italic mb-3">{plan.note}</p>}

                  {/* CTA Button */}
                  {isCurrent ? (
                    <div className="space-y-2">
                      <div className="w-full text-center text-xs font-bold py-3 rounded-xl"
                        style={{ background: `${style.accent}10`, color: style.accent, border: `1px solid ${style.accent}25` }}>
                        <Check className="w-3 h-3 inline mr-1" /> Active · {currentBilling}
                      </div>
                      {billing !== currentBilling && (
                        <Button
                          onClick={() => handleChangeBilling()}
                          disabled={changingBilling}
                          className="w-full text-xs font-bold py-3 transition-all duration-300"
                          style={isDowngrade(currentPlanId, billing)
                            ? { background: 'transparent', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.3)' }
                            : { background: `linear-gradient(135deg, ${style.accent}, ${style.accent}cc)`, color: '#0F1629', boxShadow: `0 4px 16px ${style.accent}30` }
                          }
                          data-testid="change-billing-btn"
                        >
                          {changingBilling ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> :
                           isDowngrade(currentPlanId, billing) ? <Mail className="w-3 h-3 mr-1" /> : <ArrowRight className="w-3 h-3 mr-1" />}
                          {isDowngrade(currentPlanId, billing) ? `Contact Support` : `Switch to ${billing}`}
                        </Button>
                      )}
                    </div>
                  ) : requiresVerification(plan.id) && !isVerifiedFor(plan.id) ? (
                    // Verification required — show status, code input for enterprise, or verify button
                    plan.id === 'enterprise' ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            value={b2bCode}
                            onChange={(e) => setB2bCode(e.target.value.toUpperCase())}
                            placeholder="Enter partner code"
                            className="flex-1 text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--b)' }}
                            data-testid="b2b-code-input"
                          />
                          <Button
                            onClick={handleVerifyB2bCode}
                            disabled={verifyingCode || !b2bCode.trim()}
                            className="text-xs font-bold px-4"
                            style={{ background: `linear-gradient(135deg, ${style.accent}, ${style.accent}cc)`, color: '#fff' }}
                            data-testid="verify-b2b-code-btn"
                          >
                            {verifyingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Activate'}
                          </Button>
                        </div>
                        <p className="text-[10px] text-[var(--t5)] text-center">Code provided by your employer or partner</p>
                      </div>
                    ) : verificationStatus?.status === 'pending' && verificationStatus?.tier_requested === plan.id ? (
                      <div className="w-full text-center text-xs font-bold py-3 rounded-xl"
                        style={{ background: `${style.accent}08`, color: style.accent, border: `1px dashed ${style.accent}40` }}>
                        <Clock className="w-3 h-3 inline mr-1" /> Verification Pending
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleSubscribe(plan.id)}
                        disabled={subscribing === plan.id}
                        className="w-full text-xs font-bold py-4 transition-all duration-300"
                        style={{ background: 'transparent', color: style.accent, border: `2px solid ${style.accent}35` }}
                        data-testid={`subscribe-${plan.id}`}
                      >
                        <Shield className="w-3.5 h-3.5 mr-1" /> Verify & Subscribe
                      </Button>
                    )
                  ) : currentSub?.status === 'active' ? (
                    <Button
                      onClick={() => handleChangePlan(plan.id)}
                      disabled={subscribing === plan.id}
                      className="w-full text-xs font-bold py-4 transition-all duration-300"
                      style={isDowngrade(plan.id, billing)
                        ? { background: 'transparent', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.3)' }
                        : { background: `linear-gradient(135deg, ${style.accent}, ${style.accent}cc)`, color: '#0F1629', boxShadow: `0 4px 16px ${style.accent}30` }
                      }
                      data-testid={`change-plan-${plan.id}`}
                    >
                      {subscribing === plan.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> :
                       isDowngrade(plan.id, billing) ? <Mail className="w-3.5 h-3.5 mr-1" /> : <ArrowRight className="w-3.5 h-3.5 mr-1" />}
                      {isDowngrade(plan.id, billing) ? 'Contact Support' : 'Upgrade'}
                    </Button>
                  ) : (
                    !benCanSubscribe ? (
                      <div className="w-full text-center text-xs font-bold py-3 rounded-xl opacity-50 cursor-not-allowed"
                        style={{ background: 'var(--s)', color: 'var(--t5)', border: '1px solid var(--b)' }}
                        data-testid={`subscribe-${plan.id}-disabled`}
                      >
                        Available after transition
                      </div>
                    ) : (
                    <Button
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={subscribing === plan.id}
                      className="w-full text-xs font-bold py-4 transition-all duration-300"
                      style={{
                        background: isRecommended
                          ? `linear-gradient(135deg, ${style.accent}, ${style.accent}cc)`
                          : 'transparent',
                        color: isRecommended ? '#0F1629' : style.accent,
                        border: isRecommended ? 'none' : `2px solid ${style.accent}35`,
                        boxShadow: isRecommended ? `0 4px 20px ${style.accent}30` : 'none',
                      }}
                      data-testid={`subscribe-${plan.id}`}
                    >
                      {subscribing === plan.id ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Processing...</>
                      ) : (
                        <>Subscribe <ChevronRight className="w-3.5 h-3.5 ml-1" /></>
                      )}
                    </Button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Beneficiary: Family Plan Request */}
        {isBeneficiary && (
          <div className="mt-6 p-4 rounded-xl" style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.12)' }}>
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-[#60A5FA] mt-0.5 shrink-0" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-[var(--t)] mb-1">Part of a Family Plan?</h4>
                <p className="text-xs text-[var(--t5)] mb-3">
                  If a benefactor has a CarryOn Family Plan, ask them to add you — no separate subscription needed.
                </p>
                {showFamilyRequest ? (
                  <div className="flex gap-2">
                    <Input
                      value={familyEmail}
                      onChange={(e) => setFamilyEmail(e.target.value)}
                      placeholder="Benefactor's CarryOn email"
                      className="input-field text-xs h-9"
                      data-testid="family-request-email"
                    />
                    <Button
                      onClick={handleFamilyPlanRequest}
                      disabled={sendingRequest || !familyEmail.trim()}
                      className="h-9 px-4 text-xs font-bold shrink-0"
                      style={{ background: 'linear-gradient(135deg, #60A5FA, #3b82f6)', color: '#fff' }}
                      data-testid="send-family-request"
                    >
                      {sendingRequest ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3 mr-1" />}
                      Send
                    </Button>
                    <Button onClick={() => setShowFamilyRequest(false)} variant="ghost" className="h-9 px-2 text-[var(--t5)]">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setShowFamilyRequest(true)}
                    className="text-xs h-8 px-4 font-semibold"
                    style={{ background: 'rgba(96,165,250,0.1)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.2)' }}
                    data-testid="request-family-plan"
                  >
                    <Users className="w-3 h-3 mr-1.5" /> Request Family Plan
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Verification Upload Modal */}
      {showVerification && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" data-testid="verification-modal">
          <div className="w-full max-w-md rounded-2xl p-6 space-y-5 glass-card" style={{
            border: '1px solid var(--b)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {verificationTier === 'military' ? 'Military / First Responder' : 'Hospice'} Verification
              </h2>
              <button onClick={() => { setShowVerification(false); setVerificationFile(null); setVerificationDocType(''); }}
                className="text-[var(--t5)] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-[var(--t4)]">
              Upload one of the following to verify your eligibility:
            </p>

            <div className="space-y-2">
              <label className="text-xs text-[var(--t5)] font-medium">Document Type</label>
              <div className="flex flex-col gap-2">
                {(VERIFICATION_DOCS[verificationTier] || []).map(doc => (
                  <button
                    key={doc}
                    onClick={() => setVerificationDocType(doc)}
                    className="p-3 rounded-xl text-sm text-left transition-all"
                    style={{
                      background: verificationDocType === doc ? 'rgba(212,175,55,0.1)' : 'var(--s)',
                      border: verificationDocType === doc ? '1px solid var(--gold)' : '1px solid var(--b)',
                      color: verificationDocType === doc ? 'var(--gold)' : 'var(--t3)',
                    }}
                    data-testid={`verify-doc-type-${doc.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {doc}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[var(--t5)] font-medium">Upload Document</label>
              <label className="flex items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
                style={{ borderColor: verificationFile ? 'var(--gold)' : 'var(--b)' }}
                data-testid="verification-file-upload">
                <input type="file" accept="image/*,.pdf" className="hidden"
                  onChange={(e) => setVerificationFile(e.target.files[0])} />
                <Shield className="w-5 h-5 text-[var(--t5)]" />
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
              {uploadingVerification ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
              Submit for Review
            </Button>

            <p className="text-[10px] text-[var(--t5)] text-center">
              Documents are reviewed within 24-48 hours. You'll be notified in your Customer Service portal once approved.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
};
