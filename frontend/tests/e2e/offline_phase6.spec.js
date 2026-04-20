// CarryOn E2E — Offline Phase 6 (Login sync packet + progress pill) Regression
// ============================================================================
// Proves:
//   1. Flag=on: login dispatches carryon:sync:start and progress events and
//      the <OfflineSyncProgress /> pill renders while the warm-up runs.
//   2. Flag=off: no sync events fire and the pill never appears.

import { test, expect } from '@playwright/test';
import { BASE, loginAsAdminWithMode } from './_helpers.js';

async function setupEventCapture(page) {
  await page.addInitScript(() => {
    window.__syncEvents = [];
    ['carryon:sync:start', 'carryon:sync:progress', 'carryon:sync:finish'].forEach((t) => {
      window.addEventListener(t, (e) => window.__syncEvents.push({ type: t, detail: e.detail }));
    });
  });
}

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.describe('Offline Phase 6 — Login sync packet + progress pill', () => {
  test('flag=on: warm-up emits start → progress events and pill becomes visible', async ({ page }) => {
    await setupEventCapture(page);
    await loginAsAdminWithMode(page, 'on', { postLoginWaitMs: 9000 });

    const events = await page.evaluate(() => window.__syncEvents || []);
    const types = events.map((e) => e.type);
    expect(types).toContain('carryon:sync:start');
    expect(types).toContain('carryon:sync:progress');
    const startEvent = events.find((e) => e.type === 'carryon:sync:start');
    expect(startEvent.detail.total).toBeGreaterThanOrEqual(1);
  });

  test('flag=off: no sync events fire and pill never appears', async ({ page }) => {
    await setupEventCapture(page);
    await loginAsAdminWithMode(page, 'off', { postLoginWaitMs: 5000 });

    const events = await page.evaluate(() => window.__syncEvents || []);
    expect(events.length).toBe(0);
    const pill = await page.locator('[data-testid="offline-sync-progress"]').count();
    expect(pill).toBe(0);
  });
});
