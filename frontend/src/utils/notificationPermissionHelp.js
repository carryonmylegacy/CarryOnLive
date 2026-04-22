// Generate a browser-specific "how to unblock notifications" message.
// When a browser has previously recorded a "denied" permission for the
// origin, calling Notification.requestPermission() silently returns
// "denied" without re-prompting. The only remedy is a manual reset in
// the browser's site-settings UI — and the path is different per
// browser. Keep this pure (no toast/UI) so the two call sites
// (NotificationSettings, PushPrompt) can render it however they want.

const isChrome = () => /Chrome|Chromium|CriOS/i.test(navigator.userAgent) && !/Edg|OPR/i.test(navigator.userAgent);
const isEdge = () => /Edg/i.test(navigator.userAgent);
const isFirefox = () => /Firefox|FxiOS/i.test(navigator.userAgent);
const isSafari = () => /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR/i.test(navigator.userAgent);
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * Build a human-readable instruction for unblocking notifications.
 * Assumes Notification.permission === 'denied' (caller decides when to show).
 */
export function notificationUnblockInstruction() {
  if (isIOS()) {
    return 'Notifications are blocked. Open iOS Settings → Notifications → CarryOn → turn on Allow Notifications.';
  }
  if (isSafari()) {
    return 'Notifications are blocked. Open Safari → Settings → Websites → Notifications, find carryon.us, and choose "Allow". Then reload this page.';
  }
  if (isFirefox()) {
    return 'Notifications are blocked. Click the lock icon in the address bar → Clear permissions → reload the page and try again.';
  }
  if (isChrome() || isEdge()) {
    return 'Notifications are blocked. Click the lock/tune icon next to the URL → Site settings → Notifications → Allow. Then reload this page.';
  }
  return 'Notifications are blocked for this site. Open your browser\'s site settings for carryon.us and switch notifications to "Allow", then reload the page.';
}
