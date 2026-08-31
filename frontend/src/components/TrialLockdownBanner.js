import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FolderLock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * TrialLockdownBanner — persistent bar shown when the benefactor's
 * full-access period has ended (subscriptionStatus.sdv_only_lockdown).
 * Copy adapts for: the owner (trial expired vs dormant billing) and a
 * trustee/manager clicked into the client's account. Owner gets a
 * "Choose a Plan" CTA; trustees don't (billing is owner-only).
 */
const TrialLockdownBanner = () => {
  const { user, subscriptionStatus, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const show = isAuthenticated
    && user?.role === 'benefactor'
    && subscriptionStatus?.sdv_only_lockdown === true
    && !path.startsWith('/beneficiary')
    && !path.startsWith('/manager')
    && !path.startsWith('/p/')
    && !path.startsWith('/print');
  if (!show) return null;

  const trustee = !!user?.trustee_mode;
  const dormant = subscriptionStatus?.is_dormant === true;
  let copy;
  if (trustee) {
    copy = "This client's full-access period has ended — everything except the Secure Document Vault is disabled until they choose a subscription. Their data is safe.";
  } else if (dormant) {
    copy = 'Your subscription payment needs attention. Everything except your Secure Document Vault is disabled until billing is updated. Your data is safe.';
  } else {
    copy = 'Your full-access trial has ended. Everything except your Secure Document Vault is disabled until you choose a plan. Your data is safe — nothing has been deleted.';
  }

  return (
    <div
      className="w-full px-4 py-2.5 flex items-center justify-center gap-3 flex-wrap"
      style={{
        background: 'linear-gradient(90deg, rgba(212,175,55,0.18), rgba(184,120,30,0.24), rgba(212,175,55,0.18))',
        borderBottom: '1px solid rgba(212,175,55,0.45)',
      }}
      data-testid="trial-lockdown-banner"
      role="status"
    >
      <FolderLock className="w-4 h-4 flex-shrink-0" style={{ color: '#d4af37' }} />
      <span className="text-xs sm:text-sm font-semibold text-[var(--t)] text-center" data-testid="trial-lockdown-banner-copy">
        {copy}
      </span>
      {!trustee && (
        <button
          onClick={() => navigate('/subscription')}
          className="text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 active:scale-95 transition-transform"
          style={{ background: '#d4af37', color: '#0B1221' }}
          data-testid="lockdown-choose-plan-btn"
        >
          Choose a Plan
        </button>
      )}
      {!trustee && (
        <button
          onClick={() => navigate('/settings')}
          className="text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 active:scale-95 transition-transform"
          style={{ background: 'transparent', color: '#d4af37', border: '1px solid rgba(212,175,55,0.5)' }}
          data-testid="lockdown-export-link"
        >
          Export everything
        </button>
      )}
    </div>
  );
};

export default TrialLockdownBanner;
