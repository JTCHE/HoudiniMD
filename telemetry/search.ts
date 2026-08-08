import { visitorKind, type VisitorKind } from "../lib/wants-markdown";
import { visitorHash } from "../lib/visitor-hash";
import { visitorLabel } from "../lib/visitor-label";
import { canRecord, nowStamp, type TelemetryEnv, type WaitUntil } from "./types";

type SearchSource = "api" | "resolve" | "generate" | "overlay" | "home";
type SearchKind = VisitorKind;

/**
 * Nothing that reads the search API is a reader, whatever its headers claim —
 * a browser-shaped client calling JSON is automation. It stays an "agent"
 * rather than an unidentified "bot": it came in through the agent-facing API,
 * which is an identification.
 */
function apiKind(request: Request): SearchKind {
  const kind = visitorKind(request.headers.get("user-agent"), request.headers);
  return kind === "human" || kind === "bot" ? "agent" : kind;
}

function writeSearchRow(request: Request, env: TelemetryEnv, ev: { q: string; source: SearchSource; dest: string; results: number; kind?: SearchKind; rank?: number }) {
  if (!canRecord(env)) return;
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const salt = env.VISITOR_SALT!;
  const ua = request.headers.get("user-agent");
  const visitor = visitorHash(`${ip}|${ua ?? ""}`, salt);
  return env.DB!.prepare(
    `INSERT OR IGNORE INTO searches (ts, visitor, q, country, category, results, source, dest, kind, alias, rank)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      nowStamp(),
      visitorHash(ip, salt),
      ev.q.slice(0, 200),
      request.headers.get("cf-ipcountry") ?? "",
      "",
      ev.results,
      ev.source,
      ev.dest.slice(0, 200),
      ev.kind ?? visitorKind(ua, request.headers),
      visitorLabel(visitor),
      String(ev.rank ?? 0),
    )
    .run();
}

export function recordApiSearch(request: Request, url: URL, response: Response, env: TelemetryEnv, ctx: WaitUntil) {
  if (request.method !== "GET" || !canRecord(env)) return;
  const kind = apiKind(request);
  if (url.pathname === "/api/search" && response.status === 200) {
    const q = url.searchParams.get("q")?.trim();
    if (!q) return;
    ctx.waitUntil(response.clone().json().then((body: unknown) => {
      const total = typeof (body as { total?: unknown })?.total === "number" ? (body as { total: number }).total : 0;
      return writeSearchRow(request, env, { q, source: "api", dest: "", results: total, kind });
    }).catch(() => {}));
    return;
  }
  if (url.pathname === "/api/resolve") {
    const q = url.searchParams.get("name")?.trim();
    if (!q) return;
    if (response.status !== 200) return ctx.waitUntil(Promise.resolve(writeSearchRow(request, env, { q, source: "resolve", dest: "", results: 0, kind })));
    ctx.waitUntil(response.clone().json().then((body: unknown) => {
      const slug = typeof (body as { slug?: unknown })?.slug === "string" ? (body as { slug: string }).slug : "";
      return writeSearchRow(request, env, { q, source: "resolve", dest: slug, results: slug ? 1 : 0, kind });
    }).catch(() => {}));
    return;
  }
  if (url.pathname === "/api/generate") {
    const slug = url.searchParams.get("slug")?.trim();
    if (!slug) return;
    ctx.waitUntil(response.clone().text().then((body) => {
      const found = response.status === 200 && !body.includes('"stage":"error"');
      return writeSearchRow(request, env, { q: slug, source: "generate", dest: found ? slug : "", results: found ? 1 : 0, kind });
    }).catch(() => writeSearchRow(request, env, { q: slug, source: "generate", dest: "", results: 0, kind })));
  }
}

export function recordSearchBeacon(request: Request, url: URL, env: TelemetryEnv, ctx: WaitUntil): Response | null {
  if (url.pathname !== "/api/search-log") return null;
  const q = url.searchParams.get("q")?.trim();
  if (q) ctx.waitUntil(Promise.resolve(writeSearchRow(request, env, {
    q,
    source: url.searchParams.get("src") === "home" ? "home" : "overlay",
    dest: url.searchParams.get("dest")?.trim() ?? "",
    results: Number(url.searchParams.get("n")) || 0,
    rank: Number(url.searchParams.get("rank")) || 0,
  })));
  return new Response(null, { status: 204 });
}
