import React from "react";
import ReactDOM from "react-dom/client";
import axios from "axios";
import "./index.css";
import App from "./App";
import installHistoryRateLimit from "./utils/historyRateLimit";
import installViewportReflow from "./utils/viewportReflow";

// Install the history.replaceState / pushState rate limiter FIRST —
// before any library (React Router, Sentry, Capacitor, etc.) patches
// history. This caps call rate below iOS Safari's hard 100-per-10-seconds
// ceiling so we never throw the `SecurityError` that otherwise crashes
// the PWA at boot. See utils/historyRateLimit.js for the full story.
installHistoryRateLimit();

// Install global viewport reflow handler — fixes iOS Safari's known bug
// where `vw`/`vh` CSS units can get "stuck" at initial-orientation values
// when rotating, AND where scroll containers occasionally fail to recompute
// height after rotation in PWA standalone mode. See utils/viewportReflow.js.
installViewportReflow();

// ── Global axios defaults — MUST run before any page mounts ────────────────
// Two problems we fix here:
//   1. iOS Safari in airplane mode does NOT reject outgoing XHRs quickly.
//      A naked `apiClient.get(url)` can hang 60-120s on the native TCP layer.
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

// Single choke-point for mutating the offline flag. Dispatches a
// `carryon:device-offline-changed` event ONLY when the value actually
// flips, so subscribers (NetworkStatusBanner, page guards) react the
// instant connectivity state changes. On a true→false flip (confirmed
// reconnection) it ALSO re-dispatches a synthetic `online` event so the
// many pages that refetch on `online` reload their data NOW that the
// connection is genuinely usable — not during iOS's premature window.
function __applyDeviceOffline(v) {
  const next = !!v;
  if (next === __deviceOffline) {
    if (next) __startOfflineProbe(); // already offline — ensure probe runs
    return;
  }
  __deviceOffline = next;
  if (next) __startOfflineProbe();
  else __stopOfflineProbe();
  try {
    window.dispatchEvent(
      new CustomEvent('carryon:device-offline-changed', { detail: { offline: next } }),
    );
    // Confirmed reconnection → tell every `online` listener to refetch,
    // now that a real round-trip has succeeded (so their requests won't
    // fail into empty "add your first…" states the way the raw, premature
    // iOS `online` event caused).
    if (!next) window.dispatchEvent(new Event('online'));
  } catch { /* CustomEvent unsupported — subscribers fall back to native events */ }
}

