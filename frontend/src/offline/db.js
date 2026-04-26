/**
 * CarryOn — Offline-First IndexedDB (Dexie)
 * ============================================================================
 * The local persistent store that mirrors server data. Populated on first
 * login (Phase 6) and kept fresh by per-page read-through caches (Phases
 * 1, 3, 4, 5). Writes go here FIRST (Phase 2) and are queued in the
 * `outbox` table for replay to the server when online.
 *
 * Scope of Phase 0 (this file):
 *   - Dexie database schema definitions only.
 *   - Zero reads/writes from anywhere in the app yet.
 *   - Opening the DB is cheap and idempotent, but the offline feature
 *     flag (see featureFlag.js) still gates ALL access paths. If the
 *     flag is 'off', this DB is never opened at runtime.
 *
 * Why Dexie (vs raw IndexedDB):
 *   - Native IndexedDB API is event-driven and awful to use with modern
 *     async/await code. Dexie is a 20 KB wrapper that gives us promises,
 *     schema migrations, indexes, and compound queries.
 *   - Battle-tested at scale (Linear, OneNote, many others).
 *
 * Naming convention for tables:
 *   - Singular noun matching the server's primary object (e.g. `user`).
 *   - Primary key is always `id` matching the server's canonical id.
 *   - Every table has an `_updatedAt` column (ms since epoch) used by
 *     the sync engine to detect staleness.
 *   - Entities scoped to a specific estate have `estate_id` as an index
 *     so we can query by estate without scanning.
 *
 * Schema version 1 covers the entities the sync packet will include
 * once Phase 6 lands. Adding a table or an index later requires bumping
 * the version number and writing an upgrade function — Dexie handles
 * the rest automatically.
 */

import Dexie from 'dexie';

export const DB_NAME = 'carryon-offline';
export const DB_VERSION = 5;

