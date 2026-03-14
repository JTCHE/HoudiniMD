const CACHE = 'vexllm-docs-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache full-page navigations to /docs/* (hard refresh, new tab, direct URL, back/forward)
// SPA navigations via router.push use RSC fetches which bypass this entirely — no interference.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.mode !== 'navigate') return;

  const url = new URL(request.url);
  if (!url.pathname.startsWith('/docs/')) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request).then((res) => {
        if (res.ok) cache.put(request, res.clone());
        return res;
      });

      if (cached) {
        networkFetch.catch(() => {}); // silent revalidate in background
        return cached;
      }

      return networkFetch;
    }),
  );
});
