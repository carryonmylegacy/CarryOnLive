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
 *
 * Auto-logout safety: opening Stripe in a new window/tab hides the
 * original tab on most platforms. If the user has set their security
 * policy to "instant on app leave" (`carryon_auto_logout_minutes='0'`)
 * the visibilitychange handler in AuthContext would log them out
 * mid-payment. Suspending auto-logout for the duration of the round-
 * trip — released on focus-return — keeps the session alive across
 * every paywall surface (main paywall, settings, Founders Circle,
 * future tiles) without per-caller wiring.
 */
import { suspendAutoLogout } from './autoLogoutSuspend';
import apiClient from './apiClient';
import { API_URL } from '../config';

export function openStripeCheckout(url) {
  if (!url) return false;
  const release = suspendAutoLogout();
  // Always release when focus returns to the original window. The
  // utility also has a 5-minute hard ceiling so a never-returning
  // user can't permanently disable the security policy.
  const onReturn = () => release();
  window.addEventListener('focus', onReturn, { once: true });
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

/**
 * startPlanCheckout — shared by /start and /pricing. Creates the Stripe
 * Checkout session via POST /api/subscriptions/checkout (the same route the
 * in-app paywall uses), persists the pending-session breadcrumb that
 * LoginPage / SubscriptionPage reconcile on return, and hands off to Stripe.
 * Resolves `{ free: true }` when the platform is in beta / free mode (no
 * Stripe hop), `{ url }` after redirecting, or throws on API failure.
 */
export async function startPlanCheckout({ planId, cycle, planName }) {
  const token = localStorage.getItem('carryon_token');
  const res = await apiClient.post(`${API_URL}/subscriptions/checkout`, {
    plan_id: planId,
    billing_cycle: cycle,
    origin_url: window.location.origin,
  }, { headers: { Authorization: `Bearer ${token}` } });
  if (res.data.free) return { free: true, message: res.data.message };
  if (!res.data.url) throw new Error('Checkout did not return a payment link');
  if (res.data.session_id) {
    try {
      localStorage.setItem('carryon_pending_stripe_session', JSON.stringify({
        session_id: res.data.session_id, plan_id: planId, plan_name: planName, billing_cycle: cycle, created_at: Date.now(),
      }));
    } catch { /* private mode */ }
  }
  openStripeCheckout(res.data.url);
  return { url: res.data.url };
}
