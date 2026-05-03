/**
 * Auto-update checker — ensures users always run the latest deployed frontend.
 *
 * How it works:
 * 1. Each build writes a unique hash to /version.json
 * 2. On app mount, we fetch /version.json with a cache-busting query
 * 3. If the hash differs from localStorage, we flag an update pending.
 *    The reload happens at a SAFE moment (next navigation or explicit user
 *    action), NOT mid-session — which prevents the login-flash glitch.
 *
 * Safety:
 * - Never force-reloads while a user is typing, has an open modal, or is
 *   on /login, /signup, /accept-invitation (critical form flows)
 * - Only one reload per session
 * - All failures are silent
 */

const STORAGE_KEY = 'carryon_build_version';
const REFRESH_GUARD = 'carryon_version_refreshed';
const UPDATE_READY_FLAG = 'carryon_update_ready';

// Paths where a mid-session reload is *never* acceptable (form submission in
// progress would be destroyed). We defer until the user navigates away.
const SAFE_RELOAD_BLOCKLIST = [
  '/login',
  '/signup',
  '/accept-invitation',
  '/create-estate',
  '/onboarding',
  '/founders-circle',
  '/subscription',
];

function isSafeReloadLocation() {
  try {
    const path = window.location.pathname || '';
    if (SAFE_RELOAD_BLOCKLIST.some((p) => path.startsWith(p))) return false;
    // If user is typing in a form, don't reload
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      return false;
    }
    // If there's an open dialog/modal, don't reload
    if (document.querySelector('[role="dialog"][data-state="open"]')) return false;
    return true;
  } catch {
    return false;
  }
}

function scheduleReloadOnNavigation() {
  sessionStorage.setItem(UPDATE_READY_FLAG, '1');
  // On next pushState/popState, reload if we're in a safe spot.
  const tryReload = () => {
    if (!sessionStorage.getItem(UPDATE_READY_FLAG)) return;
    if (!isSafeReloadLocation()) return;
    sessionStorage.removeItem(UPDATE_READY_FLAG);
    sessionStorage.setItem(REFRESH_GUARD, '1');
    window.location.reload();
  };
  // Listen for SPA navigation (back/forward only — patching pushState
  // and replaceState used to multiply the call rate of those APIs and
  // eventually triggered iOS Safari's 100-replaceState-per-10-seconds
  // SecurityError. popstate alone covers user-initiated nav; the
  // visibilitychange listener below covers the rest.
  window.addEventListener('popstate', tryReload);
  // Also check on visibility change (tab regains focus)
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryReload();
  });
}

export async function checkForUpdates() {
  try {
    // Never refresh more than once per browser session
    if (sessionStorage.getItem(REFRESH_GUARD)) return;

    const res = await fetch(`/version.json?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return;

    const data = await res.json();
    const serverVersion = data?.v;
    if (!serverVersion) return;

    const localVersion = localStorage.getItem(STORAGE_KEY);

    if (!localVersion) {
      // First visit ever — just store the version, no refresh needed
      localStorage.setItem(STORAGE_KEY, serverVersion);
      return;
    }

    if (localVersion === serverVersion) return; // Up to date

    // Version changed — store new version, then schedule a safe reload.
    // Previously this immediately called window.location.reload() which
    // caused a visual flash when triggered mid-login. Now we wait for
    // the next navigation/visibility change in a safe location.
    localStorage.setItem(STORAGE_KEY, serverVersion);
    scheduleReloadOnNavigation();
  } catch {
    // Silent failure — never crash the app for a version check
  }
}

/** Returns true if a pending update has been detected but not yet applied. */
export function isUpdatePending() {
  try { return !!sessionStorage.getItem(UPDATE_READY_FLAG); } catch { return false; }
}
