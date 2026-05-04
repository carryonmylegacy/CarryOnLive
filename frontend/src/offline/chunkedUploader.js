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

// Module-level lock so concurrent triggers (login + online event firing
// within the same second) don't double-drain the same row and flood the
// server with duplicate chunk PUTs.
let _drainInFlight = false;

// Files at or below this size bypass the chunked pipeline entirely and
// use the legacy two-step direct upload (POST /messages + POST
// /messages/{id}/upload-video). The legacy path is the same code path
// that handles every online milestone create on the platform — it's
// proven, FormData-based (which iOS WKWebView handles reliably), and
// avoids axios.put-with-Blob behaviours that have surfaced as 0%-stall
// regressions in the field. Anything bigger still goes through chunked
// because a 75 MB single POST is brittle on cellular.
const LEGACY_FALLBACK_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Direct (non-chunked) upload for a queued milestone using the legacy
 * `POST /messages` + `POST /messages/{id}/upload-video|attachment` path.
 * Returns true on success, false when the row isn't a milestone (caller
 * should fall through to chunked). Throws on hard failure.
 */
async function _uploadMilestoneViaLegacy({ token, full, onProgress }) {
  const isVideo = full.kind === 'milestone_video';
  const isAudio = full.kind === 'milestone_audio';
  if (!isVideo && !isAudio) return false;
  const create = full?.metadata?.message_create;
  if (!create) return false; // not the offline-create-and-attach shape

  const headers = { Authorization: `Bearer ${token}` };
  const total = full.size_bytes || full.blob?.size || 0;

  // Voice messages: backend has no separate upload endpoint. The legacy
  // online path POSTs voice_data inline as base64 in /messages itself.
  // Replicate that here so audio drains in a single round-trip.
  let voiceDataB64 = null;
  if (isAudio && full.blob) {
    voiceDataB64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try { resolve(String(reader.result).split(',')[1] || null); }
        catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error('blob read failed'));
      reader.readAsDataURL(full.blob);
    });
  }

  // Step 1: create the Message row. For video, video bytes follow in
  // step 2; for voice, the bytes ride inline as base64 here.
  const createRes = await axios.post(`${API_URL}/messages`, {
    estate_id: create.estate_id,
    title: create.title || 'Milestone Message',
    content: create.content || '',
    message_type: create.message_type || (isVideo ? 'video' : 'voice'),
    video_data: null,
    video_thumbnail: create.video_thumbnail || null,
    voice_data: voiceDataB64,
    recipients: create.recipients || [],
    trigger_type: create.trigger_type || 'immediate',
    trigger_value: create.trigger_value || null,
    trigger_age: create.trigger_age || null,
    trigger_date: create.trigger_date || null,
    custom_event_label: create.custom_event_label || null,
  }, { headers, timeout: 60000 });
  const messageId = createRes?.data?.id;
  if (!messageId) throw new Error('legacy create returned no message id');

  // Voice upload completes with the create POST.
  if (isAudio) {
    try { onProgress && onProgress({ loaded: total, total, pct: 100 }); } catch { /* ignore */ }
    return true;
  }

  // Step 2 (video only): stream the media via FormData / multipart. iOS
  // WKWebView handles FormData uploads reliably (this is the same code
  // online milestones run through every day). The Blob has already
  // been detached from the IDB transaction in `getPendingUpload`, so
  // we can hand it straight to FormData here.
  const formData = new FormData();
  formData.append('video', full.blob, full.filename || 'video.webm');
  await axios.post(`${API_URL}/messages/${messageId}/upload-video`, formData, {
    headers: { ...headers, 'Content-Type': 'multipart/form-data' },
    timeout: 600000, // 10 min for very slow uplinks
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    onUploadProgress: (evt) => {
      if (!evt) return;
      const loaded = Math.min(evt.loaded || 0, total || evt.total || 0);
      const denom = total || evt.total || 0;
      const pct = denom ? Math.round((loaded / denom) * 100) : 0;
      try { onProgress && onProgress({ loaded, total: denom, pct }); } catch { /* ignore */ }
    },
  });
  return true;
}

