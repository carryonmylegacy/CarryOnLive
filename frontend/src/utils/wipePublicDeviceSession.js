/**
 * wipePublicDeviceSession — nuke every trace of the user's session from
 * the local device. Used by Public Device Mode (a benefactor-activated
 * estate setting) to make CarryOn safe to use on a borrowed phone, a
 * library terminal, a FEMA trailer kiosk, etc.
 *
 * What gets wiped:
 *   1. The Dexie offline cache (deletes the entire `carryon-offline`
 *      IndexedDB database — chat messages, vault docs, estate metadata,
 *      pinned offline blobs, everything).
 *   2. localStorage in full (auth token, recent emojis, UI prefs, etc.).
 *   3. sessionStorage in full.
 *   4. The service worker's per-user API + image caches (via
 *      `CLEAR_APP_CACHES` postMessage — same channel logout already uses).
 *   5. The in-memory offline encryption key (so the next user can't
 *      decrypt stale rows even if Dexie deletion fails).
 *   6. The server-side session (best-effort POST /auth/logout — fire and
 *      forget; on `pagehide` we may not get a network round-trip).
 *
 * This is intentionally MORE aggressive than the regular logout flow,
 * which preserves the offline cache for re-login on the family's own
 * device.
 */
import axios from 'axios';
import Dexie from 'dexie';
import { API_URL } from '../config';
import { DB_NAME } from '../offline/db';

export async function wipePublicDeviceSession({ token } = {}) {
  // 1. Best-effort server logout. Use `keepalive` so the request survives
  //    a browser-close `pagehide` event. axios doesn't expose `keepalive`
  //    directly, so we fall through to fetch for that one path.
  if (token) {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
        keepalive: true,
      });
    } catch { /* network gone, that's fine — token will expire on its own */ }
  }

  // 2. Dexie. Catch errors — if the DB is mid-transaction, delete may
  //    queue; either way we proceed with the rest of the wipe.
  try { await Dexie.delete(DB_NAME); } catch { /* fall through */ }

  // 3. In-memory offline encryption key.
  try {
    const m = await import('../offline/crypto');
    m.clearSessionKey?.();
  } catch { /* ignore */ }

  // 4. SW caches.
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_APP_CACHES' });
    }
  } catch { /* ignore */ }

  // 5. localStorage + sessionStorage. .clear() is fine here — we WANT
  //    everything gone, including UI prefs, "I've seen the security
  //    intro" flag, etc. The user is on a borrowed device.
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
}

// Synchronous variant for the `pagehide` path, which doesn't await async
// work reliably. Same wipe order, but we don't pretend to await Dexie or
// the server — they happen on a best-effort basis.
export function wipePublicDeviceSessionSync({ token } = {}) {
  if (token) {
    try {
      // sendBeacon is the canonical "send a request from pagehide" API.
      // It's queued by the browser and survives the page going away.
      const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
      navigator.sendBeacon?.(`${API_URL}/auth/logout`, blob);
    } catch { /* ignore */ }
  }
  try { Dexie.delete(DB_NAME); } catch { /* ignore */ }
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_APP_CACHES' });
    }
  } catch { /* ignore */ }
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
}
