import { recordApiSearch, recordPageView, recordSearchBeacon, recordViewBeacon } from "./telemetry";
import { pruneAnalytics } from "./telemetry/prune";
import type { D1Database } from "./telemetry/types";
import { iconMissing, iconNeedsRefresh, iconResponse, refreshIcon, validIconPath, type IconBucket } from "./lib/icon-cache";
import { cacheKey, fromCache, keep } from "./lib/edge-cache";
import { rewriteNotice } from "./lib/notice-rewrite";
import { storedAnswer, type Bucket } from "./lib/stored-answer";
import { isProbe } from "./lib/is-probe";

/**
 * The OpenNext entry, loaded by the request that needs it and never at module
 * scope.
 *
 * A static import evaluates on every cold isolate, and that module pulls in
 * the Next middleware bundle: 870 KB of JavaScript, measured on this build. It
 * is what makes a cold prefetch cost 337 CPU-ms when the answer itself is one
 * R2 read. The Next *server* was already lazy inside that module; this makes
 * the rest of it lazy too, so an isolate that only ever answers from R2 never
 * evaluates any of Next.
 *
 * No Durable Object class is re-exported. The queue is deleted (see
 * wrangler.jsonc) and nothing binds the tag cache or the cache purge, so every
 * export was inert — and a static re-export is exactly what would force this
 * module to load. Restore them beside the durable_objects bindings that need
 * them, as static re-exports from `.open-next/worker.js`.
 */
type NextHandler = { fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> };
let loading: Promise<NextHandler> | undefined;
const nextHandler = (): Promise<NextHandler> =>
  (loading ??= import("./.open-next/worker.js").then((m) => m.default as NextHandler));

interface Env {
  NEXT_INC_CACHE_R2_BUCKET: Bucket;
  CONTENT: Bucket;
  HOUDINIMD_ICONS: IconBucket;
  DB?: D1Database;
  VISITOR_SALT?: string;
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

const worker = {
  async fetch(request: Request, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void }) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/icons/") && (request.method === "GET" || request.method === "HEAD")) {
      const path = url.pathname.slice(7);
      if (!validIconPath(path)) return iconMissing();

      const edgeCache = (caches as unknown as { default: Cache }).default;
      const cacheRequest = new Request(request, { method: "GET" });
      const edgeResponse = await edgeCache.match(cacheRequest);
      if (edgeResponse) {
        return request.method === "HEAD" ? new Response(null, edgeResponse) : edgeResponse;
      }

      const cached = await env.HOUDINIMD_ICONS.get(path);
      if (cached) {
        if (iconNeedsRefresh(cached)) {
          ctx.waitUntil(refreshIcon(path, env.HOUDINIMD_ICONS).catch((error) => console.error(`Icon refresh failed: ${error}`)));
        }
        const response = iconResponse(cached.body, cached.httpEtag);
        ctx.waitUntil(edgeCache.put(cacheRequest, response.clone()));
        return request.headers.get("if-none-match") === cached.httpEtag
          ? new Response(null, { status: 304, headers: response.headers })
          : request.method === "HEAD"
            ? new Response(null, response)
            : response;
      }

      try {
        const svg = await refreshIcon(path, env.HOUDINIMD_ICONS);
        const response = iconResponse(svg);
        ctx.waitUntil(edgeCache.put(cacheRequest, response.clone()));
        return request.method === "HEAD" ? new Response(null, response) : response;
      } catch (error) {
        console.error(`Icon fill failed: ${error}`);
        const missing = iconMissing();
        ctx.waitUntil(edgeCache.put(cacheRequest, missing.clone()));
        return missing;
      }
    }
    const beacon = recordSearchBeacon(request, url, env, ctx) ?? recordViewBeacon(request, url, env, ctx);
    if (beacon) return beacon;

    if (url.pathname.startsWith("/_next/static/") && request.method === "GET") {
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

    if (isProbe(url.pathname)) return new Response("Not found", { status: 404 });

    // The edge cache sits here, in front of the Next server, because the cost
    // it saves is Next's own bootstrap. See lib/edge-cache.ts.
    const key = cacheKey(request, url);
    if (key) {
      const hit = await fromCache(key);
      if (hit) {
        recordPageView(request, url, hit, env, ctx);
        return hit;
      }
    }

    // A doc page, its prefetches, its RSC payload and its `.md` twin are all
    // a lookup in an object Next would read anyway, so all four are answered
    // here and Next is never started. This is where the meter is: the edge
    // cache above only catches the few requests that repeat inside one colo.
    // See lib/stored-answer.ts.
    const stored = await storedAnswer(request, url, env.NEXT_INC_CACHE_R2_BUCKET, env.CONTENT);
    if (stored) {
      const answer = rewriteNotice(stored);
      recordPageView(request, url, answer, env, ctx);
      if (key) keep(key, answer, ctx);
      return answer;
    }

    // The notice copy is written in here, not in the page, so changing it
    // costs one Worker script instead of a rewrite of 21k cached pages. See
    // lib/notice-copy.ts. It runs before `keep`, so what the edge cache holds
    // is the finished answer, and before the reader sees any byte of it.
    const response = rewriteNotice(await (await nextHandler()).fetch(request, env, ctx));
    recordPageView(request, url, response, env, ctx);
    recordApiSearch(request, url, response, env, ctx);

    const contentType = response.headers.get("content-type") ?? "";
    if (
      (contentType.includes("text/html") || contentType.includes("text/x-component")) &&
      response.headers.get("cache-control")?.includes("stale-while-revalidate")
    ) {
      const patched = new Response(response.body, response);
      patched.headers.set("cache-control", "public, max-age=0, must-revalidate");
      if (key) keep(key, patched, ctx);
      return patched;
    }
    if (key) keep(key, response, ctx);
    return response;
  },

  async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    if (env.DB) ctx.waitUntil(pruneAnalytics(env.DB));
  },
};

export default worker;
