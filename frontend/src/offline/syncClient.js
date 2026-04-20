/**
 * CarryOn — Sync Client (skeleton)
 * ============================================================================
 * Central orchestrator for the offline-first subsystem. In Phase 0 this is
 * just the shell — no actual syncing happens yet. It:
 *
 *   1. Gates everything on the feature flag (featureFlag.js). When the flag
 *      is 'off', this module is a no-op.
 *   2. Owns the singleton online/offline detection via the `online` event.
 *   3. Will (Phase 2+) run the outbox replay loop.
 *   4. Will (Phase 6) run the initial "sync packet" bootstrap.
 *
 * Explicitly out of scope for Phase 0:
 *   - No reads or writes against real entities yet.
 *   - No server API calls.
 *   - Not wired into AuthContext, Login flow, or any page.
 *
 * Exported API stays stable across phases so consumers can call into it
 * today without needing to change when later phases land.
 */

import { getDB, smokeCheck, purgeLocalData } from './db';
import { isOfflineEnabled, getOfflineMode } from './featureFlag';

const PHASE = 0;

class SyncClient {
  constructor() {
    this.initialized = false;
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this._listeners = [];
  }

  /** Idempotent bootstrap. Safe to call many times. */
  async init() {
    if (this.initialized) return;
    if (!isOfflineEnabled()) return; // flag gate: off = nothing to do
    // Verify we can actually use IndexedDB in this browser.
    try {
      const ok = await smokeCheck();
      if (!ok) throw new Error('IndexedDB smoke check failed');
    } catch (err) {
      console.warn('[offline] Disabling offline mode — IndexedDB unavailable:', err);
      return;
    }
    // Watch for network transitions so later phases can replay the outbox.
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._onOnline);
      window.addEventListener('offline', this._onOffline);
    }
    this.initialized = true;
    console.log(`[offline] Sync client initialized (phase ${PHASE}, mode=${getOfflineMode()})`);
  }

  _onOnline = () => {
    this.online = true;
    // Phase 2+: replay outbox here.
  };

  _onOffline = () => {
    this.online = false;
  };

  /** Called on logout — wipe the per-user local mirror. */
  async clearAll() {
    if (!isOfflineEnabled()) return;
    try {
      await purgeLocalData();
      console.log('[offline] Local data purged');
    } catch (err) {
      console.warn('[offline] Purge failed:', err);
    }
  }

  /** Debug snapshot of current state — used by the offline debug console. */
  async snapshot() {
    const db = getDB();
    const counts = {};
    for (const t of db.tables) {
      try { counts[t.name] = await t.count(); } catch { counts[t.name] = 'err'; }
    }
    return {
      phase: PHASE,
      mode: getOfflineMode(),
      online: this.online,
      initialized: this.initialized,
      counts,
    };
  }
}

// Singleton exported instance.
export const syncClient = new SyncClient();
export default syncClient;
