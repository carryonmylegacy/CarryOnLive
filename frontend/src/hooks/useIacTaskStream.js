/**
 * CarryOn™ — useIacTaskStream
 *
 * Subscribes to the backend Server-Sent Events endpoint
 * `GET /api/guardian/iac-task-stream` and emits the current EGA IAC
 * task status to a caller-supplied `onUpdate` callback. Falls back to
 * the legacy `/iac-task-status` polling endpoint if the SSE handshake
 * fails — guarantees we never regress when an intermediary proxy
 * strips long-lived connections.
 *
 * Why this exists: at 1,000 concurrent users, polling the status
 * endpoint every 4s produces ~250 req/sec of pure overhead. SSE
 * collapses that into ~1,000 idle, long-lived connections — orders of
 * magnitude less request-handler churn — while still surfacing every
 * status change in <2 s.
 *
 * Uses fetch + ReadableStream (NOT the native EventSource API)
 * because EventSource can't send an `Authorization: Bearer` header
 * and this app's auth is JWT-in-localStorage. fetch streaming is
 * supported in every evergreen browser AND iOS Safari 14.5+ — the
 * minimum target for our PWA.
 *
 * Usage:
 *   useIacTaskStream({
 *     enabled: !!estate?.id && featureEnabled,
 *     onUpdate: (task) => { ...same shape as the polling response... },
 *     onError:  () => {},  // optional
 *   });
 *
 * The hook is self-managing: it tears down its abort controller on
 * unmount, on `enabled=false`, or when the server closes the stream.
 * If a stream ends in a non-terminal state, the hook reconnects with
 * exponential backoff capped at 30s.
 */

import { useEffect, useRef } from 'react';

const API_URL = process.env.REACT_APP_BACKEND_URL ? `${process.env.REACT_APP_BACKEND_URL}/api` : '/api';
const TERMINAL = new Set(['completed', 'error', 'canceled']);
const POLLING_FALLBACK_INTERVAL_MS = 8000;  // gentler than the legacy 4s

export default function useIacTaskStream({ enabled, onUpdate, onError }) {
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let abort = null;
    let pollTimer = null;
    let backoffMs = 1000;

    const getToken = () => {
      try { return localStorage.getItem('carryon_token'); } catch { return null; }
    };

    // Polling fallback — preserves the legacy contract end-to-end so
    // any proxy/Cloudflare config that strips SSE still works.
    const pollOnce = async () => {
      if (cancelled) return;
      try {
        const token = getToken();
        const res = await fetch(`${API_URL}/guardian/iac-task-status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const task = await res.json();
        if (!cancelled) onUpdateRef.current?.(task);
      } catch (err) {
        if (!cancelled) onErrorRef.current?.(err);
      } finally {
        if (!cancelled) pollTimer = setTimeout(pollOnce, POLLING_FALLBACK_INTERVAL_MS);
      }
    };

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      pollOnce();
    };

    const stopPolling = () => {
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    };

    const consumeSse = async () => {
      const token = getToken();
      abort = new AbortController();
      let res;
      try {
        res = await fetch(`${API_URL}/guardian/iac-task-stream`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            Accept: 'text/event-stream',
          },
          signal: abort.signal,
        });
      } catch (_err) {
        if (cancelled) return;
        // Network or CORS — fall back to polling, retry SSE later.
        startPolling();
        scheduleSseReconnect();
        return;
      }
      if (!res.ok || !res.body) {
        if (cancelled) return;
        startPolling();
        scheduleSseReconnect();
        return;
      }
      // Stream up: cancel any pending poll fallback.
      stopPolling();
      let streamStartTs = Date.now();
      let sseProvenWorking = false;
      backoffMs = 1000;  // reset

      // First-byte timeout: if no SSE frame arrives within 8 s, the
      // intermediary proxy is almost certainly buffering the response
      // (some kube ingresses don't honor X-Accel-Buffering: no). Abort
      // the silent connection and fall back to polling so the UI
      // doesn't go dark waiting for events that will never arrive.
      const firstByteTimeout = setTimeout(() => {
        if (!sseProvenWorking && !cancelled) {
          try { abort?.abort(); } catch { /* noop */ }
          startPolling();
        }
      }, 8000);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let closed = false;
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseProvenWorking = true;
          buffer += decoder.decode(value, { stream: true });
          // SSE events are separated by a blank line.
          let sepIdx;
          while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
            const raw = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            const lines = raw.split('\n');
            let event = 'message';
            let data = '';
            for (const line of lines) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (event === 'close') { closed = true; break; }
            if (data) {
              try {
                const payload = JSON.parse(data);
                if (!cancelled) onUpdateRef.current?.(payload);
                if (TERMINAL.has(payload?.status)) closed = true;
              } catch { /* malformed event — ignore */ }
            }
          }
          if (closed) break;
        }
      } catch (err) {
        if (!cancelled) onErrorRef.current?.(err);
      } finally {
        clearTimeout(firstByteTimeout);
        try { reader.cancel(); } catch { /* noop */ }
      }
      if (cancelled) return;
      // If SSE never produced a single byte, the proxy is buffering —
      // polling has already been kicked off by the first-byte timeout.
      // Schedule a long-interval SSE retry so we eventually re-pick-up
      // streaming if the proxy config gets fixed mid-session.
      if (!sseProvenWorking) {
        backoffMs = 60000;  // 1-minute retry while polling carries us
        scheduleSseReconnect();
        return;
      }
      // Stream ended after delivering events — reconnect normally.
      // Defensive: if it closed in under 5s, back off longer than the
      // default 1s to avoid a reconnect storm.
      const streamLifetimeMs = Date.now() - streamStartTs;
      if (streamLifetimeMs < 5000) {
        backoffMs = Math.max(backoffMs, 15000);
      }
      scheduleSseReconnect();
    };

    let reconnectTimer = null;
    const scheduleSseReconnect = () => {
      if (cancelled || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!cancelled) consumeSse();
      }, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30000);
    };

    consumeSse();

    return () => {
      cancelled = true;
      if (abort) { try { abort.abort(); } catch { /* noop */ } }
      stopPolling();
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };
  }, [enabled]);
}
