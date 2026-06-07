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
import { sealRecordForce, unsealRecordForce, ensureKeyForOutbox } from './crypto';
import { API_URL } from '../config';

const MAX_RETRIES = 3;

// audit #d0c48d7 P1 — encrypt outbox bodies at rest. Only these query/index
// fields stay plaintext (Dexie indexes them or we filter on them); everything
// else — crucially `body` and `server_row` — is sealed into `__enc`.
const OUTBOX_PLAIN_KEYS = [
  'id', 'entity_type', 'entity_id', 'method', 'url',
  'status', 'retry_count', 'last_error', 'created_at', 'conflict_status',
];

// Secret-like fields a DAV / CFP offline body can carry. Used both to decide
// fail-closed behaviour on enqueue and to redact display surfaces.
const SECRET_BODY_FIELDS = ['password', 'additional_access', 'notes', 'dav_login_password'];

function bodyHasSecret(body) {
  if (!body || typeof body !== 'object') return false;
  return SECRET_BODY_FIELDS.some((f) => f in body && body[f] != null && body[f] !== '');
}

/** Deep copy that masks secret fields wherever they appear. Display-only. */
function redactSecrets(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactSecrets);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_BODY_FIELDS.includes(k) && v != null && v !== '') out[k] = '••••••';
    else if (v && typeof v === 'object') out[k] = redactSecrets(v);
    else out[k] = v;
  }
  return out;
}

/** Display-safe view of a stored row: unseal (so the UI can read it) then
 *  redact secret fields from body + server_row. Never returns raw secrets. */
async function toDisplayRow(row) {
  const unsealed = (row && row.__enc) ? await unsealRecordForce(row) : row;
  if (!unsealed) {
    // Couldn't decrypt (no key) — return a minimal redacted shell.
    const { __enc: _e, body: _b, server_row: _s, ...plain } = row || {};
    return { ...plain, body: undefined, server_row: undefined, _sealed: true };
  }
  const safe = { ...unsealed };
  delete safe.__enc;
  if (safe.body) safe.body = redactSecrets(safe.body);
  if (safe.server_row) safe.server_row = redactSecrets(safe.server_row);
  return safe;
}

// Run the legacy plaintext-row sealing migration at most once per session.
let _sealMigrationDone = false;

/** Opportunistically seal any legacy plaintext rows once a key is available.
 *  Encryption is now UNCONDITIONAL (audit #3be1d2f P2) — no flag gate. */
async function sealExistingPlaintextRows(db) {
  try {
    const key = await ensureKeyForOutbox();
    if (!key) return;
    const all = await db.outbox.toArray();
    for (const r of all) {
      if (r.__enc) continue;
      if (r.body == null && r.server_row == null) continue; // nothing worth sealing
      const sealed = await sealRecordForce(r, OUTBOX_PLAIN_KEYS);
      if (sealed.__enc) await db.outbox.put({ ...sealed, id: r.id });
    }
  } catch (err) {
    console.warn('[offline] outbox seal migration warning:', err);
  }
}

/** Idempotent per-session migration guard, run before any outbox read and at boot. */
async function ensureSealMigration(db) {
  if (_sealMigrationDone) return;
  _sealMigrationDone = true;
  await sealExistingPlaintextRows(db || getDB());
}

/** Public entry point — wired into app boot (index.js) so legacy plaintext rows
 *  are sealed BEFORE any read path runs, not only during a drain. */
export async function migrateOutboxEncryption() {
  try { await ensureSealMigration(getDB()); } catch { /* best-effort */ }
}

