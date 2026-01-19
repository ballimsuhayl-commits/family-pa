const CACHE = 'rosie-cache-ghpages-v37';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './app.js',
  './icons.js',
  './store.js',
  './calendar.js',
  './parser.js',
  './ics.js',
  './manifest.webmanifest',
  './assets/rosie.png',
  './assets/family/nasima.png',
  './assets/family/suhayl.png',
  './assets/family/zaara.png',
  './assets/family/rayhaan.png',
  './assets/family/jabu.png',
  './assets/family/lisa.png',
  './assets/icons/rosie-192.png',
  './assets/icons/rosie-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
