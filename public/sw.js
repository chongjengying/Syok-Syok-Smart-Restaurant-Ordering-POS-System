const CACHE_NAME = 'smart-pos-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (['/rest/', '/auth/', '/functions/', '/realtime/', '/storage/'].some((prefix) => url.pathname.startsWith(prefix))) return;

  const cacheResponse = (cacheKey, response) => {
    if (response.ok) {
      // Clone synchronously. Waiting until after the response is returned can
      // race with the browser consuming the body and throw Response.clone().
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy)));
    }
    return response;
  };

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse('/index.html', response))
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Hashed bundles must be fetched from the current deployment first. Falling
  // back to a stale cached module can reference assets removed by a release.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(request, response))
        .catch(() => caches.match(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const refreshed = fetch(request).then((response) => cacheResponse(request, response));
      return cached || refreshed;
    }),
  );
});
