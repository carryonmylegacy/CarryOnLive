/**
 * CarryOn — Chunked Resumable Uploader (Tier B Phase 9)
 * ============================================================================
 * Streams a Blob to `/api/uploads/chunked/*` in 10 MB chunks with retry +
 * resume support. Emits progress events for the UI.
 *
 * Usage:
 *   const uploader = new ChunkedUploader({ token, blob, filename, mime_type, kind, metadata, onProgress });
 *   const result = await uploader.run();
 *   // result = { ok, resource | error }
 *
 * Design:
 *   - Chunk size fixed at 10 MB (server cap). Final chunk may be smaller.
 *   - Each chunk carries a `Content-Range: bytes <start>-<end>/<total>` header.
 *   - On network failure: exponential backoff, up to 5 retries per chunk.
 *   - Resume: if an upload_id already exists (e.g. after a reload), we
 *     query /status and skip already-received chunks.
 *   - Aborts gracefully if `abortSignal` fires.
 *
 * Emits on `window`:
 *   'carryon:upload:progress' { detail: { id, bytes_sent, total, pct, filename } }
 */

import axios from 'axios';
import { API_URL } from '../config';

const CHUNK_SIZE = 10 * 1024 * 1024;
const MAX_RETRIES_PER_CHUNK = 5;

function emit(type, detail) {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent(type, { detail })); } catch {}
}

export class ChunkedUploader {
  constructor({ token, blob, filename, mime_type, kind, metadata, pendingId = null, existingUploadId = null, onProgress = null, abortSignal = null }) {
    this.token = token;
    this.blob = blob;
    this.filename = filename;
    this.mime_type = mime_type || blob.type || 'application/octet-stream';
    this.kind = kind;
    this.metadata = metadata || {};
    this.pendingId = pendingId;
    this.uploadId = existingUploadId;
    this.onProgress = onProgress;
    this.abortSignal = abortSignal;
    this.bytesSent = 0;
  }

  _headers(extra = {}) {
    return { Authorization: `Bearer ${this.token}`, ...extra };
  }

  _reportProgress() {
    const pct = this.blob.size ? Math.round((this.bytesSent / this.blob.size) * 100) : 0;
    const detail = {
      id: this.pendingId,
      bytes_sent: this.bytesSent,
      total: this.blob.size,
      pct,
      filename: this.filename,
    };
    emit('carryon:upload:progress', detail);
    if (this.onProgress) { try { this.onProgress(detail); } catch {} }
  }

  async _init() {
    if (this.uploadId) return this.uploadId;
    const res = await axios.post(`${API_URL}/uploads/chunked/init`, {
      filename: this.filename,
      total_bytes: this.blob.size,
      mime_type: this.mime_type,
      kind: this.kind,
    }, { headers: this._headers(), timeout: 60000 });
    this.uploadId = res.data.upload_id;
    return this.uploadId;
  }

  async _fetchReceivedChunks() {
    if (!this.uploadId) return [];
    try {
      const res = await axios.get(`${API_URL}/uploads/chunked/${this.uploadId}/status`, { headers: this._headers(), timeout: 60000 });
      return res.data.chunks_received || [];
    } catch { return []; }
  }

