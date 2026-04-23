// CarryOn — Playwright Global Setup
// ============================================================================
// Runs ONCE before the entire test suite. Launches a real Chromium browser
// against the preview URL, waits out any Cloudflare "Performing security
// verification" interstitial, and persists the resulting cookies (including
// `cf_clearance`) to `tests/.auth/cf.json`.
//
// Every test in the suite then starts with this `storageState` preloaded, so
// Cloudflare sees a trusted browser and skips the challenge entirely. This
// eliminates the first-attempt `locator.fill: Timeout` flakes we were seeing
// on cold CI runs.
//
// If CF isn't up at the time of setup, the empty storageState is still
// written — tests still function, just without the pre-warmed cookie.

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const BASE = process.env.E2E_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
  const outDir = path.resolve(__dirname, '.auth');
  const outFile = path.join(outDir, 'cf.json');
  fs.mkdirSync(outDir, { recursive: true });

  const start = Date.now();
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait out Cloudflare challenge if present (up to 30s).
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const cf = await page.locator('text=Performing security verification').count().catch(() => 0);
      if (cf === 0) break;
      await page.waitForTimeout(1500);
    }
    // Give the page a beat to fully settle and set any final cookies.
    await page.waitForTimeout(1500);
  } catch (e) {
    // Never fail the whole suite because of warmup — just log and continue.
    // Individual specs each have their own CF-aware retry fallback.
    // eslint-disable-next-line no-console
    console.warn(`[global-setup] CF warmup failed (continuing): ${e.message}`);
  }

  await context.storageState({ path: outFile });
  await browser.close();
  // eslint-disable-next-line no-console
  console.log(`[global-setup] CF warmup done in ${Date.now() - start}ms → ${outFile}`);
};