class CarryOnDB extends Dexie {
  constructor() {
    super(DB_NAME);
    // v2 schema (kept for legacy upgrade path)
    this.version(2).stores({
      user: 'id, email, _updatedAt',
      subscription: 'id, _updatedAt',
      enabledFeatures: 'id, _updatedAt',
      estate: 'id, owner_id, _updatedAt',
      beneficiary: 'id, estate_id, email, _updatedAt',
      dashboardTile: 'id, estate_id, _updatedAt',
      readinessScore: 'estate_id, _updatedAt',
      chatChannel: 'id, estate_id, type, _updatedAt',
      chatContact: 'id, _updatedAt',
      chatMessage: 'id, channel_id, created_at, _updatedAt, [channel_id+created_at]',
      chatFile: 'file_id, channel_id, _updatedAt',
      shareCard: 'id, _updatedAt',
      voicesQuote: 'id, _updatedAt',
      vaultItem: 'id, estate_id, category, _updatedAt',
      notificationPref: 'id, _updatedAt',
      outbox: '++id, entity_type, entity_id, status, created_at',
      syncMeta: 'entity_type, last_synced_at',
      pendingUpload: '++id, kind, status, created_at',
    });
    // v3 — adds `milestoneMessage` for MM offline read-through.
    this.version(DB_VERSION).stores({
      // ── Core user & session ──────────────────────────────────────────
      user: 'id, email, _updatedAt',
      subscription: 'id, _updatedAt',  // singleton, id='current'
      enabledFeatures: 'id, _updatedAt', // singleton, id='current'

      // ── Estates & members ────────────────────────────────────────────
      estate: 'id, owner_id, _updatedAt',
      beneficiary: 'id, estate_id, email, _updatedAt',

      // ── Dashboard ────────────────────────────────────────────────────
      dashboardTile: 'id, estate_id, _updatedAt',
      readinessScore: 'estate_id, _updatedAt', // singleton per estate

      // ── Chat ─────────────────────────────────────────────────────────
      // Messages use a compound key so we can efficiently query by channel.
      chatChannel: 'id, estate_id, type, _updatedAt',
      chatContact: 'id, _updatedAt',
      chatMessage: 'id, channel_id, created_at, _updatedAt, [channel_id+created_at]',
      chatFile: 'file_id, channel_id, _updatedAt',

      // ── Share Cards / Voices ─────────────────────────────────────────
      shareCard: 'id, _updatedAt',
      voicesQuote: 'id, _updatedAt',

      // ── Vault ────────────────────────────────────────────────────────
      vaultItem: 'id, estate_id, category, _updatedAt',

      // ── Notifications ────────────────────────────────────────────────
      notificationPref: 'id, _updatedAt',  // singleton id='current'

      // ── Sync / Outbox ────────────────────────────────────────────────
      // Outbox: local writes that need to be replayed to the server.
      // Auto-incrementing id so ordering is preserved.
      outbox: '++id, entity_type, entity_id, status, created_at',
      // syncMeta: per-entity-type last-sync timestamps so incremental
      // fetches know what's changed.
      syncMeta: 'entity_type, last_synced_at',

      // ── Milestone Messages (MM) ──────────────────────────────────────
      // Per-estate MM list cached for offline paint; written by page
      // read-through + warm-up.
      milestoneMessage: 'id, estate_id, created_at, _updatedAt, [estate_id+created_at]',

      // ── Pending Uploads (Tier B / Phase 9) ───────────────────────────
      // Large blobs awaiting chunked upload. `blob` is a Blob object;
      // Dexie serializes it efficiently in IndexedDB. `kind` mirrors
      // the server's upload finalizer: 'document' | 'milestone_video' |
      // 'milestone_audio' | 'chat_media'.
      pendingUpload: '++id, kind, status, created_at',

      // ── Image Blob Cache (v4) ────────────────────────────────────────
      // Stable-key blob storage for cross-origin photos (S3 presigned
      // URLs change per session because of expiring signatures, so a
      // simple URL-keyed SW cache misses each time). The OfflineImage
      // component looks up by `cache_key` (e.g. `beneficiary:abc:photo`)
      // not by URL, so the same beneficiary photo survives URL rotation.
      // Stores up to ~5MB per row; Dexie/IndexedDB handles that fine.
      imageBlob: 'cache_key, fetched_at, kind',

      // ── Pinned Documents (v5 — Phase 9a) ─────────────────────────────
      // User-explicit "pin this document for offline access" — separate
      // from the imageBlob row used by avatars because (a) doc blobs
      // can be large (PDFs/images, often 1–10MB) and (b) we want to
      // persist a server-side flag so the warmup re-primes them on
      // every fresh device. The blob lives here; the server sets
      // `documents.pinned_offline=true` in Mongo. cache_key is always
      // `doc:<doc_id>`.
      pinnedDoc: 'cache_key, doc_id, fetched_at, size_bytes',
    });
  }
}

// Singleton instance — lazily constructed so importing this module is
// free when the offline flag is off.
let _db = null;

/**
 * Get the singleton Dexie database handle. Calling this opens the IndexedDB
 * connection (a cheap async operation). Safe to call many times.
 */
export function getDB() {
  if (!_db) _db = new CarryOnDB();
  return _db;
}

/**
 * Open the DB and verify it's writable. Used by the Phase 0 smoke check
 * to confirm the foundation works on a given browser.
 */
export async function smokeCheck() {
  const db = getDB();
  const testKey = '__carryon_smoke__';
  await db.syncMeta.put({ entity_type: testKey, last_synced_at: Date.now() });
  const got = await db.syncMeta.get(testKey);
  await db.syncMeta.delete(testKey);
  return !!got;
}

/**
 * Wipe every table. Called on logout so a different user on the same
 * device doesn't inherit the previous user's local mirror. Safe to call
 * even when the DB was never populated.
 */
export async function purgeLocalData() {
  const db = getDB();
  // Collect table names from the schema so we don't drift if we add tables later.
  const tables = db.tables.map((t) => t.name);
  await db.transaction('rw', tables, async () => {
    for (const t of tables) {
      try { await db.table(t).clear(); } catch {}
    }
  });
}
