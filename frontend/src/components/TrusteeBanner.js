import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldAlert } from 'lucide-react';

/**
 * TrusteeBanner — persistent, high-contrast banner that renders on EVERY
 * page (including settings) whenever the active session was created via
 * a trustee credential. Reads `trustee_mode` off the auth user object.
 *
 * Rendered once near the top of `App.js`, above all routes.
 */
const TrusteeBanner = () => {
  const { user } = useAuth();
  if (!user || !user.trustee_mode) return null;

  const acting = user.name || 'the benefactor';
  const trusteeName = user.trustee_display_name || 'Trustee';

  return (
    <div
      data-testid="trustee-mode-banner"
      role="status"
      aria-live="polite"
      className="w-full"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        background: 'linear-gradient(90deg, #b45309 0%, #d97706 50%, #b45309 100%)',
        color: '#fff7ed',
        borderBottom: '2px solid #92400e',
        padding: '8px 16px',
        textAlign: 'center',
        fontWeight: 700,
        letterSpacing: '0.02em',
        boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <ShieldAlert size={18} aria-hidden="true" />
        TRUSTEE MODE — {trusteeName} acting on behalf of {acting}
      </span>
    </div>
  );
};

export default TrusteeBanner;
