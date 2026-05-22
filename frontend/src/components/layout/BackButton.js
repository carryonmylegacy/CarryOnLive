import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Universal back button — rendered once by `DashboardLayout` and
 * fixed to a top corner of the viewport so every authenticated page
 * gets a consistent affordance to return to the previous page
 * without taking vertical space in the layout (the page gradient
 * flows uninterrupted to the very top edge).
 *
 * Visual (May 22 2026 — per founder feedback):
 *   • Icon-only circular chip (~32 px) instead of "← Back" pill —
 *     same iOS-Safari corner-chevron pattern users recognize
 *     instantly. Roughly 60% smaller footprint, so it stops
 *     visually clipping section titles even when the title is
 *     long. Tooltip + `aria-label` preserve discoverability.
 *   • Background uses `color-mix` over `var(--card)` so the chip
 *     reads as frosted glass in dark + light theme automatically.
 *   • `z-index: 60` so it always paints above any in-page modals
 *     or sticky toolbars (notably ECT's chat overlay at z:45).
 *
 * Position (per-route override):
 *   • `/estate-chat` + `/beneficiary/estate-chat` → top-LEFT.
 *     ECT renders its own action toolbar (✓ / 🔍 / +) in the
 *     top-right and conflicts with our chip. Top-left is empty on
 *     both views, so the chip lives there.
 *   • Everything else → top-RIGHT, the natural empty corner across
 *     every other authenticated surface.
 *
 * Hidden destinations:
 *   • `/dashboard`, `/admin`, `/ops`, `/beneficiary`,
 *     `/beneficiary/dashboard`, `/beneficiary/hub`, `/onboarding`,
 *     `/transition` — root or modal-style surfaces with no
 *     meaningful "before" within the SPA history.
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

  const LEFT_CORNER_ROUTES = new Set([
    '/estate-chat',
    '/beneficiary/estate-chat',
  ]);
  const isLeftCorner = LEFT_CORNER_ROUTES.has(location.pathname);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/dashboard');
  };

  // Positioning: top offset clears mobile header (h-12 = 48 px) +
  // iOS safe-area + offline banner (if visible). Left/right offset
  // is the same on both sides so the chip sits visually balanced
  // against the opposite-corner content (hamburger on right or
  // section icon on left).
  const positionStyle = isLeftCorner
    ? { left: '12px' }
    : { right: '12px' };

  return (
    <button
      onClick={handleBack}
      type="button"
      data-testid="universal-back-button"
      aria-label="Back to previous page"
      title="Back"
      className="fixed inline-flex items-center justify-center rounded-full transition-all active:scale-90"
      style={{
        ...positionStyle,
        top: 'calc(env(safe-area-inset-top, 0px) + var(--cy-offline-banner-h, 0px) + 54px)',
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
