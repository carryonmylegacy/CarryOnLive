/**
 * CarryOn — Estate Chat Offline Repository (Phase 4)
 * ============================================================================
 * Airplane-mode messaging: mirrors channels, contacts, and messages into
 * IndexedDB so the Estate Chat Tab (ECT) can paint the channel list and
 * the last-viewed conversation instantly on cold boot or on a flight.
 *
 * Queued send:
 *   When the user hits "Send" while offline, we insert the message into
 *   the local `chatMessage` table tagged with `_local_pending: true` and
 *   a `local-*` temp id, then enqueue a `POST /estate-chat/channels/{id}/messages`
 *   job in the outbox. The user sees their message appear in the transcript
 *   immediately with a "sending…" state. When the device reconnects, the
 *   outbox drains and the temp row is swapped for the server's canonical
 *   row via `replaceLocalMessageId`.
 *
 * Shape (see db.js `chatMessage` store):
 *   chatMessage: 'id, channel_id, created_at, _updatedAt, [channel_id+created_at]'
 *
 * Gated on the offline feature flag.
 */

import { getDB } from '../db';
import { isOfflineEnabled } from '../featureFlag';
import { sealRecord, unsealRecord } from '../crypto';

// Indexed / queryable fields on the `chatMessage` store stay plaintext so
// Dexie can still sort/filter them. Everything else (content, attachments,
// reactions, sender_name) goes through the AES-GCM seal when encryption
// is on.
const MSG_PLAIN_FIELDS = ['id', 'channel_id', 'created_at', 'sender_id', 'message_type'];

// ── Channels ────────────────────────────────────────────────────────────────

export async function getLocalChannels() {
  if (!isOfflineEnabled()) return [];
  try {
    const rows = await getDB().chatChannel.toArray();
    return rows.map(({ _updatedAt, ...rest }) => rest);
  } catch (err) {
    console.warn('[offline] getLocalChannels failed:', err);
    return [];
  }
}

export async function upsertLocalChannels(list) {
  if (!isOfflineEnabled() || !Array.isArray(list)) return;
  try {
    const db = getDB();
    const now = Date.now();
    const rows = list.map((c) => ({ ...c, _updatedAt: now }));
    await db.transaction('rw', db.chatChannel, async () => {
      await db.chatChannel.clear();
      if (rows.length) await db.chatChannel.bulkPut(rows);
    });
    await db.syncMeta.put({ entity_type: 'chatChannels', last_synced_at: now });
  } catch (err) {
    console.warn('[offline] upsertLocalChannels failed:', err);
  }
}

// ── Contacts ────────────────────────────────────────────────────────────────

export async function getLocalContacts() {
  if (!isOfflineEnabled()) return [];
  try {
    const rows = await getDB().chatContact.toArray();
    return rows.map(({ _updatedAt, ...rest }) => rest);
  } catch (err) {
    console.warn('[offline] getLocalContacts failed:', err);
    return [];
  }
}

export async function upsertLocalContacts(list) {
  if (!isOfflineEnabled() || !Array.isArray(list)) return;
  try {
    const db = getDB();
    const now = Date.now();
    // `/api/estate-chat/contacts` returns one row per estate keyed by
    // `estate_id` — with no `id` field of its own. Dexie's `chatContact`
    // store uses `id` as the primary key, so we normalize by lifting
    // `estate_id` into `id`. Rows that already carry an `id` (future
    // per-contact shape) pass through unchanged.
    const rows = list
      .map((c) => {
        if (!c) return null;
        if (c.id) return { ...c, _updatedAt: now };
        if (c.estate_id) return { ...c, id: c.estate_id, _updatedAt: now };
        return null;
      })
      .filter(Boolean);
    await db.transaction('rw', db.chatContact, async () => {
      await db.chatContact.clear();
      if (rows.length) await db.chatContact.bulkPut(rows);
    });
  } catch (err) {
    console.warn('[offline] upsertLocalContacts failed:', err);
  }
}

// ── Messages ────────────────────────────────────────────────────────────────

