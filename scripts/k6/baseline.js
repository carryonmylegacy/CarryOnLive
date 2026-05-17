// CarryOn™ — k6 SLO load test (Feb 2026)
//
// USAGE:
//   k6 run --env API_URL=https://carryon-api-production.up.railway.app \
//          --env TEST_EMAIL=info@carryon.us \
//          --env TEST_PASSWORD=Demo1234! \
//          /app/scripts/k6/baseline.js
//
// SLO BUDGETS (will FAIL the test if breached):
//   * p95 latency < 500ms across all hot-path GETs
//   * p99 latency < 1500ms (LLM-touching endpoints excluded)
//   * error rate < 1%
//
// LOAD PROFILE:
//   * 30 virtual users
//   * Steady 1-minute soak (ramp 30s → hold 30s → ramp-down implicit)
//
// CI INTEGRATION:
//   See scripts/check.sh — runs only when HK_RUN_K6=1 (opt-in heavy stage).
//   Future: nightly job in GitHub Actions to track p95/p99 drift over time.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:8001';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'info@carryon.us';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'Demo1234!';

// Custom metrics — segregate latency by path category so LLM calls don't pollute
// the hot-path SLO.
const hotpathLatency = new Trend('hotpath_latency', true);
const errorRate = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '15s', target: 30 },  // ramp up to 30 VUs
    { duration: '30s', target: 30 },  // soak
    { duration: '5s', target: 0 },    // ramp down
  ],
  thresholds: {
    'hotpath_latency': [
      'p(95)<500',   // 95% of hot-path requests under 500ms
      'p(99)<1500',  // 99% under 1.5s
    ],
    'error_rate': ['rate<0.01'],  // less than 1% errors
  },
};

let TOKEN = null;
let ESTATE_ID = null;

export function setup() {
  const loginRes = http.post(
    `${API_URL}/api/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, force_login: true }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (loginRes.status !== 200) {
    throw new Error(`Login failed: ${loginRes.status} ${loginRes.body}`);
  }
  const token = JSON.parse(loginRes.body).access_token;

  const estatesRes = http.get(`${API_URL}/api/estates`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const estates = JSON.parse(estatesRes.body);
  if (!Array.isArray(estates) || estates.length === 0) {
    throw new Error('Test user has no estate');
  }

  return { token, estateId: estates[0].id };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` };

  // Hot-path GETs — these run on every screen load in the app
  const endpoints = [
    `/api/auth/me`,
    `/api/estates`,
    `/api/estates/${data.estateId}`,
    `/api/beneficiaries/${data.estateId}`,
    `/api/checklists/${data.estateId}`,
    `/api/messages/${data.estateId}`,
    `/api/documents/${data.estateId}`,
    `/api/subscriptions/plans`,
    `/api/subscriptions/status`,
  ];

  for (const ep of endpoints) {
    const res = http.get(`${API_URL}${ep}`, { headers });
    hotpathLatency.add(res.timings.duration);
    errorRate.add(res.status >= 400);
    check(res, {
      [`${ep} is 2xx`]: (r) => r.status >= 200 && r.status < 300,
    });
  }

  sleep(1);  // mimic real user think time
}
