// Golden Hour used to live at the site root with a service worker scoped to the whole site.
// It now lives in golden-hour/ with its own. Phones that still have the old root worker
// fetch this file on their next visit; it clears the old caches and unregisters itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('golden-hour-v') && key !== 'golden-hour-v4') await caches.delete(key);
  await self.registration.unregister();
  for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
})()));
