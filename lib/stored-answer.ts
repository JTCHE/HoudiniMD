/**
 * Answer a doc request from R2, without starting Next.
 *
 * WHY IT IS WORTH THE CODE.
 *
 * Next serves a finished doc page by reading one R2 object and returning bytes
 * it already holds. The difference is the bootstrap: on a cold isolate Next
 * must be evaluated first, and Cloudflare bills that to the request that meets
 * it. Measured on the live Worker with `wrangler tail`, 17 September 2026: a
 * doc page costs 326 CPU-ms on average and a `.md` twin 380, against 1-3 for
 * an answer written inside `worker.ts`.
 *
 * Five request shapes are answered here:
 *
 *  - A segment prefetch, from `segmentData` in the ISR entry. Measured 17
 *    September 2026, 73% of requests carried `next-router-segment-prefetch`,
 *    and the commonest one (`/_tree`) answers in 691 bytes.
 *  - The full RSC payload, from `rsc` in the same entry. Verified against the
 *    live site: the answer is the same bytes for every router state tree, with
 *    and without `next-router-prefetch`, because the route is prerendered.
 *  - A full page, from `html`. The doc route is `revalidate = false`, so there
 *    is no staleness to lose by not asking Next: the entry changes only when a
 *    deploy or a revalidate writes it.
 *  - The `.md` twin, and `/api/raw/<slug>` behind it, from the content object
 *    that route would read. Byte-identical to what it returns — see
 *    `markdown()`. The two differ only in the `cache-control` they carry.
 *  - An agent asking for a doc page, which middleware answers with a 302 to
 *    the `.md` twin. That one needs no object at all, only the gates.
 *  - `/api/search-index`, which is a proxy of one R2 object and nothing else.
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
import { DOCS_KEY } from "./search/bm25";
import { generatedAtIsCurrent } from "./content-freshness";
import { SIDEFX_DOCS_ROOT } from "./houdini";
import { checkDocNamespace, DOC_NAMESPACES } from "./url/namespaces";
import { VERIFIED_SLUG_REDIRECTS } from "./url/slug-redirects";
import { wantsMarkdown } from "./wants-markdown";

/** `segmentData` stores this one as null when it equals `rsc`. See lib/cache/compressed-r2-cache.ts. */
const FULL_SEGMENT_KEY = "/_full";

/**
 * Written into the progress view by components/docs/GeneratingPage.tsx. An
 * entry holding one is a page that had no content when it was rendered, and
 * only Next can decide whether that is still true.
 */
const GENERATING_MARKER = "data-generating";

/** Just the part of an R2 binding this module uses. */
export interface Bucket {
  get(key: string): Promise<{ body: ReadableStream } | null>;
}

interface Entry {
  html?: string;
  rsc?: string;
  segmentData?: Record<string, string | null>;
  /** A route handler's whole answer, when the route is prerendered. */
  body?: string;
  meta?: { status?: number; headers?: Record<string, string> };
}

/** What Next says an RSC answer varies on. It sends this on the page too. */
const VARY = "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch";

/** The value `worker.ts` rewrites a Next page answer to. Both paths agree. */
const PAGE_CACHE_CONTROL = "public, max-age=0, must-revalidate";

/** Set by next.config.ts `headers()` for `/docs/:path*`, and kept for `.md`. */
const MARKDOWN_CACHE_CONTROL =
  "public, max-age=0, must-revalidate, s-maxage=86400, stale-while-revalidate=2592000";

/** What `/api/raw` sets on its own answers, where the `/docs/` rule does not reach. */
const RAW_CACHE_CONTROL = "public, max-age=2592000";

/** The BM25 doc table, and the headers app/api/search-index/route.ts gives it. */
const SEARCH_INDEX_PATH = "/api/search-index";
const SEARCH_INDEX_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Content-Type",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
};

const PREFETCH_HEADERS: Record<string, string> = {
  "content-type": "text/x-component",
  vary: VARY,
  "x-nextjs-cache": "HIT",
  "cache-control": PAGE_CACHE_CONTROL,
};

