// The service worker is served from here rather than public/ so its cache name
// can carry a build stamp. Cached HTML names content-hashed JS/CSS chunks, and
// every build renames those chunks — a cache that outlives the build it was
// filled from hands the browser HTML whose every asset 404s.
//
// force-static is load-bearing: the stamp has to be baked once at build time.
// Left dynamic, module scope re-runs per worker isolate, so the script body
// would change under the browser and the cache would never survive to be hit.
export const dynamic = "force-static";

const BUILD = Date.now().toString(36);

const SOURCE = `const CACHE = 'houdinimd-docs-${BUILD}';

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

export function GET() {
  return new Response(SOURCE, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // The browser has to see the new script to start the update that swaps
      // the cache. A cached sw.js keeps the previous build's cache alive.
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
