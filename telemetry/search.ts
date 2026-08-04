import { visitorKind } from "../lib/wants-markdown";
import { visitorHash } from "../lib/visitor-hash";
import { visitorLabel } from "../lib/visitor-label";
import { canRecord, type TelemetryEnv, type WaitUntil } from "./types";

type SearchSource = "api" | "resolve" | "generate" | "overlay" | "home";

function writeSearchRow(request: Request, env: TelemetryEnv, ev: { q: string; source: SearchSource; dest: string; results: number; category?: string; rank?: number }) {
  if (!canRecord(env)) return;
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const salt = env.VISITOR_SALT!;
  const ua = request.headers.get("user-agent");
  const visitor = visitorHash(`${ip}|${ua ?? ""}`, salt);
  env.ANALYTICS!.writeDataPoint({
    indexes: [visitor],
    blobs: [ev.q.slice(0, 200), "search", visitorHash(ip, salt), request.headers.get("cf-ipcountry") ?? "", ev.source, ev.category ?? "", ev.dest.slice(0, 200), visitorKind(ua, request.headers), visitorLabel(visitor)],
    doubles: [ev.results, ev.rank ?? 0],
  });
}

export function recordApiSearch(request: Request, url: URL, response: Response, env: TelemetryEnv, ctx: WaitUntil) {
  if (request.method !== "GET" || !canRecord(env)) return;
  if (url.pathname === "/api/search" && response.status === 200) {
    const q = url.searchParams.get("q")?.trim();
    if (!q) return;
    const category = url.searchParams.get("category")?.trim() ?? "";
    ctx.waitUntil(response.clone().json().then((body: unknown) => {
      const total = typeof (body as { total?: unknown })?.total === "number" ? (body as { total: number }).total : 0;
      writeSearchRow(request, env, { q, source: "api", dest: "", results: total, category });
    }).catch(() => {}));
    return;
  }
  if (url.pathname === "/api/resolve") {
    const q = url.searchParams.get("name")?.trim();
    if (!q) return;
    if (response.status !== 200) return writeSearchRow(request, env, { q, source: "resolve", dest: "", results: 0 });
    ctx.waitUntil(response.clone().json().then((body: unknown) => {
      const slug = typeof (body as { slug?: unknown })?.slug === "string" ? (body as { slug: string }).slug : "";
      writeSearchRow(request, env, { q, source: "resolve", dest: slug, results: slug ? 1 : 0 });
    }).catch(() => {}));
    return;
  }
  if (url.pathname === "/api/generate") {
    const slug = url.searchParams.get("slug")?.trim();
    if (!slug) return;
    ctx.waitUntil(response.clone().text().then((body) => {
      const found = response.status === 200 && !body.includes('"stage":"error"');
      writeSearchRow(request, env, { q: slug, source: "generate", dest: found ? slug : "", results: found ? 1 : 0 });
    }).catch(() => writeSearchRow(request, env, { q: slug, source: "generate", dest: "", results: 0 })));
  }
}

export function recordSearchBeacon(request: Request, url: URL, env: TelemetryEnv): Response | null {
  if (url.pathname !== "/api/search-log") return null;
  const q = url.searchParams.get("q")?.trim();
  if (q) writeSearchRow(request, env, {
    q,
    source: url.searchParams.get("src") === "home" ? "home" : "overlay",
    dest: url.searchParams.get("dest")?.trim() ?? "",
    results: Number(url.searchParams.get("n")) || 0,
    rank: Number(url.searchParams.get("rank")) || 0,
  });
  return new Response(null, { status: 204 });
}
