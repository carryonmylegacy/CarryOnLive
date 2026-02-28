import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  CreditCard,
  Loader2,
  Clock,
  ChevronRight,
  Zap,
  Upload,
  Shield,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { PlanCard } from './PlanCard';
import { BillingToggle } from './BillingToggle';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const SubscriptionManagement = ({
  subscriptionStatus,
  refreshSubscription,
  getAuthHeaders,
  onShowPaywall,
}) => {
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState('monthly');
  const [activePlan, setActivePlan] = useState('Premium');
  const [changingPlan, setChangingPlan] = useState(false);
  const [cancellingPlan, setCancellingPlan] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationTier, setVerificationTier] = useState('');
  const [verificationFile, setVerificationFile] = useState(null);
  const [verificationDocType, setVerificationDocType] = useState('');
  const [uploadingVerification, setUploadingVerification] = useState(false);

  const currentSub = subscriptionStatus?.subscription;
  const currentPlanId = currentSub?.plan_id;
  const currentBilling = currentSub?.billing_cycle || 'monthly';
  const eligibleTiers = subscriptionStatus?.eligible_tiers || [];

  const isEligibleForPlan = (planId) => {
    if (planId === 'new_adult') return eligibleTiers.includes('new_adult');
    return true;
  };

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await axios.get(`${API_URL}/subscriptions/plans`);
        setPlans(res.data.plans || []);
      } catch (e) { /* fallback to empty */ }
    };
    fetchPlans();
    if (currentBilling) setBilling(currentBilling);
  }, [currentBilling]);

  const getBillingPrice = (plan) => {
    if (plan.price === 0) return 'Free';
    if (billing === 'quarterly') return '$' + (plan.quarterly_price || (plan.price * 0.9)).toFixed(2);
    if (billing === 'annual') return '$' + (plan.annual_price || (plan.price * 0.8)).toFixed(2);
    return '$' + plan.price.toFixed(2);
  };

  const getBillingLabel = () => {
    if (billing === 'annual') return '/mo (annual)';
    if (billing === 'quarterly') return '/mo (quarterly)';
    return '/month';
  };

  const handleChangePlan = async (planId) => {
    if (planId === currentPlanId) return;

    // Gate verification-required plans (military, hospice)
    if (['military', 'hospice'].includes(planId)) {
      setVerificationTier(planId);
      setShowVerification(true);
      return;
    }

    setChangingPlan(true);
    try {
      const res = await axios.post(`${API_URL}/subscriptions/change-plan`, {
        plan_id: planId,
        billing_cycle: billing,
        origin_url: window.location.origin,
      }, getAuthHeaders());
      if (res.data.url) {
        window.location.href = res.data.url;
      } else if (res.data.success) {
        toast.success(res.data.message);
        if (refreshSubscription) await refreshSubscription();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to change plan');
    }
    setChangingPlan(false);
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
          toast.success(res.data.message || 'Verification submitted! You will be notified once approved.');
          setShowVerification(false);
          setVerificationFile(null);
          setVerificationDocType('');
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

  const handleChangeBilling = async (newCycle) => {
    if (!currentSub || newCycle === currentBilling) {
      setBilling(newCycle);
      return;
    }
    setBilling(newCycle);
    try {
      const res = await axios.post(`${API_URL}/subscriptions/change-billing`, {
        billing_cycle: newCycle,
        origin_url: window.location.origin,
      }, getAuthHeaders());
      if (res.data.url) {
        // Stripe checkout redirect for paid billing changes
        window.location.href = res.data.url;
      } else if (res.data.success) {
        toast.success(res.data.message);
        if (refreshSubscription) await refreshSubscription();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to change billing');
    }
  };

  const handleCancelSubscription = async () => {
    setCancellingPlan(true);
    try {
      await axios.post(`${API_URL}/subscriptions/cancel`, {}, getAuthHeaders());
      toast.success('Subscription cancelled');
      setShowCancelConfirm(false);
      if (refreshSubscription) await refreshSubscription();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to cancel');
    }
    setCancellingPlan(false);
  };

  const getPlanRank = (id) => ({ base: 1, new_adult: 2, military: 3, standard: 4, premium: 5 }[id] || 0);
  const isUpgrade = (planId) => getPlanRank(planId) > getPlanRank(currentPlanId);
  const isDowngrade = (planId) => getPlanRank(planId) < getPlanRank(currentPlanId);
  const requiresVerification = (planId) => ['military', 'hospice'].includes(planId);

  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader>
        <CardTitle className="text-[var(--t)] flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-[var(--gold)]" />
          Subscription Plan
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Status Bar */}
        {subscriptionStatus && (
          <div className="mb-5 p-4 rounded-xl relative overflow-hidden" style={{
            background: currentSub?.status === 'active'
              ? 'linear-gradient(135deg, rgba(34,201,147,0.08) 0%, rgba(34,201,147,0.02) 100%)'
              : subscriptionStatus.trial?.trial_active
                ? 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(212,175,55,0.02) 100%)'
                : 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)',
            border: `1px solid ${currentSub?.status === 'active' ? 'rgba(34,201,147,0.2)' : subscriptionStatus.trial?.trial_active ? 'rgba(212,175,55,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {currentSub?.status === 'active' ? (
                  <Zap className="w-4 h-4 text-[#22C993]" />
                ) : (
                  <Clock className="w-4 h-4 text-[var(--gold)]" />
                )}
                <span className="text-sm font-semibold text-[var(--t)]">
                  {subscriptionStatus.beta_mode ? 'Beta Mode — All features free' :
                   currentSub?.status === 'active'
                    ? `${currentSub.plan_name} Plan · ${currentSub.billing_cycle || 'monthly'}`
                    : subscriptionStatus.trial?.trial_active
                      ? `Free Trial — ${subscriptionStatus.trial.days_remaining} days remaining`
                      : 'No active subscription'}
                </span>
              </div>
              {currentSub?.status === 'active' && (
                <button onClick={() => setShowCancelConfirm(true)} className="text-xs text-[var(--t5)] hover:text-red-400 transition-colors" data-testid="cancel-sub-btn">Cancel</button>
              )}
            </div>
          </div>
        )}

        {/* Cancel Confirm */}
        {showCancelConfirm && (
          <div className="mb-5 p-4 rounded-xl border border-red-500/20 bg-red-500/5">
            <p className="text-sm text-[var(--t3)] mb-3">Are you sure you want to cancel? You'll keep access until the end of your billing period.</p>
            <div className="flex gap-2">
              <Button onClick={handleCancelSubscription} disabled={cancellingPlan} className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 text-xs px-4 py-2" data-testid="confirm-cancel-btn">
                {cancellingPlan ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Yes, Cancel
              </Button>
              <Button onClick={() => setShowCancelConfirm(false)} className="bg-[var(--s)] text-[var(--t4)] border border-[var(--b)] text-xs px-4 py-2">Keep Plan</Button>
            </div>
          </div>
        )}

        {/* Billing Toggle */}
        <BillingToggle billing={billing} onChangeBilling={handleChangeBilling} />

        {/* Plan Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="plan-grid">
          {plans.map((p, idx) => (
            <PlanCard
              key={p.id}
              plan={p}
              index={idx}
              currentPlanId={currentPlanId}
              activePlan={activePlan}
              setActivePlan={setActivePlan}
              isEligible={isEligibleForPlan(p.id)}
              isUpgrade={isUpgrade}
              isDowngrade={isDowngrade}
              requiresVerification={requiresVerification}
              billingPrice={getBillingPrice(p)}
              billingLabel={getBillingLabel()}
              onChangePlan={handleChangePlan}
              onShowPaywall={onShowPaywall}
              changingPlan={changingPlan}
              hasActiveSub={currentSub?.status === 'active'}
            />
          ))}
        </div>

        {!subscriptionStatus?.beta_mode && !currentSub?.status && (
          <div className="mt-6 text-center">
            <Button onClick={onShowPaywall} className="gold-button shadow-[0_4px_20px_rgba(212,175,55,0.3)] px-8 py-5" data-testid="settings-subscribe-btn">
              <Zap className="w-4 h-4 mr-2" /> Subscribe Now <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>

      {/* Verification Modal */}
      {showVerification && (
        <div className="fixed inset-0 z-[9999] bg-[#0a0e1a]/90 flex items-center justify-center p-4" data-testid="verification-modal">
          <div className="w-full max-w-md rounded-2xl p-6 space-y-5" style={{
            background: 'linear-gradient(168deg, rgba(26,36,64,0.98) 0%, rgba(15,22,41,0.99) 100%)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {verificationTier === 'military' ? 'Military / First Responder' : 'Hospice'} Verification
              </h2>
              <button onClick={() => { setShowVerification(false); setVerificationFile(null); setVerificationDocType(''); }} className="text-[var(--t5)] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-[var(--t4)]">
              Please upload one of the following documents to verify your eligibility for the {verificationTier === 'military' ? 'Military / First Responder' : 'Hospice'} plan:
            </p>

            <div className="space-y-3">
              <label className="text-sm text-[var(--t5)]">Document Type</label>
              <div className="flex flex-col gap-2">
                {(verificationTier === 'military'
                  ? ['Military ID', 'First Responder Badge']
                  : ['Hospice enrollment documentation']
                ).map(doc => (
                  <button
                    key={doc}
                    onClick={() => setVerificationDocType(doc)}
                    className={`p-3 rounded-xl text-sm text-left transition-all ${
                      verificationDocType === doc
                        ? 'bg-[var(--gold)]/10 border border-[var(--gold)] text-[var(--gold)]'
                        : 'bg-[var(--s)] border border-[var(--b)] text-[var(--t3)] hover:border-[var(--t5)]'
                    }`}
                    data-testid={`verify-doc-type-${doc.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {doc}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[var(--t5)]">Upload Document</label>
              <label className="flex items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-[var(--b)] hover:border-[var(--gold)]/50 cursor-pointer transition-colors" data-testid="verification-file-upload">
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
              {uploadingVerification ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Shield className="w-5 h-5 mr-2" />}
              Submit for Review
            </Button>

            <p className="text-xs text-[var(--t5)] text-center">
              Documents are reviewed within 24-48 hours. You'll be notified once approved.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
};
