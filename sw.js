const CACHE_NAME = 'ruffle-touch-v1';

const CORE_ASSETS = [
  './',
  './index.html',
  './src/ruffle-touch.js',
  './src/ruffle-touch.css',
  './manifest.webmanifest',
  'https://unpkg.com/@ruffle-rs/ruffle'
];

// Install Event - Pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-While-Revalidate / Cache-First strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // DO NOT cache proxy requests (ignore requests with `url=` query param or matching `workers.dev`)
  if (request.url.includes('url=') || request.url.includes('workers.dev')) {
    return;
  }

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        // Check if response is valid before caching
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((error) => {
        // If network fails, return cached response if available or log gracefully
        console.warn('[SW] Fetch failed; returning cached resource if available.', error);
        return cachedResponse;
      });

      // Cache-first response if available, otherwise wait for network fetch
      return cachedResponse || fetchPromise;
    })
  );
});
