/* AETHER cache-first PWA. All paths and requests are strictly same-origin. */
const CACHE = 'aether-local-v1.6';
const CORE = ['./', './index.html', './app.js', './sound-bank.js', './styles.css', './offline.js'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch('./vendor/offline-assets.json', {cache: 'no-store'});
    if (!response.ok) throw Error('Missing vendored asset manifest');
    const manifest = await response.json();
    if (!Array.isArray(manifest.files) || !manifest.files.length) throw Error('Offline asset manifest empty');
    await cache.addAll([...CORE, './vendor/offline-assets.json', ...manifest.files.map(path => './' + path)]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('aether-local-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => (await caches.match(request)) || fetch(request))());
});
