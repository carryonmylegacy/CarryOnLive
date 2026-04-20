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
 * When the device is offline the global red "You're offline" banner already
 * communicates the root cause. Individual pages' "Failed to load X" toasts
 * become noise that makes the user think something is actually broken.
 *
 * This filter silently drops `toast.error` calls whose message matches a
 * generic load/fetch/network failure pattern WHILE we're offline. Real
 * action-failure toasts (e.g. "Please enter a recipient", "Invalid file
 * size", server 500s while online) still render.
 *
 * Callers can opt out with `{ force: true }` if they absolutely need the
 * toast to surface even when offline.
 */
const NETWORK_ERROR_RE = /^(failed to (load|fetch|connect|get|retrieve|refresh)|network error|load failed|unable to (load|connect|reach)|couldn'?t (load|reach|connect))/i;

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const shouldSuppressError = (message, options) => {
  if (options && options.force) return false;
  if (!isOffline()) return false;
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
