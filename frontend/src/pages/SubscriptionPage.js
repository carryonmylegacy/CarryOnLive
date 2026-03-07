import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SubscriptionManagement } from '../components/settings/SubscriptionManagement';
import FamilyPlanSettings from '../components/FamilyPlanSettings';
import SubscriptionPaywall from '../components/SubscriptionPaywall';

const SubscriptionPage = () => {
  const { subscriptionStatus, refreshSubscription, token } = useAuth();
  const [showPaywall, setShowPaywall] = useState(false);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` },
  });

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="subscription-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Subscription
        </h1>
        <p className="text-[var(--t4)] mt-1 text-sm sm:text-base">
          Manage your plan, billing, and family sharing
        </p>
      </div>

      <SubscriptionManagement
        subscriptionStatus={subscriptionStatus}
        refreshSubscription={refreshSubscription}
        getAuthHeaders={() => getAuthHeaders()}
        onShowPaywall={() => setShowPaywall(true)}
      />

      <FamilyPlanSettings getAuthHeaders={() => getAuthHeaders()} />

      {showPaywall && (
        <SubscriptionPaywall onDismiss={() => setShowPaywall(false)} />
      )}
    </div>
  );
};

export default SubscriptionPage;
