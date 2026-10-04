// notematic — service worker (uso sin conexión)
// Al cambiar cualquier archivo de la app, sube el número de versión de abajo
// (notematic-v2, v3...) para que los móviles descarguen la versión nueva.
const CACHE = 'notematic-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (así siempre ves la última versión si hay internet);
// si no hay conexión o tarda demasiado, usa la copia guardada.
function networkFirst(request, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const useCache = () =>
      caches.match(request, { ignoreSearch: true })
        .then((hit) => hit || caches.match('./index.html'));
    const timer = setTimeout(() => {
      useCache().then((hit) => { if (hit && !settled) { settled = true; resolve(hit); } });
    }, timeoutMs);
    fetch(request.url, { cache: 'no-cache' })
      .then((res) => {
        clearTimeout(timer);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        if (!settled) { settled = true; resolve(res); }
      })
      .catch(() => {
        clearTimeout(timer);
        useCache().then((hit) => {
          if (!settled) { settled = true; resolve(hit || Response.error()); }
        });
      });
  });
}

// Caché primero para iconos y otros archivos que casi no cambian.
function cacheFirst(request) {
  return caches.match(request).then((hit) => {
    if (hit) return hit;
    return fetch(request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  const isManifest = url.pathname.endsWith('manifest.json');
  if (isPage || isManifest) {
    event.respondWith(networkFirst(req, 4000));
  } else {
    event.respondWith(cacheFirst(req));
  }
});
