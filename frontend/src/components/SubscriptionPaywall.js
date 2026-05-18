import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import apiClient from '../utils/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { Crown, Shield, Check, Star, ChevronRight, ChevronDown, Loader2,
  Upload, Clock, Users, X, Heart, Award, RotateCcw, Zap, Sun
} from 'lucide-react';
import { Button } from './ui/button';
import { toast } from '../utils/toast';
import { isNative } from '../services/native';
import { useIAPPurchase } from '../hooks/useIAPPurchase';
import { API_URL } from '../config';
import { openStripeCheckout } from '../utils/stripeRedirect';
import { suspendAutoLogout } from '../utils/autoLogoutSuspend';

const TIER_ICONS = {
  premium: Crown,
  standard: Star,
  base: Shield,
  new_adult: Award,
  military: Shield,
  veteran: Award,
  seniors: Sun,
  hospice: Heart,
  enterprise: Zap,
};

const TIER_COLORS = {
  premium: { border: '#d4af37', bg: 'rgba(var(--gold-rgb), 0.08)', accent: '#d4af37' },
  standard: { border: '#60A5FA', bg: 'rgba(96,165,250,0.08)', accent: '#60A5FA' },
  base: { border: '#22C993', bg: 'rgba(34,201,147,0.08)', accent: '#22C993' },
  new_adult: { border: '#B794F6', bg: 'rgba(183,148,246,0.08)', accent: '#B794F6' },
  military: { border: '#F59E0B', bg: 'rgba(245,158,11,0.08)', accent: '#F59E0B' },
  veteran: { border: '#059669', bg: 'rgba(5,150,105,0.08)', accent: '#059669' },
  seniors: { border: '#FBBF24', bg: 'rgba(251,191,36,0.08)', accent: '#FBBF24' },
  hospice: { border: '#ec4899', bg: 'rgba(236,72,153,0.08)', accent: '#ec4899' },
  enterprise: { border: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', accent: '#8B5CF6' },
};

// Tier groups for the lazy-collapse layout (mirrors landing page +
// SubscriptionManagement). Eligibility/discount tiers tuck behind a
// gold pill; main tiers are always front-and-center.
const MAIN_TIER_IDS_PAYWALL = ['premium', 'standard', 'base'];

// Canonical discount-tier display order (platform-wide).
// Matches the discount blurb copy: Military / First Responders → Veterans →
// Hospice → Seniors → New Adults → B2B (enterprise).
const DISCOUNT_TIER_ORDER = ['military', 'veteran', 'hospice', 'seniors', 'new_adult', 'enterprise'];
const sortByDiscountOrder = (a, b) => {
  const ai = DISCOUNT_TIER_ORDER.indexOf(a.id);
  const bi = DISCOUNT_TIER_ORDER.indexOf(b.id);
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
};

export default function SubscriptionPaywall({ onDismiss }) {
  const { token, refreshSubscription, partnerBranding } = useAuth();
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState('annual');
  const [selectedPlan, setSelectedPlan] = useState('premium');
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
  // Lazy-collapse the discount tiers behind a gold pill — mirrors the
  // landing page so first impression in-app is just as focused as
  // first impression on the marketing site.
  const [discountOpen, setDiscountOpen] = useState(false);

  const { useAppleIAP, restoringPurchases, purchaseWithIAP, restoreWithIAP } = useIAPPurchase();

  const headers = { Authorization: `Bearer ${token}` };

  // Handle post-payment redirect — check session_id in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (sessionId && token) {
      setConfirmingPayment(true);
      apiClient.get(`${API_URL}/subscriptions/checkout-status/${sessionId}`, { headers })
        .then(async (res) => {
          if (res.data?.payment_status === 'paid' || res.data?.payment_status === 'complete') {
            // toast removed
            // Clean up URL
            window.history.replaceState({}, '', window.location.pathname);
            // Refresh subscription status to dismiss paywall
            if (refreshSubscription) await refreshSubscription();
          } else {
            // toast removed
            // Retry after a few seconds
            setTimeout(async () => {
              try {
                const retry = await apiClient.get(`${API_URL}/subscriptions/checkout-status/${sessionId}`, { headers });
                if (retry.data?.payment_status === 'paid' || retry.data?.payment_status === 'complete') {
                  // toast removed
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

  const [tierFeatures, setTierFeatures] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const [plansRes, statusRes] = await Promise.all([
        apiClient.get(`${API_URL}/subscriptions/plans`),
        apiClient.get(`${API_URL}/subscriptions/status`, { headers }),
      ]);
      setPlans(plansRes.data.plans || []);
      setSubStatus(statusRes.data);
      if (plansRes.data.tier_features) {
        setTierFeatures(plansRes.data.tier_features);
      }
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
      // Native iOS: MUST use Apple In-App Purchase (Apple Guideline 3.1.1)
      if (isNative) {
        const iapResult = await purchaseWithIAP(plan.id, billing);
        if (iapResult.cancelled) {
          setCheckoutLoading(false);
          return;
        }
        toast.success('Subscription activated!');
        await refreshSubscription();
        fetchData();
        setCheckoutLoading(false);
        return;
      }

      // Web: use Stripe checkout
      // The redirect / popup hides this tab, which trips the
      // auto-logout-on-app-leave policy if the user has set it to
      // "instant". Suspend during the round-trip so they're still
      // signed in when Stripe sends them back.
      const releaseAutoLogout = suspendAutoLogout();
      try {
        const res = await apiClient.post(`${API_URL}/subscriptions/checkout`, {
          plan_id: plan.id,
          billing_cycle: billing,
          origin_url: window.location.origin,
        }, { headers });

        if (res.data.free) {
          fetchData();
          releaseAutoLogout();
        } else if (res.data.url) {
          // ── Persist the pending checkout session BEFORE handing the
          // user to Stripe. On standalone macOS PWAs, Stripe's redirect
          // back to our success_url lands in the user's default browser
          // (NOT the PWA window) which doesn't carry the JWT — so the
          // user lands on /login. Without this localStorage breadcrumb
          // we'd lose the session_id at that point and never reconcile.
          // Honored by LoginPage (redirects post-login to
          // /subscription?session_id=…) and SubscriptionPage (calls
          // /api/subscriptions/reconcile on mount as a safety-net).
          if (res.data.session_id) {
            try {
              localStorage.setItem(
                'carryon_pending_stripe_session',
                JSON.stringify({
                  session_id: res.data.session_id,
                  plan_id: plan.id,
                  plan_name: plan.name,
                  billing_cycle: billing,
                  created_at: Date.now(),
                }),
              );
            } catch { /* private mode — fall through */ }
          }
          // Push (not replace): we want a Stripe history entry between
          // the paywall and the user's prior page so browser-back from
          // Standalone PWA: open in a new window so the in-app session
          // is preserved when the user returns. Browser tab: legacy
          // in-window redirect (Stripe's standard checkout flow).
          openStripeCheckout(res.data.url);
          // Release on return-focus or after a hard 5-min ceiling
          // (already enforced by suspendAutoLogout itself).
          window.addEventListener('focus', () => releaseAutoLogout(), { once: true });
        } else {
          releaseAutoLogout();
        }
      } catch (innerErr) {
        releaseAutoLogout();
        throw innerErr;
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || 'Failed to start checkout');
    }
    setCheckoutLoading(false);
  };

  const handleRestorePurchases = async () => {
    const result = await restoreWithIAP();
    if (result.success) {
      await refreshSubscription();
      fetchData();
    }
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
          await apiClient.post(`${API_URL}/verification/upload`, formData, { headers });
          // toast removed
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
      : verificationTier === 'veteran'
        ? ['DD214', 'Veterans Administration Benefits Letter']
        : verificationTier === 'seniors' || verificationTier === 'new_adult'
          ? ["Driver's License", 'Passport', 'State ID']
          : ['Hospice enrollment documentation'];
    const verificationTitle = verificationTier === 'military'
      ? 'Military / First Responder'
      : verificationTier === 'veteran'
        ? 'Veteran'
        : verificationTier === 'seniors'
          ? 'Seniors (65+)'
          : verificationTier === 'new_adult'
            ? 'New Adult (18–25)'
            : 'Hospice';

    return (
      <div className="fixed inset-0 z-[9999] bg-[#0a0e1a]/95 flex items-center justify-center p-4" data-testid="verification-modal">
        <div className="w-full max-w-md glass-card p-6 space-y-5 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
              {verificationTitle} Verification
            </h2>
            <button onClick={() => setShowVerification(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform">
              <X className="w-4 h-4" />
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
                onClick={() => {
                  // iOS opens Photos/Files in a sibling activity which
                  // hides this tab. Without this suspend, users on the
                  // "instant-on-app-leave" security setting were being
                  // kicked back to /login the moment they tapped the
                  // picker — they could never finish Senior / Veteran
                  // / Military verification. Released on `change` (file
                  // chosen) and on `cancel` (back without picking).
                  const release = suspendAutoLogout();
                  // Belt-and-suspenders: release after 90s even if no
                  // event fires (Safari can swallow `cancel`).
                  const t = setTimeout(release, 90000);
                  const cleanup = () => { clearTimeout(t); release(); };
                  window.addEventListener('focus', cleanup, { once: true });
                }}
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
        {/* Skip / Continue link */}
        <div className="w-full max-w-5xl flex justify-end mb-2">
          <button
            onClick={() => { if (onDismiss) onDismiss(); else window.location.href = '/dashboard'; }}
            className="text-xs text-[var(--t5)] hover:text-[var(--t3)] transition-colors px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--s)', border: '1px solid var(--b)' }}
            data-testid="paywall-skip"
          >
            {subStatus?.has_active_subscription ? 'Go to Dashboard' : 'Continue to Dashboard'}
          </button>
        </div>

        {/* Header */}
        <div className="text-center mb-8 max-w-lg animate-fade-in">
          <img src={partnerBranding?.logoUrl || "/carryon-logo.png"} alt={partnerBranding?.companyName || "CarryOn"} className="w-[120px] h-auto mx-auto mb-4" />

          {trial.trial_expired ? (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>
                Your Free Trial Has Ended
              </h1>
              <p className="text-[var(--t4)] text-sm">
                Choose a plan to continue protecting your family's estate plan with CarryOn.
              </p>
            </>
          ) : trial.trial_active ? (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>
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
              <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>
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
                  ? b === 'annual'
                    ? 'text-[#0F1629]'
                    : 'bg-[#d4af37] text-[#0F1629]'
                  : 'bg-[var(--s)] text-[var(--t5)] hover:text-[var(--t)] border border-[var(--b)]'
              }`}
              style={billing === b && b === 'annual' ? { background: 'linear-gradient(135deg, #22C993, #10b981)', boxShadow: '0 4px 16px rgba(34,201,147,0.35)' } : {}}
              data-testid={`paywall-billing-${b}`}
            >
              {b}
              {b === 'annual' && billing !== 'annual' && (
                <span className="absolute -top-2 -right-2 text-[11px] bg-[#22C993] text-white px-1.5 py-0.5 rounded-full font-bold">
                  Best Value
                </span>
              )}
              {b !== 'monthly' && billing === b && (
                <span className="absolute -top-2 -right-2 text-[11px] bg-[#22C993] text-white px-1.5 py-0.5 rounded-full font-bold">
                  {getSavingsLabel()}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Plan Cards — main 3 tiers visible by default; eligibility/
            discount tiers tuck behind a gold pill (lazy collapse,
            mirroring the landing page). Same renderer is used for
            both grids to guarantee zero card-render regression. */}
        <div className="max-w-5xl w-full mb-8 animate-fade-in">
        {(() => {
          const filteredPlans = visiblePlans.filter(p => !['hospice'].includes(p.id) || p.price === 0);
          const mainPlans = filteredPlans.filter(p => MAIN_TIER_IDS_PAYWALL.includes(p.id));
          const discountPlans = filteredPlans
            .filter(p => !MAIN_TIER_IDS_PAYWALL.includes(p.id))
            .sort(sortByDiscountOrder);

          const renderPaywallCard = (plan, useFlexWidth) => {
            const Icon = TIER_ICONS[plan.id] || Shield;
            const colors = TIER_COLORS[plan.id] || TIER_COLORS.base;
            const isSelected = selectedPlan === plan.id;
            const isPremium = plan.id === 'premium';
            const eligibleTiers = subStatus?.eligible_tiers || [];
            const eligible = plan.id !== 'new_adult' || eligibleTiers.includes('new_adult');

            // Subscription state — the `/subscriptions/status` payload
            // nests the real subscription document under `.subscription`,
            // NOT at the response root. Reading from the root (legacy
            // code path) made `isActivePlan` ALWAYS false: the
            // "Current Plan" badge never lit up for any user, no matter
            // how many times the webhook had successfully activated
            // them server-side. (This is the root cause of the
            // "still showed unsubscribed after payment" complaint.)
            const activeSub = subStatus?.subscription || null;
            const activePlanId = activeSub?.plan_id;
            const activeBilling = activeSub?.billing_cycle;
            const hasActiveSub = activePlanId && activeSub?.status === 'active';
            const isActivePlan = hasActiveSub && activePlanId === plan.id;
            const isGreyedOut = hasActiveSub && !isActivePlan;

            // Optimistic "Processing payment…" overlay — shows the
            // moment the user is sent to Stripe, clears when the
            // webhook/reconcile lands. Never shadows a real active sub.
            const pendingIntent = !hasActiveSub ? subStatus?.pending_intent : null;
            const isPendingPlan = !!(pendingIntent && pendingIntent.plan_id === plan.id);

            // Should show "Recommended" pulse: user is subscribed but NOT on premium annual
            const isPremiumAnnual = isPremium && billing === 'annual';
            const showRecommendedPulse = isPremiumAnnual && hasActiveSub && !(activePlanId === 'premium' && activeBilling === 'annual');
            const flexWidth = useFlexWidth
              ? 'w-full sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.834rem)]'
              : '';

            return (
              <div
                key={plan.id}
                onClick={() => eligible && !isGreyedOut && setSelectedPlan(plan.id)}
                className={`${flexWidth} relative rounded-2xl overflow-hidden transition-all duration-300 group ${
                  !eligible || isGreyedOut ? 'opacity-40 cursor-default' : 'cursor-pointer'
                } ${
                  eligible && !isGreyedOut && isPremium ? 'hover:-translate-y-2 sm:scale-[1.03]' : eligible && !isGreyedOut ? 'hover:-translate-y-1' : ''
                }`}
                style={{
                  // Subtle accent wash on every state — keeps light mode
                  // from collapsing all idle cards into the same flat
                  // surface color (tier identity stays visible at a
                  // glance). Alpha kept low so dark-mode contrast holds.
                  background: isActivePlan || isPendingPlan
                    ? `linear-gradient(168deg, ${colors.bg} 0%, var(--s) 40%)`
                    : isPremium
                      ? `linear-gradient(168deg, rgba(var(--gold-rgb), 0.15) 0%, var(--s) 40%)`
                      : isSelected && !isGreyedOut
                        ? `linear-gradient(168deg, ${colors.bg} 0%, var(--s) 100%)`
                        : `linear-gradient(168deg, ${colors.accent}14, var(--s) 75%)`,
                  border: isActivePlan
                    ? `2px solid ${colors.border}`
                    : isPendingPlan
                      ? `2px dashed ${colors.border}`
                      : isPremium
                        ? '2px solid rgba(var(--gold-rgb), 0.4)'
                        : isSelected && !isGreyedOut
                          ? `2px solid ${colors.border}`
                          : `1px solid ${colors.accent}30`,
                  boxShadow: isActivePlan || isPendingPlan
                    ? `0 8px 32px -6px ${colors.accent}44, 0 2px 8px rgba(0,0,0,0.25)`
                    : isPremium
                      ? '0 12px 48px -8px rgba(var(--gold-rgb), 0.3), 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                      : isSelected && !isGreyedOut
                        ? `0 8px 32px -6px ${colors.accent}44, 0 2px 8px rgba(0,0,0,0.25)`
                        : '0 4px 16px -4px rgba(0,0,0,0.3)',
                  animation: isPendingPlan
                    ? 'pendingPulse 1.6s ease-in-out infinite'
                    : showRecommendedPulse
                      ? 'recommendedPulse 2.5s ease-in-out infinite'
                      : 'none',
                }}
                data-testid={`paywall-plan-${plan.id}`}
              >
                {/* Recommended pulse animation */}
                {showRecommendedPulse && (
                  <style>{`
                    @keyframes recommendedPulse {
                      0%, 100% { box-shadow: 0 12px 48px -8px rgba(var(--gold-rgb), 0.3), 0 4px 16px rgba(0,0,0,0.3); }
                      50% { box-shadow: 0 12px 48px -8px rgba(var(--gold-rgb), 0.5), 0 4px 24px rgba(var(--gold-rgb), 0.15), 0 0 0 3px rgba(var(--gold-rgb), 0.12); }
                    }
                  `}</style>
                )}
                {isPendingPlan && (
                  <style>{`
                    @keyframes pendingPulse {
                      0%, 100% { box-shadow: 0 8px 32px -6px ${colors.accent}55, 0 2px 8px rgba(0,0,0,0.25); }
                      50%      { box-shadow: 0 8px 32px -6px ${colors.accent}88, 0 0 0 3px ${colors.accent}33; }
                    }
                  `}</style>
                )}

                {/* Premium shimmer line */}
                {isPremium && (
                  <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--gold-rgb), 0.6), transparent)' }} />
                )}

                {/* Active subscription badge */}
                {isActivePlan && (
                  <div className="absolute -top-0 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1.5 rounded-b-xl"
                    style={{ background: 'linear-gradient(180deg, #22C993, #16A34A)', color: 'white', boxShadow: '0 4px 16px rgba(34,201,147,0.4)' }}>
                    Your Plan
                  </div>
                )}

                {/* Pending-payment ribbon (optimistic) — same slot as
                    the "Your Plan" badge so cards never jump when the
                    webhook lands and the badge swaps over. */}
                {isPendingPlan && (
                  <>
                    <div
                      className="absolute -top-0 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1.5 rounded-b-xl flex items-center gap-1.5"
                      style={{
                        background: 'linear-gradient(180deg, #d4af37, #b8962e)',
                        color: 'var(--bg2)',
                        boxShadow: '0 4px 16px rgba(var(--gold-rgb), 0.4)',
                      }}
                      data-testid={`paywall-plan-${plan.id}-pending-ribbon`}
                    >
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Processing Payment…
                    </div>
                    <div
                      className="absolute top-7 left-1/2 -translate-x-1/2 text-[11px] font-medium px-2 py-0.5 rounded-b-md whitespace-nowrap"
                      style={{
                        color: 'rgba(var(--gold-rgb), 0.95)',
                        background: 'rgba(var(--gold-rgb), 0.10)',
                        border: '1px solid rgba(var(--gold-rgb), 0.25)',
                        borderTop: 'none',
                      }}
                      data-testid={`paywall-plan-${plan.id}-pending-eta`}
                    >
                      usually ≤ 5 seconds
                    </div>
                  </>
                )}

                {/* Premium label or Recommended CTA */}
                {isPremium && !isActivePlan && !isPendingPlan && (
                  <div className="absolute -top-0 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1.5 rounded-b-xl"
                    style={{
                      background: showRecommendedPulse
                        ? 'linear-gradient(180deg, #22C993, #16A34A)'
                        : 'linear-gradient(180deg, #d4af37, #b8962e)',
                      color: showRecommendedPulse ? 'white' : 'var(--bg2)',
                      boxShadow: showRecommendedPulse
                        ? '0 4px 16px rgba(34,201,147,0.4)'
                        : '0 4px 16px rgba(var(--gold-rgb), 0.4)',
                    }}>
                    {showRecommendedPulse ? 'Recommended — Best Value' : 'Most Popular'}
                  </div>
                )}

                <div className="p-5 pt-6">
                  {/* Tier icon + name */}
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" 
                      style={{ background: `${colors.accent}18`, border: `1px solid ${colors.accent}30` }}>
                      <Icon className="w-5 h-5" style={{ color: colors.accent }} />
                    </div>
                    <h3 className="font-bold text-lg text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>{plan.name}</h3>
                  </div>

                  {/* Price — hero element */}
                  <div className="mb-1">
                    <span className="text-4xl font-bold tracking-tight" style={{ color: isPremium ? '#d4af37' : colors.accent, fontFamily: 'var(--sans)' }}>
                      {getPrice(plan)}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-xs text-[var(--t5)] ml-1.5">{getBillingLabel()}</span>
                    )}
                  </div>

                  {plan.ben_price !== undefined && (
                    <p className="text-sm font-bold text-[var(--t4)] mb-4">
                      Beneficiary: <span className="text-[var(--t3)]">${(
                        billing === 'annual' ? plan.ben_price * 0.8
                        : billing === 'quarterly' ? plan.ben_price * 0.9
                        : plan.ben_price
                      ).toFixed(2)}/mo</span>
                    </p>
                  )}

                  {/* Divider */}
                  <div className="h-px mb-4" style={{ background: `linear-gradient(90deg, transparent, ${colors.accent}30, transparent)` }} />

                  {/* Features — dynamic from feature gates. We only render
                      ENABLED features per tile; disabled ones are hidden
                      entirely (no strikethrough). Product decision:
                      negative advertising hurts conversion — each tile
                      should present itself as a complete, positive offer. */}
                  <div className="space-y-2.5 mb-5">
                    {(tierFeatures[plan.id] && tierFeatures[plan.id].length > 0
                      ? tierFeatures[plan.id]
                      : (plan.features || []).map(f => typeof f === 'string' ? { label: f, enabled: true } : f)
                    ).filter(f => (typeof f === 'string' ? true : f.enabled !== false))
                      .map((f, i) => {
                        const label = typeof f === 'string' ? f : f.label;
                        return (
                          <div key={i} className="flex items-start gap-2.5 text-sm">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5`}
                              style={{ background: `${colors.accent}15` }}>
                              <Check className="w-3 h-3" style={{ color: colors.accent }} />
                            </div>
                            <span className="text-[var(--t4)]">{label}</span>
                          </div>
                        );
                      })}
                  </div>

                  {plan.note && (
                    <p className="text-xs text-[var(--t5)] italic mb-4">{plan.note}</p>
                  )}

                  {/* CTA Button */}
                  {!eligible ? (
                    <div className="w-full text-center text-xs font-medium py-3 rounded-xl text-[var(--t5)]" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                      Ages 18-25 only
                    </div>
                  ) : isActivePlan ? (
                    <div className="w-full text-center text-xs font-bold py-3 rounded-xl text-[#22C993]"
                      style={{ background: 'rgba(34,201,147,0.08)', border: '1px solid rgba(34,201,147,0.2)' }}
                      data-testid={`paywall-active-${plan.id}`}>
                      Current Plan
                    </div>
                  ) : isPendingPlan ? (
                    <div
                      className="w-full text-center text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                      style={{
                        background: 'rgba(var(--gold-rgb), 0.10)',
                        border: '1px dashed rgba(var(--gold-rgb), 0.45)',
                        color: 'var(--gold)',
                      }}
                      data-testid={`paywall-pending-${plan.id}`}
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Confirming your payment…
                    </div>
                  ) : isGreyedOut && !showRecommendedPulse ? (
                    <div className="w-full text-center text-xs font-medium py-3 rounded-xl text-[var(--t5)]" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
                      {plan.price > (plans.find(p => p.id === activePlanId)?.price || 0) ? 'Upgrade' : 'Downgrade'}
                    </div>
                  ) : (
                    <Button
                      onClick={(e) => { e.stopPropagation(); handleCheckout(plan); }}
                      disabled={checkoutLoading}
                      className={`w-full text-sm font-bold py-5 transition-all duration-300 ${
                        isPremium || showRecommendedPulse
                          ? 'gold-button shadow-[0_4px_20px_rgba(var(--gold-rgb), 0.3)]'
                          : isSelected
                            ? 'gold-button'
                            : 'bg-transparent border-2 hover:bg-[var(--s)]'
                      }`}
                      style={!isPremium && !isSelected && !showRecommendedPulse ? { borderColor: `${colors.accent}40`, color: colors.accent } : {}}
                      data-testid={`paywall-select-${plan.id}`}
                    >
                      {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      {showRecommendedPulse ? 'Upgrade to Best Value' : plan.requires_verification && plan.id !== 'new_adult' ? 'Verify & Subscribe' : 'Subscribe'}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            );
          };

          return (
            <>
              {/* Main 3 tiers — symmetric 3-up grid, always visible. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {mainPlans.map(p => renderPaywallCard(p, false))}
              </div>

              {/* Eligibility pill + collapsible discount tiers. */}
              {discountPlans.length > 0 && (
                <div className="mt-8" data-testid="paywall-discount-section">
                  <div className="flex justify-center px-2">
                    <button
                      type="button"
                      onClick={() => setDiscountOpen(o => !o)}
                      aria-expanded={discountOpen}
                      aria-controls="paywall-modal-discount-tiers"
                      data-testid="paywall-eligibility-button"
                      className="rounded-full px-5 py-3 sm:px-6 sm:py-3.5 text-center max-w-3xl transition-transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                      style={{
                        background: 'var(--gold)',
                        border: '2px solid #b89220',
                        boxShadow: '0 0 48px -16px rgba(var(--gold-rgb), 0.45)',
                      }}
                    >
                      <span
                        className="font-semibold leading-snug inline-flex items-center justify-center gap-2"
                        style={{ color: '#0b1120', fontSize: 'clamp(13px, 1.2vw, 15px)' }}
                      >
                        Eligible for a discount? Military / First Responders, Veterans, Hospice patients, Seniors (65+), New adults (18–25), and B2B partners have dedicated tiers — {discountOpen ? 'hide' : 'see'} pricing.
                        <ChevronDown
                          className="w-4 h-4 flex-shrink-0 transition-transform"
                          style={{ transform: discountOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        />
                      </span>
                    </button>
                  </div>
                  <div
                    id="paywall-modal-discount-tiers"
                    className="overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out"
                    style={{ maxHeight: discountOpen ? '5000px' : '0px', opacity: discountOpen ? 1 : 0 }}
                    aria-hidden={!discountOpen}
                  >
                    <p className="text-center text-[11px] uppercase tracking-[0.18em] mt-5 mb-4" style={{ color: 'var(--gold)' }}>
                      Dedicated tiers · same features · eligibility verified after subscribe
                    </p>
                    <div className="flex flex-wrap justify-center gap-5">
                      {discountPlans.map(p => renderPaywallCard(p, true))}
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

          {/* Family Plan — centered tile under the paywall (sibling
              to the main + discount sections). */}
          <div className="mt-8 max-w-md mx-auto">
          <div
            className="relative rounded-2xl cursor-pointer transition-all duration-300 hover:-translate-y-1 flex flex-col overflow-hidden group"
            style={{
              background: selectedPlan === 'family' 
                ? `linear-gradient(168deg, rgba(var(--gold-rgb), 0.12) 0%, var(--s) 100%)` 
                : 'var(--s)',
              border: `${selectedPlan === 'family' ? '2px' : '1px'} solid ${selectedPlan === 'family' ? 'rgba(var(--gold-rgb), 0.4)' : 'var(--b)'}`,
              boxShadow: selectedPlan === 'family' 
                ? '0 8px 32px -6px rgba(var(--gold-rgb), 0.2)' 
                : '0 4px 16px -4px rgba(0,0,0,0.3)',
            }}
            onClick={() => setSelectedPlan('family')}
            data-testid="paywall-plan-family"
          >
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" 
                  style={{ background: 'rgba(var(--gold-rgb), 0.12)', border: '1px solid rgba(var(--gold-rgb), 0.25)' }}>
                  <Users className="w-5 h-5 text-[#d4af37]" />
                </div>
                <h3 className="font-bold text-lg text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>Family Plan</h3>
              </div>

              <div className="mb-1">
                <span className="text-2xl font-bold text-[#d4af37]" style={{ fontFamily: 'var(--sans)' }}>
                  Bundle & Save
                </span>
              </div>
              <p className="text-xs text-[var(--t5)] mb-4">All beneficiaries: <span className="text-[var(--t5)]">flat $3.49/mo</span></p>

              <div className="h-px mb-4" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--gold-rgb), 0.2), transparent)' }} />

              <div className="space-y-2.5 mb-5 flex-1">
                {['Owner pays standard tier rate', 'Added benefactors save $1/mo', 'Successor inherits ownership', 'Floor tiers exempt from discount'].map((f, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(var(--gold-rgb), 0.12)' }}>
                      <Check className="w-3 h-3 text-[#d4af37]" />
                    </div>
                    <span className="text-[var(--t4)]">{f}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-[var(--t5)] italic mb-4">Subscribe individually, then add family from Settings</p>

              <Button
                onClick={(e) => { e.stopPropagation(); setShowFamilyInfo(!showFamilyInfo); }}
                className="w-full text-sm font-bold py-5 bg-transparent border-2 hover:bg-[var(--s)]"
                style={{ borderColor: 'rgba(var(--gold-rgb), 0.35)', color: '#d4af37' }}
                data-testid="paywall-select-family"
              >
                Learn More <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
          </div>
        </div>

        {/* Family Plan Details (expanded) */}
        {showFamilyInfo && (
          <div className="max-w-5xl w-full mb-8 animate-fade-in">
            <div className="rounded-2xl p-5" style={{
              background: 'rgba(var(--gold-rgb), 0.04)',
              border: '2px solid rgba(var(--gold-rgb), 0.15)',
            }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[var(--t)] text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#d4af37]" />
                  Family Plan Details
                </h3>
                <button onClick={() => setShowFamilyInfo(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] active:scale-90 transition-transform">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-xl bg-[var(--s)]">
                  <p className="text-[#d4af37] font-bold">Plan Owner</p>
                  <p className="text-[var(--t4)]">Pays standard tier rate. Sets the plan anchor.</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--s)]">
                  <p className="text-[#60A5FA] font-bold">Added Benefactors</p>
                  <p className="text-[var(--t4)]">$1/mo discount off their individual tier rate</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--s)]">
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

        {/* Restore Purchases (Apple IAP requirement) */}
        {useAppleIAP && (
          <button
            onClick={handleRestorePurchases}
            disabled={restoringPurchases}
            className="text-sm text-[var(--gold)] underline mb-4 flex items-center gap-1 mx-auto"
            data-testid="paywall-restore-purchases"
          >
            {restoringPurchases ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Restore Purchases
          </button>
        )}

        {/* Apple-required subscription disclosure (Guideline 3.1.2) */}
        <div className="text-center mb-4 animate-fade-in max-w-md mx-auto">
          <p className="text-[var(--t5)] text-xs">
            AES-256 Encrypted · Zero-Knowledge Architecture · All plans include full security
          </p>
          <p className="text-[var(--t5)] text-[11px] mt-2 leading-relaxed">
            Payment will be charged to your {useAppleIAP ? 'Apple ID' : 'payment method'} at confirmation of purchase.
            Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period.
            {useAppleIAP ? ' Manage subscriptions in your iPhone Settings > Apple ID > Subscriptions.' : ''}
          </p>
          <div className="flex items-center justify-center gap-3 mt-2">
            <a href="/terms" className="text-[var(--t5)] text-[11px] underline hover:text-[var(--t4)]" data-testid="paywall-terms-link">Terms of Service</a>
            <span className="text-[var(--t5)] text-[11px]">·</span>
            <a href="/privacy" className="text-[var(--t5)] text-[11px] underline hover:text-[var(--t4)]" data-testid="paywall-privacy-link">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  );
}
