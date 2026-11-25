/* GATE '27 — Lightweight Offline-Ready Service Worker (100% Free, Safe Auth Bypass) */
const CACHE_NAME = 'gate27-pwa-v1';
const PRECACHE_ASSETS = [
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'accounts.google.com',
  'apis.google.com',
  'firebaseapp.com',
  'firebaseinstallations.googleapis.com',
  'generativelanguage.googleapis.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function shouldBypass(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  if (BYPASS_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
    return true;
  }
  if (url.pathname.startsWith('/__/') || url.pathname.startsWith('/@vite')) {
    return true;
  }
  return false;
}

function offlineHtmlResponse() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GATE '27 — Offline</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #FAF8F4; color: #1C1613; font-family: system-ui, -apple-system, sans-serif; padding: 24px; }
    .card { max-width: 420px; background: #FFFFFF; border: 1px solid #E8E0D5; border-radius: 28px; padding: 28px; text-align: center; box-shadow: 0 12px 32px -12px rgba(45,28,18,0.12); }
    .badge { display: inline-block; background: #6E261A; color: #FAF8F4; font-weight: 700; font-size: 12px; padding: 6px 14px; border-radius: 999px; margin-bottom: 14px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { font-size: 13px; line-height: 1.5; color: #61554D; margin: 0 0 18px; }
    button { background: #6E261A; color: #FFFFFF; border: none; border-radius: 999px; padding: 10px 20px; font-weight: 600; font-size: 13px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">GATE CSE 2027</span>
    <h1>You are offline</h1>
    <p>Reconnect briefly to reload the shell. Once cached, your GateR PYQ bank, Focus Timer, and study progress stay available offline.</p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (shouldBypass(url)) return;

  // 1. Network-First for API calls (never serve stale API mutations; graceful offline JSON)
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({
              ok: false,
              offline: true,
              message: 'Offline mode active — reconnect to sync with server.',
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            }
          )
      )
    );
    return;
  }

  // 2. Network-First for HTML Navigations (always get fresh app shell when online)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cached = (await caches.match(request)) || (await caches.match('/'));
          return cached || offlineHtmlResponse();
        })
    );
    return;
  }

  // 3. Stale-While-Revalidate for Static Assets, Icons & Fonts
  const isSameOriginAsset =
    url.origin === self.location.origin &&
    /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?|webmanifest|ico)$/i.test(url.pathname);
  const isGoogleFont =
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (isSameOriginAsset || isGoogleFont) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && (response.ok || response.type === 'opaque')) {
              cache.put(request, response.clone()).catch(() => undefined);
            }
            return response;
          })
          .catch(() => undefined);

        if (cached) {
          event.waitUntil(networkPromise);
          return cached;
        }
        const net = await networkPromise;
        return net || new Response('', { status: 504 });
      })
    );
  }
});
