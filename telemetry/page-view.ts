import { botFamily, browserEvidence, visitorKind } from "../lib/wants-markdown";
import { visitorHash } from "../lib/visitor-hash";
import { visitorLabel } from "../lib/visitor-label";
import { canRecord, type TelemetryEnv } from "./types";

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

function writeView(
  request: Request,
  env: TelemetryEnv,
  ev: { path: string; referrer: string; status: number; markdown: boolean },
) {
  const ua = request.headers.get("user-agent");
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const salt = env.VISITOR_SALT!;
  const visitor = visitorHash(`${ip}|${ua ?? ""}`, salt);
  const kind = visitorKind(ua, request.headers);
  env.ANALYTICS!.writeDataPoint({
    indexes: [visitor],
    blobs: [
      ev.path,
      kind,
      visitorHash(ip, salt),
      request.headers.get("cf-ipcountry") ?? "",
      botFamily(ua) ?? "",
      ((request as Request & { cf?: { city?: string } }).cf?.city) ?? "",
      browserEvidence(request.headers),
      ev.referrer,
      kind,
      visitorLabel(visitor),
    ],
    doubles: [ev.status, ev.markdown ? 1 : 0],
  });
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
export function recordPageView(request: Request, url: URL, response: Response, env: TelemetryEnv) {
  if (!canRecord(env) || request.method !== "GET" || (response.status >= 300 && response.status < 400)) return;
  if (request.headers.get("rsc")) return;
  const path = url.pathname;
  if (!isTracked(path)) return;
  writeView(request, env, {
    path: path.endsWith(".md") ? path.slice(0, -3) : path,
    referrer: referrerHost(request, url),
    status: response.status,
    markdown: path.endsWith(".md"),
  });
}

/**
 * The other half: one beacon per client-side navigation, sent by the page that
 * was opened. `from` is the page it was opened from, recorded in the same
 * `self:` form referrerHost() writes, so reading on inside the site looks the
 * same however the browser got there.
 */
export function recordViewBeacon(request: Request, url: URL, env: TelemetryEnv): Response | null {
  if (url.pathname !== VIEW_BEACON_PATH) return null;
  const path = url.searchParams.get("path") ?? "";
  const from = url.searchParams.get("from") ?? "";
  if (canRecord(env) && isTracked(path))
    writeView(request, env, {
      path,
      referrer: from.startsWith("/") ? `self:${from}` : "",
      status: 200,
      markdown: false,
    });
  return new Response(null, { status: 204 });
}
