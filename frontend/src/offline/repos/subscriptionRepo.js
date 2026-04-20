/**
 * CarryOn — Subscription Offline Repository (Phase 3)
 * ============================================================================
 * Mirrors the authenticated user's subscription status into IndexedDB so
 * trial banners, paywall gating, and the Settings subscription card can
 * paint instantly when offline.
 *
 * Read-only from the client's perspective — subscriptions are mutated
 * exclusively via Stripe webhooks on the server. We never enqueue
 * subscription writes to the outbox.
 *
 * Stored as a singleton with `id = 'current'` in the `subscription` table.
 */

import { getDB } from '../db';
import { isOfflineEnabled } from '../featureFlag';

const KEY = 'current';

/** Read the cached subscription status snapshot, or null. */
export async function getLocalSubscription() {
  if (!isOfflineEnabled()) return null;
  try {
    const row = await getDB().subscription.get(KEY);
    if (!row) return null;
    return row.data || null;
  } catch (err) {
    console.warn('[offline] getLocalSubscription failed:', err);
    return null;
  }
}

/** Upsert the server-canonical subscription payload. */
export async function upsertLocalSubscription(data) {
  if (!isOfflineEnabled() || !data) return;
  try {
    await getDB().subscription.put({
      id: KEY,
      data,
      _updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[offline] upsertLocalSubscription failed:', err);
  }
}
