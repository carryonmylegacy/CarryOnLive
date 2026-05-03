/**
 * iOS Safari throws a hard `SecurityError: Attempt to use history.replaceState()
 * more than 100 times per 10 seconds` the moment a site exceeds that ceiling —
 * it's an irrecoverable, user-visible throw that our RouteErrorBoundary then
 * catches as "Something went wrong".
 *
 * Our own code and every library on the page (React Router, Meta Pixel, Sentry,
 * etc.) each try to keep things sane, but the 100-per-10-seconds budget is
 * SHARED across all callers. It's very easy for a benign-looking combination
 * (e.g. a React Router `navigate(url, { replace: true })` inside a useEffect
 * with a dependency that re-fires, or a third-party SPA tracker) to push the
 * total over the ceiling during app boot and crash the PWA.
 *
 * This module installs a GLOBAL rate limiter on `history.pushState` and
 * `history.replaceState` that caps call rate at ~80 per 10 seconds (a 20%
 * safety margin under the iOS ceiling). Calls beyond the cap are silently
 * DROPPED (no-op) rather than allowed to trigger the SecurityError. For the
 * very few legitimate high-rate callers, dropping a replaceState is WAY less
 * destructive than crashing the entire app: at worst the URL doesn't update
 * for a brief moment; at best nobody notices.
 *
 * Install at the earliest possible point — BEFORE React Router boots, BEFORE
 * any other library patches history. Once installed it's transparent.
 */

const MAX_CALLS = 80;       // cap below iOS's 100 ceiling
const WINDOW_MS = 10_000;   // sliding window the limit applies over

let installed = false;

export function installHistoryRateLimit() {
  if (installed) return;
  if (typeof window === 'undefined' || !window.history) return;

  const history = window.history;
  // Keep originals so we can still forward calls that pass the rate-limit.
  const originalReplace = history.replaceState.bind(history);
  const originalPush = history.pushState.bind(history);

  // Timestamp ring buffer — pushes on each allowed call, prunes on each check.
  const stamps = [];

  const allowCall = () => {
    const now = Date.now();
    // Drop any stamps older than the sliding window.
    while (stamps.length && now - stamps[0] > WINDOW_MS) stamps.shift();
    if (stamps.length >= MAX_CALLS) {
      // Hard cap hit — drop this call. Safer than letting iOS throw.
      // eslint-disable-next-line no-console
      if (stamps.length === MAX_CALLS) {
        // Log ONCE per cap-hit cluster so we have a breadcrumb without spam.
        try { console.warn('[carryon] history.replaceState rate limit hit — dropping excess calls'); } catch {}
      }
      return false;
    }
    stamps.push(now);
    return true;
  };

  history.replaceState = function rateLimitedReplaceState(...args) {
    if (!allowCall()) return;
    return originalReplace(...args);
  };
  history.pushState = function rateLimitedPushState(...args) {
    if (!allowCall()) return;
    return originalPush(...args);
  };

  installed = true;
}

export default installHistoryRateLimit;
