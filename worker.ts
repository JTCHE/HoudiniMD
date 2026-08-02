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
import { visitorKind, botFamily, browserEvidence } from "./lib/wants-markdown";
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
      visitorKind(ua, request.headers),
      visitorHash(ip), // blob3: lets the CLI drop the operator's own visits
      request.headers.get("cf-ipcountry") ?? "",
      botFamily(ua) ?? "", // blob5: named crawler/agent for the live feed, e.g. "Googlebot"
      (request.cf?.city as string) ?? "", // blob6: city, for the live feed's location tag
      // blob7: which browser-only headers came with the request, so a "human"
      // count can be audited instead of trusted. "-" means none of them.
      browserEvidence(request.headers),
      referrerHost(request, url), // blob8: where the visit came from, host only
    ],
    // A 404 is a page view like any other until you can see the status: a dead
    // inbound link and a real read were previously the same row. The second
    // number marks a raw-markdown read: blob1 keeps the .md stripped so both
    // forms of a page roll up as one, and this is what tells them apart.
    doubles: [response.status, path.endsWith(".md") ? 1 : 0],
  });
}

/**
 * Host of the referring page, or "" for same-site and direct hits. Only the
 * host: the full URL is the visitor's browsing history, and the question this
 * answers ("where does traffic come from") never needs the path.
 */
function referrerHost(request: Request, url: URL): string {
  const ref = request.headers.get("referer");
  if (!ref) return "";
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    return host === url.hostname.replace(/^www\./, "") ? "" : host;
  } catch {
    return "";
  }
}

/**
 * Search rows live in the same dataset as page views; blob2 "search" marks them
 * so the CLI's kind-based panels skip them. Only *submitted* searches are
 * recorded — a query the visitor typed and acted on — never keystrokes.
 *
 * blob5 is the submit path it came from and blob7 is where the visitor landed.
 * An empty blob7 is a failed search: nothing was found for what they asked.
 * Together they answer the two questions the query alone cannot — "did this
 * search work" and "which page answered it".
 */
type SearchSource = "api" | "resolve" | "generate" | "overlay" | "home";

function writeSearchRow(
  request: Request,
  env: Env,
  ev: { q: string; source: SearchSource; dest: string; results: number; category?: string }
) {
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  env.ANALYTICS!.writeDataPoint({
    indexes: [visitorHash(`${ip}|${request.headers.get("user-agent") ?? ""}`)],
    blobs: [
      ev.q.slice(0, 200),
      "search",
      visitorHash(ip),
      request.headers.get("cf-ipcountry") ?? "",
      ev.source,
      ev.category ?? "",
      ev.dest.slice(0, 200),
    ],
    doubles: [ev.results],
  });
}

/**
 * The three server-side submit paths. Runs in ctx.waitUntil so reading a
 * response body never delays the response itself.
 *
 * - /api/search   the public JSON API (MCP, agents, curl) — no landing page.
 * - /api/resolve  "I typed a name and pressed Enter", from the ⌘K overlay and
 *                 the homepage field. A non-200 is the "Nothing found" toast.
 * - /api/generate "mirror a page you do not have yet" — the request itself is
 *                 the signal, so it is recorded when the stream starts rather
 *                 than waiting on SSE events the client already handles.
 */
function recordApiSearch(
  request: Request,
  url: URL,
  response: Response,
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void }
) {
  if (!env.ANALYTICS || request.method !== "GET") return;

  if (url.pathname === "/api/search" && response.status === 200) {
    const q = url.searchParams.get("q")?.trim();
    if (!q) return;
    const category = url.searchParams.get("category")?.trim() ?? "";
    ctx.waitUntil(
      response
        .clone()
        .json()
        .then((body: unknown) => {
          const total = typeof (body as { total?: unknown })?.total === "number" ? (body as { total: number }).total : 0;
          writeSearchRow(request, env, { q, source: "api", dest: "", results: total, category });
        })
        .catch(() => {})
    );
    return;
  }

  if (url.pathname === "/api/resolve") {
    const q = url.searchParams.get("name")?.trim();
    if (!q) return;
    if (response.status !== 200) {
      writeSearchRow(request, env, { q, source: "resolve", dest: "", results: 0 });
      return;
    }
    ctx.waitUntil(
      response
        .clone()
        .json()
        .then((body: unknown) => {
          const slug = typeof (body as { slug?: unknown })?.slug === "string" ? (body as { slug: string }).slug : "";
          writeSearchRow(request, env, { q, source: "resolve", dest: slug, results: slug ? 1 : 0 });
        })
        .catch(() => {})
    );
    return;
  }

  if (url.pathname === "/api/generate") {
    const slug = url.searchParams.get("slug")?.trim();
    if (!slug) return;
    writeSearchRow(request, env, {
      q: slug,
      source: "generate",
      dest: response.status === 200 ? slug : "",
      results: response.status === 200 ? 1 : 0,
    });
  }
}

// The fourth submit path, and the only one no server request can see: picking a
// result out of the list. The ⌘K overlay and the homepage field rank in the
// browser (lib/search/client.ts) and navigate client-side, so nothing reaches
// recordApiSearch — lib/search/log.ts beacons the query and the page it opened
// here instead. Handled before handler.fetch: Next has no route for it, and a
// log write must not pay for a page render.
function recordSearchBeacon(request: Request, url: URL, env: Env): Response | null {
  if (url.pathname !== "/api/search-log") return null;
  const q = url.searchParams.get("q")?.trim();
  const source = url.searchParams.get("src") === "home" ? "home" : "overlay";
  if (env.ANALYTICS && q) {
    writeSearchRow(request, env, {
      q,
      source,
      dest: url.searchParams.get("dest")?.trim() ?? "",
      results: Number(url.searchParams.get("n")) || 0,
    });
  }
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void }) {
    const url = new URL(request.url);

    const beacon = recordSearchBeacon(request, url, env);
    if (beacon) return beacon;

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
    recordApiSearch(request, url, response, env, ctx);

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
