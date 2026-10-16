// Service worker: fetch the app's own files from the network first so updates show up straight
// away; fall back to the last copy when offline. Also handles notification taps.
// County parcel data and Google Fonts are other sites, so they always come from the network.
const CACHE = 'nearby-owners-v1';

// Saved at install so the Home Screen app opens even with no signal (searches still need it).
const APP_FILES = [
  './', 'index.html', 'owners.js?v=20261016a', 'xlsx.js?v=20261016a', 'app.js?v=20261016a', 'manifest.webmanifest',
  'icon-180.png', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_FILES)).catch(() => {}));
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('nearby-owners-v') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok) (await caches.open(CACHE)).put(e.request, res.clone());
      return res;
    } catch (err) {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      throw err;
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) =>
    cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
