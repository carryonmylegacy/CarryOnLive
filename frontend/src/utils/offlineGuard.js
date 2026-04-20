/**
 * CarryOn — Offline Action Guard
 * ============================================================================
 * Helper used by page-level handlers that open a cloud-only resource
 * (a DAV document, a milestone video/audio, a chat attachment) to short-
 * circuit when the device has no signal and show a friendly, honest toast.
 *
 * Usage:
 *   if (!canOpenCloudFile({ kind: 'document' })) return;
 *   // ... otherwise proceed with fetch/open
 *
 * Copy tailored per resource so users understand exactly what will happen
 * when they reconnect.
 */

import { toast } from './toast';

const COPY = {
  document: {
    title: "You're offline",
    body: 'This document will open once you reconnect. Your files are safely waiting in your vault.',
  },
  milestone: {
    title: "You're offline",
    body: 'This milestone will play when you reconnect. All your messages are safe in the cloud.',
  },
  attachment: {
    title: "You're offline",
    body: 'This attachment will load once you reconnect.',
  },
  default: {
    title: "You're offline",
    body: "This item will open once you reconnect — you can still create new content in the meantime.",
  },
};

/** Returns true if the resource can be opened now, false if blocked. */
export function canOpenCloudFile({ kind = 'default' } = {}) {
  if (typeof navigator === 'undefined') return true;
  if (navigator.onLine !== false) return true;
  const { title, body } = COPY[kind] || COPY.default;
  try {
    toast.info ? toast.info(`${title} — ${body}`) : toast(`${title} — ${body}`);
  } catch {}
  return false;
}

/** Wrap an async handler so it short-circuits (with toast) when offline. */
export function guardCloudAction(kind, handler) {
  return async (...args) => {
    if (!canOpenCloudFile({ kind })) return;
    return handler(...args);
  };
}
