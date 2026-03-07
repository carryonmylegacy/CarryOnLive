/**
 * CarryOn™ — Haptic Feedback Service
 *
 * Provides native haptic feedback on iOS/Android via Capacitor.
 * Falls back silently on web — no-op, no errors.
 */

import { Capacitor } from '@capacitor/core';

const isNativePlatform = Capacitor.isNativePlatform();

// Cache the plugin import so we don't re-import on every tap
let _haptics = null;
async function getHaptics() {
  if (!isNativePlatform) return null;
  if (_haptics) return _haptics;
  try {
    const mod = await import('@capacitor/haptics');
    _haptics = mod.Haptics;
    return _haptics;
  } catch {
    return null;
  }
}

/** Light tap — button presses, toggles */
export async function tapLight() {
  const h = await getHaptics();
  h?.impact({ style: 'light' }).catch(() => {});
}

/** Medium tap — confirmations, selections */
export async function tapMedium() {
  const h = await getHaptics();
  h?.impact({ style: 'medium' }).catch(() => {});
}

/** Success — completed action */
export async function tapSuccess() {
  const h = await getHaptics();
  h?.notification({ type: 'success' }).catch(() => {});
}

/** Warning — destructive action confirmation */
export async function tapWarning() {
  const h = await getHaptics();
  h?.notification({ type: 'warning' }).catch(() => {});
}

/** Error — failed action */
export async function tapError() {
  const h = await getHaptics();
  h?.notification({ type: 'error' }).catch(() => {});
}
