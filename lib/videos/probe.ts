import { parseWebmDimensions, type VideoDimensions } from "./dimensions";

export type VideoProbe = VideoDimensions;

// Matroska stores the Tracks element (with pixel dimensions) near the front
// of the file, ahead of frame data, but a SeekHead/Info section can push it
// back further than an image's header — a bigger prefix than images need is
// still cheap insurance.
const PROBE_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 3000;

// Warm-isolate cache: the same video appears across many pages, and its
// dimensions never change. Mirrors lib/images/probe.ts.
const probeCache = new Map<string, VideoProbe | null>();

/**
 * Fetch just the first bytes of a remote WebM video and read its pixel size
 * from the header, without downloading the whole file.
 *
 * Returns null for any failure — non-WebM URL, non-2xx, network error,
 * timeout, or a header that didn't fit in the fetched prefix. Callers must
 * treat null as "no hint available", not as an error to surface.
 */
export async function probeVideo(url: string): Promise<VideoProbe | null> {
  const cached = probeCache.get(url);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${PROBE_BYTES - 1}` },
      signal: controller.signal,
    });
    if (res.status !== 206 && res.status !== 200) return null;

    const probe = parseWebmDimensions(new Uint8Array(await res.arrayBuffer()));
    probeCache.set(url, probe);
    return probe;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Probe every URL once, in parallel. Capped so a video-heavy page cannot fan
 * out an unbounded number of upstream requests on a cold render; videos past
 * the cap fall back to client-side dimension detection.
 */
const MAX_PROBES_PER_PAGE = 6;

export async function probeVideos(urls: string[]): Promise<Map<string, VideoProbe>> {
  const unique = Array.from(new Set(urls)).slice(0, MAX_PROBES_PER_PAGE);
  const results = await Promise.all(unique.map(async (url) => [url, await probeVideo(url)] as const));
  const map = new Map<string, VideoProbe>();
  for (const [url, probe] of results) {
    if (probe) map.set(url, probe);
  }
  return map;
}
