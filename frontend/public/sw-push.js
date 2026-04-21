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
const SHELL_VERSION = 'v13-2026-02-21-sw-inline-offline-fallback';
const SHELL_CACHE = `carryon-shell-${SHELL_VERSION}`;
const RUNTIME_CACHE = `carryon-runtime-${SHELL_VERSION}`;
const API_CACHE = `carryon-api-${SHELL_VERSION}`;
const IMAGE_CACHE = `carryon-images-${SHELL_VERSION}`;

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
  '/carryon-app-icon.jpg',      // iOS/Android home-screen icon
  '/flag-bg.jpg',               // HTML boot splash flag background + homepage hero
  '/icon-192.png',
  '/icon-512.png',
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
// that changes per-second). Matched by path prefix.
const CACHEABLE_API_PREFIXES = [
  '/api/dashboard/tiles',
  '/api/beneficiaries/',
  '/api/estates/',
  '/api/estate-chat/contacts',
  '/api/subscriptions/enabled-features',
  '/api/subscriptions/status',
  '/api/auth/me',
  '/api/notification-prefs',
  '/api/share-cards/voices',
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
      })
      .then(() => self.skipWaiting())
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
    await clients.claim();
  })());
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function isCacheableApiRequest(url) {
  if (!url.pathname.startsWith('/api/')) return false;
  if (API_NEVER_CACHE.some((p) => url.pathname.startsWith(p))) return false;
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
         url.pathname.match(/\.(js|css|woff2?|ttf|otf|eot)$/i);
}

// Stale-while-revalidate: return cache (if any), then update in background.
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
async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
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
  // Same-origin requests: run the full router below.
  // Cross-origin requests: only intercept IMAGE GETs so S3-presigned
  // profile photos / beneficiary avatars / estate photos are cache-first
  // and survive a reconnect-offline cycle. Everything else third-party
  // (Stripe, Google Fonts, Analytics) still bypasses the SW entirely.
  if (url.origin !== self.location.origin) {
    if (isImageRequest(url, request)) {
      event.respondWith(cacheFirst(request, IMAGE_CACHE));
    }
    return;
  }

  // 1) Top-level navigations (HTML) → network-first, offline shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  // 2) Bundle assets (hashed JS/CSS, fonts) → stale-while-revalidate.
  if (isBundleAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // 3) Images (PNG/JPG/etc. + chat/share-card image endpoints + avatar
  //    endpoints) → cache-first.
  if (isImageRequest(url, request)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // 4) Cacheable API GETs → stale-while-revalidate.
  if (isCacheableApiRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
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
  } else if (event.data.type === 'CLEAR_APP_CACHES') {
    // Called by the app on logout — wipes per-user API cache so the next
    // user doesn't see stale data from the previous session.
    event.waitUntil((async () => {
      await caches.delete(API_CACHE);
      await caches.delete(IMAGE_CACHE);
    })());
  } else if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Push Notifications (unchanged behaviour) ────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Push received.');
  let data = { title: 'CarryOn™', body: 'You have a new notification', icon: '/icon-192.png' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    console.error('Error parsing push data:', e);
  }
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
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
      .then(() => clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(urlToOpen);
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
