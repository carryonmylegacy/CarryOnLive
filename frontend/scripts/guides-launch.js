/* Build step — founder-controlled switches that decide what the sitemap lists / what gets prerendered:
 *   • /guides (+ each article) once the founder has pressed Launch (Admin → Marketing → Guides)
 *   • /founder-about once the Founder story is switched to Public (Admin → Marketing → Site Content)
 * Reads the live flags from the API the build is pointed at (REACT_APP_BACKEND_URL), so a plain
 * Redeploy after flipping a switch is enough. Fail-soft: any problem leaves the build exactly as it was. */

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

async function readJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  return res.json();
}

function addToSitemap(entries, marker) {
  if (!fs.existsSync(SITEMAP)) return;
  const xml = fs.readFileSync(SITEMAP, 'utf8');
  if (xml.includes(marker)) return;
  fs.writeFileSync(SITEMAP, xml.replace('</urlset>', `${entries.join('\n')}\n</urlset>`));
}

async function guides(api) {
  let status;
  try {
    status = await readJson(`${api}/api/public/guides/status`);
  } catch (e) {
    console.warn(`guides-launch: could not read launch flag (${e.message}) — guides left unlisted`);
    return;
  }
  if (!status || !status.launched) { console.log('guides-launch: not launched — /guides stays out of the sitemap'); return; }

  const slugs = guideSlugs();
  const routes = ['/guides', ...slugs.map((s) => `/guides/${s}`)];
  fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes));

  const lastmod = String(status.launched_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  addToSitemap(
    routes.map((r, i) => `  <url><loc>${ORIGIN}${r}</loc><lastmod>${lastmod}</lastmod><changefreq>${i ? 'yearly' : 'monthly'}</changefreq><priority>${i ? '0.6' : '0.7'}</priority></url>`),
    `${ORIGIN}/guides<`,
  );
  console.log(`guides-launch: launched ${lastmod} — ${routes.length} guide routes added to sitemap + prerender`);
}

async function founderStory(api) {
  let content;
  try {
    content = await readJson(`${api}/api/public/site-content`);
  } catch (e) {
    console.warn(`guides-launch: could not read the Founder story switch (${e.message}) — /founder-about left unlisted`);
    return;
  }
  if (!content || !content.founder_story_public) { console.log('guides-launch: Founder story is invite-only — /founder-about stays out of the sitemap'); return; }
  const today = new Date().toISOString().slice(0, 10);
  addToSitemap(
    [`  <url><loc>${ORIGIN}/founder-about</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq><priority>0.5</priority></url>`],
    `${ORIGIN}/founder-about<`,
  );
  console.log('guides-launch: Founder story is public — /founder-about added to sitemap');
}

(async () => {
  try { fs.unlinkSync(ROUTES_FILE); } catch { /* nothing to clear */ }
  const api = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');
  if (!api) { console.log('guides-launch: REACT_APP_BACKEND_URL not set — launch-gated routes left unlisted'); return; }
  await guides(api);
  await founderStory(api);
})();
