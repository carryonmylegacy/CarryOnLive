/**
 * CarryOn — Pending Uploads Repository (Tier B Phase 9)
 * ============================================================================
 * IndexedDB-backed queue of large-file uploads awaiting chunked transfer
 * to the server. Each row holds the Blob + enough metadata to finalize
 * the upload once we reconnect.
 *
 * Shape:
 *   {
 *     id: auto,
 *     kind: 'document' | 'milestone_video' | 'milestone_audio' | 'chat_media',
 *     filename, mime_type, size_bytes,
 *     blob: Blob,                          // the file bytes
 *     metadata: {...},                     // feature-specific payload
 *     upload_id: string | null,            // set after /init
 *     bytes_sent: number,                  // for progress tracking
 *     status: 'queued' | 'uploading' | 'complete' | 'failed',
 *     retry_count: number, last_error, created_at, updated_at,
 *   }
 */

import { getDB } from './db';
import { isOfflineEnabled } from './featureFlag';

export async function addPendingUpload({ kind, filename, mime_type, blob, metadata = {} }) {
  // Allow queueing whenever the offline flag is on OR when the device
  // is CURRENTLY offline. The flag means "the user opted into offline
  // mode and wants stuff persisted in IndexedDB". But if they're
  // actually offline RIGHT NOW with a 5-minute video recording in
  // hand, refusing the queue means losing the recording — the worst
  // possible UX. So treat real-time offline as an automatic override:
  // we MUST accept the upload because there is no other path. The
  // drainer below already runs flag-agnostic for exactly this reason.
  const flagOn = isOfflineEnabled();
  const deviceOffline = (typeof window !== 'undefined' && typeof window.__isDeviceOffline === 'function')
    ? window.__isDeviceOffline()
    : (typeof navigator !== 'undefined' && navigator.onLine === false);
  if (!flagOn && !deviceOffline) throw new Error('offline disabled');
  if (!blob) throw new Error('blob required');
  const db = getDB();
  const now = Date.now();
  const id = await db.pendingUpload.add({
    kind, filename, mime_type,
    size_bytes: blob.size,
    blob, metadata,
    upload_id: null,
    bytes_sent: 0,
    status: 'queued',
    retry_count: 0,
    last_error: null,
    created_at: now,
    updated_at: now,
  });
  try { window.dispatchEvent(new CustomEvent('carryon:pending:changed', { detail: { id, kind } })); } catch { /* SSR */ }
  return id;
}

// NOTE: listPendingUploads / getPendingUpload / countPendingUploads
// intentionally do NOT gate on isOfflineEnabled(). If a user queued
// uploads while the flag was 'on' and then switched it to 'off', we
// still want the drain path to be able to see + complete those pending
// items so the user's recorded media never gets orphaned in IndexedDB.
export async function listPendingUploads() {
  try {
    const rows = await getDB().pendingUpload.orderBy('created_at').toArray();
    return rows.map(({ blob, ...rest }) => ({ ...rest, has_blob: !!blob }));
  } catch { return []; }
}

export async function getPendingUpload(id) {
  const row = await getDB().pendingUpload.get(id);
  if (!row || !row.blob) return row;
  // Materialize the Blob bytes IMMEDIATELY into an ArrayBuffer-backed
  // Blob detached from the IndexedDB transaction. iOS Safari WKWebView
  // (and Firefox to a lesser extent) keeps Blobs read out of IDB tied
  // to their source transaction; once the transaction closes (which
  // happens the instant this function returns), reading the Blob via
  // `arrayBuffer()` / FormData / XHR fails with `InvalidStateError:
  // The object can not be found here.` or sends zero bytes. We've
  // chased this in three forms now (chunked PUT 0% stalls, FormData
  // multipart zero-byte uploads, and the user's most recent
  // "could not read queued recording" error). Materializing once at
  // the read boundary is the only reliable cure.
  try {
    const bytes = await row.blob.arrayBuffer();
    const detached = new Blob([bytes], { type: row.mime_type || row.blob.type || 'application/octet-stream' });
    return { ...row, blob: detached };
  } catch (err) {
    // Surface the failure to the caller so the drainer can mark the
    // row failed instead of silently uploading nothing.
    return { ...row, blob: null, _blob_read_error: err?.message || String(err) };
  }
}

export async function updatePendingUpload(id, patch) {
  return getDB().pendingUpload.update(id, { ...patch, updated_at: Date.now() });
}

export async function deletePendingUpload(id) {
  return getDB().pendingUpload.delete(id);
}

export async function countPendingUploads() {
  try { return await getDB().pendingUpload.where('status').notEqual('complete').count(); }
  catch { return 0; }
}
