/**
 * Auto-logout suspension utility.
 *
 * The app's AuthContext auto-logs users out when the browser tab
 * becomes hidden (per their security setting — including "instant on
 * app leave"). That is correct for genuine app-leave events but FALSE-
 * positives on flows where the user intentionally hands focus to a
 * sibling activity that takes the web page out of view:
 *
 *   • iOS file-picker (verification doc upload → Photos / Files app)
 *   • Stripe Checkout opening in a popup / new tab
 *   • Apple/Google IAP sheets on native PWA
 *
 * Wrapping those flows with `suspendAutoLogout()` keeps the user
 * signed in across the round-trip. The return value MUST be invoked
 * to release the suspension — pair every call with a paired release.
 *
 * Reference-counted so concurrent flows don't release each other
 * prematurely (e.g. user reopens the file picker before the previous
 * close handler ran).
 */

let suspendCount = 0;
let safetyTimeoutId = null;

// Absolute safety ceiling — never suspend auto-logout for more than
// 5 minutes regardless of how the caller released or didn't release
// the suspension. Belt-and-suspenders: a stuck flow can't permanently
// disable the security policy.
const MAX_SUSPEND_MS = 5 * 60 * 1000;

const ensureSafetyTimeout = () => {
  if (safetyTimeoutId) return;
  safetyTimeoutId = setTimeout(() => {
    suspendCount = 0;
    safetyTimeoutId = null;
  }, MAX_SUSPEND_MS);
};

const clearSafetyTimeout = () => {
  if (suspendCount > 0) return;
  if (safetyTimeoutId) {
    clearTimeout(safetyTimeoutId);
    safetyTimeoutId = null;
  }
};

export const suspendAutoLogout = () => {
  suspendCount += 1;
  ensureSafetyTimeout();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    suspendCount = Math.max(0, suspendCount - 1);
    clearSafetyTimeout();
  };
};

export const isAutoLogoutSuspended = () => suspendCount > 0;
