// PWA install detection.
//
// CarryOn supports two installation modes:
//   1. Plain mobile/desktop browser tab — minimal offline (just SW shell cache).
//   2. PWA installed to home screen / dock — full offline mode, including
//      offline-capable login, IndexedDB-encrypted credential cache, and the
//      Settings → "Enable offline access on this device" toggle.
//
// Detection signals (any one is enough):
//   - matchMedia('(display-mode: standalone)') — Chrome / Edge / Safari macOS
//   - navigator.standalone — iOS Safari
//   - referrer prefix 'android-app://' — Android TWA / Trusted Web Activity
//   - localStorage flag — sticky once detected (see note below).
//
// Sticky-flag rationale (iPadOS bug, May 6 2026):
//   Apple's iPadOS does not always reset `navigator.standalone = true`
//   on hard navigations within a launched PWA. After a portal-switcher
//   `window.location.href` navigation, the next page load reports
//   standalone = false even though the user is still inside the home-
//   screen-installed PWA. Symptom: Settings → "Enable offline access"
//   tile vanished after using the admin portal switcher. Fix: once any
//   live signal trips, we cache the truth in localStorage. From that
//   point any standalone signal OR the cached flag returns true. The
//   flag is per-origin and survives navigation; it can only be cleared
//   by clearing site data, which would also kill the IndexedDB
//   credential cache anyway, so the staleness window is bounded.
//
// We deliberately treat the "browser tab" case as the safer default: if any
// of these flags is unavailable or false, isPWA() returns false and any
// offline-credential surface stays hidden. A user can only opt into offline
// auth from a PWA-installed device.

const PWA_FLAG_KEY = 'carryon_pwa_detected';

function _liveStandaloneSignal() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator && window.navigator.standalone === true) return true;
    if (typeof document !== 'undefined' && document.referrer && document.referrer.startsWith('android-app://')) return true;
  } catch { /* APIs unavailable */ }
  return false;
}

export function isPWA() {
  if (typeof window === 'undefined') return false;
  if (_liveStandaloneSignal()) {
    // Trip the sticky flag the first time we observe a live signal.
    try { window.localStorage.setItem(PWA_FLAG_KEY, '1'); } catch { /* private mode */ }
    return true;
  }
  // No live signal — fall back to the cached truth (set on a prior
  // load when standalone was reliably reported).
  try {
    if (window.localStorage.getItem(PWA_FLAG_KEY) === '1') return true;
  } catch { /* private mode */ }
  return false;
}

export function isStandalone() {
  // Alias for callers that prefer the platform-native term.
  return isPWA();
}
