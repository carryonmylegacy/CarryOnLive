// CarryOn™ — Visual Regression Scaffold (Playwright)
// ============================================================================
// Framework scaffold. To use:
//   1. cd frontend && yarn add -D @playwright/test
//   2. npx playwright install chromium
//   3. Run baseline: npx playwright test tests/visual/ --update-snapshots
//   4. Run check:    npx playwright test tests/visual/
//
// Captures screenshots of critical pages at 2 viewports (mobile/desktop) and
// diffs against committed baseline. CI-ready once yarn add is done.
//
// NOTE: Baselines (__screenshots__/) should be committed so CI runs have a
// reference. Expect some noise on font-rendering — baseline in Linux to match CI.

import { test, expect } from '@playwright/test';

const BASE = process.env.VISUAL_BASE_URL || 'http://localhost:3000';

const ROUTES = [
  { name: 'home',       path: '/home' },
  { name: 'login',      path: '/login' },
  { name: 'signup',     path: '/signup' },
  { name: 'speak-with-us', path: '/speak-with-us' },
];

const VIEWPORTS = [
  { name: 'mobile',  width: 390,  height: 844 }, // iPhone 14
  { name: 'desktop', width: 1440, height: 900 },
];

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    test(`${route.name} @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
      // Wait for fonts + initial motion to settle
      await page.waitForTimeout(800);
      // Kill animations for stable diffs
      await page.addStyleTag({
        content: `*, *::before, *::after {
          animation: none !important;
          transition: none !important;
        }`,
      });
      await expect(page).toHaveScreenshot(`${route.name}-${vp.name}.png`, {
        fullPage: false,
        maxDiffPixelRatio: 0.02, // allow 2% difference (font rendering nuances)
      });
    });
  }
}
