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
 *
 * AT-REST ENCRYPTION (audit 3153523 #4)
 * -------------------------------------
 * The subscription payload (tier, status, Stripe identifiers, trial dates) is
 * force-encrypted into an `__enc` blob regardless of the offline feature flag,
 * so it is NEVER mirrored in plaintext — even for users who never enabled
 * offline mode. FAILS CLOSED: when no key can be derived, the mirror is simply
 * absent (re-fetched from the network when online).
 */

import { getDB } from '../db';
import { sealRecordForce, unsealRecordForce } from '../crypto';

const KEY = 'current';

/** Read the cached subscription status snapshot, or null. */
export async function getLocalSubscription() {
  try {
    const row = await getDB().subscription.get(KEY);
    if (!row) return null;
    // Legacy plaintext mirror (full `data`, no `__enc`) — self-heal/purge, then
    // serve the value this one time.
    if (row.data && !row.__enc) {
      try { await upsertLocalSubscription(row.data); } catch { /* best-effort */ }
      return row.data;
    }
    const unsealed = await unsealRecordForce(row);
    return (unsealed && unsealed.data) || null;
  } catch (err) {
    console.warn('[offline] getLocalSubscription failed:', err);
    return null;
  }
}

/** Upsert the server-canonical subscription payload (force-encrypted). */
export async function upsertLocalSubscription(data) {
  if (!data) return;
  try {
    const sealed = await sealRecordForce({ id: KEY, data, _updatedAt: Date.now() }, ['id']);
    if (!sealed || !sealed.__enc) {
      // FAIL CLOSED — never persist the subscription payload in plaintext.
      try { await getDB().subscription.delete(KEY); } catch { /* ignore */ }
      return;
    }
    await getDB().subscription.put(sealed);
  } catch (err) {
    console.warn('[offline] upsertLocalSubscription failed:', err);
  }
}
