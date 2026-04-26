// Shared Playwright helpers for CarryOn offline-phase specs.
// ============================================================================
// - Robust login helper that tolerates Cloudflare's "Performing security
//   verification" interstitial by retrying the goto up to 3 times and
//   waiting for a visible (non-hidden) input to appear.
// - IndexedDB count helper that returns 0 for missing object stores.

const { expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || process.env.REACT_APP_BACKEND_URL || 'https://chat-monolith-fix.preview.emergentagent.com';

/**
 * Wait out a Cloudflare "Performing security verification" interstitial if
 * one is present. The challenge normally resolves within 5-10s on the first
 * hit; subsequent requests are cookie-authorised and skip it entirely.
 */
async function waitOutCloudflareChallenge(page, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout;
  // Quick check first — if there's no CF heading, skip.
  const cfSelector = 'text=Performing security verification';
  const cfCount = await page.locator(cfSelector).count().catch(() => 0);
  if (cfCount === 0) return false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1500);
    const stillChallenged = await page.locator(cfSelector).count().catch(() => 0);
    if (stillChallenged === 0) return true;
  }
  return false;
}

async function loginAsAdminWithMode(page, mode, { postLoginWaitMs = 3500 } = {}) {
  // Phase 8 fix: set the offline feature flag via addInitScript so it is
  // in localStorage BEFORE any app JS runs. Otherwise React components
  // like ConflictResolver and OfflineSyncProgress read the flag at mount
  // time with the previous value and never re-check.
  await page.addInitScript((m) => {
    try { localStorage.setItem('carryon_offline_v1', m); } catch {}
  }, mode);
  return robustLogin(page, { postLoginWaitMs });
}

/**
 * Robust login helper used by all e2e specs. Handles:
 *   - Cloudflare "Performing security verification" interstitials on the
 *     preview preview URL (wait until cleared).
 *   - Mid-flow CF navigations (whole flow wrapped in a retry).
 *   - Flag-set-via-localStorage after /login DOM-content-loaded (for specs
 *     that need to set a flag that cannot use addInitScript, e.g. because
 *     they mutate multiple localStorage keys).
 *
 * Pass `localStorageKeys` as an object of {key: value} pairs to set after
 * /login has loaded but BEFORE inputs are filled. This is functionally
 * identical to the older inline pattern in offline_phase*.spec.js and
 * avoids having to migrate every spec to addInitScript.
 */
async function robustLogin(page, {
  postLoginWaitMs = 2500,
  email = 'info@carryon.us',
  password = 'Demo1234!',
  localStorageKeys = null,
} = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);
      // Fast CF wait — storageState usually pre-clears the cookie so we
      // only need a short check. Longer waits just eat the test timeout.
      await waitOutCloudflareChallenge(page, { timeout: 12000 });
      if (localStorageKeys) {
        await page.evaluate((kv) => {
          for (const [k, v] of Object.entries(kv)) {
            try { localStorage.setItem(k, v); } catch {}
          }
        }, localStorageKeys);
      }
      const inputs = page.locator('input:not([type="hidden"]):visible');
      await inputs.first().waitFor({ state: 'visible', timeout: 12000 });
      await inputs.nth(0).fill(email, { timeout: 6000 });
      await inputs.nth(1).fill(password, { timeout: 6000 });
      await page.locator('button[type="submit"]').first().click({ timeout: 6000 });
      await page.waitForTimeout(postLoginWaitMs);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      await page.waitForTimeout(1500);
    }
  }
  if (lastErr) throw lastErr;
}

async function countStore(page, storeName) {
  return await page.evaluate(async (name) => {
    return new Promise((resolve) => {
      const req = indexedDB.open('carryon-offline');
      req.onsuccess = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(name)) { db.close(); resolve(0); return; }
          const tx = db.transaction(name, 'readonly');
          const countReq = tx.objectStore(name).count();
          countReq.onsuccess = () => { db.close(); resolve(countReq.result); };
          countReq.onerror = () => { db.close(); resolve(-1); };
        } catch { resolve(-1); }
      };
      req.onerror = () => resolve(-1);
    });
  }, storeName);
}

module.exports = { BASE, loginAsAdminWithMode, robustLogin, waitOutCloudflareChallenge, countStore, expect };
