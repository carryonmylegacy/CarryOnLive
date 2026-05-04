/**
 * CarryOn — Scroll Restoration Preference & Hook
 * ============================================================================
 * Optional UX feature: when the user toggles "Remember scroll position" ON
 * in Settings → Preferences, the platform saves the window scroll offset
 * for every distinct pathname they visit and restores it on return.
 *
 * Storage choices:
 *   - The pref itself     → `localStorage[carryon_remember_scroll]` so it
 *     persists across PWA cold-launches AND offline (no server round-trip
 *     required to read or write).
 *   - The scroll offsets  → `localStorage[carryon_scroll_positions]` as a
 *     JSON map of `{ "/path": offsetY }`. Capped at 60 entries (FIFO eviction)
 *     so the storage budget can't grow unbounded as the user navigates.
 *
 * Both reads/writes are wrapped in try/catch — Safari Private mode throws
 * on quota writes; the feature degrades gracefully to "no-op" rather than
 * crashing the page.
 *
 * The actual restoration is wired in `<ScrollRestorationProvider />` which
 * mounts inside the routed area and watches `useLocation().pathname`. On
 * mount or pathname change it restores the saved offset (if pref is ON);
 * on scroll (debounced) it saves the current offset keyed by the live
 * pathname.
 *
 * IMPORTANT — Hash routes / in-page anchors take precedence: if the URL
 * has a non-empty hash, we let the browser's native anchor jump win and
 * skip restoration for that navigation.
 */

import { useEffect, useState, useCallback, useRef } from 'react';

const PREF_KEY = 'carryon_remember_scroll';
const POSITIONS_KEY = 'carryon_scroll_positions';
const PREF_EVENT = 'carryon:scroll-pref:change';
const MAX_ENTRIES = 60;
const SAVE_DEBOUNCE_MS = 180;

// ── Pref helpers ────────────────────────────────────────────────

export function isScrollRestorationEnabled() {
  try { return localStorage.getItem(PREF_KEY) === '1'; }
  catch { return false; }
}

export function setScrollRestorationEnabled(on) {
  try {
    if (on) localStorage.setItem(PREF_KEY, '1');
    else localStorage.removeItem(PREF_KEY);
  } catch { /* private mode / quota — degrade silently */ }
  try { window.dispatchEvent(new CustomEvent(PREF_EVENT)); } catch { /* SSR */ }
  // When the user turns the feature OFF, drop any saved positions so
  // re-enabling later starts with a clean slate.
  if (!on) {
    try { localStorage.removeItem(POSITIONS_KEY); } catch { /* ignore */ }
  }
}

export function useScrollRestorationPref() {
  const [enabled, setEnabled] = useState(() => isScrollRestorationEnabled());
  useEffect(() => {
    const refresh = () => setEnabled(isScrollRestorationEnabled());
    window.addEventListener(PREF_EVENT, refresh);
    const onStorage = (e) => { if (e.key === PREF_KEY) refresh(); };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PREF_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return [enabled, setScrollRestorationEnabled];
}

// ── Position helpers ────────────────────────────────────────────

function readPositions() {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writePositions(map) {
  try {
    // Cap at MAX_ENTRIES — drop the oldest when over.
    const keys = Object.keys(map);
    if (keys.length > MAX_ENTRIES) {
      const trimmed = {};
      // Re-insert the most-recent MAX_ENTRIES keys (insertion order
      // is preserved in V8, so callers should always re-set the key
      // to mark it as recent).
      for (const k of keys.slice(keys.length - MAX_ENTRIES)) trimmed[k] = map[k];
      map = trimmed;
    }
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(map));
  } catch { /* quota / private mode — degrade silently */ }
}

export function clearAllSavedScrollPositions() {
  try { localStorage.removeItem(POSITIONS_KEY); } catch { /* ignore */ }
}

/** Returns the active scroll container element for the current view.
 * On the benefactor/beneficiary DashboardLayout the page content
 * scrolls inside an OverlayScrollbars viewport — `window.scrollY`
 * stays at 0 and reading/writing it is a no-op. On marketing routes
 * (no DashboardLayout) the document itself scrolls. We pick whichever
 * exists at the time of the call. */
function getScrollHost() {
  if (typeof document === 'undefined') return null;
  const viewport = document.querySelector('.main-content [data-overlayscrollbars-viewport]');
  return viewport || null; // null => caller should fall back to window
}
function readY(host) {
  if (host) return host.scrollTop || 0;
  return typeof window !== 'undefined' ? window.scrollY || 0 : 0;
}
function writeY(host, y) {
  if (host) { host.scrollTo({ top: y, behavior: 'auto' }); return; }
  if (typeof window !== 'undefined') window.scrollTo(0, y);
}

/**
 * Returns a stable `saveCurrent(pathname)` and `restore(pathname)`
 * pair that the provider component drives off route changes and
 * scroll events. Both are no-ops when the user pref is OFF.
 */
export function useScrollRestoration() {
  const enabled = useScrollRestorationPref()[0];
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const saveCurrent = useCallback((pathname) => {
    if (!enabledRef.current || !pathname) return;
    const host = getScrollHost();
    const y = readY(host);
    const positions = readPositions();
    // Re-set the key so insertion order moves it to the most-recent end
    // (the cap-eviction logic above relies on this).
    delete positions[pathname];
    positions[pathname] = y;
    writePositions(positions);
  }, []);

  const restore = useCallback((pathname, hash) => {
    if (!enabledRef.current || !pathname) return;
    if (hash && hash !== '#') return; // anchor jump wins
    const positions = readPositions();
    const y = positions[pathname];
    if (typeof y !== 'number') {
      // Default to top of page on first visit, matching the
      // browser's native fresh-route behaviour.
      writeY(getScrollHost(), 0);
      return;
    }
    // Two RAFs: first lets React commit, second lets the browser lay
    // out the new content so the target offset exists. Without this
    // the restoration races route content render and lands at 0.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      writeY(getScrollHost(), y);
    }));
  }, []);

  return { enabled, saveCurrent, restore, debounceMs: SAVE_DEBOUNCE_MS };
}