const PAGE_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  vary: VARY,
  "x-nextjs-cache": "HIT",
  "cache-control": PAGE_CACHE_CONTROL,
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Paths outside `/docs/` whose answer is one prerendered entry per build, and
 * the name Next stores that entry under. The root is `/index`, not `/`.
 */
const FIXED_PAGES: ReadonlyMap<string, string> = new Map([
  ["/", "/index"],
  ["/docs", "/docs"],
  ["/privacy", "/privacy"],
]);

/**
 * Route handlers Next prerenders whole: the entry carries the body and the
 * headers the route itself set, so nothing here decides what they say.
 *
 * `/sitemap.xml` is not one of these. next.config.ts gives it a different
 * `cache-control` than the entry stores, and copying that rule here would put
 * it in two places.
 */
const STORED_ROUTES: ReadonlySet<string> = new Set(["/robots.txt"]);

type Ask =
  | { kind: "searchIndex" }
  | { kind: "route"; path: string }
  | { kind: "page"; path: string }
  | { kind: "rsc"; path: string }
  | { kind: "prefetch"; path: string; segment: string }
  | { kind: "markdown"; slug: string; cacheControl: string }
  | { kind: "redirect"; to: string };

/**
 * What this request is, or null when it must go to Next. Mirrors what
 * middleware does to a `/docs/` path before it renders.
 */
function read(request: Request, url: URL): Ask | null {
  if (request.method !== "GET") return null;

  // A prerendered answer never varies on a query string, and the keys read
  // below carry none. The one exception is `_rsc`, the cache buster Next puts
  // on every RSC and prefetch request: the value never changes the answer.
  // Anything else arriving with a query is Next's business.
  if (url.search && [...url.searchParams.keys()].join() !== "_rsc") return null;

  // One R2 object, streamed through. The route does the same, and the only
  // reason it is a route is that the browser needs it same-origin.
  if (url.pathname === SEARCH_INDEX_PATH) return { kind: "searchIndex" };

  if (STORED_ROUTES.has(url.pathname)) return { kind: "route", path: url.pathname };

  const segment = request.headers.get("next-router-segment-prefetch");
  const rsc = request.headers.get("rsc");

  // Neither of these is under the `/docs/:path*` matcher, so middleware never
  // redirects an agent away from them: everyone gets the page.
  const fixed = FIXED_PAGES.get(url.pathname);
  if (fixed) {
    if (segment) return { kind: "prefetch", path: fixed, segment };
    if (rsc) return { kind: "rsc", path: fixed };
    return { kind: "page", path: fixed };
  }

  // `/api/raw/<slug>` is the route middleware rewrites a `.md` path to, and
  // agents also reach it directly from llms.txt. Same object, same gates, and
  // the route's own `cache-control` rather than the one `/docs/` carries.
  const raw = url.pathname.startsWith("/api/raw/");
  if (!raw && !url.pathname.startsWith("/docs/")) return null;

  const asked = url.pathname.slice(raw ? "/api/raw/".length : "/docs/".length);
  const isMarkdown = raw || asked.endsWith(".md");
  const slug = asked.endsWith(".md") ? asked.slice(0, -3) : asked;

  // Any path middleware would rewrite rather than render: an empty slug, a
  // trailing slash, or a `.html` extension. Each is a redirect, not a page.
  if (slug === "" || slug.endsWith("/") || slug.endsWith(".html")) return null;

  // `/index` slugs are the ones middleware looks up in the source-alias table,
  // which can redirect them. That lookup reads R2 and is not repeated here.
  if (slug.endsWith("/index")) return null;

  if (checkDocNamespace(slug).kind !== "allowed") return null;
  if (slug in VERIFIED_SLUG_REDIRECTS) return null;

  if (isMarkdown) {
    return { kind: "markdown", slug, cacheControl: raw ? RAW_CACHE_CONTROL : MARKDOWN_CACHE_CONTROL };
  }
  if (segment) return { kind: "prefetch", path: url.pathname, segment };
  if (rsc) return { kind: "rsc", path: url.pathname };

  // An agent is sent to the `.md` twin by middleware, and that redirect is one
  // of the commonest answers the site gives. It needs no object at all.
  //
  // A tree root is the exception. `/docs/houdini.md` and its three siblings are
  // answered in front of this Worker with a 301 back to `/docs/houdini`, so
  // sending an agent to the twin puts it in a redirect loop: one hour of tail
  // showed a single client asking for `/docs/hdk` 132 times. Give the root its
  // rendered page instead, which is what a tree root holds anyway — a list of
  // links, not prose an agent would rather have as markdown.
  if (
    !DOC_NAMESPACES.includes(slug as (typeof DOC_NAMESPACES)[number]) &&
    wantsMarkdown(request.headers.get("user-agent"), request.headers)
  ) {
    return { kind: "redirect", to: `${url.pathname}.md` };
  }
  return { kind: "page", path: url.pathname };
}

