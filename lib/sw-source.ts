/**
 * The service worker, as source.
 *
 * `scripts/write-build-stamp.ts` renders this into `public/sw.js` before the
 * build, so the file ships as a static asset. The stamp in the cache name is
 * load-bearing: cached HTML names content-hashed JS and CSS chunks, and every
 * build renames those, so a cache that outlives its build hands the browser
 * HTML whose every asset 404s.
 */
export function serviceWorkerSource(stamp: string): string {
  return `// Written by scripts/write-build-stamp.ts. Do not edit.
const CACHE = 'houdinimd-docs-${stamp}';

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
//
// Cache-first: the hit is the point, it is what makes a repeat hard navigation
// instant. Safe only because CACHE is build-stamped, so a deploy starts an
// empty cache instead of replaying the previous build's HTML.
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
`;
}
