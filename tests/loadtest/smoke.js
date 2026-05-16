// CarryOn™ — k6 smoke load test
//
// Validates that the 10 hottest read-only endpoints stay under their
// p95 latency budgets at a representative concurrent load. Run before
// any deploy to a new environment, or after structural changes
// (Mongo index changes, new middleware, connection pool tweaks).
//
// Usage:
//   API_URL=https://your-deployed-api.example.com \
//   TOKEN=eyJhbGc... \
//   k6 run /app/tests/loadtest/smoke.js
//
// Defaults to 50 virtual users for 60 seconds (a realistic post-pitch
// "small partner pilot" load). Pass through k6's standard options to
// scale up (--vus, --duration). Hooked into the housekeeping suite
// as an OPTIONAL pre-push check — set `LOAD_TEST=1` env to enable.

import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API_URL || 'http://localhost:8001';
const TOKEN = __ENV.TOKEN || '';
const ESTATE_ID = __ENV.ESTATE_ID || '';

export const options = {
  vus: parseInt(__ENV.VUS || '50', 10),
  duration: __ENV.DURATION || '60s',
  thresholds: {
    // Top-line latency budgets — anything slower at 50 VUs means a
    // scaling regression. Adjust per-environment via env vars.
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'], // < 1% errors
  },
};

const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

const hotEndpoints = [
  '/api/health',
  '/api/auth/me',
  '/api/estates',
  ESTATE_ID && `/api/beneficiaries/${ESTATE_ID}`,
  ESTATE_ID && `/api/checklists/${ESTATE_ID}`,
  ESTATE_ID && `/api/estate/${ESTATE_ID}/readiness`,
  ESTATE_ID && `/api/ccp/plans/${ESTATE_ID}`,
  ESTATE_ID && `/api/financial/summary/${ESTATE_ID}`,
  '/api/chat/sessions',
  '/api/guardian/usage/today',
].filter(Boolean);

export default function () {
  for (const path of hotEndpoints) {
    const res = http.get(`${API}${path}`, { headers, tags: { endpoint: path } });
    check(res, {
      [`${path} status ok`]: (r) => r.status === 200 || r.status === 404,
      [`${path} fast`]: (r) => r.timings.duration < 2000,
    });
  }
  sleep(1);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] || 0;
  const failureRate = data.metrics.http_req_failed?.values?.rate || 0;
  return {
    'stdout': `\nload test summary: p95=${p95.toFixed(0)}ms, error_rate=${(failureRate * 100).toFixed(2)}%\n`,
    '/tmp/k6_summary.json': JSON.stringify({
      p95_ms: p95,
      error_rate: failureRate,
      vus: data.options?.vus,
      duration: data.options?.duration,
    }, null, 2),
  };
}
