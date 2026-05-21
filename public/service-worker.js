/**
 * Service worker for the Expo web build.
 *
 * Purpose: let the web app launch with no network. The browser otherwise has
 * to fetch index.html and the JS bundle from the server on every load, so a
 * hard refresh while offline fails. This worker caches the app shell and the
 * static assets the app requests, then serves them from cache when offline.
 *
 * It does not cache Supabase API calls. Offline data is handled separately by
 * the in-app sync layer (the mutation outbox and the AsyncStorage caches).
 *
 * Strategy:
 *   - navigations (the HTML document): network-first, fall back to cached
 *     index.html. The fallback also drives SPA client-side routing offline.
 *   - same-origin static assets (JS, CSS, images, fonts): cache-first, and
 *     populate the cache on the first successful fetch.
 *   - everything cross-origin (the Supabase API): left to the network.
 */

const CACHE = 'german-vocab-app-shell-v1';
const APP_SHELL = ['/', '/index.html'];

// On install, cache the shell and also parse index.html for its hashed asset
// URLs (the JS bundle, favicon) so the app works offline after a single online
// visit, rather than needing a second visit to prime the cache.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(APP_SHELL);
      try {
        const res = await fetch('/index.html', { cache: 'no-cache' });
        const html = await res.text();
        const urls = new Set();
        const re = /(?:src|href)="([^"]+)"/g;
        let match;
        while ((match = re.exec(html)) !== null) {
          const u = match[1];
          if (u.startsWith('/') && !u.startsWith('//')) urls.add(u);
        }
        await Promise.all([...urls].map((u) => cache.add(u).catch(() => undefined)));
      } catch {
        // Best effort: a navigation later will still populate the cache.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // Only same-origin requests are handled. The Supabase API is cross-origin
  // and must always go to the network.
  if (url.origin !== self.location.origin) return;

  // SPA navigation: try the network, fall back to the cached shell. The cached
  // index.html also serves every client-side route when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  // Static assets: serve from cache first, otherwise fetch and cache.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});
