import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Universal back button — rendered once by `DashboardLayout` and
 * fixed to the TOP-LEFT corner so every authenticated page gets a
 * consistent affordance to return to the previous page.
 *
 * Visual (May 22 2026 — per founder direction):
 *   • Icon-only circular chip (~32 px) — small footprint, reads as
 *     native chrome (the universally-understood corner chevron).
 *   • Background uses `color-mix` over `var(--card)` so the chip
 *     reads as frosted glass on dark + light theme automatically.
 *   • `z-index: 60` so it paints above any in-page modal or
 *     sticky toolbar (notably ECT's chat overlay at z:45).
 *
 * Layout integration:
 *   • Fixed top-left at the same vertical level as the typical
 *     page icon-chip. The companion CSS rule in `index.css`
 *     (`.main-content.with-back-button > *:first-child > *:first-child {
 *     padding-left: 48px }`) bumps each page's first content row
 *     right just enough to make room. The page's gradient still
 *     flows full-width underneath the chip so the chip reads as
 *     part of the integrated UX, not as floating chrome.
 *
 * Hidden destinations (root or modal-style surfaces):
 *   • `/dashboard`, `/admin`, `/ops`, `/beneficiary`,
 *     `/beneficiary/dashboard`, `/beneficiary/hub`, `/onboarding`,
 *     `/transition`
 *
 * Click → `navigate(-1)` if history > 1, else `/dashboard` so a
 * deep-link doesn't dead-end on a closed-tab no-op.
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
      aria-label="Back to previous page"
      title="Back"
      className="universal-back-chip fixed inline-flex items-center justify-center rounded-full transition-all active:scale-90"
      style={{
        // `top` is inline because it depends on the runtime
        // safe-area-inset and the offline-banner height variables.
        // `left` is handled by `.universal-back-chip` in index.css
        // so it can shift right of the sidebar on desktop without
        // JS knowing the sidebar's current width.
        top: 'calc(env(safe-area-inset-top, 0px) + var(--cy-offline-banner-h, 0px) + 60px)',
        width: 32,
        height: 32,
        zIndex: 60,
        background: 'color-mix(in srgb, var(--card) 80%, transparent)',
        color: 'var(--t)',
        border: '1.5px solid color-mix(in srgb, var(--t) 32%, transparent)',
        backdropFilter: 'blur(12px) saturate(140%)',
        WebkitBackdropFilter: 'blur(12px) saturate(140%)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.07)',
        padding: 0,
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
      <ArrowLeft className="w-4 h-4" />
    </button>
  );
};

export default BackButton;
