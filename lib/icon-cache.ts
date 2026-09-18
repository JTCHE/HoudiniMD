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

/**
 * Read one icon from SideFX and keep the bytes, so the next request reads R2.
 *
 * The bytes go in as they arrive. An earlier version ran svgo here, which cost
 * 2700 CPU-ms for a single miss: 660 ms to evaluate the module, then up to
 * 730 ms of multipass over a 100 KB crowd icon. svgo is a build tool, and a
 * request is not a build. It saved 43-60% of the bytes, which R2 gives away
 * and the edge holds for a month.
 */
export async function refreshIcon(path: string, bucket: IconBucket): Promise<string> {
  const response = await fetch(`${HOUDINI_ICON_ROOT}/${path}`);
  if (!response.ok) throw new Error(`SideFX icon returned ${response.status}: ${path}`);
  const svg = await response.text();
  await bucket.put(path, svg, {
    httpMetadata: { contentType: "image/svg+xml; charset=utf-8" },
    customMetadata: { refreshedAt: new Date().toISOString() },
  });
  return svg;
}

export function iconResponse(body: BodyInit, etag?: string): Response {
  const headers = new Headers({
    "cache-control": `public, max-age=${MONTH_SECONDS}, s-maxage=${DAY_SECONDS}`,
    "content-type": "image/svg+xml; charset=utf-8",
  });
  if (etag) headers.set("etag", etag);
  return new Response(body, { headers });
}

/**
 * SideFX's icon tree has gaps, and a page that names a missing icon names it on
 * every view: one tail hour showed the same 404 asked for 14 times. Each of
 * those was a fetch to SideFX. Hold the answer at the edge for an hour instead.
 */
export function iconMissing(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": `public, max-age=${60 * 60}` },
  });
}
