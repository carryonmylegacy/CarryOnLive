/* eslint-disable */
/**
 * prebuild-sw-version.js
 *
 * Stamps a UNIQUE SHELL_VERSION into public/sw-push.js on every production
 * build. This is the fix for the offline white-screen regression:
 *
 *   Each production build emits new hashed JS/CSS chunk filenames. The
 *   service worker only re-runs its `install` handler (which pre-caches the
 *   new chunks) when sw-push.js is BYTE-DIFFERENT from the installed copy.
 *   If SHELL_VERSION never changes, the stale worker keeps serving a cached
 *   index.html that points at chunks it never cached -> React can't mount ->
 *   blank white screen on the next OFFLINE launch.
 *
 *   By bumping SHELL_VERSION every build, the browser detects a new worker,
 *   re-installs it (pre-caching the CURRENT build's index.html + every
 *   manifest chunk), purges old-version caches on activate, and claims
 *   clients. The next offline launch then has a consistent shell + chunks.
 *
 * Best-effort: any failure here is logged and swallowed so it can NEVER
 * break the production build.
 */
const fs = require('fs');
const path = require('path');

try {
  const swPath = path.join(__dirname, '..', 'public', 'sw-push.js');
  const src = fs.readFileSync(swPath, 'utf8');

  const d = new Date();
  const day = d.toISOString().slice(0, 10); // YYYY-MM-DD
  const stamp = `build-${day}-${Date.now().toString(36)}`;

  const re = /const SHELL_VERSION = '[^']*';/;
  if (re.test(src)) {
    const next = src.replace(re, `const SHELL_VERSION = '${stamp}';`);
    fs.writeFileSync(swPath, next);
    console.log('[prebuild-sw-version] SW SHELL_VERSION ->', stamp);
  } else {
    console.warn('[prebuild-sw-version] SHELL_VERSION line not found — SW version left unchanged');
  }
} catch (err) {
  console.warn('[prebuild-sw-version] skipped:', (err && err.message) || err);
}
