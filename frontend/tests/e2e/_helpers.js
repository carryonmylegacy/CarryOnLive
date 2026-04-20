// Shared Playwright helpers for CarryOn offline-phase specs.
// ============================================================================
// - Robust login helper that tolerates Cloudflare's "Performing security
//   verification" interstitial by retrying the goto up to 3 times and
//   waiting for a visible (non-hidden) input to appear.
// - IndexedDB count helper that returns 0 for missing object stores.

const { expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || process.env.REACT_APP_BACKEND_URL || 'https://ui-polish-72.preview.emergentagent.com';

async function loginAsAdminWithMode(page, mode, { postLoginWaitMs = 3500 } = {}) {
  // Phase 8 fix: set the offline feature flag via addInitScript so it is
  // in localStorage BEFORE any app JS runs. Otherwise React components
  // like ConflictResolver and OfflineSyncProgress read the flag at mount
  // time with the previous value and never re-check.
  await page.addInitScript((m) => {
    try { localStorage.setItem('carryon_offline_v1', m); } catch {}
  }, mode);
  let attempt = 0;
  while (attempt < 2) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    try {
      await page.locator('input:not([type="hidden"]):visible').first().waitFor({ state: 'visible', timeout: 12000 });
      break;
    } catch (e) {
      attempt++;
      if (attempt >= 2) throw e;
      await page.waitForTimeout(2000);
    }
  }
  const inputs = page.locator('input:not([type="hidden"]):visible');
  await inputs.nth(0).fill('info@carryon.us');
  await inputs.nth(1).fill('Demo1234!');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(postLoginWaitMs);
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

module.exports = { BASE, loginAsAdminWithMode, countStore, expect };
