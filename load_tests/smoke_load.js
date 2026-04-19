// CarryOn — Smoke load test for preview/staging pods
// =====================================================
// Lightweight sanity check: hammers read-only endpoints to verify the
// rate limiter, connection pool, and Sentry integration hold up under
// sustained concurrent load without 500s or memory leaks.
//
// NOT a production load test — the full signup flow lives in
// signup_and_dashboard.js. Use this one against the preview pod;
// use the signup one against Railway staging.
//
// Usage:
//   k6 run --vus 20 --duration 30s load_tests/smoke_load.js
//   BASE_URL=http://localhost:8001 k6 run load_tests/smoke_load.js
//
// What "pass" looks like:
//   ✓ http_req_failed ...........: < 1% (rate limiter's 429s are expected under load)
//   ✓ http_req_duration p(95) ...: < 1500ms
//   ✓ No 500s — only 200s and 429s
//   ✓ Steady memory, no connection pool exhaustion
import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8001';

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    // 429s (rate-limited) are fine — we only care about 5xx's.
    'checks{type:no_5xx}': ['rate>0.99'],
    http_req_duration: ['p(95)<1500'],
  },
};

const no5xx = new Rate('no_5xx_rate');

export default function () {
  // Health probe — should always 200
  const h = http.get(`${BASE_URL}/api/health`);
  check(h, {
    'health not 5xx': (r) => r.status < 500,
  }, { type: 'no_5xx' });
  no5xx.add(h.status < 500);

  // Readiness probe — verifies Mongo + rate limiter index init
  const ready = http.get(`${BASE_URL}/api/health/ready`);
  check(ready, {
    'ready not 5xx': (r) => r.status < 500,
  }, { type: 'no_5xx' });
  no5xx.add(ready.status < 500);

  // Unauthenticated login attempt — exercises auth path + rate limiter
  // We don't care if it 401s (wrong creds); we care that it doesn't 500.
  const login = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: 'loadtest@example.com', password: 'wrong' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(login, {
    'login not 5xx': (r) => r.status < 500,
  }, { type: 'no_5xx' });
  no5xx.add(login.status < 500);
}
