/**
 * CarryOn — Toast Utility
 *
 * Drop-in replacement that routes all toast calls to the CarryOn
 * AppNotification system. Accepts the same API surface sonner uses
 * (a message string plus an optional options object with `description`,
 * `duration`, `action`, etc.) so existing `toast.success('msg')` and
 * `toast.success('msg', { duration, description })` calls keep working.
 *
 * The `description` field is flattened into the message with a middle-dot
 * separator so users still see the supporting context inline.
 */

import { notify } from '../components/AppNotification';

const normalize = (message, options = {}) => {
  const base = typeof message === 'string' ? message : String(message || '');
  const desc = options && typeof options.description === 'string' ? options.description : '';
  const combined = desc ? `${base}  ·  ${desc}` : base;
  const forwarded = {};
  if (options && typeof options.duration === 'number') forwarded.duration = options.duration;
  if (options && options.title) forwarded.title = options.title;
  if (options && options.action) forwarded.action = options.action;
  return [combined, forwarded];
};

/**
 * Page-level data fetches that fail produce a "Failed to load X" toast on
 * almost every screen in the app. During a live B2B pitch (the founder
 * demos the platform on Zoom), the page already has cached data painted
 * from IndexedDB — the toast is pure noise that makes the platform look
 * broken even though the data is sitting right there on screen.
 *
 * Strategy: always drop generic load/fetch/refresh failure toasts
 * regardless of online state. The two paths a user actually cares about
 * still surface fully:
 *   1. ACTION failures ("Failed to save", "Could not delete", "Send
 *      failed") — different verbs, keep firing.
 *   2. Critical load failures the caller really wants visible — opt back
 *      in with `{ force: true }`.
 *
 * The regex is intentionally narrow: only patterns that begin with a
 * load/fetch verb match. "Failed to save", "Could not send",
 * "Invalid file", server validation errors, etc. all keep firing.
 *
 * Callers can opt out with `{ force: true }` if they absolutely need the
 * toast to surface even when offline / when cached data is already
 * painted.
 */
const NETWORK_ERROR_RE = /^(failed to (load|fetch|connect|get|retrieve|refresh)|network error|load failed|unable to (load|connect|reach|fetch|retrieve)|couldn'?t (load|reach|connect|fetch|refresh)|could not (load|fetch|retrieve|reach|connect)|error loading)/i;

const shouldSuppressError = (message, options) => {
  if (options && options.force) return false;
  const text = typeof message === 'string' ? message : String(message || '');
  return NETWORK_ERROR_RE.test(text.trim());
};

export const toast = {
  error: (message, options) => {
    if (shouldSuppressError(message, options)) return;
    notify.error(...normalize(message, options));
  },
  success: (message, options) => notify.success(...normalize(message, options)),
  info: (message, options) => notify.info(...normalize(message, options)),
  warning: (message, options) => notify.warning(...normalize(message, options)),
  /** Compatibility shim for sonner-style loading toasts */
  loading: (message, options) => notify.info(...normalize(message, options)),
  /** Compatibility shim — dismiss is a no-op (notifications auto-dismiss) */
  dismiss: () => {},
};
