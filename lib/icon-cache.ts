import { HOUDINI_ICON_ROOT } from "./houdini";

const MONTH_SECONDS = 30 * 24 * 60 * 60;
const MONTH_MS = MONTH_SECONDS * 1000;
const DAY_SECONDS = 24 * 60 * 60;

export interface IconObject {
  body: ReadableStream;
  customMetadata?: Record<string, string>;
  httpEtag: string;
}

export interface IconBucket {
  get(key: string): Promise<IconObject | null>;
  put(
    key: string,
    value: string,
    options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> },
  ): Promise<unknown>;
}

export function validIconPath(path: string): boolean {
  try {
    const decoded = decodeURIComponent(path);
    return decoded.endsWith(".svg") && !decoded.includes("\\") && !decoded.split("/").includes("..");
  } catch {
    return false;
  }
}

export function iconNeedsRefresh(icon: IconObject): boolean {
  const refreshedAt = Date.parse(icon.customMetadata?.refreshedAt ?? "");
  return !Number.isFinite(refreshedAt) || Date.now() - refreshedAt >= MONTH_MS;
}

export async function normalizeIcon(svg: string, path: string): Promise<string> {
  const { optimize } = await import("svgo/browser");
  return optimize(svg, {
    multipass: true,
    path,
    plugins: ["preset-default", "removeDimensions", "sortAttrs"],
  }).data;
}

export async function fetchIcon(path: string): Promise<string> {
  const response = await fetch(`${HOUDINI_ICON_ROOT}/${path}`);
  if (!response.ok) throw new Error(`SideFX icon returned ${response.status}: ${path}`);
  return normalizeIcon(await response.text(), path);
}

export async function refreshIcon(path: string, bucket: IconBucket): Promise<string> {
  const data = await fetchIcon(path);
  await bucket.put(path, data, {
    httpMetadata: { contentType: "image/svg+xml; charset=utf-8" },
    customMetadata: { refreshedAt: new Date().toISOString() },
  });
  return data;
}

export function iconResponse(body: BodyInit, etag?: string): Response {
  const headers = new Headers({
    "cache-control": `public, max-age=${MONTH_SECONDS}, s-maxage=${DAY_SECONDS}`,
    "content-type": "image/svg+xml; charset=utf-8",
  });
  if (etag) headers.set("etag", etag);
  return new Response(body, { headers });
}