/** Add a new job to the outbox. Returns the new row's id, or null if gated off. */
export async function enqueue({ entity_type, entity_id, method, url, body }) {
  // Flag-agnostic if the device is genuinely offline right now: a user
  // who toggles airplane mode without ever opting into "offline mode"
  // still expects their delete/edit to land when they reconnect.
  // Refusing the queue silently was making offline mutations vanish
  // (the user would tap Delete, the toast would say "queued", and on
  // reconnect nothing happened because the row was never written).
  const flagOn = isOfflineEnabled();
  const deviceOffline = (typeof window !== 'undefined' && typeof window.__isDeviceOffline === 'function')
    ? window.__isDeviceOffline()
    : (typeof navigator !== 'undefined' && navigator.onLine === false);
  if (!flagOn && !deviceOffline) return null;
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

  // audit #3be1d2f P2 — seal the body at rest UNCONDITIONALLY (independent of
  // the offline feature flag). Every outbox body is PII (entity writes), and
  // DAV/CFP saves can additionally carry password / additional_access / notes /
  // dav_login_password. As long as a bearer token exists a key is derivable, so
  // the row is encrypted. A body that cannot be sealed is REFUSED — never
  // written plaintext at rest.
  const hasSecret = bodyHasSecret(body);
  let storedRow = row;
  if (body != null) {
    const key = await ensureKeyForOutbox();
    if (key) storedRow = await sealRecordForce(row, OUTBOX_PLAIN_KEYS);
    if (!storedRow.__enc) {
      const e = new Error(hasSecret
        ? 'This change includes sensitive data and can’t be saved offline. Please reconnect to save.'
        : 'This change can’t be securely saved offline right now. Please reconnect to save.');
      e.code = 'OFFLINE_SECRET_FAIL_CLOSED';
      throw e;
    }
  }
  const id = await db.outbox.add(storedRow);
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
  // Flag-agnostic when there's anything to send: matching enqueue's
  // policy. A user who toggled airplane on/off without ever turning on
  // offline mode can still have outbox rows (the new "deviceOffline"
  // path in enqueue), and they need them drained on reconnect.
  if (!isOfflineEnabled()) {
    try {
      const have = await getDB().outbox.where('status').equals('pending').count();
      if (!have) return { sent: 0, failed: 0, skipped: true };
    } catch { return { sent: 0, failed: 0, skipped: true }; }
  }
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
    // audit #3be1d2f P2 — seal any legacy plaintext rows now that a key is
    // available, before we start replaying (idempotent with the boot run).
    await ensureSealMigration(db);
    let sent = 0;
    let failed = 0;
    // Process one at a time, in order.
    while (true) {
      const next = await db.outbox.where('status').equals('pending').first();
      if (!next) break;
      // Mark inflight so a concurrent drain on another tab doesn't duplicate.
      await db.outbox.update(next.id, { status: 'inflight' });
      // audit #d0c48d7 P1 — unseal the encrypted body for replay. If the row is
      // sealed but no key is available (cold boot / logged out), defer it: put
      // it back to pending and stop, so it drains once the key is primed.
      let job = next;
      if (next.__enc) {
        const unsealed = await unsealRecordForce(next);
        if (!unsealed) {
          await db.outbox.update(next.id, { status: 'pending' });
          console.warn(`[offline] drain deferred #${next.id} — no key to unseal`);
          break;
        }
        job = unsealed;
      }
      try {
        const url = next.url.startsWith('http') ? next.url : `${API_URL}${next.url}`;
        const response = await axios.request({ method: next.method, url, data: job.body, headers });

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
            const merged = response?.data || job.body || null;
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
          // audit #3be1d2f P2 — re-seal the whole row so body + server_row stay
          // encrypted at rest (a 409 body still carries the user's PII/secrets).
          const mergedRow = {
            ...job,
            status: 'conflict',
            retry_count: retries,
            last_error: msg,
            server_row: serverRow,
            conflict_status: status,
          };
          const sealedRow = await sealRecordForce(mergedRow, OUTBOX_PLAIN_KEYS);
          await db.outbox.put({ ...sealedRow, id: next.id });
          try {
            window.dispatchEvent(new CustomEvent('carryon:outbox:conflict', {
              detail: { id: next.id, entity_type: next.entity_type },
            }));
          } catch { /* noop */ }
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
    try { await db.outbox.where('status').equals('done').delete(); } catch { /* noop */ }
    // Broadcast so pages that display queued entities can refetch and
    // swap their optimistic `_local_pending` rows for the server-authoritative
    // data. Best-effort — never blocks the drain on failure.
    if (sent > 0) {
      try {
        window.dispatchEvent(new CustomEvent('carryon:outbox:drained', { detail: { sent, failed } }));
      } catch { /* noop */ }
    }
    return { sent, failed, skipped: false };
  })();
  try { return await _drainLock; }
  finally { _drainLock = null; }
}

