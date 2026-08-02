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
import { visitorKind } from "./lib/wants-markdown";
import { visitorHash } from "./lib/visitor-hash";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge };

interface Env {
  NEXT_INC_CACHE_R2_BUCKET: {
    get(key: string): Promise<{ body: ReadableStream } | null>;
  };
  // Absent in `next dev` and in any deploy predating the binding.
  ANALYTICS?: {
    writeDataPoint(event: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
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

// One data point per doc page actually served, so `bun run analytics` can split
// humans from agents. Everything skipped here is noise the Cloudflare dashboard
// drowns in: assets, /api/*, the .md redirect (the agent's follow-up request to
// the .md URL is the real read), and Next's link prefetches.
//
// index1 is the visitor id, which is what Analytics Engine samples on — a bot
// hammering one path gets sampled down on its own while ordinary visitors are
// recorded in full. Every count must therefore be SUM(_sample_interval).
function recordPageView(request: Request, url: URL, response: Response, env: Env) {
  if (!env.ANALYTICS || request.method !== "GET") return;
  if (response.status >= 300 && response.status < 400) return;
  if (request.headers.get("next-router-prefetch")) return;
  const path = url.pathname;
  if (path !== "/" && !path.startsWith("/docs/")) return;

  const ua = request.headers.get("user-agent");
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  env.ANALYTICS.writeDataPoint({
    indexes: [visitorHash(`${ip}|${ua ?? ""}`)],
    blobs: [
      path.endsWith(".md") ? path.slice(0, -3) : path,
      visitorKind(ua, request.headers.get("sec-fetch-dest")),
      visitorHash(ip), // blob3: lets the CLI drop the operator's own visits
      request.headers.get("cf-ipcountry") ?? "",
    ],
  });
}

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
    recordPageView(request, url, response, env);

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
