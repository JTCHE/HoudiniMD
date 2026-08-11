import handler, { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
import { recordApiSearch, recordPageView, recordSearchBeacon, recordViewBeacon } from "./telemetry";
import { pruneAnalytics } from "./telemetry/prune";
import type { D1Database } from "./telemetry/types";
import { iconNeedsRefresh, iconResponse, refreshIcon, validIconPath, type IconBucket } from "./lib/icon-cache";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge };

interface Env {
  NEXT_INC_CACHE_R2_BUCKET: { get(key: string): Promise<{ body: ReadableStream } | null> };
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
      if (!validIconPath(path)) return new Response("Not found", { status: 404 });

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
        return new Response("Not found", { status: 404 });
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

    const response = await handler.fetch(request, env, ctx);
    recordPageView(request, url, response, env, ctx);
    recordApiSearch(request, url, response, env, ctx);

    const contentType = response.headers.get("content-type") ?? "";
    if (
      (contentType.includes("text/html") || contentType.includes("text/x-component")) &&
      response.headers.get("cache-control")?.includes("stale-while-revalidate")
    ) {
      const patched = new Response(response.body, response);
      patched.headers.set("cache-control", "public, max-age=0, must-revalidate");
      return patched;
    }
    return response;
  },

  async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    if (env.DB) ctx.waitUntil(pruneAnalytics(env.DB));
  },
};

export default worker;
