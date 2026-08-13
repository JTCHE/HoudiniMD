import { botFamily, browserEvidence, browserKind, deviceKind, fetchSite, primaryLanguage, visitorKind } from "../lib/wants-markdown";
import { visitorHash } from "../lib/visitor-hash";
import { visitorLabel } from "../lib/visitor-label";
import { canRecord, nowStamp, type TelemetryEnv, type WaitUntil } from "./types";

/** Where `lib/view-log.ts` reports a client-side navigation. */
export const VIEW_BEACON_PATH = "/api/view-log";

const referrerHost = (request: Request, url: URL) => {
  const ref = request.headers.get("referer");
  if (!ref) return "";
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    if (host === url.hostname.replace(/^www\./, "")) return `self:${new URL(ref).pathname}`;
    return host;
  } catch {
    return "";
  }
};

/** A page address we count. Everything else on the site is not a doc read. */
const isTracked = (path: string) => path === "/" || path.startsWith("/docs/");

/**
 * The same read can reach the worker twice under one source IP each —
 * search-result and omnibox prefetch races land on a different connection
 * (and so a different `cf-connecting-ip`) than the click that follows. IP
 * is exactly what differs between the two, so it can't be part of the dedupe
 * key; path/referrer/country is what the two requests still agree on.
 *
 * ponytail: Cache API as a 5s dedupe window, not a durable counter. A cold
 * colo or a genuinely distinct visitor sharing the key is undercounted by
 * one row, which is a smaller error than the double-count this replaces.
 */
async function seenRecently(key: string, ctx: WaitUntil): Promise<boolean> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://dedupe.internal/view/${encodeURIComponent(key)}`);
  if (await cache.match(cacheKey)) return true;
  ctx.waitUntil(cache.put(cacheKey, new Response(null, { headers: { "cache-control": "max-age=5" } })));
  return false;
}

async function writeView(
  request: Request,
  env: TelemetryEnv,
  ctx: WaitUntil,
  ev: { path: string; referrer: string; status: number; markdown: boolean },
) {
  const ua = request.headers.get("user-agent");
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const country = request.headers.get("cf-ipcountry") ?? "";
  const kind = visitorKind(ua, request.headers);
  if (await seenRecently(`${ev.path}|${country}|${ev.referrer}|${kind}`, ctx)) return;
  const salt = env.VISITOR_SALT!;
  const visitor = visitorHash(`${ip}|${ua ?? ""}`, salt);
  await env.DB!.prepare(
    `INSERT OR IGNORE INTO views (ts, visitor, path, kind, country, city, bot, evidence, status, referrer, markdown, alias, device, browser, fetch_site, lang)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      nowStamp(),
      visitorHash(ip, salt),
      ev.path,
      kind,
      country,
      ((request as Request & { cf?: { city?: string } }).cf?.city) ?? "",
      botFamily(ua) ?? "",
      browserEvidence(request.headers),
      String(ev.status),
      ev.referrer,
      ev.markdown ? "1" : "",
      visitorLabel(visitor),
      deviceKind(ua, request.headers),
      browserKind(ua, request.headers),
      // On a beacon these describe the beacon's own fetch, not the navigation
      // it reports — that request really is same-origin — so a beacon row can
      // never contradict its `from`. Only a document load can, which is the
      // only place the dashboard reads the pair. See fetchSite().
      fetchSite(request.headers),
      primaryLanguage(request.headers),
    )
    .run();
}

/**
 * A document load: someone typed the address, followed a link in from outside,
 * opened a new tab, or hard-refreshed.
 *
 * An RSC request is never one of those. It is either a prefetch — which is not
 * a read — or the fetch behind a client-side navigation, and with `prefetch`
 * on every link the payload is usually already in the router cache, so the
 * click that opens the page reaches no server at all. Counting the prefetch
 * would count twenty pages nobody opened; counting the RSC fetch would miss
 * most reads and double-count the rest. So the worker counts document loads
 * and the browser reports its own navigations — see recordViewBeacon.
 */
export function recordPageView(request: Request, url: URL, response: Response, env: TelemetryEnv, ctx: WaitUntil) {
  if (!canRecord(env) || request.method !== "GET" || (response.status >= 300 && response.status < 400)) return;
  if (request.headers.get("rsc")) return;
  const path = url.pathname;
  if (!isTracked(path)) return;
  ctx.waitUntil(writeView(request, env, ctx, {
    path: path.endsWith(".md") ? path.slice(0, -3) : path,
    referrer: referrerHost(request, url),
    status: response.status,
    markdown: path.endsWith(".md"),
  }));
}

/**
 * The other half: one beacon per client-side navigation, sent by the page that
 * was opened. `from` is the page it was opened from, recorded in the same
 * `self:` form referrerHost() writes, so reading on inside the site looks the
 * same however the browser got there.
 */
export function recordViewBeacon(request: Request, url: URL, env: TelemetryEnv, ctx: WaitUntil): Response | null {
  if (url.pathname !== VIEW_BEACON_PATH) return null;
  const path = url.searchParams.get("path") ?? "";
  const from = url.searchParams.get("from") ?? "";
  if (canRecord(env) && isTracked(path))
    ctx.waitUntil(writeView(request, env, ctx, {
      path,
      referrer: from.startsWith("/") ? `self:${from}` : "",
      status: 200,
      markdown: false,
    }));
  return new Response(null, { status: 204 });
}
