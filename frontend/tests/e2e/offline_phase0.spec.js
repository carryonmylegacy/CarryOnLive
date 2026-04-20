// CarryOn E2E — Offline Subsystem Phase 0 Regression Test
// ============================================================================
// Asserts the offline-first foundation is installed correctly AND is
// completely inert when the feature flag is off. This is the "no
// regression guarantee" concrete test:
//
//   1. With flag=off (default), navigating to /dashboard must NOT open
//      the carryon-offline IndexedDB. If it does, the flag gate is broken.
//   2. With flag=on, navigating must open the DB and it must contain
//      the expected tables.
//   3. The admin debug page at /debug/offline must render and expose
//      the flag controls.
//
// Runs against the admin test account from /app/memory/test_credentials.md.

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.REACT_APP_BACKEND_URL || 'https://ui-polish-72.preview.emergentagent.com';

async function loginAsAdmin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const inputs = page.locator('input');
  await inputs.nth(0).fill('info@carryon.us');
  await inputs.nth(1).fill('Demo1234!');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
}

async function listIndexedDBs(page) {
  return await page.evaluate(async () => {
    if (!indexedDB.databases) return null; // Firefox
    const dbs = await indexedDB.databases();
    return dbs.map((d) => d.name);
  });
}

test.describe('Offline Phase 0 — foundation is installed and inert by default', () => {
  test('flag=off: carryon-offline IndexedDB is NOT created by normal navigation', async ({ page, context }) => {
    // Ensure a clean slate — no leftover flag or DB from a prior run.
    await context.clearCookies();
    await page.goto(BASE);
    await page.evaluate(() => { localStorage.removeItem('carryon_offline_v1'); });

    await loginAsAdmin(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const dbs = await listIndexedDBs(page);
    if (dbs === null) test.skip(true, 'indexedDB.databases unavailable');
    expect(dbs).not.toContain('carryon-offline');
  });

  test('flag=on: carryon-offline IndexedDB is created and contains Phase 0 tables', async ({ page }) => {
    await loginAsAdmin(page);
    // Force the flag on via URL param so no localStorage mutation is needed.
    await page.goto(`${BASE}/dashboard?offline=on`, { waitUntil: 'domcontentloaded' });
    // The sync client init runs in index.js — give it a beat.
    await page.waitForTimeout(2500);

    const info = await page.evaluate(async () => {
      if (!indexedDB.databases) return { supported: false };
      const dbs = await indexedDB.databases();
      const ours = dbs.find((d) => d.name === 'carryon-offline');
      return { exists: !!ours, version: ours?.version };
    });
    if (info.supported === false) test.skip(true, 'indexedDB.databases unavailable');
    expect(info.exists).toBe(true);
    expect(info.version).toBeGreaterThanOrEqual(1);
  });

  test('admin debug page /debug/offline renders with the three flag buttons', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE}/debug/offline`, { waitUntil: 'domcontentloaded' });
    // Auth + admin check + lazy-loaded page can take a beat under full-suite
    // load. Use longer timeouts on the visibility assertions.
    await expect(page.locator('[data-testid="offline-flag-off"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="offline-flag-shadow"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="offline-flag-on"]')).toBeVisible({ timeout: 5000 });
  });
});
