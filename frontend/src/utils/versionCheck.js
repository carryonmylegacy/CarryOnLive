/**
 * Auto-update checker — ensures users always run the latest deployed frontend.
 *
 * How it works:
 * 1. Each build writes a unique hash to /version.json
 * 2. On app mount, we fetch /version.json with a cache-busting query
 * 3. If the hash differs from localStorage, we hard-refresh (once per session)
 *
 * Safety:
 * - Only refreshes ONCE per session (sessionStorage guard)
 * - All failures are silent — never breaks the app
 * - 5-second delay after mount to avoid blocking initial render
 */

const STORAGE_KEY = 'carryon_build_version';
const REFRESH_GUARD = 'carryon_version_refreshed';

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

    // Version changed — store new version, mark session, and reload
    localStorage.setItem(STORAGE_KEY, serverVersion);
    sessionStorage.setItem(REFRESH_GUARD, '1');
    window.location.reload();
  } catch {
    // Silent failure — never crash the app for a version check
  }
}
