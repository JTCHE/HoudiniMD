// Wraps the OpenNext-generated worker to fix two related Cloudflare-hosting
// bugs (see wrangler.jsonc "main" + scripts/cache-sync.ts):
//
// 1. OpenNext's ISR cache-hit path (fixISRHeaders in
//    @opennextjs/aws/dist/core/routing/util.js) unconditionally stamps
//    `stale-while-revalidate=2592000` on /docs/* HTML/RSC responses, *after*
//    Next middleware has already run — so middleware.ts can't touch it. That
//    lets browsers serve month-old cached HTML for up to 30 days, referencing
//    JS chunk hashes a later deploy has since deleted ("page couldn't load").
//    Fix: strip stale-while-revalidate here, the one place that runs after
//    OpenNext's handler.
// 2. Workers Assets only serves the *current* deploy's static files — no
//    multi-version fallback. If a stale-but-still-served HTML page (during
//    the SWR revalidation window) references an old chunk hash, that request
//    404s. Fix: serve archived old chunks from R2 (populated by
//    scripts/cache-sync.ts on each deploy) for any /_next/static/* request
//    that falls through to the worker (Workers Assets already handles
//    current-deploy files without invoking the worker at all).
import handler, { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge };

interface Env {
  NEXT_INC_CACHE_R2_BUCKET: {
    get(key: string): Promise<{ body: ReadableStream } | null>;
  };
  [key: string]: unknown;
}

const STATIC_ARCHIVE_MIME: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  woff2: "font/woff2",
  map: "application/json",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void }) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/_next/static/") && request.method === "GET") {
      // A flaky R2 call should fall through to handler.fetch (worst case a
      // clean 404), not surface as a 500.
      const archived = await env.NEXT_INC_CACHE_R2_BUCKET.get(`static-archive${url.pathname}`).catch(() => null);
      if (archived) {
        const ext = url.pathname.split(".").pop() ?? "";
        return new Response(archived.body, {
          headers: {
            "content-type": STATIC_ARCHIVE_MIME[ext] ?? "application/octet-stream",
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    const response = await handler.fetch(request, env, ctx);

    const contentType = response.headers.get("content-type") ?? "";
    const cacheControl = response.headers.get("cache-control") ?? "";
    if (
      (contentType.includes("text/html") || contentType.includes("text/x-component")) &&
      cacheControl.includes("stale-while-revalidate")
    ) {
      const patched = new Response(response.body, response);
      patched.headers.set("cache-control", "public, max-age=0, must-revalidate");
      return patched;
    }
    return response;
  },
};