/** Debug helper: snapshot of the outbox (bodies + ciphertext + server_row hidden). */
export async function snapshot() {
  try {
    const db = getDB();
    const all = await db.outbox.orderBy('id').toArray();
    return all.map(({ body: _body, __enc: _enc, server_row, ...rest }) => ({
      ...rest,
      server_row: server_row ? redactSecrets(server_row) : undefined,
    }));
  } catch { return []; }
}

/** List every outbox row that isn't completed yet (pending, inflight,
 *  failed, conflict). Sorted newest-first. Used by the platform-wide
 *  PendingSyncPanel to render the per-item list. Conflict rows keep
 *  their full `body` + `server_row` so the panel can render the
 *  inline diff; non-conflict rows strip `body` to keep the payload
 *  small.
 *
 *  audit #50f324c P2 — NOT gated on isOfflineEnabled() (matches
 *  pendingUploadsRepo). enqueue() deliberately queues writes when the device
 *  is truly offline even with Offline Mode OFF; those rows must stay visible
 *  and resolvable, otherwise a failed/conflicted write becomes invisible. */
export async function listPending() {
  try {
    const db = getDB();
    const all = await db.outbox.orderBy('id').reverse().toArray();
    const rows = all.filter((r) => ['pending', 'inflight', 'failed', 'conflict'].includes(r.status));
    const out = [];
    for (const r of rows) {
      if (r.status === 'conflict') {
        // Unseal + redact so the diff renders without exposing raw secrets.
        out.push(await toDisplayRow(r));
      } else {
        const { body: _body, __enc: _enc, ...rest } = r;
        out.push(rest);
      }
    }
    return out;
  } catch { return []; }
}

/** Re-queue a failed or inflight outbox row for the next drain.
 *  Flag-agnostic (audit #50f324c P2) — see listPending. */
export async function retryRow(id) {
  if (!id) return;
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

/** Permanently remove an outbox row (user chose to cancel the write).
 *  Flag-agnostic (audit #50f324c P2) — see listPending. */
export async function removeRow(id) {
  if (!id) return;
  try {
    await getDB().outbox.delete(id);
    try { window.dispatchEvent(new CustomEvent('carryon:outbox:drained-one', { detail: { id } })); } catch { /* SSR */ }
  } catch (err) {
    console.warn('[offline] removeRow failed:', err);
  }
}

// ── Phase 8 — Conflict resolution ───────────────────────────────────────────

/** List every outbox row currently in the `conflict` state (unsealed + redacted).
 *  Flag-agnostic (audit #50f324c P2) — see listPending. */
export async function listConflicts() {
  try {
    const db = getDB();
    const rows = await db.outbox.where('status').equals('conflict').toArray();
    return await Promise.all(rows.map(toDisplayRow));
  } catch { return []; }
}

/**
 * Resolve a conflict with the user's chosen strategy.
 *   'mine'   — re-enqueue the local write, overwriting the server's state.
 *   'theirs' — discard the local write and accept the server's state.
 *  Flag-agnostic (audit #50f324c P2) — see listPending.
 */
export async function resolveConflict(id, choice) {
  if (!id) return;
  try {
    const db = getDB();
    const rawRow = await db.outbox.get(id);
    if (!rawRow) return;
    // Unseal so 'theirs' can read the encrypted server_row / entity fields.
    const row = rawRow.__enc ? await unsealRecordForce(rawRow) : rawRow;
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
        } catch { /* noop */ }
      }
      if (server && row.entity_type === 'profile') {
        try {
          const repo = await import('./repos/profileRepo');
          await repo.upsertLocalProfile(server);
        } catch { /* noop */ }
      }
      await db.outbox.delete(id);
    }
  } catch (err) {
    console.warn('[offline] resolveConflict failed:', err);
  }
}
