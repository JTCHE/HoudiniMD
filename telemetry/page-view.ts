import { botFamily, browserEvidence, visitorKind } from "../lib/wants-markdown";
import { visitorHash } from "../lib/visitor-hash";
import { visitorLabel } from "../lib/visitor-label";
import { canRecord, type TelemetryEnv } from "./types";

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

export function recordPageView(request: Request, url: URL, response: Response, env: TelemetryEnv) {
  if (!canRecord(env) || request.method !== "GET" || response.status >= 300 && response.status < 400) return;
  if (request.headers.get("next-router-prefetch")) return;
  const path = url.pathname;
  if (path !== "/" && !path.startsWith("/docs/")) return;
  const ua = request.headers.get("user-agent");
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const salt = env.VISITOR_SALT!;
  const visitor = visitorHash(`${ip}|${ua ?? ""}`, salt);
  env.ANALYTICS!.writeDataPoint({
    indexes: [visitor],
    blobs: [
      path.endsWith(".md") ? path.slice(0, -3) : path,
      visitorKind(ua, request.headers),
      visitorHash(ip, salt),
      request.headers.get("cf-ipcountry") ?? "",
      botFamily(ua) ?? "",
      ((request as Request & { cf?: { city?: string } }).cf?.city) ?? "",
      browserEvidence(request.headers),
      referrerHost(request, url),
      visitorKind(ua, request.headers),
      visitorLabel(visitor),
    ],
    doubles: [response.status, path.endsWith(".md") ? 1 : 0],
  });
}
