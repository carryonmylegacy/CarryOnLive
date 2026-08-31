// CarryOn™ Service Worker — App Shell + Push Notifications
// ============================================================================
// This single file handles BOTH:
//   1. Progressive-Web-App shell caching (precache + runtime strategies)
//      → home-screen icon launches instantly; basic tiles and navigation
//        work offline after the first visit.
//   2. Push notification delivery + badge management (unchanged behaviour
//      from the original push-only service worker).
//
// The filename remains `sw-push.js` so all existing registration call-sites
// in `components/PushPrompt.js`, `components/NotificationSettings.js`, and
// `utils/pwaBadge.js` keep working without change.
// ============================================================================

// ── Versioning ──────────────────────────────────────────────────────────────
// Bump SHELL_VERSION whenever the list of precached shell assets or the
// caching strategy changes — triggers a cache purge on next SW activation.
const SHELL_VERSION = 'build-2026-08-31-mthqgcxx';
const SHELL_CACHE = `carryon-shell-${SHELL_VERSION}`;
const RUNTIME_CACHE = `carryon-runtime-${SHELL_VERSION}`;
const API_CACHE = `carryon-api-${SHELL_VERSION}`;
const IMAGE_CACHE = `carryon-images-${SHELL_VERSION}`;

// audit 18a9d44 F-18-01 — authenticated API responses are cached in a cache
// PARTITIONED BY SIGNED-IN USER. The app posts SET_CACHE_ID after login; until
// it does, the SW refuses to cache API GETs at all (network-only). On logout we
// delete only the active user's API/image cache and clear the namespace so a
// later user on the same device can never read a previous user's cached PII.
let apiCacheId = '';
function apiCacheName() {
  return apiCacheId ? `${API_CACHE}-${apiCacheId}` : null;
}
function userImageCacheName() {
  return apiCacheId ? `${IMAGE_CACHE}-${apiCacheId}` : IMAGE_CACHE;
}
// The "app shell" — static files the PWA needs to render the first frame
// with chrome + branding. These all come from /public/ so their URLs are
// stable across deploys. The login-page brand logo MUST be here — if it's
// missing, a cold-start-while-offline user sees a broken-image box where
// the CarryOn logo should be.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/splash.jpg',
  '/carryon-icon.jpg',
  '/carryon-logo.png',          // HTML boot splash logo + login brand mark
  '/carryon-app-icon.png',      // In-app upper-left portal switcher (transparent)
  '/carryon-app-icon.jpg',      // Legacy iOS/Android home-screen icon (kept for cache compat)
  '/flag-bg.jpg',               // HTML boot splash flag background + homepage hero
  '/icon-192.png',
  '/icon-512.png',
  '/notification-icon-64.png',  // Web-push reserve
  '/notification-icon-128.png', // Web-push toast icon (crisp at 64-128px)
  '/notification-badge-96.png', // Android tray mono silhouette
  '/apple-touch-icon-180.png',  // macOS Safari notification permission toast
  // pdf.js workers — REQUIRED offline. Without these, react-pdf can't spin
  // up its worker, so the SDV viewer shows "Could not render PDF" and the
  // document thumbnails never render. They are public static files (NOT in
  // asset-manifest.json), so they must be precached explicitly.
  '/pdf.worker.react-pdf.min.mjs', // react-pdf viewer + DocThumbnail
  '/pdf.worker.min.mjs',           // standalone pdfjs (kept for compat)
];

