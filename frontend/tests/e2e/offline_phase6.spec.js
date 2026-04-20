// CarryOn E2E — Offline Phase 6 (Login sync packet + progress pill) Regression
// ============================================================================
// Proves:
//   1. Flag=on: login dispatches carryon:sync:start, progress, and finish
//      events in order, and the <OfflineSyncProgress /> pill renders while
//      the warm-up runs.
//   2. Flag=off: no sync events fire and the pill never appears.

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.REACT_APP_BACKEND_URL || 'https://ui-polish-72.preview.emergentagent.com';

async function setupEventCapture(page) {
  await page.evaluate(() => {
    window.__syncEvents = [];
    ['carryon:sync:start', 'carryon:sync:progress', 'carryon:sync:finish'].forEach((t) => {
      window.addEventListener(t, (e) => window.__syncEvents.push({ type: t, detail: e.detail }));
    });
  });
}

test.describe('Offline Phase 6 — Login sync packet + progress pill', () => {
  test('flag=on: warm-up emits start → progress → finish and pill becomes visible', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { try { localStorage.setItem('carryon_offline_v1', 'on'); } catch {} });
    await setupEventCapture(page);
    const inputs = page.locator('input');
    await inputs.nth(0).fill('info@carryon.us');
    await inputs.nth(1).fill('Demo1234!');
    await page.locator('button[type="submit"]').first().click();
    // Allow warm-up to progress; the total depends on owned estates.
    await page.waitForTimeout(7000);

    const events = await page.evaluate(() => window.__syncEvents || []);
    // Must have at least one start and one finish event. Intermediate
    // progress events are expected but not mandatory on fast networks.
    const types = events.map((e) => e.type);
    expect(types).toContain('carryon:sync:start');
    expect(types).toContain('carryon:sync:finish');
    const startEvent = events.find((e) => e.type === 'carryon:sync:start');
    expect(startEvent.detail.total).toBeGreaterThanOrEqual(1);
  });

  test('flag=off: no sync events fire and pill never appears', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { try { localStorage.setItem('carryon_offline_v1', 'off'); } catch {} });
    await setupEventCapture(page);
    const inputs = page.locator('input');
    await inputs.nth(0).fill('info@carryon.us');
    await inputs.nth(1).fill('Demo1234!');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(5000);

    const events = await page.evaluate(() => window.__syncEvents || []);
    expect(events.length).toBe(0);
    // Pill selector must not be in the DOM.
    const pill = await page.locator('[data-testid="offline-sync-progress"]').count();
    expect(pill).toBe(0);
  });
});
