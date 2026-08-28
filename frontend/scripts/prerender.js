/* Build-time prerender — snapshots every PUBLIC route of the built SPA into
 * static HTML (build/<route>/index.html) so crawlers and AI agents see real
 * text instead of an empty shell. Logged-in areas are never prerendered:
 * they fall back to the pristine SPA shell (build/shell.html) via the
 * vercel.json catch-all rewrite.
 *
 * Chromium strategy (in order):
 *   1. PRERENDER_CHROME env override (path to a chrome binary)
 *   2. @sparticuz/chromium — a Chromium build made for Vercel/AWS build
 *      machines (Amazon Linux), bundled as a regular dependency
 *   3. A Playwright-cache chromium if one is installed (local dev)
 *
 * Runs after `yarn build` (see build-prod.sh). Fail-soft by default so a
 * Chromium hiccup never blocks a deploy; set PRERENDER_STRICT=1 to fail hard.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const PORT = process.env.PRERENDER_PORT ? Number(process.env.PRERENDER_PORT) : 4173;
const STRICT = process.env.PRERENDER_STRICT === '1';

// Public, static-path routes only. No dynamic params, no auth-gated pages.
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/about',
  '/voices',
  '/security',
  '/wind-down-promise',
  '/privacy',
  '/terms',
  '/speak-with-us',
  '/home',
  '/landing-consumer',
  '/our-promise',
  '/founder-about',
  '/founder',
  '/get-started',
  '/partner-brief',
  '/quickstart/try',
  '/partner',
];

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mjs': 'application/javascript', '.map': 'application/json', '.txt': 'text/plain',
  '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};

// Tiny static server over build/ with SPA fallback to the PRISTINE shell so
// every route renders the un-prerendered app during snapshotting.
function startServer(shellHtml) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(BUILD_DIR, urlPath);
    if (filePath.startsWith(BUILD_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(shellHtml);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function chromiumCandidates() {
  const candidates = [];
  if (process.env.PRERENDER_CHROME) {
    candidates.push({ name: 'env override', executablePath: process.env.PRERENDER_CHROME, extraArgs: [] });
  }
  // @sparticuz/chromium ships x86_64 Linux binaries (Vercel/AWS build machines).
  if (process.platform === 'linux' && process.arch === 'x64') {
    try {
      const mod = require('@sparticuz/chromium');
      const sparticuz = mod && mod.default ? mod.default : mod;
      const executablePath = await sparticuz.executablePath();
      if (executablePath && fs.existsSync(executablePath)) {
        candidates.push({ name: '@sparticuz/chromium', executablePath, extraArgs: sparticuz.args || [] });
      }
    } catch (e) {
      console.warn(`prerender: @sparticuz/chromium unavailable (${e.message.split('\n')[0]})`);
    }
  }
  // Playwright-managed chromium (local dev / CI).
  try {
    const { chromium } = require('@playwright/test');
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) candidates.push({ name: 'playwright chromium', executablePath: p, extraArgs: [] });
  } catch (e) { /* playwright not installed — fine */ }
  return candidates;
}

async function snapshot(page, route) {
  const url = `http://127.0.0.1:${PORT}${route}`;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => {});
  // Wait for React to paint real content into #root.
  await page.waitForFunction(
    () => {
      const r = document.getElementById('root');
      return r && r.innerText && r.innerText.trim().length > 40;
    },
    { timeout: 20000 },
  );
  await new Promise((r) => setTimeout(r, 600)); // settle animations / late effects
  return page.evaluate(() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
}

(async () => {
  if (!fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
    console.error('prerender: build/index.html not found — run yarn build first');
    process.exit(STRICT ? 1 : 0);
  }
  // Prefer the pristine shell (build-prod.sh copies it before we run) so a
  // re-run never uses an already-prerendered index.html as the SPA fallback.
  const shellPath = fs.existsSync(path.join(BUILD_DIR, 'shell.html'))
    ? path.join(BUILD_DIR, 'shell.html')
    : path.join(BUILD_DIR, 'index.html');
  const shellHtml = fs.readFileSync(shellPath, 'utf8');

  const candidates = await chromiumCandidates();
  if (!candidates.length) {
    console.error('prerender: no Chromium executable found — skipping');
    process.exit(STRICT ? 1 : 0);
  }

  let browser = null;
  for (const c of candidates) {
    try {
      browser = await puppeteer.launch({
        executablePath: c.executablePath,
        args: [
          ...c.extraArgs,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
        headless: true,
      });
      console.log(`prerender: using ${c.name} (${c.executablePath})`);
      break;
    } catch (e) {
      console.warn(`prerender: ${c.name} failed to launch (${e.message.split('\n')[0]})`);
    }
  }
  if (!browser) {
    console.error('prerender: every Chromium candidate failed to launch — skipping');
    process.exit(STRICT ? 1 : 0);
  }

  const server = await startServer(shellHtml);
  const page = await browser.newPage();
  // Keep the service worker out of the way during snapshotting.
  await page.evaluateOnNewDocument(() => {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = () => Promise.reject(new Error('prerender: SW disabled'));
    }
  });

  const results = {};
  const failures = [];
  for (const route of PUBLIC_ROUTES) {
    try {
      const html = await snapshot(page, route);
      results[route] = html;
      const textLen = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').length;
      console.log(`prerender: OK   ${route}  (${(html.length / 1024).toFixed(0)} KB, ~${textLen} text chars)`);
    } catch (e) {
      failures.push(route);
      console.error(`prerender: FAIL ${route} — ${e.message.split('\n')[0]}`);
    }
  }

  await browser.close();
  server.close();

  // Write snapshots only after all rendering is done (the server keeps
  // serving the pristine shell for every route while we snapshot).
  for (const [route, html] of Object.entries(results)) {
    const outPath = route === '/'
      ? path.join(BUILD_DIR, 'index.html')
      : path.join(BUILD_DIR, route.slice(1), 'index.html');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
  }

  console.log(`prerender: ${Object.keys(results).length}/${PUBLIC_ROUTES.length} public pages written as static HTML`);
  if (failures.length) {
    console.error(`prerender: failed routes fall back to the SPA shell: ${failures.join(', ')}`);
    if (STRICT) process.exit(1);
  }
  process.exit(0);
})();
