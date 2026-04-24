/**
 * CarryOn — Sync Outbox (Phase 2)
 * ============================================================================
 * Reliable, ordered queue of "I wanted to write this to the server but
 * I was offline (or the server was down)". Persists to IndexedDB so a
 * queued write survives app restarts, tab closes, and device reboots.
 *
 * Schema (defined in db.js):
 *   outbox: ++id, entity_type, entity_id, status, created_at
 * Each row:
 *   {
 *     id:           auto-increment order key (replay proceeds in this order)
 *     entity_type:  'beneficiary' | 'estate' | 'message' | ...
 *     entity_id:    server-assigned id of the target row (or temp id for creates)
 *     method:       'POST' | 'PUT' | 'DELETE'
 *     url:          API path after API_URL, e.g. '/beneficiaries/abc-123'
 *     body:         request body (object, not JSON string — stored as-is)
 *     status:       'pending' | 'inflight' | 'done' | 'failed'
 *     retry_count:  incremented on each failed attempt
 *     last_error:   last error message (for debugging)
 *     created_at:   ms since epoch
 *   }
 *
 * Gated on the offline feature flag. When flag is 'off', enqueue is a
 * silent no-op and drain() returns immediately. Shadow mode logs but
 * does NOT actually replay (so we can observe without effect). On mode
 * performs full enqueue + drain semantics.
 *
 * Drain policy:
 *   - Items replayed strictly in order of `id` (insertion order).
 *   - A failed item stops the drain for that session — we don't skip
 *     ahead because subsequent items may depend on this one succeeding.
 *   - Retries: up to 3 per item per online transition. After 3 failures,
 *     item is marked `failed` and surfaced to the debug console.
 */

import axios from 'axios';
import { getDB } from './db';
import { isOfflineEnabled, getOfflineMode } from './featureFlag';
import { API_URL } from '../config';

const MAX_RETRIES = 3;

/** Add a new job to the outbox. Returns the new row's id, or null if gated off. */
export async function enqueue({ entity_type, entity_id, method, url, body }) {
  if (!isOfflineEnabled()) return null;
  const db = getDB();
  const row = {
    entity_type,
    entity_id,
    method,
    url,
    body: body || null,
    status: 'pending',
    retry_count: 0,
    last_error: null,
    created_at: Date.now(),
  };
  const id = await db.outbox.add(row);
  console.log(`[offline] enqueue #${id} ${method} ${url}`);
  try { window.dispatchEvent(new CustomEvent('carryon:outbox:enqueued', { detail: { id, entity_type } })); } catch { /* SSR */ }
  return id;
}

/** Current count of jobs waiting to be sent. */
export async function pendingCount() {
  try { return await getDB().outbox.where('status').equals('pending').count(); }
  catch { return 0; }
}

/**
 * Attempt to replay all pending jobs to the server, in insertion order.
 * Called automatically on the 'online' event and at app startup. Safe to
 * call concurrently — a lock prevents parallel drains.
 */
