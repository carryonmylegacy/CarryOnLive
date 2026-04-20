/**
 * CarryOn — Offline-first feature flag
 * ============================================================================
 * The SINGLE switch that gates every offline-first code path (Phases 0-8).
 *
 * By design, when this flag is OFF, the offline subsystem is completely
 * inert — no IndexedDB writes, no sync loops, no API interception. The
 * app's behaviour is bit-for-bit identical to what it was before the
 * offline rollout began. This is the "no regression guarantee": every
 * new code path is gated; if something goes wrong we set the flag to
 * 'off' and users immediately resume the proven pre-offline behaviour.
 *
 * Three gate levels are supported so we can ship incrementally:
 *   'off'           — default. No offline code runs.
 *   'shadow'        — new code runs in parallel with the old; writes to
 *                      IndexedDB for verification, but all UI still uses
 *                      the old path. Lets us collect mismatch data
 *                      through Sentry before going live.
 *   'on'            — new code is the source of truth.
 *
 * Persisted in localStorage under `carryon_offline_v1` so it survives
 * reloads. Can be overridden via `?offline=on|off|shadow` URL param for
 * one-off testing without flipping the user's saved preference.
 */

const KEY = 'carryon_offline_v1';
const DEFAULT = 'off';

const VALID = new Set(['off', 'shadow', 'on']);

function readFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search).get('offline');
    return VALID.has(p) ? p : null;
  } catch { return null; }
}

function readFromStorage() {
  try {
    const v = localStorage.getItem(KEY);
    return VALID.has(v) ? v : null;
  } catch { return null; }
}

/** Returns the current mode: 'off' | 'shadow' | 'on'. */
export function getOfflineMode() {
  return readFromUrl() || readFromStorage() || DEFAULT;
}

/** Convenience — most call sites just want to know "is anything on?". */
export function isOfflineEnabled() {
  return getOfflineMode() !== 'off';
}

/** Is the new code path allowed to drive the UI (vs just shadow-write)? */
export function isOfflinePrimary() {
  return getOfflineMode() === 'on';
}

/** Persist a new mode. Returns the mode that was set. */
export function setOfflineMode(mode) {
  if (!VALID.has(mode)) throw new Error(`Invalid offline mode: ${mode}`);
  try {
    localStorage.setItem(KEY, mode);
    // Broadcast so other components using this flag re-render immediately.
    window.dispatchEvent(new CustomEvent('carryon:offline-mode-changed', { detail: { mode } }));
  } catch {}
  return mode;
}

export const OFFLINE_FLAG_KEY = KEY;
