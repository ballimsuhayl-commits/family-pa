// Simple cache-first service worker (no eval, no inline).
const CACHE = 'rosie-cache-v10';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './app.js',
  './icons.js',
  './manifest.webmanifest',
  './lib/store.js',
  './lib/utils.js',
  './lib/voice.js',
  './lib/brain.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k === CACHE ? null : caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only GET
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // best effort cache
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => cached);
    })
  );
});