// Hard-coded HTML served when ALL cache lookups fail AND the network is
// unreachable. Self-contained — NO external assets referenced, so it
// renders even if every precached file is missing. The user sees a
// branded splash + a clear "you're offline" message instead of a white
// blank WebView error page. On reconnect, tapping "Try again" forces a
// navigation back through the SW, which will then serve the real shell.
const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0B1221" />
  <title>CarryOn — Offline</title>
  <style>
    html,body{margin:0;padding:0;height:100%;background:#0B1221;color:#F4E7C1;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;}
    .wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;}
    .badge{width:96px;height:96px;border-radius:22px;background:linear-gradient(135deg,#0F1A33 0%,#1E3A5F 50%,#0B1221 100%);display:flex;align-items:center;justify-content:center;box-shadow:0 12px 36px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.08);margin-bottom:28px;}
    .badge svg{width:52px;height:52px;}
    h1{font-size:22px;margin:0 0 8px;font-weight:600;letter-spacing:0.01em;color:#F4E7C1;}
    p{font-size:14px;line-height:1.55;margin:0 0 24px;max-width:320px;color:rgba(244,231,193,0.75);}
    .btn{appearance:none;border:0;background:#d4af37;color:#0B1221;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;cursor:pointer;box-shadow:0 8px 22px rgba(212,175,55,0.3);-webkit-tap-highlight-color:transparent;}
    .btn:active{transform:scale(0.97);}
    .tag{font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin-top:32px;color:rgba(244,231,193,0.4);}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="badge" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 20c3-5 9-5 12 0s9 5 12 0c3-5 9-5 12 0M16 44c3-5 9-5 12 0s9 5 12 0c3-5 9-5 12 0" stroke="#d4af37" stroke-width="3" stroke-linecap="round" fill="none"/>
        <circle cx="32" cy="32" r="4" fill="#d4af37"/>
      </svg>
    </div>
    <h1>You're offline</h1>
    <p>CarryOn couldn't reach the server. Your saved data is safe. When you're back online, tap the button below.</p>
    <button class="btn" onclick="location.reload()">Try again</button>
    <div class="tag">CarryOn&trade;</div>
  </div>
</body>
</html>`;

// API endpoints that are SAFE to cache (idempotent reads, no sensitive data
// that changes per-second). Matched by path prefix. ONLY GET requests are
// ever intercepted (see fetch handler), so POST/PUT/DELETE bypass.
//
// Why these prefixes: the Dashboard fires ~10 parallel reads on every
// estate change. Without these in SWR, every navigation back to the
// dashboard waits on 10 network round-trips. With SWR the cached payload
// paints instantly and the network refresh happens in the background.
// Post-Render migration each round-trip costs ~50-80ms more than it did
// on Railway, so the cumulative penalty was making every page feel
// sluggish even after the SPA was warm.
const CACHEABLE_API_PREFIXES = [
  '/api/dashboard/tiles',
  '/api/beneficiaries/',
  '/api/estates',          // /api/estates (list) + /api/estates/{id} — cache so the
                           // beneficiary Hub + Dashboard switcher survive airplane mode
  '/api/estate/',          // /api/estate/{id}/readiness
  '/api/estate-chat/contacts',
  '/api/subscriptions/enabled-features',
  '/api/subscriptions/status',
  '/api/auth/me',
  '/api/notification-prefs',
  '/api/share-cards/voices',
  '/api/documents/',       // /api/documents/{estateId}
  '/api/messages/',        // /api/messages/{estateId}
  '/api/checklists/',      // /api/checklists/{estateId}
  '/api/onboarding/',      // /api/onboarding/progress
  '/api/ccp/',             // /api/ccp/plans/{estateId}
  '/api/financial/',       // /api/financial/summary/{estateId}
  '/api/pdfs/',            // /api/pdfs/latest
  '/api/guardian/',        // /api/guardian/iac-task-status
];

// API paths that MUST NEVER be cached (sensitive, realtime, or mutative).
const API_NEVER_CACHE = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/webhook/',
  '/api/stripe/',
  '/api/admin/',
];

// Sensitive API SUBPATHS that must NEVER be cached even though their parent
// prefix is cacheable — decrypted documents, message media, and chat files.
// The Cache API ignores Cache-Control, so the SW itself must refuse to cache
// (and refuse to image-cache) these. Backend also sends Cache-Control: no-store
// on the responses (audit 512bd5c F-18-01).
const API_NEVER_CACHE_PATTERNS = [
  /^\/api\/documents\/[^/]+\/download/,
  /^\/api\/documents\/[^/]+\/preview/,
  /^\/api\/messages\/video\//,
  /^\/api\/messages\/voice\//,
  /^\/api\/messages\/[^/]+\/attachment/,
  /^\/api\/messages\/[^/]+\/download/,
  /^\/api\/estate-chat\/files\//,
  // Generated, highly sensitive financial dossier / exports (audit fa1ad83 #6).
  /^\/api\/financial\/handoff-package\//,
];

function isNeverCacheApi(url) {
  if (API_NEVER_CACHE.some((p) => url.pathname.startsWith(p))) return true;
  return API_NEVER_CACHE_PATTERNS.some((re) => re.test(url.pathname));
}

// Authorization-sensitive API routes whose access can be REVOKED. These must be
// network-first so a revoked beneficiary never sees stale section data while
// online; on 401/403 we drop the cached copy and tell clients to purge local
// mirrors. Cache is only a fallback for true offline (audit fa1ad83 #5).
const AUTHZ_SENSITIVE_API_PREFIXES = [
  '/api/documents/',
  '/api/messages/',
  '/api/checklists/',
  '/api/financial/',
  '/api/estate-chat/contacts',
  '/api/ccp/',
  '/api/guardian/',
  '/api/beneficiaries/',
];

function isAuthzSensitiveApi(url) {
  return AUTHZ_SENSITIVE_API_PREFIXES.some((p) => url.pathname.startsWith(p));
}

// ── Install: precache the shell ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing', SHELL_VERSION);
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(async (cache) => {
        // IMPORTANT: cache.addAll is atomic — if ANY url 404s the ENTIRE
        // precache rejects and the shell cache is left empty. That caused
        // a cold-boot stall where the boot splash couldn't find any asset.
        // Switch to independent `cache.add` calls so each asset is
        // best-effort and a single missing file can't brick the whole SW.
        await Promise.all(PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Precache skipped ${url}:`, err?.message || err);
          })
        ));
        // Parse index.html and precache its hashed JS/CSS bundles into
        // the runtime cache. CRITICAL for offline boot: on first page
        // load the SW isn't yet controlling, so the browser fetches
        // main.*.js directly — bypassing the SW, never populating the
        // cache. When the user next opens the app offline, the HTML
        // loads but the JS bundle 404s and React never mounts (blank
        // white page). Fetching index.html here and pre-seeding the
        // bundle URLs guarantees they're in cache before any offline
        // launch.
        try {
          const indexResp = await fetch('/index.html', { cache: 'no-store' });
          if (indexResp && indexResp.ok) {
            const html = await indexResp.text();
            const scriptUrls = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)).map((m) => m[1]);
            const cssUrls = Array.from(html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/g)).map((m) => m[1]);
            const bundleUrls = [...scriptUrls, ...cssUrls]
              .map((u) => (u.startsWith('http') ? u : u.replace(/^\/+/, '/')))
              // Only same-origin /static/ bundles; skip external scripts.
              .filter((u) => u.startsWith('/static/') || u.startsWith(self.location.origin + '/static/'));
            const runtimeCache = await caches.open(RUNTIME_CACHE);
            await Promise.all(bundleUrls.map((u) =>
              runtimeCache.add(u).catch((err) => {
                console.warn(`[SW] Bundle precache skipped ${u}:`, err?.message || err);
              })
            ));
            console.log(`[SW] Precached ${bundleUrls.length} bundle(s)`);
          }
        } catch (e) {
          console.warn('[SW] Bundle precache failed:', e?.message || e);
        }
        // ALSO precache every hashed chunk listed in asset-manifest.json.
        // index.html only references the ENTRY bundles; lazy route chunks
        // (e.g. /static/js/1418.*.chunk.js) load on demand and otherwise
        // 404 offline (ChunkLoadError) on any page the user hasn't visited
        // yet. The manifest enumerates EVERY chunk for this build, so this
        // guarantees full offline navigation after the SW installs.
        try {
          const manifestResp = await fetch('/asset-manifest.json', { cache: 'no-store' });
          if (manifestResp && manifestResp.ok) {
            const manifest = await manifestResp.json();
            const files = manifest && manifest.files ? Object.values(manifest.files) : [];
            const chunkUrls = files.filter((u) =>
              typeof u === 'string' && u.startsWith('/static/') && /\.(js|css)$/i.test(u));
            const runtimeCache = await caches.open(RUNTIME_CACHE);
            await Promise.all(chunkUrls.map((u) =>
              runtimeCache.add(u).catch((err) => {
                console.warn(`[SW] Chunk precache skipped ${u}:`, err?.message || err);
              })
            ));
            console.log(`[SW] Precached ${chunkUrls.length} chunk(s) from manifest`);
          }
        } catch (e) {
          console.warn('[SW] Manifest chunk precache failed:', e?.message || e);
        }
      })
      // NOTE: we intentionally do NOT call self.skipWaiting() here.
      // The new worker stays in the "waiting" state so the app can show
      // a "New version available — tap to refresh" prompt and only
      // activate (via the SKIP_WAITING message) when the user taps.
      // This stops the open page from silently running stale code until
      // a full app close/reopen (the recurring PWA-cache complaint).
  );
});

