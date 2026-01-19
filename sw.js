const CACHE = 'rosie-cache-v34';
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
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchAndCache = fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      });
      // Cache-first for same-origin navigations/assets; fallback to network; finally to index.html.
      return cached || fetchAndCache.catch(() => caches.match('./index.html'));
    })
  );
});
