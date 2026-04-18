/**
 * CarryOn — Client Error Reporter
 *
 * When Sentry is initialized (REACT_APP_SENTRY_DSN is set), all errors
 * are forwarded to Sentry — zero CORS issues, richer stack traces, better UI.
 *
 * When Sentry is NOT available, falls back to the internal Railway endpoint.
 * This keeps error visibility working even in local dev / staging environments
 * that don't have a Sentry DSN configured.
 *
 * Backend endpoint: POST /api/errors/report (used only when Sentry unavailable)
 */

import { BASE_URL as API_URL } from '../config';

let initialized = false;
const reported = new Set(); // Dedupe within session

function getFingerprint(message, stack) {
  return `${message}::${(stack || '').slice(0, 100)}`;
}

function sendToSentry(error, componentName) {
  // Sentry is initialized asynchronously. Check the ready flag set in index.js.
  if (!window.__SENTRY_READY__) return false;
  try {
    // Access global Sentry instance (set via dynamic import in index.js)
    if (window.__sentry_hub__ || window.Sentry) {
      const S = window.Sentry;
      if (S && typeof S.captureException === 'function') {
        if (componentName) S.withScope(scope => { scope.setTag('component', componentName); S.captureException(error); });
        else S.captureException(error);
        return true;
      }
    }
    // Alternative: use the @sentry/react module directly
    return false;
  } catch {
    return false;
  }
}

function sendToBackend(report) {
  // Only send to backend if Sentry is not available — avoids duplicate reports
  // and the CORS noise from sendBeacon to Railway.
  if (window.__SENTRY_READY__) return;

  const fp = getFingerprint(report.message, report.stack);
  if (reported.has(fp)) return;
  reported.add(fp);

  try {
    const body = JSON.stringify({
      message: (report.message || 'Unknown error').slice(0, 2000),
      stack: (report.stack || '').slice(0, 5000),
      component: (report.component || '').slice(0, 200),
      url: window.location.href.slice(0, 500),
      user_agent: navigator.userAgent.slice(0, 500),
      app_version: report.appVersion || '',
      platform: report.platform || 'web',
      severity: report.severity || 'error',
    });

    // Use fetch with no-credentials to avoid the CORS wildcard conflict
    fetch(`${API_URL}/api/errors/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',  // no cookies — removes the wildcard CORS conflict
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never throw from the error reporter
  }
}

export function initErrorReporter() {
  if (initialized || !API_URL) return;
  initialized = true;

  // Unhandled JS errors
  window.addEventListener('error', (event) => {
    const error = event.error || new Error(event.message || 'Unknown error');
    if (!sendToSentry(error, 'window.onerror')) {
      sendToBackend({
        message: event.message || String(event.error),
        stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
        component: 'window.onerror',
        severity: 'error',
      });
    }
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    if (!sendToSentry(error, 'unhandledrejection')) {
      sendToBackend({
        message: reason?.message || String(reason),
        stack: reason?.stack || '',
        component: 'unhandledrejection',
        severity: 'error',
      });
    }
  });
}

/** Manual report from React error boundaries or catch blocks */
export function reportError(error, componentName) {
  if (!sendToSentry(error, componentName)) {
    sendToBackend({
      message: error?.message || String(error),
      stack: error?.stack || '',
      component: componentName || 'manual',
      severity: 'error',
    });
  }
}
