/**
 * CarryOn — Platform-wide Offline-Mode visibility flag.
 *
 * This is DIFFERENT from `/offline/featureFlag.js`, which tracks the
 * CURRENT DEVICE's offline behaviour (`carryon_offline_v1`). Here we
 * mirror the founder's master switch — `platform_settings.offline_mode`
 * — so the regular user UI can hide every "Offline mode" affordance
 * (the Settings cards and the onboarding tile) when the founder has
 * turned the feature off platform-wide.
 *
 * Wire-up:
 *   • Source of truth: `GET /api/public/site-content` → `offline_mode`.
 *   • Hydrated once at app boot from the public endpoint and cached in
 *     localStorage so subsequent reads are synchronous (no flicker).
 *   • Re-broadcast on every change so any mounted listener re-renders
 *     immediately — the founder flipping their sidebar toggle is the
 *     primary trigger but a fresh boot fetch also dispatches it.
 *
 * Always errs on the side of HIDING the feature — if the network is
 * down on first boot, the Settings cards and onboarding tile stay
 * hidden until we successfully hear from the server. That's the
 * correct conservative default for "feature ships ON" vs "feature
 * ships OFF and we'll flip it on later".
 */

import apiClient from './apiClient';

const KEY = 'carryon_platform_offline_flag_v1';
const EVENT = 'carryon:platform-offline-flag-changed';
const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

/** Synchronous read — returns 'on' | 'off'. Defaults to 'off' (hide). */
export function getPlatformOfflineFlag() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** Convenience — has the founder enabled the offline feature platform-wide? */
export function isPlatformOfflineVisible() {
  return getPlatformOfflineFlag() === 'on';
}

/** Persist + broadcast. Returns the value that was set. */
export function setPlatformOfflineFlag(mode) {
  const next = mode === 'on' ? 'on' : 'off';
  try {
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { mode: next } }));
  } catch { /* private-mode etc. */ }
  return next;
}

/** Fetch the public flag from the server and update local cache. */
export async function refreshPlatformOfflineFlag() {
  try {
    const res = await apiClient.get(`${API_URL}/public/site-content`);
    const mode = res?.data?.offline_mode === 'on' ? 'on' : 'off';
    const current = getPlatformOfflineFlag();
    if (current !== mode) {
      setPlatformOfflineFlag(mode);
    }
    return mode;
  } catch {
    return getPlatformOfflineFlag();
  }
}

export const PLATFORM_OFFLINE_FLAG_EVENT = EVENT;
