const CACHE = 'assistant-iphone-v9-sync-debug';
const ASSETS = ['./index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-512.png', './voice.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const pathname = new URL(event.request.url).pathname;
  if (pathname.endsWith('/sync-config.js') || pathname.endsWith('/sync.js')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