// Connectivity probe: poll a tiny same-origin resource that the Service
// Worker does NOT serve from cache (`/manifest.json` falls through to
// default network handling in sw-push.js), so a successful response proves
// a REAL working round-trip — not iOS's lying `navigator.onLine`. The first
// tick runs immediately so reconnection is confirmed fast; then every 3s.
let __offlineProbeTimer = null;
async function __probeTick() {
  try {
    const resp = await fetch(`/manifest.json?cy_probe=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (resp && resp.ok) __applyDeviceOffline(false);
  } catch { /* still offline — keep probing */ }
}
function __startOfflineProbe() {
  if (__offlineProbeTimer || typeof window === 'undefined' || typeof fetch !== 'function') return;
  __probeTick(); // immediate first check — don't wait 3s to confirm reconnect
  __offlineProbeTimer = setInterval(__probeTick, 3000);
}
function __stopOfflineProbe() {
  if (__offlineProbeTimer) {
    clearInterval(__offlineProbeTimer);
    __offlineProbeTimer = null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => __applyDeviceOffline(true));
  // iOS fires `online` OPTIMISTICALLY — the connection is frequently not
  // usable for a second or two. Do NOT clear the offline flag here (that
  // was the cause of section pages flashing empty "add your first…" states
  // on reconnect: they'd refetch, the request would fail, and the re-mounted
  // page would fall through to its empty state instead of cache). Instead,
  // keep reporting offline and let the probe confirm a real round-trip — the
  // probe (or the first successful API response, below) clears the flag.
  window.addEventListener('online', () => { if (__deviceOffline) __startOfflineProbe(); });
  // Booted already offline (cold launch in airplane mode) → start probing now.
  if (__deviceOffline) __startOfflineProbe();
}

// PATCH `navigator.onLine` itself so every consumer in the codebase (and
// every third-party library) gets the truth without each having to know
// about our event-tracked flag. There are ~80 direct `navigator.onLine`
// reads across the frontend and untold more inside libraries; chasing
// them one-by-one is whack-a-mole.
//
// Strategy: install a getter on `Navigator.prototype` that returns
// `false` whenever our event-tracked flag says we're offline (overriding
// the native iOS lie), but preserves the original behaviour otherwise.
// We never report `false → true` upgrades; the native value flips back
// to `true` reliably when iOS regains connectivity, so the original
// getter handles "online" reporting correctly. We only need to override
// the FALSE case that iOS misses.
//
// Safe-by-design: if Object.defineProperty fails (some locked-down
// browsers refuse), the helper above + per-page checks still work as
// a fallback.
try {
  if (typeof Navigator !== 'undefined') {
    const proto = Navigator.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'onLine');
    if (desc && desc.configurable) {
      const nativeGetter = desc.get;
      Object.defineProperty(proto, 'onLine', {
        configurable: true,
        enumerable: desc.enumerable,
        get: function () {
          // If our tracked flag says offline, override iOS's lie.
          if (__deviceOffline) return false;
          // Otherwise defer to the native value — accurate for "true"
          // reports and accurate when no event-tracked override exists.
          try { return nativeGetter ? nativeGetter.call(this) : true; }
          catch { return true; }
        },
      });
    }
  }
} catch { /* best-effort patch; helper above remains the safety net */ }

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
  // Lets the boot sequence flip the tracked flag directly. On Wi-Fi-with-
  // no-internet (cruise ship / captive portal) navigator.onLine LIES (true)
  // and request timeouts (ECONNABORTED) are intentionally NOT treated as
  // offline-proof (see response interceptor), so nothing would mark the app
  // offline — every page would hang the full 20s timeout. AuthContext calls
  // this at its optimistic-paint moment so subsequent page requests
  // short-circuit to cache instantly, and clears it if /auth/me later
  // succeeds.
  window.__setDeviceOffline = (v) => { __applyDeviceOffline(v); };
}

axios.interceptors.request.use(
  (config) => {
    try {
      // Upload paths are allowed through even if __deviceOffline is set —
      // a stale flag from an earlier transient hiccup must not strand a
      // user's queued recording forever. The actual fetch will surface
      // a real Network Error if the device truly is offline; in that
      // case the response interceptor (above) intentionally does NOT
      // flip __deviceOffline for these URLs, so retries stay possible.
      const url = config?.url || '';
      if (_isUploadUrl(url)) return config;
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

// Response interceptor — promote any no-response / network-layer failure
// into the tracked `__deviceOffline` flag. This is what catches iOS Safari's
// `navigator.onLine` lie: the very first request to fail proves the
// device is offline, and every subsequent request short-circuits
// instantly instead of waiting 8s each.
//
// IMPORTANT: ECONNABORTED is intentionally NOT included here. It fires on
// any axios `timeout` — including legitimately slow chunked-video uploads
// over cellular (10 MB at 200 KB/s = 50 s). Treating "this single request
// timed out" as "the device is offline" was bricking the upload drainer:
// the first chunk would time out at 8 s, the flag would flip to true, and
// every retry + every other axios call would short-circuit with
// ERR_OFFLINE even though the user was demonstrably online (Wi-Fi, LTE,
// 5G — the whole reason they reconnected). Only treat genuine routing
// failures (Network Error / ERR_NETWORK / ERR_OFFLINE) as offline proof.
//
// SECOND IMPORTANT EXCLUSION: large uploads (the chunked-upload PUT path
// AND the legacy /messages/{id}/upload-video FormData POST). When a
// 30-second video upload hits a transient cellular drop on iOS Safari it
// errors with `Network Error` even though the device immediately
// reconnects. Letting that single failure flip __deviceOffline poisoned
// every later axios call in the session with ERR_OFFLINE — which is
// exactly the regression the user just reported. Skip uploads here.
function _isUploadUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.includes('/uploads/chunked/')) return true;
  if (/\/messages\/[^/]+\/upload-(video|attachment)/.test(url)) return true;
  return false;
}
axios.interceptors.response.use(
  (res) => {
    // Any successful response is proof of a usable connection. If a stale
    // offline flag is still set (e.g. iOS fired `online` early and the probe
    // hasn't confirmed yet, or a transient earlier failure set it), clear it
    // now so the app reconciles to live data immediately.
    try { if (__deviceOffline) __applyDeviceOffline(false); } catch { /* swallow */ }
    return res;
  },
  (err) => {
    try {
      const url = err?.config?.url || '';
      const networkish = !err?.response && (
        err?.code === 'ERR_NETWORK' ||
        err?.message === 'Network Error' ||
        err?.code === 'ERR_OFFLINE'
      );
      if (networkish && !_isUploadUrl(url)) __applyDeviceOffline(true);
    } catch { /* swallow */ }
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
        // Drop noisy errors that originate inside Android in-app browsers
        // (Facebook / Instagram / TikTok / LinkedIn embedded webviews).
        // These fire when a user closes the host app mid-load and have
        // nothing to do with our React/PWA code. Match by message
        // substring so any future variant from the same bridge is also
        // filtered out.
        ignoreErrors: [
          'Java object is gone',
          'Error invoking postMessage',
          'navigation_performance_logger_android',
          // AbortError: Fetch is aborted — fires when the user navigates
          // away from a page (or a component unmounts) while a `fetch()`
          // is still in flight and the in-flight promise rejection isn't
          // caught locally. This is expected browser behavior, not a
          // bug. Matches both the bare message and the wrapped variants.
          'AbortError',
          'Fetch is aborted',
          'The user aborted a request',
          'The operation was aborted',
        ],
        // Also drop events whose entire stack is inside iabjs:// — that
        // protocol is exclusively the in-app browser JS bridge.
        denyUrls: [
          /iabjs:\/\//i,
        ],
        beforeSend(event) {
          // Strip potentially sensitive form data before sending.
          try {
            if (event.request?.cookies) delete event.request.cookies;
          } catch {}
          // Belt-and-suspenders: if all stack frames are from the IAB
          // bridge, drop the event even if the message didn't match.
          try {
            const frames = event?.exception?.values?.[0]?.stacktrace?.frames || [];
            if (frames.length > 0 && frames.every((f) => (f.filename || '').startsWith('iabjs://'))) {
              return null;
            }
          } catch {}
          // Drop AbortError / DOMException 20 regardless of how it was
          // wrapped. Some browsers surface these as `name: 'AbortError'`
          // on the value object rather than in the message string, so
          // `ignoreErrors` above doesn't always catch them. AbortErrors
          // are virtually always a user navigating away during an
          // in-flight fetch — expected behavior, not a regression.
          try {
            const exc = event?.exception?.values?.[0];
            if (exc) {
              const isAbort =
                exc.type === 'AbortError' ||
                /aborted/i.test(exc.value || '') ||
                exc.mechanism?.handled === false &&
                  exc.mechanism?.type === 'onunhandledrejection' &&
                  /aborted/i.test(exc.value || '');
              if (isAbort) return null;
            }
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
    // audit 4fcd843 #3 — when the SW detects a 401/403 on an authorization-
    // sensitive API it posts AUTHZ_REVOKED. The SW already dropped its HTTP
    // cache entry, but Dexie/localStorage mirrors can still hold the now-
    // unauthorized data and would reappear offline. Security-first: purge ALL
    // local app mirrors so revoked data cannot resurface.
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.type !== 'AUTHZ_REVOKED') return;
      Promise.allSettled([
        import('./offline/db').then((m) => m.purgeLocalData()),
        import('./utils/localListCache').then((m) => m.clearAllLists()),
        import('./utils/clearLocalDrafts').then((m) => m.clearLocalDrafts()),
      ]).catch(() => {});
    });
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
        // Lazy route chunks never appear as <script> tags in the DOM, so
        // postBundles() above can't see them — which is exactly why
        // navigating to an unvisited page offline threw ChunkLoadError.
        // Pull the full build manifest and ask the SW to cache EVERY chunk.
        // Runs on each online load, so it self-heals across deploys: a new
        // build's hashed chunks get cached the next time the user is online,
        // even when sw-push.js itself didn't change (so the install handler
        // never re-ran).
        const cacheAllChunks = async () => {
          try {
            const resp = await fetch('/asset-manifest.json', { cache: 'no-store' });
            if (!resp.ok) return;
            const manifest = await resp.json();
            const files = manifest && manifest.files ? Object.values(manifest.files) : [];
            const urls = files.filter(
              (u) => typeof u === 'string' && u.startsWith('/static/') && /\.(js|css)$/i.test(u),
            );
            if (urls.length && navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URLS', urls });
            }
          } catch { /* best-effort */ }
        };
        const warmCaches = () => { postBundles(); cacheAllChunks(); };
        if (navigator.serviceWorker.controller) warmCaches();
        navigator.serviceWorker.addEventListener('controllerchange', warmCaches);
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

// audit d5a54f5e P0 — purge any DAV secrets that older builds leaked into
// plaintext localStorage list caches. One-time + self-healing: only rewrites
// cache entries that still carry secret fields, no-ops thereafter.
try {
  import('./utils/sanitizeDavForCache').then((m) => m.purgeLeakedDavSecrets()).catch(() => {});
} catch {}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
