// CarryOn — Playwright Global Setup
// ============================================================================
// Runs ONCE before the entire test suite. Launches a real Chromium browser
// against the preview URL, waits out any Cloudflare "Performing security
// verification" interstitial, and persists the resulting cookies (including
// `cf_clearance`) to `tests/.auth/cf-desktop.json` AND `cf-mobile.json`.
//
// We warm up both UAs because Cloudflare scopes `cf_clearance` to the
// User-Agent that solved the challenge — a desktop-UA cookie does not work
// for the iPhone-UA mobile project.
//
// Every test in the suite then starts with the appropriate `storageState`
// preloaded, so Cloudflare sees a trusted browser and skips the challenge
// entirely. This eliminates the first-attempt `locator.fill: Timeout`
// flakes we were seeing on cold CI runs.
//
// If CF isn't up at the time of setup, an empty storageState is still
// written — tests still function, just without the pre-warmed cookie
// (per-spec retry logic is the fallback).

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/16.0 Mobile/15E148 Safari/604.1';

async function warmUp(browser, { label, contextOpts, outFile, baseUrl }) {
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const start = Date.now();
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
    // eslint-disable-next-line no-console
    console.warn(`[global-setup] ${label} CF warmup failed (continuing): ${e.message}`);
  }
  await context.storageState({ path: outFile });
  await context.close();
  // eslint-disable-next-line no-console
  console.log(`[global-setup] ${label} CF warmup done in ${Date.now() - start}ms → ${outFile}`);
}

module.exports = async () => {
  const BASE = process.env.E2E_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
  const outDir = path.resolve(__dirname, '.auth');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  await warmUp(browser, {
    label: 'desktop',
    contextOpts: { viewport: { width: 1440, height: 900 } },
    outFile: path.join(outDir, 'cf-desktop.json'),
    baseUrl: BASE,
  });
  await warmUp(browser, {
    label: 'mobile',
    contextOpts: {
      viewport: { width: 390, height: 844 },
      userAgent: MOBILE_UA,
      isMobile: true,
      hasTouch: true,
    },
    outFile: path.join(outDir, 'cf-mobile.json'),
    baseUrl: BASE,
  });
  await browser.close();
};
