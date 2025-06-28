const CACHE_NAME = 'tirage-au-sort-v1';

const localUrlsToCache = [
  '/',
  '/index.html',
  '/style.css', 
  '/script.js',
  '/vercel.js', 
  '/tirage/tirage.css',
  '/tirage/tirage.style.js',
  '/tirage/img/icon-192x192.png', 
  '/tirage/img/icon-512x512.png',
  '/tirage/pwa/manifest.json' 
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache ouvert et fichiers locaux mis en cache');
        return cache.addAll(localUrlsToCache);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Ancien cache supprimé:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        return cachedResponse || fetch(request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          cache.put(request, networkResponse.clone());
          return networkResponse;
        });

        return cachedResponse || fetchPromise;
      });
    })
  );
});