import React from "react";
import ReactDOM from "react-dom/client";
import axios from "axios";
import "./index.css";
import App from "./App";

// ── Global axios defaults — MUST run before any page mounts ────────────────
// Two problems we fix here:
//   1. iOS Safari in airplane mode does NOT reject outgoing XHRs quickly.
//      A naked `axios.get(url)` can hang 60-120s on the native TCP layer.
//      Many pages show spinners/skeletons the whole time — making the
//      offline app feel frozen even though the shell loaded fine.
//   2. Pages that don't pass an explicit `timeout` would wait forever for
//      a slow/cold backend even while online.
// Solution: set a sane 8-second default and reject instantly when the
// browser already knows it's offline. Pages still write their own
// `.catch` handlers to show cached data from IndexedDB / skeleton empty
// states — they just get to run in <100ms instead of 60+s.
axios.defaults.timeout = 8000;

// iOS Safari's `navigator.onLine` is notoriously unreliable in installed
// PWAs — it can return `true` even when airplane mode is on. The
// `online`/`offline` window events ARE reliable on iOS. Track them in a
// module-level flag so axios can short-circuit requests even when
// `navigator.onLine` lies.
let __deviceOffline = (typeof navigator !== 'undefined' && navigator.onLine === false);
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => { __deviceOffline = true; });
  window.addEventListener('online', () => { __deviceOffline = false; });
}

// Exposed on window so any module (AuthContext, page guards, etc.) can ask
// the authoritative question "is the device offline right now?" without
// duplicating the event-listener boilerplate or falling for iOS Safari's
// `navigator.onLine` false-positive. The helper accepts TWO signals —
// the tracked flag, and a recent axios-style error — because on a cold
// launch with airplane mode already engaged the `offline` event may
// have fired before any listener was attached.
if (typeof window !== 'undefined') {
  window.__isDeviceOffline = (err) => {
    if (__deviceOffline) return true;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    if (err) {
      if (err.code === 'ERR_OFFLINE') return true;
      if (err.code === 'ECONNABORTED') return true;
      if (err.code === 'ERR_NETWORK') return true;
      if (err.message === 'Network Error') return true;
      if (!err.response && err.request) return true;
    }
    return false;
  };
}

axios.interceptors.request.use(
  (config) => {
    try {
      // Accept EITHER signal: the tracked event-based flag OR the
      // standard API. Either being true is enough to short-circuit.
      const isOffline = __deviceOffline ||
        (typeof navigator !== 'undefined' && navigator.onLine === false);
      if (isOffline) {
        const err = new Error('offline');
        err.code = 'ERR_OFFLINE';
        err.config = config;
        // Mimic the shape axios error handlers expect so existing
        // `err.response?.status` checks don't explode.
        err.request = {};
        return Promise.reject(err);
      }
    } catch { /* fall through to normal request */ }
    return config;
  },
  (err) => Promise.reject(err),
);

// Response interceptor — promote any no-response / timeout failure into
// the tracked `__deviceOffline` flag. This is what catches iOS Safari's
// `navigator.onLine` lie: the very first request to fail proves the
// device is offline, and every subsequent request short-circuits
// instantly instead of waiting 8s each.
axios.interceptors.response.use(
  (res) => res,
  (err) => {
    try {
      const networkish = !err?.response && (
        err?.code === 'ERR_NETWORK' ||
        err?.code === 'ECONNABORTED' ||
        err?.message === 'Network Error' ||
        err?.code === 'ERR_OFFLINE'
      );
      if (networkish) __deviceOffline = true;
    } catch {}
    return Promise.reject(err);
  },
);

// ── Sentry: activate only when REACT_APP_SENTRY_DSN is present ──
// Zero runtime cost when unset. Safe to merge before you provide a DSN.
try {
  const SENTRY_DSN = process.env.REACT_APP_SENTRY_DSN;
  if (SENTRY_DSN) {
    // Dynamic import so bundle stays small when Sentry is disabled.
    import('@sentry/react').then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || process.env.REACT_APP_SENTRY_ENV || 'production',
        release: process.env.REACT_APP_SENTRY_RELEASE,
        tracesSampleRate: parseFloat(process.env.REACT_APP_SENTRY_TRACES_RATE || '0.05'),
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        sendDefaultPii: false,
        beforeSend(event) {
          // Strip potentially sensitive form data before sending.
          try {
            if (event.request?.cookies) delete event.request.cookies;
          } catch {}
          return event;
        },
      });
      window.__SENTRY_READY__ = true;
      window.Sentry = Sentry; // expose so errorReporter can route through Sentry
    }).catch(() => {});
  }
} catch {}