  async _sendChunk(index, received) {
    if (received.includes(index)) {
      // Skip — already on server.
      this.bytesSent = Math.min(this.bytesSent + CHUNK_SIZE, this.blob.size);
      this._reportProgress();
      return;
    }
    const start = index * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, this.blob.size) - 1;
    const slice = this.blob.slice(start, end + 1);
    const chunkBytes = end - start + 1;
    let attempt = 0;
    while (attempt < MAX_RETRIES_PER_CHUNK) {
      if (this.abortSignal?.aborted) throw new Error('aborted');
      try {
        const baseSent = this.bytesSent;
        await axios.put(
          `${API_URL}/uploads/chunked/${this.uploadId}/chunk`,
          slice,
          {
            headers: this._headers({
              'Content-Range': `bytes ${start}-${end}/${this.blob.size}`,
              'Content-Type': 'application/octet-stream',
            }),
            // Five minutes per 10 MB chunk — comfortably handles slow
            // cellular uplinks (a few hundred KB/s). The global 8-second
            // axios default was killing every chunk on poor signal,
            // making the drainer hang at 0% until it gave up.
            timeout: 300000,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            // Surface intra-chunk progress so the UI moves smoothly even
            // for a 10 MB chunk that takes 30+ seconds on cellular.
            onUploadProgress: (evt) => {
              if (!evt) return;
              const loaded = Math.min(evt.loaded || 0, chunkBytes);
              this.bytesSent = Math.min(baseSent + loaded, this.blob.size);
              this._reportProgress();
            },
          }
        );
        this.bytesSent = Math.min(baseSent + chunkBytes, this.blob.size);
        this._reportProgress();
        return;
      } catch (err) {
        attempt++;
        if (attempt >= MAX_RETRIES_PER_CHUNK) throw err;
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s.
        await new Promise(r => setTimeout(r, Math.min(16000, 1000 * (2 ** (attempt - 1)))));
      }
    }
  }

  async _complete() {
    const res = await axios.post(
      `${API_URL}/uploads/chunked/${this.uploadId}/complete`,
      { kind: this.kind, metadata: this.metadata },
      { headers: this._headers(), timeout: 120000 },
    );
    return res.data;
  }

  async run() {
    await this._init();
    const received = await this._fetchReceivedChunks();
    const total = Math.ceil(this.blob.size / CHUNK_SIZE);
    // Account for bytes already received on server.
    this.bytesSent = received.reduce((acc, idx) => acc + Math.min(CHUNK_SIZE, this.blob.size - idx * CHUNK_SIZE), 0);
    this._reportProgress();
    for (let i = 0; i < total; i++) {
      if (this.abortSignal?.aborted) throw new Error('aborted');
      await this._sendChunk(i, received);
    }
    const result = await this._complete();
    return { ok: true, uploadId: this.uploadId, result };
  }
}

/**
 * Drain the pending uploads queue. Called when navigator.onLine flips
 * true. Processes one upload at a time so we don't saturate the uplink
 * or exhaust browser memory on a 50 MB video.
 *
 * IMPORTANT: this is called unconditionally from AuthContext on every
 * login so that queued uploads from a previous "offline=on" session
 * still drain even if the user has since flipped the flag back to off.
 * To preserve the "inert when flag=off" Phase 0 invariant — the
 * carryon-offline IndexedDB must NOT be created just by logging in
 * when the flag has never been turned on — we first probe for the DB
 * without opening it. If it doesn't exist, there's definitionally
 * nothing to drain and we return early without touching Dexie.
 */
async function _offlineDbExists() {
  try {
    if (typeof indexedDB === 'undefined') return false;
    if (typeof indexedDB.databases !== 'function') return true; // Firefox: can't detect, assume yes
    const dbs = await indexedDB.databases();
    return dbs.some((d) => d.name === 'carryon-offline');
  } catch {
    return true; // fail open — opening Dexie on a non-existent DB is cheap
  }
}

export async function drainPendingUploads(token) {
  if (typeof navigator === 'undefined' || !navigator.onLine) return { processed: 0 };
  // Phase 0 invariant: don't instantiate IndexedDB on cold boot when flag=off.
  const { isOfflineEnabled } = await import('./featureFlag');
  if (!isOfflineEnabled() && !(await _offlineDbExists())) return { processed: 0 };
  const { listPendingUploads, getPendingUpload, updatePendingUpload, deletePendingUpload }
    = await import('./pendingUploadsRepo');
  const rows = await listPendingUploads();
  let processed = 0;
  for (const row of rows) {
    if (row.status === 'complete') continue;
    const full = await getPendingUpload(row.id);
    if (!full?.blob) {
      await deletePendingUpload(row.id);
      continue;
    }
    await updatePendingUpload(row.id, { status: 'uploading' });
    try {
      const uploader = new ChunkedUploader({
        token,
        blob: full.blob,
        filename: full.filename,
        mime_type: full.mime_type,
        kind: full.kind,
        metadata: full.metadata,
        pendingId: full.id,
        existingUploadId: full.upload_id,
      });
      await uploader.run();
      await deletePendingUpload(row.id); // success: drop from queue
      processed++;
      emit('carryon:upload:complete', { id: row.id, filename: full.filename, kind: full.kind });
    } catch (err) {
      const retry = (full.retry_count || 0) + 1;
      await updatePendingUpload(row.id, {
        status: retry >= 10 ? 'failed' : 'queued',
        retry_count: retry,
        last_error: err?.message || 'upload failed',
      });
    }
  }
  return { processed };
}
