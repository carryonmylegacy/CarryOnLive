import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Universal back button — rendered once by `DashboardLayout` and
 * fixed to the top-right corner so every authenticated page gets a
 * consistent affordance to return to the previous page. Sitting in
 * the top-right (instead of a strip above the page) means the page
 * gradient flows uninterrupted to the very top of the viewport and
 * the button overlays whatever empty space exists in that corner
 * across every page.
 *
 * Behavior (May 22 2026 — per founder spec):
 *   • Hidden on `/dashboard` itself and the other root destinations
 *     (admin/, ops/, beneficiary roots) since they have no "before"
 *     within the SPA history.
 *   • Click → `navigate(-1)` if browser history has >1 entry, else
 *     falls back to `/dashboard` so a deep-linked visit doesn't
 *     dead-end.
 *
 * Visual: small pill, fixed top-right. Background uses `color-mix`
 * against `var(--card)` so the pill auto-adapts to dark vs light
 * mode (dark glass on dark, light glass on light). Border + text
 * default to high-contrast `var(--t)` so the button reads clearly
 * against any page gradient; hover transitions to brand gold.
 */
const BackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const HIDDEN_EXACT = new Set([
    '/dashboard',
    '/admin',
    '/ops',
    '/beneficiary',
    '/beneficiary/dashboard',
    '/beneficiary/hub',
    '/onboarding',
    '/transition',
  ]);
  if (HIDDEN_EXACT.has(location.pathname)) return null;

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/dashboard');
  };

  return (
    <button
      onClick={handleBack}
      type="button"
      data-testid="universal-back-button"
      aria-label="Go back to the previous page"
      className="fixed inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full transition-all active:scale-95"
      style={{
        // Sits just below the mobile header (h-12 = 48px) + the
        // offline banner (when visible) + iOS safe-area-inset.
        // On desktop the header isn't fixed so the offset reads as
        // a normal top-right margin, which is what we want.
        top: 'calc(env(safe-area-inset-top, 0px) + var(--cy-offline-banner-h, 0px) + 54px)',
        right: '12px',
        zIndex: 30,
        // `color-mix` keeps the same recipe working in dark + light
        // mode. ~78% opacity over the theme's `var(--card)` gives
        // us a frosted-glass tile that reads bright against any
        // page gradient without going full opaque.
        background: 'color-mix(in srgb, var(--card) 78%, transparent)',
        color: 'var(--t)',
        border: '1.5px solid color-mix(in srgb, var(--t) 32%, transparent)',
        backdropFilter: 'blur(12px) saturate(140%)',
        WebkitBackdropFilter: 'blur(12px) saturate(140%)',
        // Two-layer shadow: outer for lift, inner highlight for the
        // top edge so the pill reads as raised glass even on a
        // dark gradient.
        boxShadow: '0 4px 14px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.07)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--gold)';
        e.currentTarget.style.borderColor = 'var(--gold)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--t)';
        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--t) 32%, transparent)';
      }}
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back
    </button>
  );
};

export default BackButton;