/** Read the cached messages for a channel, ordered by created_at ascending. */
export async function getLocalMessages(channelId) {
  if (!isOfflineEnabled() || !channelId) return [];
  try {
    const db = getDB();
    const rows = await db.chatMessage
      .where('channel_id')
      .equals(channelId)
      .sortBy('created_at');
    const unsealed = [];
    for (const row of rows) {
      const open = await unsealRecord(row);
      if (!open) continue; // encryption on but session key missing — hide the row
      const { _updatedAt, ...rest } = open;
      unsealed.push(rest);
    }
    return unsealed;
  } catch (err) {
    console.warn('[offline] getLocalMessages failed:', err);
    return [];
  }
}

/**
 * Replace the locally-cached message history for a channel with the server's
 * canonical list. We preserve any `_local_pending` rows (queued sends that
 * haven't drained yet) so the user doesn't see their optimistic messages
 * disappear mid-sync.
 */
export async function upsertLocalMessages(channelId, list) {
  if (!isOfflineEnabled() || !channelId || !Array.isArray(list)) return;
  try {
    const db = getDB();
    const now = Date.now();
    const sealedRows = await Promise.all(list.map((m) => sealRecord({
      ...m,
      channel_id: channelId,
      _updatedAt: now,
    }, MSG_PLAIN_FIELDS)));
    await db.transaction('rw', db.chatMessage, async () => {
      // Preserve queued-but-not-yet-sent messages for this channel.
      const pending = await db.chatMessage
        .where('channel_id').equals(channelId)
        .filter((m) => m._local_pending === true)
        .toArray();
      await db.chatMessage.where('channel_id').equals(channelId).delete();
      if (sealedRows.length) await db.chatMessage.bulkPut(sealedRows);
      if (pending.length) await db.chatMessage.bulkPut(pending);
    });
    await db.syncMeta.put({
      entity_type: `chatMessages:${channelId}`,
      last_synced_at: now,
    });
  } catch (err) {
    console.warn('[offline] upsertLocalMessages failed:', err);
  }
}

/**
 * Insert an optimistic message (temp id, `_local_pending: true`) into the
 * local transcript so the user sees their send immediately. Caller should
 * use `generateTempMessageId()` for the id.
 */
export async function insertLocalMessage(channelId, msg) {
  if (!isOfflineEnabled() || !channelId || !msg?.id) return;
  try {
    const sealed = await sealRecord({
      ...msg,
      channel_id: channelId,
      _local_pending: true,
      _updatedAt: Date.now(),
    }, MSG_PLAIN_FIELDS);
    await getDB().chatMessage.put(sealed);
  } catch (err) {
    console.warn('[offline] insertLocalMessage failed:', err);
  }
}

/**
 * After the outbox drains a queued send, swap the temp row for the server's
 * canonical message so the UI now sees a real id (for reactions, edits, etc.).
 */
export async function replaceLocalMessageId(tempId, serverMsg) {
  if (!isOfflineEnabled() || !tempId || !serverMsg?.id) return;
  try {
    const db = getDB();
    await db.transaction('rw', db.chatMessage, async () => {
      const existingRaw = await db.chatMessage.get(tempId);
      const existing = existingRaw ? await unsealRecord(existingRaw) : null;
      const channelId = existing?.channel_id || serverMsg.channel_id;
      await db.chatMessage.delete(tempId);
      const sealed = await sealRecord({
        ...serverMsg,
        channel_id: channelId || serverMsg.channel_id,
        _updatedAt: Date.now(),
      }, MSG_PLAIN_FIELDS);
      await db.chatMessage.put(sealed);
    });
  } catch (err) {
    console.warn('[offline] replaceLocalMessageId failed:', err);
  }
}

/** Generate a client-side temp message id. */
export function generateTempMessageId() {
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local-msg-${rand}`;
}

/** Is this id a client-generated temp message id? */
export function isTempMessageId(id) {
  return typeof id === 'string' && id.startsWith('local-msg-');
}
