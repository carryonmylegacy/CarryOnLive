/* Build step — lists /guides in the sitemap and queues it for prerender ONLY once the founder
 * has pressed Launch (Admin → Marketing → Guides). Reads the live flag from the API the build
 * is pointed at (REACT_APP_BACKEND_URL), so a plain Redeploy after launching is enough.
 * Fail-soft: any problem leaves the build exactly as it was. */

const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const ROUTES_FILE = path.join(BUILD_DIR, '.guides-routes.json');
const SITEMAP = path.join(BUILD_DIR, 'sitemap.xml');
const ORIGIN = 'https://www.carryon.us';

function guideSlugs() {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'copy', 'siteCopyGuides.js'), 'utf8');
  return [...src.matchAll(/^\s*slug: '([a-z0-9-]+)'/gm)].map((m) => m[1]);
}

(async () => {
  try { fs.unlinkSync(ROUTES_FILE); } catch { /* nothing to clear */ }
  const api = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');
  if (!api) { console.log('guides-launch: REACT_APP_BACKEND_URL not set — guides left unlisted'); return; }
  let status;
  try {
    const res = await fetch(`${api}/api/public/guides/status`, { signal: AbortSignal.timeout(15000) });
    status = await res.json();
  } catch (e) {
    console.warn(`guides-launch: could not read launch flag (${e.message}) — guides left unlisted`);
    return;
  }
  if (!status || !status.launched) { console.log('guides-launch: not launched — /guides stays out of the sitemap'); return; }

  const slugs = guideSlugs();
  const routes = ['/guides', ...slugs.map((s) => `/guides/${s}`)];
  fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes));

  if (fs.existsSync(SITEMAP)) {
    const lastmod = String(status.launched_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const entries = routes.map((r, i) => `  <url><loc>${ORIGIN}${r}</loc><lastmod>${lastmod}</lastmod><changefreq>${i ? 'yearly' : 'monthly'}</changefreq><priority>${i ? '0.6' : '0.7'}</priority></url>`);
    const xml = fs.readFileSync(SITEMAP, 'utf8');
    if (!xml.includes(`${ORIGIN}/guides<`)) {
      fs.writeFileSync(SITEMAP, xml.replace('</urlset>', `${entries.join('\n')}\n</urlset>`));
    }
  }
  console.log(`guides-launch: launched ${lastmodSafe(status)} — ${routes.length} guide routes added to sitemap + prerender`);
})();

function lastmodSafe(status) { return String(status.launched_at || '').slice(0, 10) || 'today'; }
