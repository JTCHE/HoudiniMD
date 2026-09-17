/**
 * Answer a doc request out of the ISR entry, without starting Next.
 *
 * WHY IT IS WORTH THE CODE.
 *
 * Next serves a finished doc page by reading one R2 entry and returning bytes
 * it already holds. The difference is the bootstrap: on a cold isolate Next
 * must be evaluated first, and Cloudflare bills that to the request that meets
 * it. Measured on the live Worker: 323 CPU-ms for a cold doc page, 22-31 warm,
 * 1-3 for an answer written inside `worker.ts`.
 *
 * Three request shapes are answered here:
 *
 *  - A segment prefetch. Measured 17 September 2026, 73% of requests carried
 *    `next-router-segment-prefetch`, and the commonest one (`/_tree`) answers
 *    in 691 bytes. Four identical prefetches, same colo, same minute: 330
 *    CPU-ms for the first, 0 for the three that followed from the edge cache.
 *  - A full page. `entry.html` is the prerendered document, and the doc route
 *    is `revalidate = false`, so there is no staleness to lose by not asking
 *    Next: the entry changes only when a deploy or a revalidate writes it.
 *    This is where the p99 is — a cold boot on a page request is the most
 *    expensive thing the Worker does.
 *  - An agent asking for a doc page, which middleware answers with a 302 to
 *    the `.md` twin. That one needs no entry at all, only the gates.
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
 * pinned (see lib/build-id.json), so R2 still holds entries written under slugs
 * that are now redirected, and serving one would strand a reader on a page the
 * site no longer admits to having.
 */
import buildId from "./build-id.json";
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
  html?: string;
  rsc?: string;
  segmentData?: Record<string, string | null>;
  meta?: { status?: number };
}

/** What Next says an RSC answer varies on. It sends this on the page too. */
const VARY = "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch";

/** The headers Next sends for a segment prefetch, reproduced. */
const PREFETCH_HEADERS: Record<string, string> = {
  "content-type": "text/x-component",
  vary: VARY,
  "x-nextjs-cache": "HIT",
  "cache-control": "public, max-age=0, must-revalidate",
};

/**
 * The headers Next sends for a prerendered page, less the ones only Next's own
 * tooling reads. `cache-control` is the value `worker.ts` rewrites the Next
 * answer to, so a reader gets the same instruction either way.
 */
const PAGE_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  vary: VARY,
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
  if (!url.pathname.startsWith("/docs/")) return null;

  // A prerendered page never varies on a query string, and the key read below
  // does not carry one. Anything that arrives with one is Next's business.
  if (url.search) return null;

  // Any path middleware would rewrite rather than render: a trailing slash, an
  // extension, or the `.md` twin. Each is a redirect, not a page.
  const slug = url.pathname.slice("/docs/".length);
  if (slug === "" || slug.endsWith("/") || slug.endsWith(".md") || slug.endsWith(".html")) return null;

  // `/index` slugs are the ones middleware looks up in the source-alias table,
  // which can redirect them. That lookup reads R2 and is not repeated here.
  if (slug.endsWith("/index")) return null;

  if (checkDocNamespace(slug).kind !== "allowed") return null;
  if (slug in VERIFIED_SLUG_REDIRECTS) return null;

  return slug;
}

/**
 * The stored entry, or null. Never throws: a malformed or missing entry is a
 * miss, and a miss is the behaviour this replaces.
 */
async function readEntry(url: URL, bucket: CacheBucket): Promise<Entry | null> {
  try {
    const object = await bucket.get(
      `incremental-cache/${buildId.buildId}/${await sha256Hex(url.pathname)}.cache`,
    );
    if (!object) return null;

    const json = await new Response(
      object.body.pipeThrough(new DecompressionStream("gzip")),
    ).text();
    const entry = JSON.parse(json) as Entry;

    // A stored 404 or 500 is Next's to give: that status carries headers and
    // a no-store rule this file does not reproduce.
    if (entry.meta?.status !== undefined && entry.meta.status !== 200) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * The stored answer for this request, or null to let Next answer. It serves a
 * segment prefetch, a plain page navigation, and the agent redirect to the
 * `.md` twin; every other shape is refused.
 */
export async function storedAnswer(
  request: Request,
  url: URL,
  bucket: CacheBucket,
): Promise<Response | null> {
  const segment = request.headers.get("next-router-segment-prefetch");

  // An RSC request that is not a segment prefetch asks for a payload cut to
  // its own router state. That is Next's to compute.
  if (!segment && request.headers.get("rsc")) return null;
  if (!serveableSlug(request, url)) return null;

  // An agent is sent to the `.md` twin by middleware, and that redirect is one
  // of the commonest answers the site gives. It needs no entry at all: the
  // gates above are the whole decision.
  if (wantsMarkdown(request.headers.get("user-agent"), request.headers)) {
    return segment
      ? null
      : new Response(null, { status: 302, headers: { location: `${url.pathname}.md` } });
  }

  const entry = await readEntry(url, bucket);
  if (!entry) return null;

  if (!segment) {
    return typeof entry.html === "string"
      ? new Response(entry.html, { headers: PAGE_HEADERS })
      : null;
  }

  const stored = entry.segmentData?.[segment];
  if (stored === undefined) return null;
  // Null means the de-duplication dropped it because it equalled `rsc`.
  const payload = stored === null && segment === FULL_SEGMENT_KEY ? entry.rsc : stored;
  if (typeof payload !== "string") return null;

  return new Response(payload, { headers: PREFETCH_HEADERS });
}