export async function drainPendingUploads(token, opts = {}) {
  const { forceRetry = false } = opts;
  if (typeof navigator === 'undefined' || !navigator.onLine) return { processed: 0 };
  if (_drainInFlight && !forceRetry) return { processed: 0, skipped: 'already_running' };
  // Phase 0 invariant: don't instantiate IndexedDB on cold boot when flag=off.
  const { isOfflineEnabled } = await import('./featureFlag');
  if (!isOfflineEnabled() && !(await _offlineDbExists())) return { processed: 0 };
  const { listPendingUploads, getPendingUpload, updatePendingUpload, deletePendingUpload }
    = await import('./pendingUploadsRepo');
  // forceRetry: user tapped "Retry" on the stalled-pill. The previous
  // drain attempt may still be hung in a never-resolving axios PUT —
  // we drop the lock, mark any 'uploading' rows back to 'queued' so
  // they're picked up again, and proceed.
  if (forceRetry) {
    _drainInFlight = false;
    try {
      const stuck = await listPendingUploads();
      for (const r of stuck) {
        if (r.status === 'uploading') {
          await updatePendingUpload(r.id, { status: 'queued' }).catch(() => {});
        }
      }
    } catch { /* ignore */ }
  }
  _drainInFlight = true;
  let processed = 0;
  try {
    const rows = await listPendingUploads();
    for (const row of rows) {
      if (row.status === 'complete') continue;
      const full = await getPendingUpload(row.id);
      if (!full?.blob) {
        // Either the row's blob was lost OR the IDB read failed (iOS
        // Safari "object can not be found" — see materialization in
        // getPendingUpload). Either way, the bytes are unrecoverable.
        const errMsg = full?._blob_read_error
          ? `recording unreadable: ${full._blob_read_error}`
          : 'recording missing';
        emit('carryon:upload:failed', {
          id: row.id,
          filename: full?.filename,
          kind: full?.kind,
          error: errMsg,
          retry_count: (full?.retry_count || 0) + 1,
        });
        await updatePendingUpload(row.id, {
          status: 'failed',
          retry_count: (full?.retry_count || 0) + 1,
          last_error: errMsg,
        }).catch(() => {});
        // We do NOT delete the row here — leaving it lets the user see
        // it in any future "Pending sync" diagnostic, and we don't
        // strand them silently.
        continue;
      }
      await updatePendingUpload(row.id, { status: 'uploading', last_error: null });
      emit('carryon:upload:start', { id: row.id, filename: full.filename, kind: full.kind, total: full.size_bytes });
      try {
        // Prefer the legacy direct-upload path for small milestone
        // media — it uses the same online-milestone code path that
        // handles every day-to-day upload on the platform, and avoids
        // a class of iOS-WKWebView Blob/PUT regressions that left the
        // chunked uploader stalled at 0%.
        let usedLegacy = false;
        const sizeOK = (full.size_bytes || full.blob?.size || 0) <= LEGACY_FALLBACK_MAX_BYTES;
        const isMilestone = full.kind === 'milestone_video' || full.kind === 'milestone_audio';
        if (isMilestone && sizeOK) {
          try {
            const total = full.size_bytes || full.blob?.size || 0;
            usedLegacy = await _uploadMilestoneViaLegacy({
              token,
              full,
              onProgress: ({ loaded, pct }) => emit('carryon:upload:progress', {
                id: row.id,
                bytes_sent: loaded,
                total,
                pct,
                filename: full.filename,
              }),
            });
          } catch (legacyErr) {
            // If legacy fails for a transient reason, fall through to
            // chunked. We log the error in last_error so the user can
            // see it on the Sync Panel even if chunked also stalls.
            console.warn('[upload] legacy path failed, falling back to chunked:', legacyErr?.message || legacyErr);
            await updatePendingUpload(row.id, { last_error: `legacy: ${legacyErr?.response?.status ? `HTTP ${legacyErr.response.status}` : (legacyErr?.message || 'failed')}` }).catch(() => {});
            usedLegacy = false;
          }
        }
        if (!usedLegacy) {
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
        }
        await deletePendingUpload(row.id); // success: drop from queue
        // Clean up the local optimistic milestone row so the next
        // refresh doesn't double-render it alongside the new
        // server-authoritative row. The optimistic row's id is
        // `pending_*` and lives in IndexedDB's `milestoneMessage`
        // table; without this delete the merge in
        // MessagesPage.fetchData keeps it (its id isn't in
        // serverIds), producing the duplicate-row regression the
        // user reported.
        try {
          const pendingId = full?.metadata?.pending_id;
          if (pendingId && (full.kind === 'milestone_video' || full.kind === 'milestone_audio')) {
            const { deleteLocalMessage } = await import('./repos/messagesRepo');
            await deleteLocalMessage(pendingId).catch(() => {});
          }
        } catch { /* non-fatal cleanup */ }
        processed++;
        emit('carryon:upload:complete', { id: row.id, filename: full.filename, kind: full.kind });
      } catch (err) {
        const retry = (full.retry_count || 0) + 1;
        const message = err?.response?.status
          ? `HTTP ${err.response.status}${err.response.data?.detail ? ` — ${err.response.data.detail}` : ''}`
          : (err?.code || err?.message || 'upload failed');
        // Emit so the indicator can show "Sync stalled — tap to retry"
        // instead of leaving the user staring at a frozen 0%.
        emit('carryon:upload:failed', {
          id: row.id,
          filename: full.filename,
          kind: full.kind,
          error: message,
          retry_count: retry,
        });
        await updatePendingUpload(row.id, {
          status: retry >= 10 ? 'failed' : 'queued',
          retry_count: retry,
          last_error: message,
        });
      }
    }
  } finally {
    _drainInFlight = false;
  }
  return { processed };
}