// ── Activate: purge old-version caches + claim clients ──────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating', SHELL_VERSION);
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      // Drop any carryon-* cache that isn't the current version.
      if (k.startsWith('carryon-') && !k.endsWith(SHELL_VERSION)) {
        console.log('[SW] Purging old cache:', k);
        return caches.delete(k);
      }
      return null;
    }));
    // Enable navigation preload so network fetches start in parallel with SW startup.
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
  })());
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function isCacheableApiRequest(url) {
  if (!url.pathname.startsWith('/api/')) return false;
  if (isNeverCacheApi(url)) return false;
  return CACHEABLE_API_PREFIXES.some((p) => url.pathname.startsWith(p));
}

function isImageRequest(url, request) {
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|avif|heic|heif)$/i)) return true;
  // Chat attachment endpoint — either variant=thumb or original.
  if (url.pathname.startsWith('/api/estate-chat/files/')) return true;
  if (url.pathname.startsWith('/api/share-cards/image/')) return true;
  // Profile / estate / beneficiary photo endpoints (when served same-origin).
  if (/\/photo(\/|$|\?)/.test(url.pathname)) return true;
  if (/\/avatar(\/|$|\?)/.test(url.pathname)) return true;
  // Cross-origin S3 / R2 / CloudFront presigned photo URLs — the
  // `destination` field is set by the browser for <img> elements.
  if (request.destination === 'image') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('image/');
}

