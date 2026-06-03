/**
 * CarryOn — Platform-wide Subscription visibility flag.
 *
 * Mirrors the founder's master switch — `platform_settings.subscriptions_enabled`
 * — so EVERY user's menu can hide the "Subscription" item when the founder
 * turns the page off platform-wide. Same shape as `platformOfflineFlag.js`.
 *
 * Wire-up:
 *   • Source of truth: `GET /api/public/site-content` → `subscriptions_enabled`.
 *   • Hydrated once at app boot and cached in localStorage so reads are
 *     synchronous (no menu flicker).
 *   • Re-broadcast on every change so any mounted menu re-renders instantly
 *     when the founder flips their toggle.
 *
 * Default: VISIBLE ('on'). Unlike the offline flag (which hides on doubt),
 * we must NOT hide a revenue page just because we haven't heard from the
 * server yet — the conservative default for a feature that ships ON.
 */

import apiClient from './apiClient';

const KEY = 'carryon_platform_subs_flag_v1';
const EVENT = 'carryon:platform-subscriptions-flag-changed';
const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

/** Synchronous read — returns 'on' | 'off'. Defaults to 'on' (visible). */
export function getPlatformSubscriptionsFlag() {
  try {
    return localStorage.getItem(KEY) === 'off' ? 'off' : 'on';
  } catch {
    return 'on';
  }
}

/** Convenience — should the Subscription menu item be shown? */
export function isPlatformSubscriptionsVisible() {
  return getPlatformSubscriptionsFlag() === 'on';
}

/** Persist + broadcast. Returns the value that was set. */
export function setPlatformSubscriptionsFlag(mode) {
  const next = mode === 'off' ? 'off' : 'on';
  try {
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { mode: next } }));
  } catch { /* private-mode etc. */ }
  return next;
}

/** Fetch the public flag from the server and update local cache. */
export async function refreshPlatformSubscriptionsFlag() {
  try {
    const res = await apiClient.get(`${API_URL}/public/site-content`);
    const mode = res?.data?.subscriptions_enabled === false ? 'off' : 'on';
    if (getPlatformSubscriptionsFlag() !== mode) {
      setPlatformSubscriptionsFlag(mode);
    }
    return mode;
  } catch {
    return getPlatformSubscriptionsFlag();
  }
}

export const PLATFORM_SUBSCRIPTIONS_FLAG_EVENT = EVENT;
