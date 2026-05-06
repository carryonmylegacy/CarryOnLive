/**
 * openStripeCheckout — handles redirecting to Stripe Checkout while
 * keeping the in-app session intact when running inside a standalone
 * PWA / dock app.
 *
 * Background: on iOS PWAs and macOS dock-installed PWAs the entire
 * app runs in a windowed Safari context. `window.location.href =
 * stripe_url` navigates that window away. When the user later hits
 * "back" from Stripe, the standalone window's session storage
 * sometimes gets desynced and the user lands on /login instead of
 * the page their cancel_url specified.
 *
 * Fix: when we detect we're running standalone, open Stripe in a
 * separate browser window via `window.open(url, '_blank')`. The
 * original app window remains untouched — the user can close the
 * Stripe tab/window and resume right where they were on the
 * subscription page. In a normal browser tab we keep the legacy
 * full-window redirect because it's the standard checkout flow
 * users expect there.
 *
 * If `window.open` is blocked by a popup blocker we fall back to
 * the in-window redirect so the user is never stranded.
 */
export function openStripeCheckout(url) {
  if (!url) return false;
  if (isStandalonePWA()) {
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (popup) return true;
    // Popup blocked — fall through to legacy redirect.
  }
  window.location.href = url;
  return true;
}

export function isStandalonePWA() {
  if (typeof window === 'undefined') return false;
  // iOS Safari Add-to-Home-Screen
  if (window.navigator && window.navigator.standalone) return true;
  // macOS / Chrome / Edge installed PWA
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  }
  return false;
}
