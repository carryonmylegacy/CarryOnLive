import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Universal back button — rendered once by `DashboardLayout` and
 * fixed to the TOP-LEFT corner so every authenticated page gets a
 * consistent affordance to return to the previous page.
 *
 * Visual (Feb 26 2026 — per founder direction):
 *   • Tall rounded-rectangle "tile" (~32 × 44 px) — thinner
 *     horizontally, taller vertically — so it reads as a sibling
 *     of the page's gradient icon-chip (typically 48 × 48) sitting
 *     to ITS left, not as a floating circle in the corner above.
 *   • `border-radius: 14px` (matches the rounded-2xl page icon
 *     chip rhythm) so the eye groups it with the page header.
 *   • Background uses `color-mix` over `var(--card)` so the chip
 *     reads as frosted glass on dark + light theme automatically.
 *   • `z-index: 60` so it paints above any in-page modal or
 *     sticky toolbar.
 *
 * Hidden in two cases:
 *   • Root / modal-style surfaces (see `HIDDEN_EXACT`).
 *   • Any time a `<SlidePanel>` is open (body has class
 *     `slide-panel-open`) — the panel has its own back chevron
 *     so showing both is redundant.
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
    // ECT (Estate Comms Tool) ships its own back-to-Dashboard button in
    // the ECTChannelList header on desktop, and the mobile platform
    // header serves the same role on mobile. Showing the universal
    // chip here both duplicates that affordance AND overlaps the
    // ECT page's chat-bubble icon (its icon-row lives deep inside
    // ECTChannelList, out of reach of the room-maker CSS).
    '/estate-chat',
    '/beneficiary/estate-chat',
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
      className="universal-back-chip fixed inline-flex items-center justify-center transition-all active:scale-90"
      style={{
        // `top` is inline because it depends on the runtime
        // safe-area-inset and the offline-banner height variables.
        // `+ 60px` places the chip's vertical center on the same
        // axis as the typical 48×48 page icon-chip (Feb 26 2026:
        // tuned by founder request — "exactly a beam the icon").
        // `left` is handled by `.universal-back-chip` in index.css
        // so it can shift right of the sidebar on desktop without
        // JS knowing the sidebar's current width.
        top: 'calc(env(safe-area-inset-top, 0px) + var(--cy-offline-banner-h, 0px) + 60px)',
        width: 32,
        height: 44,
        borderRadius: 14,
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
      <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
    </button>
  );
};

export default BackButton;