// Detect native app immediately (before React renders) to prevent layout flash
try {
  const isCapacitor = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (isCapacitor) document.body.classList.add('native-app');
} catch {}

// Prevent pinch-to-zoom on iOS PWA/bookmark to make it feel native
// Pinch-zoom is prevented via CSS touch-action: manipulation on body.
// No gesture event handlers needed — they blocked iOS keyboard dismiss intermittently.

// Double-tap zoom is prevented via CSS touch-action: manipulation on body.
// No JavaScript touchend handler needed — the previous one blocked iOS keyboard dismiss.

// Mark all future scroll/touchstart listeners as passive by default
// This tells the browser it can start scrolling without waiting for JS
if (typeof EventTarget !== 'undefined') {
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, fn, opts) {
    if ((type === 'touchstart' || type === 'scroll') && opts === undefined) {
      opts = { passive: true };
    }
    return orig.call(this, type, fn, opts);
  };
}

// ── Service Worker: App Shell caching + Push notifications ─────────────────
// Register the unified SW (sw-push.js) on every load so the shell
// (icons, splash, manifest, cached API tiles) is available offline and
// the app launches instantly from the home-screen icon. Push registration
// still happens on-demand in PushPrompt / NotificationSettings — it only
// adds the push subscription to this already-registered worker.
//
// We skip registration in headless automation (Playwright) because SW's
// background stale-while-revalidate refreshes break `networkidle`-style
// assertions and sometimes crash the headless chromium process. Real
// users — including PWA installs — always get the SW.
const IS_HEADLESS = (() => {
  try {
    return Boolean(
      navigator.webdriver ||
      /HeadlessChrome|Playwright|Puppeteer/i.test(navigator.userAgent || '')
    );
  } catch { return false; }
})();

if ('serviceWorker' in navigator && window.location.protocol !== 'file:' && !IS_HEADLESS) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw-push.js', { scope: '/' })
      .then((reg) => {
        // If a new SW is waiting, prompt it to take over on next navigation.
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (installing) {
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                // New version ready — activate it so the next launch is fresh.
                installing.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          }
        });
        // Tell the SW about every same-origin bundle the browser has
        // already fetched on this page so it can copy them into
        // RUNTIME_CACHE. CRITICAL for offline boot: the FIRST page load
        // after install happens BEFORE the SW is controlling, so those
        // bundles are never seen by the SW and never cached. Without
        // this message, the next offline launch white-screens because
        // `bundle.js` (or hashed chunks) 404s and React never mounts.
        const postBundles = () => {
          try {
            const urls = new Set();
            document.querySelectorAll('script[src]').forEach((s) => {
              const u = s.getAttribute('src');
              if (u && (u.startsWith('/static/') || u.startsWith(window.location.origin + '/static/'))) {
                urls.add(u.startsWith('http') ? new URL(u).pathname : u);
              }
            });
            document.querySelectorAll('link[rel="stylesheet"][href]').forEach((l) => {
              const u = l.getAttribute('href');
              if (u && (u.startsWith('/static/') || u.startsWith(window.location.origin + '/static/'))) {
                urls.add(u.startsWith('http') ? new URL(u).pathname : u);
              }
            });
            if (urls.size && navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({
                type: 'CACHE_URLS',
                urls: Array.from(urls),
              });
            }
          } catch { /* best-effort; ignore */ }
        };
        // If a controller already exists, cache right now. Otherwise wait
        // until `controllerchange` (first activation after install).
        if (navigator.serviceWorker.controller) postBundles();
        navigator.serviceWorker.addEventListener('controllerchange', postBundles);
      })
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}




// ── Offline-first subsystem (Phase 0 foundation) ───────────────────────────
// Gated entirely by the `carryon_offline_v1` flag. Default OFF → this block
// is a no-op and the app behaves exactly as it did pre-offline. Flip the
// flag to 'shadow' or 'on' to activate the sync client.
try {
  import('./offline/syncClient').then((m) => {
    m.syncClient.init().catch(() => {});
  }).catch(() => {});
} catch {}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
