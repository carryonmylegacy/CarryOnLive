/**
 * PWA Badge API helper — syncs the home-screen icon badge
 * with the in-app unread notification count.
 */

/** Tell the service worker (and the OS) to show `count` on the icon. */
export function syncBadge(count) {
  if (typeof navigator === 'undefined') return;
  if (count > 0 && navigator.setAppBadge) {
    navigator.setAppBadge(count).catch(() => {});
  } else if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }
  // Also tell the SW so it stays in sync
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(
      count > 0 ? { type: 'SET_BADGE', count } : { type: 'CLEAR_BADGE' }
    );
  }
}

/** Convenience: clear badge entirely. */
export function clearBadge() {
  syncBadge(0);
}
