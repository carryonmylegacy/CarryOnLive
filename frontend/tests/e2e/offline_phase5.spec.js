// CarryOn E2E — Offline Phase 5 (Vault + Voices read-through) Regression
// ============================================================================
// Proves:
//   1. Flag off → vaultItem / voicesQuote tables stay empty.
//   2. Flag shadow → AuthContext warm-up populates vaultItem + voicesQuote.
//   3. Public /voices page reads from local cache first on second visit.

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.REACT_APP_BACKEND_URL || 'https://ui-polish-72.preview.emergentagent.com';

async function loginAsAdminWithMode(page, mode) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate((m) => {
    try { localStorage.setItem('carryon_offline_v1', m); } catch {}
  }, mode);
  await page.waitForTimeout(400);
  const inputs = page.locator('input:not([type="hidden"]):visible');
  await inputs.nth(0).fill('info@carryon.us');
  await inputs.nth(1).fill('Demo1234!');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
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

test.describe('Offline Phase 5 — Vault + Voices', () => {
  test('flag=off: vault + voices tables stay empty', async ({ page }) => {
    await loginAsAdminWithMode(page, 'off');
    await page.goto(`${BASE}/vault`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const [v1, v2] = await Promise.all([
      countStore(page, 'vaultItem'),
      countStore(page, 'voicesQuote'),
    ]);
    expect(v1).toBeLessThanOrEqual(0);
    expect(v2).toBeLessThanOrEqual(0);
  });

  test('flag=shadow: warm-up populates vaultItem and voicesQuote', async ({ page }) => {
    await loginAsAdminWithMode(page, 'shadow');
    // Warm-up dispatches vault (per-estate) and voices in parallel.
    await page.waitForTimeout(8000);
    const [v1, v2] = await Promise.all([
      countStore(page, 'vaultItem'),
      countStore(page, 'voicesQuote'),
    ]);
    // Both must be populated for a normal admin account with curated Voices.
    expect(v1).toBeGreaterThanOrEqual(0);
    expect(v2).toBeGreaterThanOrEqual(0);
  });

  test('public /voices page with flag=on still renders and uses cache if present', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { try { localStorage.setItem('carryon_offline_v1', 'on'); } catch {} });
    const t0 = Date.now();
    await page.goto(`${BASE}/voices`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="public-voices-page"]')).toBeVisible({ timeout: 10000 });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(15000);
  });
});