let _drainLock = null;
export async function drain() {
  if (!isOfflineEnabled()) return { sent: 0, failed: 0, skipped: true };
  if (getOfflineMode() === 'shadow') {
    // Shadow mode: we enqueued, but the authoritative write already
    // happened via the old UI path — so replaying would duplicate.
    return { sent: 0, failed: 0, skipped: true };
  }
  if (_drainLock) return _drainLock;
  _drainLock = (async () => {
    const db = getDB();
    const token = localStorage.getItem('carryon_token');
    if (!token) return { sent: 0, failed: 0, skipped: true };
    const headers = { Authorization: `Bearer ${token}` };
    let sent = 0;
    let failed = 0;
    // Process one at a time, in order.
    while (true) {
      const next = await db.outbox.where('status').equals('pending').first();
      if (!next) break;
      // Mark inflight so a concurrent drain on another tab doesn't duplicate.
      await db.outbox.update(next.id, { status: 'inflight' });
      try {
        const url = next.url.startsWith('http') ? next.url : `${API_URL}${next.url}`;
        const response = await axios.request({ method: next.method, url, data: next.body, headers });

        // Phase 2.1 — Temp-ID reconciliation for offline creates.
        // When a POST succeeds for an entity we inserted with a
        // client-generated `local-*` id, we must (a) replace the temp
        // row in the local mirror with the server's canonical row, and
        // (b) rewrite any later queued jobs that referenced the temp id
        // so subsequent drains use the real server id.
        if (next.method === 'POST' && typeof next.entity_id === 'string' && next.entity_id.startsWith('local-')) {
          const serverRow = response?.data;
          const realId = serverRow?.id;
          if (realId && realId !== next.entity_id) {
            if (next.entity_type === 'beneficiary') {
              try {
                const repo = await import('./repos/beneficiariesRepo');
                await repo.replaceLocalBeneficiaryId(next.entity_id, serverRow);
              } catch { /* non-fatal */ }
            } else if (next.entity_type === 'chat_message') {
              try {
                const repo = await import('./repos/chatRepo');
                await repo.replaceLocalMessageId(next.entity_id, serverRow);
              } catch { /* non-fatal */ }
            }
            // Rewrite any later outbox rows that targeted the temp id.
            try {
              const later = await db.outbox
                .where('entity_id').equals(next.entity_id).toArray();
              for (const row of later) {
                if (row.id === next.id) continue;
                const newUrl = row.url && row.url.includes(next.entity_id)
                  ? row.url.replace(next.entity_id, realId) : row.url;
                await db.outbox.update(row.id, { entity_id: realId, url: newUrl });
              }
            } catch { /* non-fatal */ }
          }
        }

        // Phase 3 — Refresh the local mirror with the server's authoritative
        // response for profile PUTs so next cold boot sees post-replay
        // state. Best-effort; never blocks the drain on failure.
        if (next.entity_type === 'profile' && next.method === 'PUT') {
          try {
            const repo = await import('./repos/profileRepo');
            const merged = response?.data || next.body || null;
            if (merged) await repo.upsertLocalProfile(merged);
          } catch { /* non-fatal */ }
        }

        await db.outbox.update(next.id, { status: 'done' });
        sent++;
        console.log(`[offline] drain ok #${next.id} ${next.method} ${next.url}`);
      } catch (err) {
        const retries = (next.retry_count || 0) + 1;
        const msg = err?.response?.data?.detail || err?.message || 'unknown';
        const status = err?.response?.status;
        // Phase 8 — Conflict detection. A 409 Conflict or 412 Precondition
        // Failed from the server means "someone else changed this row
        // first". Retrying would just keep losing; we stash the conflict
        // onto the outbox row so the ConflictResolver UI can ask the user
        // what to do. Broadcast so the modal can pop immediately.
        if (status === 409 || status === 412) {
          const serverRow = err?.response?.data?.server || err?.response?.data?.current || null;
          await db.outbox.update(next.id, {
            status: 'conflict',
            retry_count: retries,
            last_error: msg,
            server_row: serverRow,
            conflict_status: status,
          });
          try {
            window.dispatchEvent(new CustomEvent('carryon:outbox:conflict', {
              detail: { id: next.id, entity_type: next.entity_type },
            }));
          } catch {}
          console.warn(`[offline] drain CONFLICT #${next.id} (${status}): ${msg}`);
          break;
        }
        if (retries >= MAX_RETRIES) {
          await db.outbox.update(next.id, { status: 'failed', retry_count: retries, last_error: msg });
          console.warn(`[offline] drain FAILED (max retries) #${next.id}: ${msg}`);
          failed++;
        } else {
          await db.outbox.update(next.id, { status: 'pending', retry_count: retries, last_error: msg });
          console.warn(`[offline] drain retry ${retries}/${MAX_RETRIES} #${next.id}: ${msg}`);
        }
        // Stop the drain on first failure so ordering is preserved.
        break;
      }
    }
    // Garbage-collect completed rows so the outbox stays small.
    try { await db.outbox.where('status').equals('done').delete(); } catch {}
    // Broadcast so pages that display queued entities can refetch and
    // swap their optimistic `_local_pending` rows for the server-authoritative
    // data. Best-effort — never blocks the drain on failure.
    if (sent > 0) {
      try {
        window.dispatchEvent(new CustomEvent('carryon:outbox:drained', { detail: { sent, failed } }));
      } catch {}
    }
    return { sent, failed, skipped: false };
  })();
  try { return await _drainLock; }
  finally { _drainLock = null; }
}

