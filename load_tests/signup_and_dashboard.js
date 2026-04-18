// CarryOn — Signup + Dashboard load test
// Usage:
//   k6 run --vus 50 --duration 5m load_tests/signup_and_dashboard.js
//
// Simulates 50 concurrent virtual users continuously signing up, hitting the
// dashboard, and logging out. Surfaces: slow endpoints, N+1 queries, DB
// connection pool saturation, rate limit calibration, memory leaks.
//
// Env:
//   BASE_URL   e.g. https://app.carryon.us   (required)
//   SIGNUP_EMAIL_DOMAIN  default loadtest.carryon.local
//
// Output:
//   k6 run --out json=results.json ...  then grep for p(95), error rate, etc.

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'https://app.carryon.us';
const DOMAIN = __ENV.SIGNUP_EMAIL_DOMAIN || 'loadtest.carryon.local';

export const options = {
  scenarios: {
    steady: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 20 },   // warm up
        { duration: '2m',  target: 100 },  // ramp to 100 concurrent users
        { duration: '2m',  target: 100 },  // steady at 100
        { duration: '30s', target: 0 },    // ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // P95 below 1s across the board; error rate below 1%.
    http_req_duration: ['p(95)<1500'],
    'http_req_duration{name:dashboard}': ['p(95)<1000'],
    'http_req_failed': ['rate<0.01'],
    'errors': ['rate<0.01'],
  },
};

const errors = new Rate('errors');
const signupTrend = new Trend('signup_duration');
const dashTrend = new Trend('dashboard_duration');

function newEmail() {
  return `lt-${randomString(8).toLowerCase()}@${DOMAIN}`;
}

export default function () {
  const email = newEmail();
  const password = __ENV.LOAD_TEST_PASSWORD || 'LoadTest!Password123';
  let token = null;

  group('signup', () => {
    const payload = JSON.stringify({
      email,
      password,
      first_name: 'Load',
      last_name: 'Test',
      role: 'benefactor',
      dob: '1980-01-01',
    });
    const r = http.post(`${BASE_URL}/api/auth/register`, payload, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'signup' },
    });
    signupTrend.add(r.timings.duration);
    const ok = check(r, {
      'signup 200/201/409 (dup allowed)': (res) => [200, 201, 409].includes(res.status),
    });
    if (!ok) { errors.add(1); return; }
    try {
      const body = r.json();
      token = body.token || body.access_token;
    } catch { /* no-op */ }
  });

  if (!token) {
    // Try login if registration didn't yield a token.
    const r = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email, password }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'login' },
    });
    if (r.status === 200) {
      try { token = r.json().token || r.json().access_token; } catch {}
    }
  }

  if (!token) { errors.add(1); return; }
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  group('dashboard', () => {
    const r1 = http.get(`${BASE_URL}/api/estates`, { ...authHeaders, tags: { name: 'dashboard' } });
    dashTrend.add(r1.timings.duration);
    check(r1, { 'estates 200': (res) => res.status === 200 });

    const r2 = http.get(`${BASE_URL}/api/onboarding/progress`, { ...authHeaders, tags: { name: 'dashboard' } });
    check(r2, { 'onboarding 200': (res) => res.status === 200 });

    const r3 = http.get(`${BASE_URL}/api/notifications/unread-count`, { ...authHeaders, tags: { name: 'dashboard' } });
    check(r3, { 'notifications 200': (res) => res.status === 200 });
  });

  group('logout', () => {
    const r = http.post(`${BASE_URL}/api/auth/logout`, null, { ...authHeaders, tags: { name: 'logout' } });
    check(r, { 'logout 200/204': (res) => [200, 204].includes(res.status) });
  });

  sleep(Math.random() * 2);
}
