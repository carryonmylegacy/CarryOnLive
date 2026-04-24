/**
 * CarryOn — Universal Offline Mutation Helper (Tier A)
 * ============================================================================
 * Small wrapper any page can use in place of a raw axios/fetch write so
 * the mutation automatically queues to the outbox when the user is offline
 * (and flag is on) and executes normally when online.
 *
 * Returns: { ok, queued, data, status }
 *   ok:     true on either a successful server response OR a successful
 *           enqueue. Callers treat this as "the user's action was accepted".
 *   queued: true when the request was enqueued rather than sent.
 *   data:   server response body OR the optimistic body that was sent.
 *   status: HTTP status code (only set when actually fetched).
 *
 * Usage:
 *   const r = await mutateWithOutbox({
 *     entity_type: 'ffn',
 *     entity_id: form.id || `local-ffn-${crypto.randomUUID()}`,
 *     method: 'POST',
 *     url: '/ffn/' + estateId,
 *     body: form,
 *     authHeaders,
 *   });
 *   if (r.queued) toast.success('Saved offline — will sync when you reconnect.');
 */

import axios from 'axios';
import { API_URL } from '../config';
import { enqueue as enqueueOutbox } from '../offline/outbox';

export async function mutateWithOutbox({
  entity_type,
  entity_id,
  method = 'POST',
  url,
  body,
  authHeaders,
  offlineToastCopy = null, // optional override
}) {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // Offline path — flag-agnostic as of Apr 24, 2026. Previously gated on
  // `mode === 'on'`, which silently forced every default-off user's
  // write to be fired straight at axios and rejected with an "offline"
  // error, losing the user's data. Now every offline write is queued
  // to the outbox for replay on reconnect, regardless of the flag.
  if (isOffline) {
    try {
      await enqueueOutbox({
        entity_type,
        entity_id: entity_id || `local-${entity_type}-${(crypto?.randomUUID?.() || Date.now())}`,
        method,
        url,
        body,
      });
      return { ok: true, queued: true, data: body, status: null, copy: offlineToastCopy };
    } catch (err) {
      return { ok: false, queued: false, error: err, status: null };
    }
  }

  // Online — normal fetch path.
  try {
    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
    const cfg = { ...(authHeaders || {}) };
    let res;
    if (method === 'POST') res = await axios.post(fullUrl, body, cfg);
    else if (method === 'PUT') res = await axios.put(fullUrl, body, cfg);
    else if (method === 'PATCH') res = await axios.patch(fullUrl, body, cfg);
    else if (method === 'DELETE') res = await axios.delete(fullUrl, cfg);
    else throw new Error(`Unsupported method ${method}`);
    return { ok: true, queued: false, data: res.data, status: res.status };
  } catch (err) {
    return { ok: false, queued: false, error: err, status: err?.response?.status };
  }
}
