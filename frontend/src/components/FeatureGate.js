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
  const { enabledFeatures, user, subscriptionStatus } = useAuth();
  const path = location.pathname;

  // Trustee boundary — Milestone Messages are personal letters and are
  // fully off-limits (view included) inside a trustee/manager session.
  if (user?.trustee_mode && path.startsWith('/messages')) {
    return (
      <div className="p-4 lg:p-6 pt-6 lg:pt-10 pb-24 lg:pb-12 max-w-2xl mx-auto" data-testid="trustee-mm-offlimits">
        <div className="glass-card p-8 text-center">
          <Lock className="w-10 h-10 mx-auto mb-4" style={{ color: '#d4af37' }} />
          <h1 className="text-xl font-bold text-[var(--t)] mb-2">Personal to the Account Owner</h1>
          <p className="text-sm text-[var(--t4)] leading-relaxed">
            Milestone Messages are private letters and recordings from the account owner to their loved ones.
            They aren&apos;t viewable or editable in trustee access.
          </p>
        </div>
      </div>
    );
  }

  // Post-trial SDV-only lockdown — every feature route except the vault
  // renders a locked panel. The Secure Document Vault stays fully usable.
  if (subscriptionStatus?.sdv_only_lockdown === true && user?.role === 'benefactor' && !path.startsWith('/vault')) {
    return (
      <div className="p-4 lg:p-6 pt-6 lg:pt-10 pb-24 lg:pb-12 max-w-2xl mx-auto" data-testid="lockdown-feature-panel">
        <div className="glass-card p-8 text-center">
          <Lock className="w-10 h-10 mx-auto mb-4" style={{ color: '#d4af37' }} />
          <h1 className="text-xl font-bold text-[var(--t)] mb-2">
            {user?.trustee_mode ? 'Feature Disabled for This Client' : 'Your Full-Access Trial Has Ended'}
          </h1>
          <p className="text-sm text-[var(--t4)] leading-relaxed mb-5">
            {user?.trustee_mode
              ? "This client's full-access period has ended. Everything except the Secure Document Vault is disabled until they choose a subscription. Their data is safe — nothing has been deleted."
              : 'Everything except your Secure Document Vault is disabled until you choose a plan. Your data is safe — nothing has been deleted.'}
          </p>
          {!user?.trustee_mode && (
            <button
              onClick={() => navigate('/subscription')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm active:scale-95 transition-transform"
              style={{ background: '#d4af37', color: '#0B1221' }}
              data-testid="lockdown-panel-choose-plan-btn"
            >
              Choose a Plan <ArrowUpRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isFeatureEnabled(path, enabledFeatures)) return children;

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
