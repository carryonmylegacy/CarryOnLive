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
  if (!isOfflineEnabled()) throw new Error('offline disabled');
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
  return id;
}

export async function listPendingUploads() {
  if (!isOfflineEnabled()) return [];
  try {
    const rows = await getDB().pendingUpload.orderBy('created_at').toArray();
    return rows.map(({ blob, ...rest }) => ({ ...rest, has_blob: !!blob }));
  } catch { return []; }
}

export async function getPendingUpload(id) {
  return getDB().pendingUpload.get(id);
}

export async function updatePendingUpload(id, patch) {
  return getDB().pendingUpload.update(id, { ...patch, updated_at: Date.now() });
}

export async function deletePendingUpload(id) {
  return getDB().pendingUpload.delete(id);
}

export async function countPendingUploads() {
  if (!isOfflineEnabled()) return 0;
  try { return await getDB().pendingUpload.where('status').notEqual('complete').count(); }
  catch { return 0; }
}