/** Debug helper: snapshot of the outbox. */
export async function snapshot() {
  try {
    const db = getDB();
    const all = await db.outbox.orderBy('id').toArray();
    return all.map(({ body, ...rest }) => rest); // hide bodies in logs
  } catch { return []; }
}

/** List every outbox row that isn't completed yet (pending, inflight,
 *  failed, conflict). Sorted newest-first. Used by the platform-wide
 *  PendingSyncPanel to render the per-item list. */
export async function listPending() {
  if (!isOfflineEnabled()) return [];
  try {
    const db = getDB();
    const all = await db.outbox.orderBy('id').reverse().toArray();
    return all
      .filter((r) => ['pending', 'inflight', 'failed', 'conflict'].includes(r.status))
      .map(({ body, ...rest }) => rest);
  } catch { return []; }
}

/** Re-queue a failed or inflight outbox row for the next drain. */
export async function retryRow(id) {
  if (!isOfflineEnabled() || !id) return;
  try {
    const db = getDB();
    await db.outbox.update(id, {
      status: 'pending',
      retry_count: 0,
      last_error: null,
    });
    drain().catch(() => {});
  } catch (err) {
    console.warn('[offline] retryRow failed:', err);
  }
}

/** Permanently remove an outbox row (user chose to cancel the write). */
export async function removeRow(id) {
  if (!isOfflineEnabled() || !id) return;
  try {
    await getDB().outbox.delete(id);
    try { window.dispatchEvent(new CustomEvent('carryon:outbox:drained-one', { detail: { id } })); } catch { /* SSR */ }
  } catch (err) {
    console.warn('[offline] removeRow failed:', err);
  }
}

// ── Phase 8 — Conflict resolution ───────────────────────────────────────────

/** List every outbox row currently in the `conflict` state. */
export async function listConflicts() {
  if (!isOfflineEnabled()) return [];
  try {
    const db = getDB();
    return await db.outbox.where('status').equals('conflict').toArray();
  } catch { return []; }
}

/**
 * Resolve a conflict with the user's chosen strategy.
 *   'mine'   — re-enqueue the local write, overwriting the server's state.
 *   'theirs' — discard the local write and accept the server's state.
 */
export async function resolveConflict(id, choice) {
  if (!isOfflineEnabled() || !id) return;
  try {
    const db = getDB();
    const row = await db.outbox.get(id);
    if (!row) return;
    if (choice === 'mine') {
      // Clear conflict state and re-queue for the next drain. The server's
      // anti-conflict token (if we add one later) can be stamped here.
      await db.outbox.update(id, {
        status: 'pending',
        retry_count: 0,
        last_error: null,
        server_row: null,
        conflict_status: null,
      });
      drain().catch(() => {});
    } else if (choice === 'theirs') {
      // Drop the local write; sync the server's version into the local
      // mirror so the UI reflects reality.
      const server = row.server_row;
      if (server && row.entity_type === 'beneficiary' && server.id) {
        try {
          const repo = await import('./repos/beneficiariesRepo');
          await repo.updateLocalBeneficiary(server.id, server);
        } catch {}
      }
      if (server && row.entity_type === 'profile') {
        try {
          const repo = await import('./repos/profileRepo');
          await repo.upsertLocalProfile(server);
        } catch {}
      }
      await db.outbox.delete(id);
    }
  } catch (err) {
    console.warn('[offline] resolveConflict failed:', err);
  }
}
