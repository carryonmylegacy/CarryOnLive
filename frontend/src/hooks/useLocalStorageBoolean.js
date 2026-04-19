/**
 * CarryOn — useLocalStorageBoolean
 * ============================================================================
 * A bulletproof boolean state hook backed by localStorage, using React 19's
 * `useSyncExternalStore` for canonical external-state subscription.
 *
 * Guarantees:
 *   1. The returned value ALWAYS mirrors the current localStorage value.
 *      No stale closures, no "switch shows old state after a remount" bugs.
 *   2. Every component using the same key re-renders in lockstep the instant
 *      one of them writes a new value — via a custom window event we dispatch
 *      on set. The native `storage` event only fires across TABS, not within
 *      the same tab, which is why prior toggles appeared to "not flip" on iOS.
 *   3. Cross-tab sync still works via the native `storage` event (free bonus).
 *
 * Usage:
 *   const [hidden, setHidden] = useLocalStorageBoolean('hide_beta_bug_icon');
 *   <Switch checked={hidden} onCheckedChange={setHidden} />
 *
 * Prior bug this fixes: the "Hide Bug Report Icon" Switch read localStorage
 * directly at render time, so writes never triggered a re-render → switch
 * appeared stuck in the previous state until a full page reload.
 */

import { useSyncExternalStore, useCallback } from 'react';

const EVENT = 'carryon:localstorage-changed';

const subscribe = (key) => (cb) => {
  const onCustom = (e) => { if (!e?.detail?.key || e.detail.key === key) cb(); };
  const onStorage = (e) => { if (e.key === key) cb(); };
  window.addEventListener(EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
};

const getSnapshot = (key) => () => localStorage.getItem(key);
// SSR snapshot — boolean toggles default to false if rendered before hydration.
const getServerSnapshot = () => null;

export function useLocalStorageBoolean(key) {
  const raw = useSyncExternalStore(subscribe(key), getSnapshot(key), getServerSnapshot);
  const value = raw === 'true';

  const setValue = useCallback((next) => {
    const v = typeof next === 'function' ? next(localStorage.getItem(key) === 'true') : !!next;
    localStorage.setItem(key, v ? 'true' : 'false');
    // Broadcast so every other component using the same key re-renders
    // within the same tab. The native 'storage' event only fires for
    // cross-tab writes, so this custom event is required for intra-tab sync.
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value: v } }));
  }, [key]);

  return [value, setValue];
}

export default useLocalStorageBoolean;
