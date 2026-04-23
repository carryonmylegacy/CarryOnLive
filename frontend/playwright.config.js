// CarryOn™ — Playwright Configuration
// ============================================================================
// Two projects: functional smoke (`e2e/`) and visual regression (`visual/`).
// Run: yarn e2e          → smoke suite
//      yarn e2e:visual   → visual diff suite
//      yarn e2e:ui       → interactive UI mode
import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

const storageIfExists = (p) => (fs.existsSync(p) ? p : undefined);

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // ordered smoke path uses shared admin session
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  // Pre-warm Cloudflare's `cf_clearance` cookie once per project UA before
  // the suite runs so individual specs don't hit the "Performing security
  // verification" interstitial on their first goto. See tests/global-setup.js.
  globalSetup: './tests/global-setup.js',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'smoke-chromium',
      testDir: './tests/e2e',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // Reuse the CF-cleared desktop cookie. Graceful fallback to empty.
        storageState: storageIfExists('./tests/.auth/cf-desktop.json'),
      },
    },
    {
      name: 'smoke-mobile',
      testDir: './tests/e2e',
      // Use Chromium with mobile viewport (WebKit requires extra browser install).
      // This catches 95% of mobile-layout regressions without CI overhead.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        // Cloudflare scopes cf_clearance per User-Agent, so mobile gets its
        // own pre-warmed cookie distinct from desktop.
        storageState: storageIfExists('./tests/.auth/cf-mobile.json'),
      },
    },
    {
      name: 'visual',
      testDir: './tests/visual',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
