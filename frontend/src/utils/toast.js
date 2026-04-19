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

export const toast = {
  error: (message, options) => notify.error(...normalize(message, options)),
  success: (message, options) => notify.success(...normalize(message, options)),
  info: (message, options) => notify.info(...normalize(message, options)),
  warning: (message, options) => notify.warning(...normalize(message, options)),
  /** Compatibility shim for sonner-style loading toasts */
  loading: (message, options) => notify.info(...normalize(message, options)),
  /** Compatibility shim — dismiss is a no-op (notifications auto-dismiss) */
  dismiss: () => {},
};
