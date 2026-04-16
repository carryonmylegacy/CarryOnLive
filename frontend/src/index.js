import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// ── Sentry: activate only when REACT_APP_SENTRY_DSN is present ──
// Zero runtime cost when unset. Safe to merge before you provide a DSN.
try {
  const SENTRY_DSN = process.env.REACT_APP_SENTRY_DSN;
  if (SENTRY_DSN) {
    // Dynamic import so bundle stays small when Sentry is disabled.
    import('@sentry/react').then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.REACT_APP_SENTRY_ENV || 'production',
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


const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
