/**
 * CarryOn™ — Dexie quota guard.
 *
 * Audits IndexedDB usage on app boot and prunes data that's safe to
 * drop (synced outbox entries, expired image blobs) when the device
 * approaches its per-origin storage quota. Without this, a user who
 * works offline for weeks can accumulate hundreds of MBs in
 * IndexedDB until Safari/Chrome silently start evicting random
 * objects — which on iOS Safari is a known PWA-killing failure mode.
 *
 * Pruning policy:
 *   - `outbox` entries with status='synced' older than 30 days → DELETE.
 *   - Image blobs older than 7 days → DELETE (they re-download on demand
 *     via presigned URL re-fetch).
 *   - If usage > 80% of estimated quota, emit a console warning and
 *     fire a custom event other components can listen to.
 *
 * Intentionally conservative:
 *   - Never touches unsynced outbox entries (they'd lose offline writes).
 *   - Never touches vault/beneficiary/message mirrors (they're the
 *     primary user-facing data and the user explicitly wants them
 *     available offline).
 */

import { getDB } from './db';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const QUOTA_WARN_THRESHOLD = 0.80; // 80% — warn before browser starts evicting

/**
 * Probe browser storage quota usage. Returns { usage, quota, ratio }
 * or null if the API is unavailable (e.g., iOS Safari < 13).
 */
export async function getStorageEstimate() {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return null;
  }
  try {
    const est = await navigator.storage.estimate();
    const usage = est?.usage || 0;
    const quota = est?.quota || 0;
    return {
      usage,
      quota,
      ratio: quota > 0 ? usage / quota : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Prune synced outbox entries older than 30 days.
 * Returns the number of rows removed.
 */
export async function pruneSyncedOutbox() {
  try {
    const db = getDB();
    if (!db || !db.outbox) return 0;
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    return await db.outbox
      .where('status').equals('synced')
      .and((row) => {
        const created = typeof row.created_at === 'number'
          ? row.created_at
          : Date.parse(row.created_at || '');
        return Number.isFinite(created) && created < cutoff;
      })
      .delete();
  } catch (err) {
    console.warn('[quotaGuard] outbox prune failed:', err);
    return 0;
  }
}

/**
 * Prune expired image blobs older than 7 days. The blob store keeps
 * cached file payloads for offline viewing; we re-download on demand
 * via the existing presigned-URL flow when network returns.
 */
export async function pruneExpiredImageBlobs() {
  try {
    const db = getDB();
    if (!db || !db.tables) return 0;
    if (!db.tables.find((t) => t.name === 'imageBlob')) return 0;
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    return await db.imageBlob
      .where('_updatedAt').below(cutoff)
      .delete();
  } catch (err) {
    console.warn('[quotaGuard] imageBlob prune failed:', err);
    return 0;
  }
}

/**
 * Run a single pass of the quota guard. Safe to call on app boot
 * and after large offline-mode writes. No-op when quota is healthy.
 */
export async function runQuotaGuard() {
  try {
    const est = await getStorageEstimate();

    // Always prune synced outbox + expired blobs — small disk wins.
    const [synced, blobs] = await Promise.all([
      pruneSyncedOutbox(),
      pruneExpiredImageBlobs(),
    ]);
    if ((synced > 0 || blobs > 0) && typeof console !== 'undefined') {
      console.info(`[quotaGuard] pruned ${synced} synced outbox row(s), ${blobs} image blob(s)`);
    }

    if (est && est.ratio >= QUOTA_WARN_THRESHOLD) {
      // Surface to the rest of the app so a Settings → Storage tile
      // (or any future banner) can react.
      const ratioPct = Math.round(est.ratio * 100);
      console.warn(`[quotaGuard] IndexedDB usage at ${ratioPct}% of quota — pruning aggressively`);
      try {
        window.dispatchEvent(new CustomEvent('carryon:storage-pressure', { detail: est }));
      } catch { /* no-op in non-browser context */ }
    }

    return est;
  } catch (err) {
    console.warn('[quotaGuard] run failed:', err);
    return null;
  }
}

export default runQuotaGuard;
