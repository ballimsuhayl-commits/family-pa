/* Rosie Service Worker — r41
   - Never fails install if one file is missing
   - Clears old caches
   - Navigation fallback for SPA
*/
const CACHE = 'rosie-cache-r41';
const ASSETS = [
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './app.js',
  './calendar.js',
  './icons.js',
  './ics.js',
  './main.js',
  './parser.js',
  './store.js',
  './sw.js',
  './404.html',
  './.nojekyll'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (url) => {
      try {
        const req = new Request(url, { cache: 'reload' });
        const res = await fetch(req);
        if (res && res.ok) await cache.put(req, res.clone());
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigate = event.request.mode === 'navigate';

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    if (isNavigate && isSameOrigin) {
      try {
        const res = await fetch(event.request);
        if (res && res.ok) cache.put(event.request, res.clone());
        return res;
      } catch {
        return (await cache.match('./index.html')) || Response.error();
      }
    }

    if (isSameOrigin) {
      const cached = await cache.match(event.request);
      if (cached && cached.ok) return cached;

      try {
        const res = await fetch(event.request);
        if (res && res.ok) cache.put(event.request, res.clone());
        return res;
      } catch {
        return cached || Response.error();
      }
    }

    return fetch(event.request);
  })());
});