function isBundleAsset(url) {
  return url.pathname.startsWith('/static/') ||
         url.pathname.match(/\.(js|mjs|css|woff2?|ttf|otf|eot)$/i);
}

// Stale-while-revalidate: return cache (if any), then update in background.

// Network-first for authorization-sensitive API routes (audit fa1ad83 #5).
// While online, ALWAYS hit the network so revocation is respected immediately.
// On 401/403 we delete any cached copy and notify clients to purge local
// mirrors. Cache is used only when the network actually fails (offline).
async function networkFirstApi(request, cacheName) {
  const cache = cacheName ? await caches.open(cacheName) : null;
  try {
    const response = await fetch(request);
    if (response && (response.status === 401 || response.status === 403)) {
      if (cache) await cache.delete(request).catch(() => {});
      try {
        const clientsList = await self.clients.matchAll();
        for (const c of clientsList) {
          c.postMessage({ type: 'AUTHZ_REVOKED', url: request.url, status: response.status });
        }
      } catch (e) { /* no clients */ }
      return response;
    }
    if (cache && response && response.ok) {
      const cc = response.headers.get('Cache-Control') || '';
      if (!cc.includes('no-store')) cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    if (cache) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    throw err;
  }
}

// Produces instant paint with eventual consistency.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((response) => {
    // Don't cache error responses or ones marked no-store.
    if (!response || !response.ok) return response;
    const cc = response.headers.get('Cache-Control') || '';
    if (cc.includes('no-store')) return response;
    // Clone before putting — body can only be read once.
    cache.put(request, response.clone()).catch(() => {});
    return response;
  }).catch(() => cached); // If network fails, fall back to what we had.
  return cached || networkPromise;
}

// Cache-first with fallback to network. For content-addressable resources.
// Never throws — on total failure returns a synthesized 504 response so
// the fetch router can't leave respondWith() dangling.
async function cacheFirst(request, cacheName, ignoreSearch = false) {
  try {
    const cache = await caches.open(cacheName);
    // `ignoreSearch` matches cached images by path, ignoring the query string.
    // S3-presigned avatar/thumbnail URLs carry a DIFFERENT signature
    // (X-Amz-*) every session, so an exact-URL match always missed and the
    // image came back blank offline. Ignoring the query makes the cached copy
    // match regardless of signature.
    const cached = await cache.match(request, { ignoreSearch });
    if (cached) return cached;
    // NOTE: no global caches.match() fallback here — matching across all caches
    // could surface a different user's cached image/file (audit 512bd5c F-18-05).
    const response = await fetch(request);
    // Cache `ok` responses AND opaque cross-origin responses (S3-presigned
    // image URLs, CDN no-cors fetches). Opaque responses have status=0 and
    // response.ok=false but are still valid to cache and replay to an
    // <img> tag — which is exactly what we need for profile/beneficiary
    // photos to survive offline.
    const shouldCache = response && (response.ok || response.type === 'opaque');
    if (shouldCache) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    // Offline and the asset isn't cached yet — return a transparent 504
    // instead of throwing (which would fall through to browser's default
    // broken-image placeholder and can also wedge respondWith).
    return new Response('', { status: 504, statusText: 'Offline and not in cache' });
  }
}

