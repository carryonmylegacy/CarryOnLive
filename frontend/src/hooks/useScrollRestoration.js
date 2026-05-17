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
 * Cross-device sync:
 *   The pref AND the positions map are also mirrored to
 *   `/api/user-preferences/scroll-restoration` (PUT/GET) so a user who
 *   scrolls halfway down Beneficiaries on their phone lands at the same
 *   offset when they open Beneficiaries on their laptop later. The server
 *   is the source of truth for cross-device; localStorage is the source
 *   of truth for offline. On reconnect / login the hook fetches the
 *   server copy and merges via "newer-write-wins" (server only sends
 *   what it has, and we replace local entries that exist server-side
 *   while keeping any that are local-only). Server pushes are
 *   debounced 4 s + 1 final push on `pagehide`.
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
import axios from 'axios';

import apiClient from '../utils/apiClient';
const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PREF_KEY = 'carryon_remember_scroll';
const POSITIONS_KEY = 'carryon_scroll_positions';
const PREF_EVENT = 'carryon:scroll-pref:change';
const MAX_ENTRIES = 60;
const SAVE_DEBOUNCE_MS = 180;
const SERVER_PUSH_DEBOUNCE_MS = 4000;

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
  // Mirror to server so the toggle (and cleared positions on OFF)
  // syncs across this user's devices. Fire-and-forget — local is
  // always the source of truth for the current device.
  pushPrefToServer(on, on ? readPositions() : {});
}

// ── Server sync helpers ─────────────────────────────────────────

function authHeaders() {
  try {
    const token = localStorage.getItem('carryon_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

let serverPushTimer = null;
function pushPrefToServer(enabled, positions) {
  // Coalesce rapid changes into one PUT.
  if (serverPushTimer) clearTimeout(serverPushTimer);
  serverPushTimer = setTimeout(() => {
    serverPushTimer = null;
    const headers = authHeaders();
    if (!headers.Authorization) return; // not logged in yet
    apiClient.put(`${API_URL}/user-preferences/scroll-restoration`, {
      enabled,
      positions: enabled ? positions : {},
    }, { headers }).catch(() => { /* best-effort cross-device sync */ });
  }, 50);
}

function pushPositionsToServerDebounced() {
  if (positionsPushTimer) clearTimeout(positionsPushTimer);
  positionsPushTimer = setTimeout(() => {
    positionsPushTimer = null;
    if (!isScrollRestorationEnabled()) return;
    pushPrefToServer(true, readPositions());
  }, SERVER_PUSH_DEBOUNCE_MS);
}
let positionsPushTimer = null;

/** Force a synchronous-feel push of the current positions map. Called
 * on `pagehide` / `visibilitychange:hidden` so iOS PWA suspends still
 * mirror the latest scroll offsets to the server. */
export function flushScrollPositionsToServer() {
  if (positionsPushTimer) { clearTimeout(positionsPushTimer); positionsPushTimer = null; }
  if (!isScrollRestorationEnabled()) return;
  pushPrefToServer(true, readPositions());
}

/**
 * Hydrate local pref + positions from the server once on login or
 * reconnect. Server values are merged via "server has authority for
 * keys it sends; local-only keys remain". The toggle itself is taken
 * verbatim from the server to keep cross-device parity.
 *
 * Idempotent — safe to call repeatedly. Returns the resolved pref so
 * callers (like AuthContext) can chain UI updates if they want.
 */
export async function hydrateScrollRestorationFromServer() {
  const headers = authHeaders();
  if (!headers.Authorization) return null;
  try {
    const res = await apiClient.get(`${API_URL}/user-preferences/scroll-restoration`, { headers });
    const enabled = !!res?.data?.enabled;
    const serverPositions = (res?.data?.positions && typeof res.data.positions === 'object') ? res.data.positions : {};
    // Toggle: server wins.
    try {
      if (enabled) localStorage.setItem(PREF_KEY, '1');
      else localStorage.removeItem(PREF_KEY);
    } catch { /* ignore */ }
    // Positions: union with server-precedence on shared keys.
    if (enabled) {
      const local = readPositions();
      const merged = { ...local, ...serverPositions };
      writePositions(merged);
    } else {
      try { localStorage.removeItem(POSITIONS_KEY); } catch { /* ignore */ }
    }
    try { window.dispatchEvent(new CustomEvent(PREF_EVENT)); } catch { /* SSR */ }
    return enabled;
  } catch { return null; }
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
    // Mirror to server (debounced 4 s) so cross-device sync stays
    // current without flooding the API. Final flush also fires on
    // pagehide via the provider component.
    pushPositionsToServerDebounced();
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
