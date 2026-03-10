import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { SubscriptionManagement } from '../components/settings/SubscriptionManagement';
import FamilyPlanSettings from '../components/FamilyPlanSettings';
import SubscriptionPaywall from '../components/SubscriptionPaywall';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from '../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SubscriptionPage = () => {
  const { user, subscriptionStatus, refreshSubscription, token } = useAuth();
  const [showPaywall, setShowPaywall] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Portal-aware: beneficiary subscription page only shows their locked tier
  const isInBeneficiaryPortal = window.location.pathname.startsWith('/beneficiary');

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` },
  });

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
          toast.success('Subscription activated! All premium features are now unlocked.');
          window.history.replaceState({}, '', window.location.pathname);
          if (refreshSubscription) await refreshSubscription();
          setTimeout(() => setPaymentSuccess(false), 5000);
        } else {
          // Retry after a few seconds for async processing
          await new Promise(r => setTimeout(r, 5000));
          const retry = await axios.get(`${API_URL}/subscriptions/checkout-status/${sessionId}`, { headers });
          if (retry.data?.payment_status === 'paid' || retry.data?.payment_status === 'complete') {
            setPaymentSuccess(true);
            toast.success('Subscription activated! All premium features are now unlocked.');
            window.history.replaceState({}, '', window.location.pathname);
            if (refreshSubscription) await refreshSubscription();
            setTimeout(() => setPaymentSuccess(false), 5000);
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

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="subscription-page">
      {/* Payment confirmation overlay */}
      {confirmingPayment && (
        <div className="fixed inset-0 z-50 bg-[#0a0e1a]/80 flex items-center justify-center flex-col gap-3">
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

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
          {isInBeneficiaryPortal ? 'Your Plan' : 'Subscription'}
        </h1>
        <p className="text-[var(--t4)] mt-1 text-sm sm:text-base">
          {isInBeneficiaryPortal
            ? 'Your tier is determined by your benefactor\'s plan'
            : 'Manage your plan, billing, and family sharing'}
        </p>
      </div>

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
    </div>
  );
};

export default SubscriptionPage;