// Network-first with cache fallback. For navigations.
async function networkFirstNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  const cachedShell = async () =>
    (await cache.match('/index.html')) ||
    (await cache.match('/')) ||
    (await cache.match(event.request)) ||
    (await cache.match(new URL(event.request.url).pathname));

  // Fast-path: if the browser already knows we're offline, don't waste
  // a minute waiting for a fetch that will never resolve. Serve the
  // cached shell immediately. This is what rescues airplane-mode cold
  // starts — `event.preloadResponse` can stall ~60s on iOS before
  // failing, leaving the user on a dark blank screen.
  if (self.navigator && self.navigator.onLine === false) {
    const shell = await cachedShell();
    if (shell) return shell;
    // No cached shell at all — serve the inline offline page so the
    // user sees a branded screen instead of a white WebView error.
    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  try {
    // Race the navigation-preload response (and/or a normal fetch) against
    // a 3.5-second timeout. Whichever finishes first wins. If neither
    // succeeds in time, we fall through to the cached shell.
    const netRace = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('nav-timeout')), 3500);
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) { clearTimeout(timer); return resolve(preload); }
          const response = await fetch(event.request);
          clearTimeout(timer);
          resolve(response);
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      })();
    });
    const response = await netRace;
    if (response && response.ok) {
      // Cache under BOTH `/index.html` and `/` so any fallback path
      // matches. Also cache under the requested URL (e.g. `/dashboard`)
      // so a client-side route reload works offline too.
      cache.put('/index.html', response.clone()).catch(() => {});
      cache.put('/', response.clone()).catch(() => {});
      cache.put(event.request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    // Offline (or network timeout): serve the cached app shell so the
    // user sees the splash + UI skeleton instead of the browser's "No
    // Internet" page. React will then show its own loading states for
    // any data that can't be fetched.
    const shell = await cachedShell();
    if (shell) return shell;
    // Ultimate fallback — a self-contained offline splash baked into
    // the SW. No external assets required; renders even if every
    // precached file is missing (e.g. private-browsing install races).
    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

// ── Fetch router ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Never intercept non-GET: POST/PUT/DELETE must always go to network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Sensitive authenticated media (decrypted docs, message video/voice/
  // attachments, chat files) is NEVER cached by the SW — access can be revoked
  // by deletion, section-disable, or transition. Let it go straight to network
  // so the server's auth + Cache-Control: no-store govern it (audit 512bd5c F-18-01).
  if (url.origin === self.location.origin && isNeverCacheApi(url)) return;
  // Same-origin requests: run the full router below.
  // Cross-origin requests: only intercept IMAGE GETs so S3-presigned
  // profile photos / beneficiary avatars / estate photos are cache-first
  // and survive a reconnect-offline cycle. Everything else third-party
  // (Stripe, Google Fonts, Analytics) still bypasses the SW entirely.
  if (url.origin !== self.location.origin) {
    if (isImageRequest(url, request)) {
      event.respondWith(cacheFirst(request, userImageCacheName(), true));
    }
    return;
  }

  // 1) Top-level navigations (HTML) → network-first, offline shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  // 2) Bundle assets (hashed JS/CSS, fonts) → cache-first. Cache is
  //    authoritative: if we've got it, serve instantly. If the cache
  //    misses, fall back to network. If network fails too (airplane
  //    mode), `cacheFirst` returns a synthesized 504 rather than
  //    `undefined` — which is what was causing the cold-boot white
  //    screen (respondWith(undefined) leaves the WebView hanging with
  //    no JS bundle, so React never mounts).
  if (isBundleAsset(url)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // 3) Images (PNG/JPG/etc. + chat/share-card image endpoints + avatar
  //    endpoints) → cache-first.
  if (isImageRequest(url, request)) {
    event.respondWith(cacheFirst(request, userImageCacheName(), true));
    return;
  }

  // 4) Authorization-sensitive API GETs → NETWORK-FIRST so revocation is
  // respected immediately while online; cache is an offline-only fallback
  // (audit fa1ad83 #5).
  if (isAuthzSensitiveApi(url)) {
    event.respondWith(networkFirstApi(request, apiCacheName()));
    return;
  }

  // 5) Other cacheable API GETs → stale-while-revalidate, but ONLY within the
  // signed-in user's partitioned cache. Without an established cache identity
  // we go network-only so authenticated data is never cached unattributed
  // (audit 18a9d44 F-18-01).
  if (isCacheableApiRequest(url)) {
    const name = apiCacheName();
    if (name) {
      event.respondWith(staleWhileRevalidate(request, name));
    }
    return;
  }

  // Everything else: default network behaviour (no SW interception).
});

// ── Message handler: allow the app to purge caches on logout ────────────────
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'CLEAR_BADGE') {
    if (navigator.clearAppBadge) navigator.clearAppBadge();
  } else if (event.data.type === 'SET_BADGE') {
    const count = event.data.count || 0;
    if (count > 0 && navigator.setAppBadge) navigator.setAppBadge(count);
    else if (navigator.clearAppBadge) navigator.clearAppBadge();
  } else if (event.data.type === 'SET_CACHE_ID') {
    // App establishes the signed-in user's cache namespace after login so
    // authenticated API GETs are cached per-user (audit 18a9d44 F-18-01).
    apiCacheId = String(event.data.cacheId || '');
  } else if (event.data.type === 'CLEAR_APP_CACHES') {
    // Called by the app on logout — wipes ALL partitioned authenticated API and
    // image caches (every `carryon-api-*` / `carryon-images-*`, not just the
    // active namespace), so no prior user's data survives on a shared device.
    // App-shell/static caches are preserved for PWA launch (audit fa1ad83 #7).
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('carryon-api-') || k.startsWith('carryon-images-'))
          .map((k) => caches.delete(k).catch(() => {})),
      );
      apiCacheId = '';
    })());
  } else if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'GET_DIAG') {
    // On-device diagnostics: report the controlling SW version + a true
    // count of what's ACTUALLY cached vs what the build manifest expects.
    // This is how we tell, on a real device, whether precache completed.
    // Replies on the MessageChannel port the client opened.
    const port = event.ports && event.ports[0];
    event.waitUntil((async () => {
      const result = { version: SHELL_VERSION, caches: {} };
      try {
        const names = [SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE, API_CACHE];
        for (const n of names) {
          try {
            const c = await caches.open(n);
            const keys = await c.keys();
            result.caches[n] = keys.length;
          } catch { result.caches[n] = -1; }
        }
        // audit d5a54f5e P3 — runtime caches are PARTITIONED per estate/api id
        // (e.g. carryon-api-<v>-<id>, carryon-images-<v>). The four named caches
        // above miss those partitions and under-report true offline readiness.
        // Enumerate every partition and report per-family cache + entry totals.
        try {
          const allNames = await caches.keys();
          const partitioned = {
            api: { caches: 0, entries: 0 },
            images: { caches: 0, entries: 0 },
          };
          for (const n of allNames) {
            const fam = n.startsWith('carryon-api-')
              ? 'api'
              : (n.startsWith('carryon-images-') ? 'images' : null);
            if (!fam) continue;
            try {
              const c = await caches.open(n);
              const cnt = (await c.keys()).length;
              partitioned[fam].caches += 1;
              partitioned[fam].entries += cnt;
              result.caches[n] = cnt;
            } catch { /* skip unreadable partition */ }
          }
          result.partitioned = partitioned;
          result.totalCacheCount = allNames.length;
        } catch { /* caches.keys() unavailable */ }
        result.pdfWorkerReactCached = !!(await caches.match('/pdf.worker.react-pdf.min.mjs'));
        result.pdfWorkerStdCached = !!(await caches.match('/pdf.worker.min.mjs'));
        result.shellLogoCached = !!(await caches.match('/carryon-logo.png'));
        // Expected vs cached app chunks (the real offline-readiness gauge).
        try {
          const mResp = await fetch('/asset-manifest.json', { cache: 'no-store' });
          const m = await mResp.json();
          const files = (m && m.files ? Object.values(m.files) : []).filter(
            (u) => typeof u === 'string' && u.startsWith('/static/') && /\.(js|css)$/i.test(u));
          result.expectedChunks = files.length;
          let cached = 0; const missing = [];
          for (const u of files) {
            if (await caches.match(u)) cached += 1; else missing.push(u);
          }
          result.cachedChunks = cached;
          result.missingCount = missing.length;
          result.missingSample = missing.slice(0, 12);
          result.online = true;
        } catch (e) {
          result.online = false;
          result.manifestError = (e && e.message) || String(e);
        }
      } catch (e) {
        result.error = (e && e.message) || String(e);
      }
      if (port) port.postMessage(result);
    })());
  } else if (event.data.type === 'REARM_CACHE') {
    // Force a FULL re-precache: shell assets + pdf workers + every chunk in
    // the build manifest, bypassing the HTTP cache (`cache: 'reload'`).
    // Reports done/total + the exact URLs that failed so we can see WHY a
    // device never became offline-ready (quota, 404, network). Replies on
    // the client's MessageChannel port.
    const port = event.ports && event.ports[0];
    event.waitUntil((async () => {
      const report = { total: 0, done: 0, failed: [] };
      try {
        const shell = await caches.open(SHELL_CACHE);
        for (const u of PRECACHE_URLS) {
          report.total += 1;
          try { await shell.add(new Request(u, { cache: 'reload' })); report.done += 1; }
          catch (e) { report.failed.push({ u, err: (e && e.name) || 'err' }); }
        }
        const runtimeCache = await caches.open(RUNTIME_CACHE);
        const mResp = await fetch('/asset-manifest.json', { cache: 'no-store' });
        const m = await mResp.json();
        const files = (m && m.files ? Object.values(m.files) : []).filter(
          (u) => typeof u === 'string' && u.startsWith('/static/') && /\.(js|css)$/i.test(u));
        for (const u of files) {
          report.total += 1;
          try { await runtimeCache.add(new Request(u, { cache: 'reload' })); report.done += 1; }
          catch (e) { report.failed.push({ u, err: (e && e.name) || 'err' }); }
        }
        report.ok = report.failed.length === 0;
      } catch (e) {
        report.error = (e && e.message) || String(e);
      }
      if (port) port.postMessage(report);
    })());
  } else if (event.data.type === 'CACHE_URLS') {
    // Client telling the SW "please make sure these are cached." Sent
    // from index.js right after SW takes control, so any hashed JS/CSS
    // bundles that the browser already fetched uncontrolled on first
    // load get copied into RUNTIME_CACHE. Without this, a user's very
    // first offline launch can white-screen because the main bundle is
    // referenced in the HTML but isn't in any cache.
    const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
    event.waitUntil((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      await Promise.all(urls.map(async (u) => {
        try {
          // Skip re-fetching anything already cached — the client posts the
          // FULL build manifest on every online load, so without this guard
          // we'd re-download every chunk each launch.
          if (await cache.match(u)) return;
          await cache.add(u);
        } catch (err) {
          console.warn(`[SW] Client-requested cache skipped ${u}:`, err?.message || err);
        }
      }));
      // If EVERY posted bundle is now in cache, the app can render fully
      // offline. Tell the clients so they can flash a brief "Ready for
      // offline use" confirmation pill (the app dedupes to once/session).
      try {
        const present = await Promise.all(urls.map((u) => cache.match(u)));
        if (urls.length > 0 && present.every(Boolean)) {
          const cl = await self.clients.matchAll({ includeUncontrolled: true });
          cl.forEach((c) => c.postMessage({ type: 'OFFLINE_READY', total: urls.length }));
        }
      } catch { /* no-op */ }
    })());
  }
});

// ── Push Notifications (unchanged behaviour) ────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Push received.');
  let data = { title: 'CarryOn™', body: 'You have a new notification', icon: '/notification-icon-128.png' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    console.error('Error parsing push data:', e);
  }
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/notification-icon-128.png',
    // Android strips color from `badge` and re-tints it; a white
    // silhouette on transparent bg reads far sharper than a flattened
    // color logo. iOS/macOS ignore `badge`, so this is Android-only.
    badge: '/notification-badge-96.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/', type: data.type || 'general' },
    actions: data.actions || [],
    tag: data.tag || 'carryon-notification',
    renotify: true,
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'CarryOn™', options).then(() => {
      if (navigator.setAppBadge) {
        return self.registration.getNotifications().then((ns) => navigator.setAppBadge(ns.length));
      }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    self.registration.getNotifications()
      .then((ns) => {
        if (navigator.setAppBadge) {
          if (ns.length > 0) navigator.setAppBadge(ns.length);
          else navigator.clearAppBadge();
        }
      })
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  event.waitUntil(
    self.registration.getNotifications().then((ns) => {
      if (navigator.setAppBadge) {
        if (ns.length > 0) navigator.setAppBadge(ns.length);
        else navigator.clearAppBadge();
      }
    })
  );
});
