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
//
// We deliberately treat the "browser tab" case as the safer default: if any
// of these flags is unavailable or false, isPWA() returns false and any
// offline-credential surface stays hidden. A user can only opt into offline
// auth from a PWA-installed device.

export function isPWA() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator && window.navigator.standalone === true) return true;
    if (typeof document !== 'undefined' && document.referrer && document.referrer.startsWith('android-app://')) return true;
  } catch {
    /* APIs unavailable — fall through to false */
  }
  return false;
}

export function isStandalone() {
  // Alias for callers that prefer the platform-native term.
  return isPWA();
}
