import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isFeatureEnabled } from '../utils/featureGates';

/**
 * Route-level feature gate. If the user's tier does not have the feature
 * enabled for the current pathname, render a "not on your plan" panel
 * with a CTA to the Subscription page. Otherwise render children.
 *
 * Menu hiding is already handled in Sidebar / MobileNav via
 * `filterNavByFeatures(items, enabledFeatures)`. This component closes the
 * direct-URL-navigation gap (typed URL, stale bookmark, deep link, etc.).
 *
 * Routes without a feature key in `ROUTE_TO_FEATURE` always render children.
 */
const FEATURE_LABELS = {
  '/beneficiaries': 'Beneficiaries',
  '/messages': 'Milestone Messages',
  '/checklist': 'Important Account Checklist',
  '/vault': 'Secure Document Vault',
  '/guardian': 'Estate Guardian Assistant',
  '/ffn': 'Family Forever Network',
  '/digital-wallet': 'Digital Access Vault',
  '/trustee': 'Designated Trustee Services',
  '/timeline': 'Estate Plan Timeline',
  '/estate-chat': 'Estate Chat',
  '/connected-protocol': 'CarryOn Contingency Protocols',
  '/financial': 'Connected Financial Portal',
  '/beneficiary/estate-chat': 'Estate Chat',
  '/beneficiary/connected-protocol': 'CarryOn Contingency Protocols',
  '/beneficiary/financial': 'Connected Financial Portal',
  '/beneficiary/digital-wallet': 'Digital Access Vault',
};

export const FeatureGate = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { enabledFeatures, user } = useAuth();

  if (isFeatureEnabled(location.pathname, enabledFeatures)) return children;

  const featureLabel = FEATURE_LABELS[location.pathname] || 'This feature';
  const subscriptionPath = user?.role === 'beneficiary' ? '/beneficiary/subscription' : '/subscription';

  return (
    <div
      className="p-4 lg:p-6 pt-6 lg:pt-10 pb-24 lg:pb-12 max-w-2xl mx-auto"
      data-testid="feature-not-on-plan"
    >
      <div
        className="rounded-2xl p-7 sm:p-9 text-center"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--b)',
          boxShadow: '0 4px 32px -12px rgba(0,0,0,0.25)',
        }}
      >
        <div
          className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
          style={{
            background: 'rgba(var(--gold-rgb), 0.12)',
            border: '1px solid rgba(var(--gold-rgb), 0.25)',
          }}
        >
          <Lock className="w-7 h-7" style={{ color: 'var(--gold)' }} />
        </div>
        <h1
          className="text-2xl sm:text-3xl font-semibold mb-2"
          style={{ fontFamily: 'var(--serif)', color: 'var(--t)' }}
        >
          {featureLabel}{' '}
          <span className="italic" style={{ color: 'var(--gold)' }}>
            isn&apos;t on your plan.
          </span>
        </h1>
        <p
          className="text-sm sm:text-base mb-7 max-w-md mx-auto leading-relaxed"
          style={{ color: 'var(--t5)' }}
        >
          Upgrade your subscription to unlock {featureLabel.toLowerCase()} for you and your family.
        </p>
        <button
          onClick={() => navigate(subscriptionPath)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm btn-gold-cta"
          data-testid="feature-not-on-plan-upgrade-btn"
        >
          See Plans <ArrowUpRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => navigate(-1)}
          className="block mx-auto mt-4 text-xs hover:underline transition-colors"
          style={{ color: 'var(--t5)' }}
          data-testid="feature-not-on-plan-back-btn"
        >
          ← Go back
        </button>
      </div>
    </div>
  );
};

export default FeatureGate;
