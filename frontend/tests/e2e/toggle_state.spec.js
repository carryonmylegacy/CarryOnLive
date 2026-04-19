// CarryOn E2E — localStorage toggle regression test
// ============================================================================
// Proves that a Switch toggle flips its visual `data-state` attribute in
// response to a single click — the specific bug the user hit where the
// "Hide Bug Report Icon" toggle emitted a toast but the switch never
// visually changed because the `checked` prop read localStorage at render
// without a React state trigger.
//
// The theme toggle is a proxy here because every authenticated user has
// access to it — the "Hide Bug Report Icon" toggle is only visible to
// beta testers. The underlying mechanism (now useLocalStorageBoolean
// backed by useSyncExternalStore) is shared across all localStorage-
// backed toggles in the app.

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || process.env.REACT_APP_BACKEND_URL || 'https://ui-polish-72.preview.emergentagent.com';

test.describe('Toggle regression', () => {
  test('Settings theme toggle visually flips on click and persists its state attribute', async ({ page }) => {
    // Log in as admin
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const inputs = page.locator('input');
    await inputs.nth(0).fill('info@carryon.us');
    await inputs.nth(1).fill('Demo1234!');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2500);

    // Settings
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const toggle = page.locator('[data-testid="settings-theme-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 8000 });

    const before = await toggle.getAttribute('data-state');
    expect(before).toMatch(/^(checked|unchecked)$/);

    await toggle.click({ force: true });
    // Give React one frame to flush the state update
    await page.waitForTimeout(250);
    const after = await toggle.getAttribute('data-state');
    expect(after).toMatch(/^(checked|unchecked)$/);
    expect(after).not.toBe(before);

    // Flip it back and make sure we fully round-trip.
    await toggle.click({ force: true });
    await page.waitForTimeout(250);
    const back = await toggle.getAttribute('data-state');
    expect(back).toBe(before);
  });
});
