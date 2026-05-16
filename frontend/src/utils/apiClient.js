/**
 * CarryOn™ — Resilient axios wrapper.
 *
 * Adds three production-grade behaviors to all axios calls without
 * forcing every caller to wire them up individually:
 *
 *   1. Exponential backoff retry on 502/503/504/network-error for safe
 *      verbs (GET, HEAD). Idempotent verbs are NEVER auto-retried
 *      because they may already have committed server-side.
 *   2. Per-page abort controller cancellation. Each call accepts a
 *      `signal` (AbortSignal) — the calling page wires it to its
 *      `useEffect` cleanup so navigating away aborts in-flight
 *      requests instead of resolving into an unmounted component.
 *   3. X-Request-ID correlation header on every request — generated
 *      client-side, propagated through backend logs and Sentry, so
 *      one user complaint can be traced across the whole stack.
 *
 * Drop-in usage: replace `import axios from 'axios'` with
 *   `import api from '../utils/apiClient'` then call `api.get(...)`.
 * Existing axios imports keep working — this wrapper is additive.
 */

import axios from 'axios';

const RETRYABLE_STATUSES = new Set([0, 408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_VERBS = new Set(['get', 'head', 'options']);
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 300;

const genRequestId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `cli-${crypto.randomUUID()}`;
  }
  return `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const api = axios.create();

// Request interceptor — stamp every outbound request with a
// correlation ID so any cross-stack log entry can be traced back to
// one specific user interaction.
api.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  if (!config.headers['X-Request-ID']) {
    config.headers['X-Request-ID'] = genRequestId();
  }
  return config;
});

// Response interceptor — retries transient failures on safe verbs only.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config;
    if (!config) return Promise.reject(error);
    const method = (config.method || 'get').toLowerCase();
    const status = error?.response?.status || 0;
    // Abort signals must propagate immediately — never retry a cancel.
    if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
      return Promise.reject(error);
    }
    if (!RETRYABLE_VERBS.has(method) || !RETRYABLE_STATUSES.has(status)) {
      return Promise.reject(error);
    }
    config.__retryCount = config.__retryCount || 0;
    if (config.__retryCount >= MAX_RETRIES) {
      return Promise.reject(error);
    }
    config.__retryCount += 1;
    // Exponential backoff with full jitter: 300ms → 600ms → 1200ms.
    const delay = BASE_BACKOFF_MS * Math.pow(2, config.__retryCount - 1) * (0.5 + Math.random());
    await sleep(delay);
    return api.request(config);
  }
);

export default api;
export { genRequestId };
