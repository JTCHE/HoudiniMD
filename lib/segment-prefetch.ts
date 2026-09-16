/**
 * Answer a Next segment prefetch out of the ISR entry, without starting Next.
 *
 * WHY IT IS WORTH THE CODE.
 *
 * A segment prefetch is most of what this site is asked for, and it returns
 * very little: measured on the live Worker, 17 September 2026, 73% of requests
 * carried `next-router-segment-prefetch`, and the commonest one (`/_tree`)
 * answers in 691 bytes. Next serves it by reading the same R2 entry this file
 * reads. The difference is the bootstrap: on a cold isolate Next must be
 * evaluated first, and Cloudflare bills that to the request that meets it.
 *
 * Four identical prefetches, same colo, same minute: 330 CPU-ms for the first,
 * 0 for the three that followed it from the edge cache.
 *
 * WHY THE EDGE CACHE DOES NOT ALREADY COVER THIS.
 *
 * `caches.default` is per colo. The mirror is ~21k pages and the traffic is
 * thin and spread over the world, so a page is usually asked for once in any
 * one colo and never again while the entry lives: 7% of prefetches hit it.
 * Raising its TTL does not help — the second request is in another colo, not
 * later in the same one. R2 is a single store behind every colo, so a page
 * costs a render once and is cheap everywhere after.
 *
 * WHAT IT REFUSES.
 *
 * Everything it is not certain about, by returning null — the caller then
 * hands the request to Next exactly as before. The gates below repeat the ones
 * middleware applies, because answering here skips middleware: the build id is
 * pinned (see lib/build-id.ts), so R2 still holds entries written under slugs
 * that are now redirected, and serving one would strand a reader on a page the
 * site no longer admits to having.
 */
import { BUILD_ID } from "./build-id";
import { checkDocNamespace } from "./url/namespaces";
import { VERIFIED_SLUG_REDIRECTS } from "./url/slug-redirects";
import { wantsMarkdown } from "./wants-markdown";

/** `segmentData` stores this one as null when it equals `rsc`. See lib/cache/compressed-r2-cache.ts. */
const FULL_SEGMENT_KEY = "/_full";

/** Just the part of the R2 binding this module uses. */
export interface CacheBucket {
  get(key: string): Promise<{ body: ReadableStream } | null>;
}

interface Entry {
  rsc?: string;
  segmentData?: Record<string, string | null>;
}

/** The headers Next sends for a segment prefetch, reproduced. */
const HEADERS: Record<string, string> = {
  "content-type": "text/x-component",
  vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch",
  "x-nextjs-cache": "HIT",
  "cache-control": "public, max-age=0, must-revalidate",
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The bare docs slug this path may be answered from, or null when it must go
 * to Next. Mirrors what middleware does to a `/docs/` path before it renders.
 */
function serveableSlug(request: Request, url: URL): string | null {
  if (request.method !== "GET") return null;
  if (!request.headers.get("rsc")) return null;
  if (!url.pathname.startsWith("/docs/")) return null;

  // Any path middleware would rewrite rather than render: a trailing slash, an
  // extension, or the `.md` twin. Each is a redirect, not a page.
  const slug = url.pathname.slice("/docs/".length);
  if (slug === "" || slug.endsWith("/") || slug.endsWith(".md") || slug.endsWith(".html")) return null;

  // An agent is sent to the `.md` twin by middleware. Answering here would
  // hand it the HTML payload instead.
  if (wantsMarkdown(request.headers.get("user-agent"), request.headers)) return null;

  // `/index` slugs are the ones middleware looks up in the source-alias table,
  // which can redirect them. That lookup reads R2 and is not repeated here.
  if (slug.endsWith("/index")) return null;

  if (checkDocNamespace(slug).kind !== "allowed") return null;
  if (slug in VERIFIED_SLUG_REDIRECTS) return null;

  return slug;
}

/**
 * The prefetch payload, or null to let Next answer. Never throws: a malformed
 * or missing entry is a miss, and a miss is the behaviour this replaces.
 */
export async function segmentPrefetch(
  request: Request,
  url: URL,
  bucket: CacheBucket,
): Promise<Response | null> {
  const segment = request.headers.get("next-router-segment-prefetch");
  if (!segment) return null;
  if (!serveableSlug(request, url)) return null;

  try {
    const object = await bucket.get(
      `incremental-cache/${BUILD_ID}/${await sha256Hex(url.pathname)}.cache`,
    );
    if (!object) return null;

    const json = await new Response(
      object.body.pipeThrough(new DecompressionStream("gzip")),
    ).text();
    const entry = JSON.parse(json) as Entry;

    const stored = entry.segmentData?.[segment];
    if (stored === undefined) return null;
    // Null means the de-duplication dropped it because it equalled `rsc`.
    const payload = stored === null && segment === FULL_SEGMENT_KEY ? entry.rsc : stored;
    if (typeof payload !== "string") return null;

    return new Response(payload, { headers: HEADERS });
  } catch {
    return null;
  }
}
