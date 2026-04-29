/**
 * Lightweight in-house product analytics ("PostHog-lite") for funnel + behaviour
 * events. Uses the same fire-and-forget pattern as downloadTelemetry. Anonymous
 * for unauthenticated visitors (signup/landing); authenticated for the rest.
 *
 *   recordFunnelEvent({ event: 'landing_view' })
 *   recordFunnelEvent({ event: 'signup_step_complete', meta: { step: 1 } })
 *   recordFunnelEvent({ event: 'feature_view', meta: { feature: 'cfp' } })
 */

import axios from 'axios';
import { API_URL } from '../config';

const SESSION_KEY = 'carryon_anon_session_id';

const detectPlatform = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) return 'capacitor';
  const ua = navigator.userAgent || '';
  const standalone =
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document);
  if (isIOS) return standalone ? 'ios-pwa' : 'ios';
  if (/Android/.test(ua)) return standalone ? 'android-pwa' : 'android';
  return 'web';
};

const getOrCreateAnonSession = () => {
  if (typeof localStorage === 'undefined') return null;
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try { localStorage.setItem(SESSION_KEY, id); } catch {}
  }
  return id;
};

export const recordFunnelEvent = ({ event, meta }) => {
  if (!event) return;
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('carryon_token') : null;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const payload = {
      event: String(event).slice(0, 64),
      meta: meta && typeof meta === 'object' ? meta : null,
      platform: detectPlatform(),
      anon_session_id: token ? null : getOrCreateAnonSession(),
      path: typeof window !== 'undefined' ? window.location.pathname.slice(0, 120) : null,
      referrer: typeof document !== 'undefined' ? (document.referrer || '').slice(0, 200) : null,
    };
    axios.post(`${API_URL}/diagnostics/funnel-event`, payload, { headers, timeout: 5000 }).catch(() => {});
  } catch {
    // ignore
  }
};

export default recordFunnelEvent;
