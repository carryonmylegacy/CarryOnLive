/**
 * Audit 3153523 #4 — offline profile/subscription mirrors must be encrypted at
 * rest in IndexedDB even when the offline feature flag is OFF.
 *
 * Self-contained: uses Node's WebCrypto for the real AES path and an in-memory
 * fake of the Dexie tables. Run via CRA jest:
 *   cd /app/frontend && CI=true yarn test src/offline/repos/__tests__/offlineRepos.test.js --watchAll=false
 */

/* eslint-disable global-require */
const { webcrypto } = require('crypto');

const stores = { user: {}, subscription: {} };

jest.mock('../../db', () => ({
  getDB: () => ({
    user: {
      get: async (k) => stores.user[k],
      put: async (r) => { stores.user[r.id] = r; },
      delete: async (k) => { delete stores.user[k]; },
    },
    subscription: {
      get: async (k) => stores.subscription[k],
      put: async (r) => { stores.subscription[r.id] = r; },
      delete: async (k) => { delete stores.subscription[k]; },
    },
  }),
}));

beforeAll(() => {
  // Ensure window.crypto.subtle exists (jsdom may omit subtle).
  try {
    if (!global.crypto || !global.crypto.subtle) {
      Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true });
    }
  } catch { /* already defined */ }
  try {
    if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
      Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
    }
  } catch { /* already defined */ }
  // Minimal JWT so decodeUserId / ensureKeyForOutbox can derive a device key.
  const payload = Buffer.from(JSON.stringify({ user_id: 'test-user-1' })).toString('base64');
  window.localStorage.setItem('carryon_token', `h.${payload}.s`);
  // Offline encryption flag explicitly OFF — force-encryption must still apply.
  window.localStorage.setItem('carryon_offline_v1', 'off');
});

beforeEach(() => { stores.user = {}; stores.subscription = {}; });

test('profile snapshot is encrypted at rest with offline mode OFF', async () => {
  const { upsertLocalProfile, getLocalProfile } = require('../profileRepo');
  const profile = {
    id: 'u1', email: 'pete@example.com', name: 'Pete',
    ssn: '111-22-3333', address: '1 Main St', date_of_birth: '1980-01-01', phone: '555-0100',
  };
  await upsertLocalProfile(profile);

  const raw = stores.user.current;
  const serialized = JSON.stringify(raw);
  expect(raw.__enc).toBeTruthy();
  expect(serialized).not.toContain('111-22-3333');
  expect(serialized).not.toContain('1 Main St');
  expect(serialized).not.toContain('1980-01-01');
  expect(serialized).not.toContain('555-0100');
  // Display identity stays plaintext for instant offline paint.
  expect(raw.email).toBe('pete@example.com');
  expect(raw.name).toBe('Pete');

  const back = await getLocalProfile();
  expect(back.ssn).toBe('111-22-3333');
  expect(back.address).toBe('1 Main St');
});

test('subscription mirror is encrypted at rest with offline mode OFF', async () => {
  const { upsertLocalSubscription, getLocalSubscription } = require('../subscriptionRepo');
  const sub = { tier: 'premium', status: 'active', trial_end: '2026-12-31', stripe_customer_id: 'cus_secret123' };
  await upsertLocalSubscription(sub);

  const raw = stores.subscription.current;
  expect(raw.__enc).toBeTruthy();
  expect(JSON.stringify(raw)).not.toContain('cus_secret123');
  expect(JSON.stringify(raw)).not.toContain('premium');

  const back = await getLocalSubscription();
  expect(back.status).toBe('active');
  expect(back.stripe_customer_id).toBe('cus_secret123');
});
