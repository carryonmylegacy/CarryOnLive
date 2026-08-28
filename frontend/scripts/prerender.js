/* Build-time prerender — snapshots every PUBLIC route of the built SPA into
 * static HTML (build/<route>/index.html) so crawlers and AI agents see real
 * text instead of an empty shell. Logged-in areas are never prerendered:
 * they fall back to the pristine SPA shell (build/shell.html) via the
 * vercel.json catch-all rewrite.
 *
 * Runs after `yarn build` (see build-prod.sh). Fail-soft by default so a
 * Chromium hiccup never blocks a deploy; set PRERENDER_STRICT=1 to fail hard.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

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

// Tiny static server over build/ with SPA fallback to the ORIGINAL shell so
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

async function snapshot(page, route) {
  const url = `http://127.0.0.1:${PORT}${route}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  // Wait for React to paint real content into #root.
  await page.waitForFunction(
    () => {
      const r = document.getElementById('root');
      return r && r.innerText && r.innerText.trim().length > 40;
    },
    { timeout: 20000 },
  );
  await page.waitForTimeout(600); // settle animations / late effects
  return page.evaluate(() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
}

(async () => {
  if (!fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
    console.error('prerender: build/index.html not found — run yarn build first');
    process.exit(STRICT ? 1 : 0);
  }
  const shellHtml = fs.readFileSync(path.join(BUILD_DIR, 'index.html'), 'utf8');

  let chromium;
  try {
    ({ chromium } = require('@playwright/test'));
  } catch (e) {
    console.error(`prerender: @playwright/test unavailable (${e.message}) — skipping`);
    process.exit(STRICT ? 1 : 0);
  }

  let browser;
  try {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (e) {
    console.error(`prerender: Chromium failed to launch (${e.message}) — skipping`);
    process.exit(STRICT ? 1 : 0);
  }

  const server = await startServer(shellHtml);
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();

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
