// The site had a service worker that served doc pages from the browser's
// cache. A browser that still runs it fetches this file on its next visit, and
// this one takes its place, clears every cache it made, and removes itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((client) => client.navigate(client.url))),
  );
});