/**
 * The stored ISR entry for a path, or null. Never throws: a malformed or
 * missing entry is a miss, and a miss is the behaviour this replaces.
 */
async function entryFor(path: string, cache: Bucket): Promise<Entry | null> {
  try {
    const object = await cache.get(
      `incremental-cache/${buildId.buildId}/${await sha256Hex(path)}.cache`,
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
 * The `.md` twin, straight from the content object.
 *
 * `/api/raw` puts that object through two transforms before answering, and
 * both are no-ops for every slug `read()` admits: `cachedContentIsCurrent`
 * only tests the empty slug, which is refused above, and `insertLegacyWarning`
 * only fires on a version-suffixed root, which the namespace gate refuses. The
 * `generated_at` test is the one check that does bite, so it is repeated.
 */
async function markdown(slug: string, cacheControl: string, content: Bucket): Promise<Response | null> {
  try {
    const object = await content.get(`content/${slug}.md`);
    if (!object) return null;

    const text = await new Response(object.body).text();
    if (!generatedAtIsCurrent(text)) return null;

    return new Response(text, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": cacheControl,
        vary: VARY,
        "x-content-type-options": "nosniff",
        "x-source-url": `${SIDEFX_DOCS_ROOT}/${slug}`,
      },
    });
  } catch {
    return null;
  }
}

/** The stored answer for this request, or null to let Next answer. */
export async function storedAnswer(
  request: Request,
  url: URL,
  cache: Bucket,
  content: Bucket,
): Promise<Response | null> {
  const ask = read(request, url);
  if (!ask) return null;

  if (ask.kind === "searchIndex") {
    const object = await content.get(DOCS_KEY).catch(() => null);
    return object ? new Response(object.body, { headers: SEARCH_INDEX_HEADERS }) : null;
  }
  if (ask.kind === "redirect") {
    return new Response(null, { status: 302, headers: { location: ask.to } });
  }
  if (ask.kind === "markdown") return markdown(ask.slug, ask.cacheControl, content);

  const entry = await entryFor(ask.path, cache);
  if (!entry) return null;

  if (ask.kind === "route") {
    if (typeof entry.body !== "string") return null;
    // The tag list drives revalidation inside Next and never leaves it.
    const { "x-next-cache-tags": _tags, ...stored } = entry.meta?.headers ?? {};
    return new Response(entry.body, { headers: { ...stored, vary: VARY, "x-nextjs-cache": "HIT" } });
  }

  if (ask.kind === "prefetch") {
    const stored = entry.segmentData?.[ask.segment];
    if (stored === undefined) return null;
    // Null means the de-duplication dropped it because it equalled `rsc`.
    const payload = stored === null && ask.segment === FULL_SEGMENT_KEY ? entry.rsc : stored;
    if (typeof payload !== "string") return null;
    return new Response(payload, { headers: PREFETCH_HEADERS });
  }

  if (ask.kind === "rsc") {
    return typeof entry.rsc === "string"
      ? new Response(entry.rsc, { headers: PREFETCH_HEADERS })
      : null;
  }

  if (typeof entry.html !== "string") return null;
  if (entry.html.includes(GENERATING_MARKER)) return null;
  return new Response(entry.html, { headers: PAGE_HEADERS });
}
