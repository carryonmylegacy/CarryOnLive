/**
 * CarryOn™ — Client Error Reporter
 *
 * Captures unhandled errors and sends them to /api/errors/report.
 * Installed once at app boot via initErrorReporting().
 */

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

let installed = false;

function sendReport(report) {
  try {
    fetch(`${API_URL}/errors/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Last resort — never throw from the error reporter
  }
}

function buildReport(message, stack, severity = 'error') {
  return {
    message: String(message).slice(0, 2000),
    stack: String(stack || '').slice(0, 5000),
    component: '',
    url: window.location.href,
    user_agent: navigator.userAgent,
    app_version: '1.0.0',
    platform: window.Capacitor?.getPlatform?.() || 'web',
    severity,
  };
}

/**
 * Report an error from a React error boundary.
 */
export function reportComponentError(error, errorInfo) {
  const report = buildReport(error?.message || 'Component crash', error?.stack);
  report.component = errorInfo?.componentStack?.slice(0, 500) || '';
  report.severity = 'fatal';
  sendReport(report);
}

/**
 * Install global error handlers. Call once at app startup.
 */
export function initErrorReporting() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    // Skip cross-origin script errors (no useful info)
    if (!event.error) return;
    sendReport(buildReport(event.error.message, event.error.stack));
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason);
    // Skip network errors (handled by the network banner)
    if (message.includes('NetworkError') || message.includes('Failed to fetch')) return;
    sendReport(buildReport(message, reason?.stack, 'error'));
  });
}
