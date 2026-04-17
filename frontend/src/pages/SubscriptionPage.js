import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { SubscriptionManagement } from '../components/settings/SubscriptionManagement';
import FamilyPlanSettings from '../components/FamilyPlanSettings';
import SubscriptionPaywall from '../components/SubscriptionPaywall';
import FoundersCircleCelebration from '../components/FoundersCircleCelebration';
import SubscriberCelebration from '../components/SubscriberCelebration';
import ShareYourCarryOn from '../components/ShareYourCarryOn';
import { Loader2, CheckCircle2, Crown, ChevronRight } from 'lucide-react';
import { toast } from '../utils/toast';
import { API_URL } from '../config';

const SubscriptionPage = () => {
  const { subscriptionStatus, refreshSubscription, token, getAuthHeaders, user } = useAuth();
  const navigate = useNavigate();
  const [showPaywall, setShowPaywall] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [fcActive, setFcActive] = useState(false);
  const [fcSubs, setFcSubs] = useState([]);
  const [fcCelebration, setFcCelebration] = useState(null); // { tierName, estateName } or null
  const [subCelebration, setSubCelebration] = useState(null); // { tierName } or null

  // Portal-aware: beneficiary subscription page only shows their locked tier
  const isInBeneficiaryPortal = window.location.pathname.startsWith('/beneficiary');

  // Handle post-checkout redirect from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (!sessionId || !token) return;

    setConfirmingPayment(true);
    const headers = { Authorization: `Bearer ${token}` };

    const confirm = async () => {
      try {
        const res = await axios.get(`${API_URL}/subscriptions/checkout-status/${sessionId}`, { headers });
        if (res.data?.payment_status === 'paid' || res.data?.payment_status === 'complete') {
          setPaymentSuccess(true);
          window.history.replaceState({}, '', window.location.pathname);
          if (refreshSubscription) await refreshSubscription();
          setTimeout(() => setPaymentSuccess(false), 5000);
          // Fullscreen celebration replaces the bare toast (Apr 17, 2026)
          setSubCelebration({ tierName: res.data?.plan_name || subscriptionStatus?.plan_name || '' });
        } else {
          // Retry after a few seconds for async processing
          await new Promise(r => setTimeout(r, 5000));
          const retry = await axios.get(`${API_URL}/subscriptions/checkout-status/${sessionId}`, { headers });
          if (retry.data?.payment_status === 'paid' || retry.data?.payment_status === 'complete') {
            setPaymentSuccess(true);
            window.history.replaceState({}, '', window.location.pathname);
            if (refreshSubscription) await refreshSubscription();
            setTimeout(() => setPaymentSuccess(false), 5000);
            setSubCelebration({ tierName: retry.data?.plan_name || subscriptionStatus?.plan_name || '' });
          } else {
            toast.error('Payment is still processing. Please refresh in a moment.');
          }
        }
      } catch {
        toast.error('Could not confirm payment. Please refresh or contact support.');
      }
      setConfirmingPayment(false);
    };
    confirm();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load Founders Circle status
  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    // Check if FC campaign is active
    axios.get(`${API_URL}/founders-circle/plans`).then(r => setFcActive(r.data.active)).catch(() => {});
    // Check user's FC subscriptions
    axios.get(`${API_URL}/founders-circle/status`, { headers }).then(r => setFcSubs(r.data.subscriptions || [])).catch(() => {});

    // Handle FC checkout redirect
    const params = new URLSearchParams(window.location.search);
    const fcSessionId = params.get('fc_session_id');
    if (fcSessionId) {
      setConfirmingPayment(true);
      axios.get(`${API_URL}/founders-circle/checkout-status/${fcSessionId}`, { headers })
        .then(async (r) => {
          if (r.data.status === 'active' || r.data.status === 'completed') {
            setPaymentSuccess(true);
            window.history.replaceState({}, '', window.location.pathname);
            if (refreshSubscription) await refreshSubscription();
            setFcSubs(prev => [...prev.filter(s => s.id !== r.data.fc?.id), r.data.fc].filter(Boolean));
            setTimeout(() => setPaymentSuccess(false), 5000);
            // Fullscreen celebration replaces the bare toast (Apr 17, 2026)
            setFcCelebration({
              tierName: r.data.fc?.tier_name || '',
              estateName: r.data.fc?.estate_name || '',
            });
          } else {
            toast.error('Payment is still processing. Please refresh in a moment.');
          }
        })
        .catch(() => toast.error('Could not confirm FC payment.'))
        .finally(() => setConfirmingPayment(false));
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="subscription-page">
      {/* Payment confirmation overlay */}
      {confirmingPayment && (
        <div className="fixed inset-0 z-50 bg-[#0a0e1a]/80 flex items-center justify-center flex-col gap-3 overflow-y-auto">
          <Loader2 className="w-8 h-8 text-[var(--gold)] animate-spin" />
          <p className="text-[var(--t4)] text-sm">Confirming your payment...</p>
        </div>
      )}

      {/* Payment success banner */}
      {paymentSuccess && (
        <div className="rounded-xl p-4 flex items-center gap-3 animate-fade-in" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <CheckCircle2 className="w-6 h-6 text-[#10b981] flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-[#10b981]">Payment Confirmed</p>
            <p className="text-xs text-[var(--t4)]">Your subscription is now active. All premium features are unlocked.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'var(--sans)' }}>
            {isInBeneficiaryPortal ? 'Your Plan' : 'Subscription'}
          </h1>
          <p className="text-[var(--t4)] mt-1 text-sm sm:text-base">
          {isInBeneficiaryPortal
            ? 'Your tier is determined by your benefactor\'s plan'
            : 'Manage your plan, billing, and family sharing'}
        </p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg text-sm font-bold transition-transform hover:scale-105 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
          data-testid="subscription-back-button"
        >
          Back
        </button>
      </div>

      {/* Permanent share entry — works for any active subscriber */}
      {!isInBeneficiaryPortal && subscriptionStatus?.is_active ? (
        <div className="flex" data-testid="subscription-share-row">
          <ShareYourCarryOn variant="tile" />
        </div>
      ) : null}

      {/* Founders Circle member status */}
      {fcSubs.filter(s => s.status === 'active' || s.status === 'completed').map(fc => (
        <div key={fc.id} className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)' }} data-testid="fc-member-status">
          <Crown className="w-6 h-6 text-[var(--gold)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-[var(--gold)]">Founders Circle — {fc.tier_name} (Lifetime)</p>
            <p className="text-xs text-[var(--t4)] mt-0.5">
              Estate: {fc.estate_name} · {fc.status === 'completed' ? 'Paid in full' : `${fc.payments_made} of ${fc.num_payments} payments made`}
            </p>
            <p className="text-xs text-[var(--t4)]">Your beneficiaries enjoy free lifetime access.</p>
          </div>
        </div>
      ))}

      {/* Founders Circle link — only show if campaign active and user is not a beneficiary */}
      {fcActive && !isInBeneficiaryPortal && fcSubs.filter(s => s.status === 'active' || s.status === 'completed').length === 0 && (
        <button
          onClick={() => navigate('/founders-circle')}
          className="w-full rounded-xl p-4 flex items-center gap-3 transition-all hover:scale-[1.01] active:scale-[0.99] text-left"
          style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.04))', border: '1px solid rgba(212,175,55,0.3)' }}
          data-testid="fc-cta-link"
        >
          <Crown className="w-8 h-8 text-[var(--gold)] flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-[var(--gold)]">Founders Circle — Lifetime Access</p>
            <p className="text-xs text-[var(--t4)]">Lock in lifetime access and give your beneficiaries free access forever. Limited time offer.</p>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--gold)] flex-shrink-0 ml-auto" />
        </button>
      )}

      <SubscriptionManagement
        subscriptionStatus={subscriptionStatus}
        refreshSubscription={refreshSubscription}
        getAuthHeaders={() => getAuthHeaders()}
        onShowPaywall={() => !isInBeneficiaryPortal && setShowPaywall(true)}
      />

      {!isInBeneficiaryPortal && <FamilyPlanSettings getAuthHeaders={() => getAuthHeaders()} />}

      {showPaywall && !isInBeneficiaryPortal && (
        <SubscriptionPaywall onDismiss={() => setShowPaywall(false)} />
      )}

      {fcCelebration && (
        <FoundersCircleCelebration
          firstName={user?.first_name || (user?.name ? user.name.split(' ')[0] : '')}
          tierName={fcCelebration.tierName}
          estateName={fcCelebration.estateName}
          onDismiss={() => setFcCelebration(null)}
        />
      )}

      {subCelebration && (
        <SubscriberCelebration
          firstName={user?.first_name || (user?.name ? user.name.split(' ')[0] : '')}
          tierName={subCelebration.tierName}
          onDismiss={() => setSubCelebration(null)}
        />
      )}
    </div>
  );
};

export default SubscriptionPage;
