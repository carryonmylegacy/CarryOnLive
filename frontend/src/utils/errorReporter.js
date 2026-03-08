/**
 * CarryOn — Client Error Reporter
 *
 * Captures unhandled errors and promise rejections, sends them
 * to the backend for monitoring. Lightweight Sentry alternative.
 * Backend endpoint: POST /api/errors/report (already exists).
 */

const API_URL = process.env.REACT_APP_BACKEND_URL;

let initialized = false;
const reported = new Set(); // Dedupe within session

function getFingerprint(message, stack) {
  return `${message}::${(stack || '').slice(0, 100)}`;
}

function sendReport(report) {
  const fp = getFingerprint(report.message, report.stack);
  if (reported.has(fp)) return;
  reported.add(fp);

  // Fire-and-forget — don't block UI or create error loops
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

    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API_URL}/api/errors/report`, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(`${API_URL}/api/errors/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never throw from the error reporter
  }
}

export function initErrorReporter() {
  if (initialized || !API_URL) return;
  initialized = true;

  // Unhandled JS errors
  window.addEventListener('error', (event) => {
    sendReport({
      message: event.message || String(event.error),
      stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
      component: 'window.onerror',
      severity: 'error',
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    sendReport({
      message: reason?.message || String(reason),
      stack: reason?.stack || '',
      component: 'unhandledrejection',
      severity: 'error',
    });
  });
}

/** Manual report from React error boundaries or catch blocks */
export function reportError(error, componentName) {
  sendReport({
    message: error?.message || String(error),
    stack: error?.stack || '',
    component: componentName || 'manual',
    severity: 'error',
  });
}
