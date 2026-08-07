import handler, { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
import { recordApiSearch, recordPageView, recordSearchBeacon, recordViewBeacon } from "./telemetry";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge };

interface Env {
  NEXT_INC_CACHE_R2_BUCKET: { get(key: string): Promise<{ body: ReadableStream } | null> };
  ANALYTICS?: { writeDataPoint(event: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void };
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

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void }) {
    const url = new URL(request.url);
    const beacon = recordSearchBeacon(request, url, env) ?? recordViewBeacon(request, url, env);
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
    recordPageView(request, url, response, env);
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
};
