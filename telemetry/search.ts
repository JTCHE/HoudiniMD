import { visitorKind } from "../lib/wants-markdown";
import { visitorHash } from "../lib/visitor-hash";
import { visitorLabel } from "../lib/visitor-label";
import { canRecord, type TelemetryEnv } from "./types";

type SearchSource = "overlay" | "home";

function writeSearchRow(request: Request, env: TelemetryEnv, ev: { q: string; source: SearchSource; dest: string; results: number; rank?: number }) {
  if (!canRecord(env)) return;
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const salt = env.VISITOR_SALT!;
  const ua = request.headers.get("user-agent");
  const visitor = visitorHash(`${ip}|${ua ?? ""}`, salt);
  env.ANALYTICS!.writeDataPoint({
    indexes: [visitor],
    blobs: [ev.q.slice(0, 200), "search", visitorHash(ip, salt), request.headers.get("cf-ipcountry") ?? "", ev.source, "", ev.dest.slice(0, 200), "", visitorKind(ua, request.headers), visitorLabel(visitor)],
    doubles: [ev.results, ev.rank ?? 0],
  });
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
