// CarryOn — Dashboard load test (read-heavy realistic profile)
//
// Usage:
//   k6 run --vus 50 --duration 60s -e BASE_URL=https://your-host -e EMAIL=info@... -e PASSWORD=... \
//     /app/load_tests/dashboard_load.js
//
// Logs in once per VU with a shared test account, then hammers the read
// endpoints a real user touches every minute the dashboard is open. This
// is the realistic shape of CarryOn production traffic — read-mostly,
// authenticated, fan-out across estate/onboarding/notifications.
//
// Thresholds:
//   p(95) < 800ms (overall)
//   error rate < 1%

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL;
const EMAIL = __ENV.EMAIL;
const PASSWORD = __ENV.PASSWORD;

if (!BASE_URL || !EMAIL || !PASSWORD) {
  throw new Error('Set BASE_URL, EMAIL, and PASSWORD env vars before running.');
}

export const options = {
  vus: __ENV.VUS ? parseInt(__ENV.VUS) : 50,
  duration: __ENV.DURATION || '60s',
  thresholds: {
    http_req_duration: ['p(95)<800'],
    'http_req_duration{name:auth_me}': ['p(95)<300'],
    'http_req_duration{name:estates}': ['p(95)<500'],
    'http_req_failed': ['rate<0.01'],
    'errors': ['rate<0.01'],
  },
};

const errors = new Rate('errors');
const dashTrend = new Trend('dashboard_duration');

// One token per VU, reused across iterations.
let token = null;
let estateId = null;

function login() {
  const r = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } }
  );
  const ok = check(r, { 'login 200': (res) => res.status === 200 });
  if (!ok) { errors.add(1); return null; }
  try {
    const body = r.json();
    return body.access_token || body.token;
  } catch (_e) {
    errors.add(1);
    return null;
  }
}

function fetchEstateId(tk) {
  const r = http.get(`${BASE_URL}/api/estates`, {
    headers: { Authorization: `Bearer ${tk}` },
    tags: { name: 'estates' },
  });
  if (r.status !== 200) return null;
  try {
    const body = r.json();
    const estates = Array.isArray(body) ? body : (body.estates || []);
    return estates.length ? estates[0].id : null;
  } catch (_e) { return null; }
}

export default function () {
  if (!token) {
    token = login();
    if (!token) { sleep(1); return; }
    estateId = fetchEstateId(token);
  }
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  group('dashboard reads', () => {
    const t0 = Date.now();

    const r1 = http.get(`${BASE_URL}/api/auth/me`, { headers: auth.headers, tags: { name: 'auth_me' } });
    check(r1, { 'auth_me 200': (res) => res.status === 200 }) || errors.add(1);

    const r2 = http.get(`${BASE_URL}/api/estates`, { headers: auth.headers, tags: { name: 'estates' } });
    check(r2, { 'estates 200': (res) => res.status === 200 }) || errors.add(1);

    const r3 = http.get(`${BASE_URL}/api/notifications`, { headers: auth.headers, tags: { name: 'notifications' } });
    check(r3, { 'notifications 200': (res) => res.status === 200 }) || errors.add(1);

    const r4 = http.get(`${BASE_URL}/api/subscriptions/enabled-features`, { headers: auth.headers, tags: { name: 'features' } });
    check(r4, { 'features 200': (res) => res.status === 200 }) || errors.add(1);

    if (estateId) {
      const r5 = http.get(`${BASE_URL}/api/messages/${estateId}`, { headers: auth.headers, tags: { name: 'messages' } });
      check(r5, { 'messages 200': (res) => res.status === 200 }) || errors.add(1);

      const r6 = http.get(`${BASE_URL}/api/beneficiaries/${estateId}/primary`, { headers: auth.headers, tags: { name: 'beneficiaries' } });
      check(r6, { 'beneficiaries 200/404': (res) => [200, 404].includes(res.status) }) || errors.add(1);

      const r7 = http.get(`${BASE_URL}/api/checklists/${estateId}`, { headers: auth.headers, tags: { name: 'checklists' } });
      check(r7, { 'checklists 200': (res) => res.status === 200 }) || errors.add(1);
    }

    dashTrend.add(Date.now() - t0);
  });

  // Real users idle 2-5 seconds between actions.
  sleep(2 + Math.random() * 3);
}
