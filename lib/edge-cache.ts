/**
 * An answer cache in front of the Next server.
 *
 * WHY IT IS WORTH THE CODE.
 *
 * Measured on the live Worker, 12 September 2026, with `wrangler tail`: the
 * same doc page costs 323 CPU-ms on a cold isolate and 22-31 warm, while a
 * request answered inside `worker.ts` before `handler.fetch` costs 1-3 (the
 * `/icons/` branch). The cold figure is Next's own bootstrap, and Cloudflare
 * bills it to the request that meets it. Traffic is thin enough that a large
 * share of requests meet a cold isolate, so the account's Workers CPU meter is
 * mostly bootstrap, not render.
 *
 * So the saving is not "render less". It is "do not start Next at all".
 *
 * WHAT GOES IN.
 *
 * Only an answer that is the same for every reader, and for HTML only once the
 * ISR cache reports a hit. A page that is still being generated answers 200
 * with a progress view (see GeneratingPage), and freezing that for an hour
 * would leave the page stuck on it. `x-nextjs-cache: HIT` is how a finished
 * page says so.
 *
 * The key carries a build stamp, so a deploy is not waited out: the new build
 * reads new keys and the old entries expire unseen. It carries the notice
 * version for the same reason: the Worker writes the notice into the answer
 * before it is stored, so new wording needs keys the old entries do not hold.
 */
import { wantsMarkdown } from "./wants-markdown";
import { BUILD_STAMP } from "./build-stamp";
import { NOTICE_VERSION } from "./notice-copy";

/** How long an entry lives when the answer asks for nothing longer. */
const TTL_SECONDS = 3600;

/** The bounds an answer's own `s-maxage` is held to. */
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 86400;

/** Holds the reader-facing value while the stored copy carries the edge TTL. */
const HEADER_CC = "x-hmd-cc";

/**
 * What Next says an RSC answer varies on. A key that ignores these would hand
 * one router state's payload to another.
 */
const RSC_VARY = ["rsc", "next-router-state-tree", "next-router-prefetch", "next-router-segment-prefetch"];

/** A router state tree longer than this is particular to one navigation. */
const MAX_VARIANT = 200;

type Ctx = { waitUntil(promise: Promise<unknown>): void };

const edge = () => (caches as unknown as { default: Cache }).default;

/** Paths whose answer depends on the build alone, never on who is asking. */
function cacheablePath(p: string): boolean {
  return (
    p === "/" ||
    p === "/docs" ||
    p.startsWith("/docs/") ||
    p === "/docs.md" ||
    p === "/privacy" ||
    p === "/privacy.md" ||
    p === "/llms.txt" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml" ||
    p === "/api/meta-all" ||
    p === "/api/search-index" ||
    p === "/api/search" ||
    p === "/download"
  );
}

/** The query a path is allowed to carry, and still be one answer per build. */
function queryVariant(url: URL): string | null {
  // One query, one answer, until the next deploy rebuilds the index. The route
  // already asks to be held (see app/api/search/route.ts); without this the
  // key was refused and two identical queries cost 1385 and 1237 CPU-ms.
  if (url.pathname === "/api/search") {
    const q = url.searchParams.get("q")?.trim();
    if (!q) return null;
    for (const key of url.searchParams.keys()) {
      if (key !== "q" && key !== "limit" && key !== "category") return null;
    }
    return `search/${encodeURIComponent(q)}/${url.searchParams.get("limit") ?? ""}/${url.searchParams.get("category") ?? ""}`;
  }

  if (!url.search) return "";

  // One tooltip, one slug. The answer is the page's own title and summary.
  if (url.pathname === "/api/meta") {
    const slug = url.searchParams.get("slug");
    const only = [...url.searchParams.keys()].length === 1;
    return slug && only ? `meta/${encodeURIComponent(slug)}` : null;
  }

  // An RSC payload. `_rsc` is Next's own build-and-route stamp.
  const rsc = url.searchParams.get("_rsc");
  const only = [...url.searchParams.keys()].length === 1;
  return rsc && only && cacheablePath(url.pathname) ? `rsc/${rsc}` : null;
}

/**
 * The key, or null when the request must not be served from the cache.
 *
 * A reader and an agent get different answers on the same doc address —
 * middleware sends the agent to the `.md` twin — so the decision is part of
 * the key. It is the same call middleware makes, on the same headers.
 */
export function cacheKey(request: Request, url: URL): Request | null {
  if (request.method !== "GET") return null;
  if (request.headers.get("range") || request.headers.get("authorization")) return null;
  if (url.pathname !== "/api/meta" && !cacheablePath(url.pathname)) return null;

  const query = queryVariant(url);
  if (query === null) return null;

  let variant = wantsMarkdown(request.headers.get("user-agent"), request.headers) ? "md" : "html";
  for (const header of RSC_VARY) {
    const value = request.headers.get(header);
    if (value) variant += `,${header}=${value}`;
  }
  if (variant.length > MAX_VARIANT) return null;

  return new Request(`https://edge.houdinimd/${BUILD_STAMP}.${NOTICE_VERSION}/${encodeURIComponent(variant)}/${query}${url.pathname}`);
}

/** The stored answer, with the reader-facing headers put back. */
export async function fromCache(key: Request): Promise<Response | null> {
  const hit = await edge().match(key);
  if (!hit) return null;

  const response = new Response(hit.body, hit);
  const reader = response.headers.get(HEADER_CC);
  response.headers.delete(HEADER_CC);
  if (reader) response.headers.set("cache-control", reader);
  else response.headers.delete("cache-control");
  return response;
}

function storable(response: Response): boolean {
  if (response.headers.has("set-cookie")) return false;
  const cc = response.headers.get("cache-control") ?? "";
  if (cc.includes("no-store") || cc.includes("private")) return false;

  // A redirect is cheap to keep and saves the same bootstrap: the agent
  // redirect to the `.md` twin is one of the commonest answers the site gives.
  if (response.status === 301 || response.status === 302 || response.status === 308) return true;
  if (response.status !== 200) return false;

  // A page answer is only final once the ISR cache holds the page. Anything
  // else is a render in progress. An API answer has no such marker and needs
  // none: it reads R2 and returns what it found.
  const type = response.headers.get("content-type") ?? "";
  const page = type.includes("text/html") || type.includes("text/x-component");
  return page ? response.headers.get("x-nextjs-cache") === "HIT" : true;
}

/**
 * How long to hold it. An answer that names an `s-maxage` is naming the age a
 * shared cache may serve it at, and this is a shared cache. `/api/meta-all`
 * asks for a day: it is one projection of the search index, it costs 574
 * CPU-ms to build from the 3 MB index, and an hourly TTL made every colo pay
 * that again 24 times a day.
 */
function ttl(response: Response): number {
  const asked = Number(/s-maxage=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1]);
  if (!Number.isFinite(asked)) return TTL_SECONDS;
  return Math.min(Math.max(asked, MIN_TTL_SECONDS), MAX_TTL_SECONDS);
}

/** Keep the answer, if it is one every reader may have. Never throws. */
export function keep(key: Request, response: Response, ctx: Ctx): void {
  if (!storable(response)) return;

  const stored = new Response(response.clone().body, response);
  stored.headers.set(HEADER_CC, response.headers.get("cache-control") ?? "");
  stored.headers.set("cache-control", `public, max-age=${ttl(response)}`);
  ctx.waitUntil(edge().put(key, stored).catch(() => {}));
}
