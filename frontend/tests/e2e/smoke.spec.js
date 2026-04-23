// CarryOn™ — E2E Smoke Suite
// ============================================================================
// Eight critical-path tests that exercise the full login + dashboard flow.
// Runs on both Desktop Chrome and iPhone 14 viewports.
//
// These are NOT exhaustive — they're the regression harness that catches
// "is the app fundamentally broken?" before production traffic does.
//
// Test accounts come from /app/memory/test_credentials.md.
// Override via env: E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD.

import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'info@carryon.us';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Demo1234!';

// Helper: log in and land on dashboard. Returns after navigation settles.
async function loginAsAdmin(page) {
  await page.goto('/login');
  // Wait out Cloudflare "Performing security verification" interstitial if
  // one is present on the preview URL.
  const cfDeadline = Date.now() + 25000;
  while (Date.now() < cfDeadline) {
    const cf = await page.locator('text=Performing security verification').count().catch(() => 0);
    if (cf === 0) break;
    await page.waitForTimeout(1500);
  }
  await expect(page).toHaveURL(/\/login/);
  // CarryOn login uses a single "username or email" text input.
  // Try whichever testid variant is visible in the current viewport (PWA, mobile, desktop).
  const identifier = page.locator(
    '[data-testid="login-email-input"], [data-testid="login-email-pwa"], [data-testid="login-email"], input[autocomplete="username"]'
  ).first();
  const password = page.locator(
    '[data-testid="login-password-pwa"], [data-testid="login-password"], input[type="password"]'
  ).first();
  await identifier.waitFor({ state: 'visible' });
  await identifier.fill(ADMIN_EMAIL);
  await password.fill(ADMIN_PASSWORD);
  const submit = page.locator(
    '[data-testid="login-submit-pwa"], [data-testid="login-submit"], button[type="submit"]'
  ).first();
  await submit.click();
  // Admins land on /admin; benefactors on /dashboard; onboarding may redirect too.
  await page.waitForURL(/\/(admin|dashboard|home|onboarding|estate|get-started)/, { timeout: 20_000 });
}

test.describe('CarryOn E2E Smoke Path', () => {
  test('01 — Landing page renders without console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/home');
    // Key landing element should be present
    await expect(page.locator('body')).toBeVisible();
    // No hard page-level JavaScript errors
    expect(errors, `Console errors on landing:\n${errors.join('\n')}`).toHaveLength(0);
  });

  test('02 — Login page loads and form is interactive', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    const identifier = page.locator(
      '[data-testid="login-email-input"], [data-testid="login-email-pwa"], [data-testid="login-email"], input[autocomplete="username"]'
    ).first();
    const password = page.locator(
      '[data-testid="login-password-pwa"], [data-testid="login-password"], input[type="password"]'
    ).first();
    await expect(identifier).toBeVisible();
    await expect(password).toBeVisible();
    await identifier.fill('e2e-smoketest@example.com');
    await expect(identifier).toHaveValue('e2e-smoketest@example.com');
  });

  test('03 — Signup page loads and is interactive', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.locator('body')).toBeVisible();
    // Form must have at least one input present
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('04 — Admin login succeeds and lands on authenticated route', async ({ page }) => {
    await loginAsAdmin(page);
    // Confirm we are no longer on /login
    expect(page.url()).not.toMatch(/\/login$/);
  });

  test('05 — Dashboard / post-login landing renders without tile crashes', async ({ page }) => {
    await loginAsAdmin(page);
    // Admin may auto-route to /admin; follow to /dashboard to assert tiles
    await page.goto('/dashboard');
    // Use `load` instead of `networkidle` — our service worker fires
    // background stale-while-revalidate refreshes on every cached API,
    // so strict network-idle never occurs on an SW-enabled app.
    await page.waitForLoadState('load');
    // Give tiles a moment to render their first paint
    await page.waitForTimeout(1500);
    // The benefactor dashboard container or page body should be present
    await expect(page.locator('body')).toBeVisible();
    // Ensure no tile-level error boundary fired
    const tileErrors = page.locator('[data-testid^="tile-error-"]');
    await expect(tileErrors).toHaveCount(0);
  });

  test('06 — Navigate to Settings page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('07 — Speak-with-us public marketing route renders', async ({ page }) => {
    await page.goto('/speak-with-us');
    await expect(page.locator('body')).toBeVisible();
  });

  test('08 — API health probe is green', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBeLessThan(500);
  });
});
