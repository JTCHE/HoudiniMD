import { parseImageDimensions, type ImageDimensions } from "./dimensions";

export interface ImageProbe extends ImageDimensions {
  /**
   * Tiny (~8px wide) preview, upscaled and rendered pixelated until the real
   * image loads. Null when none is available — the figure then shows a plain
   * skeleton in its reserved box, which never shifts either way.
   */
  placeholder: string | null;
}

// Enough to reach the SOF/IHDR header of most images SideFX serves. The pixel
// data beyond it is useless for a preview anyway: these are baseline JPEGs,
// so a prefix decodes to the top few rows and nothing else.
const PROBE_BYTES = 16 * 1024;
// Some JPEGs (e.g. the docs billboards) carry a large embedded ICC/EXIF
// profile before the SOF marker, past the first 16KB — retried once at this
// wider budget rather than paying it on every probe.
const PROBE_BYTES_FALLBACK = 128 * 1024;
const FETCH_TIMEOUT_MS = 3000;

// Warm-isolate cache: the same image appears across many pages, and its
// dimensions never change. Mirrors lib/r2/read.ts's index caching.
const probeCache = new Map<string, ImageProbe | null>();

/**
 * Fetch just the first bytes of a remote image and read its pixel size from
 * the header, without downloading the whole file.
 *
 * Returns null for any failure — non-image URL, non-2xx, network error,
 * timeout, or an unrecognized header. Callers must treat null as "no hint
 * available" and render the image unreserved, not as an error to surface.
 */
async function fetchPrefix(url: string, bytes: number): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${bytes - 1}` },
      signal: controller.signal,
    });
    // 206 = server honored the Range; 200 = it ignored it and sent the whole
    // (small) file. Both give a usable prefix.
    if (res.status !== 206 && res.status !== 200) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeImage(url: string): Promise<ImageProbe | null> {
  const cached = probeCache.get(url);
  if (cached !== undefined) return cached;

  let bytes = await fetchPrefix(url, PROBE_BYTES);
  let dims = bytes ? parseImageDimensions(bytes) : null;
  // JPEG confirmed (SOI marker) but no SOF found in the prefix — a large
  // ICC/EXIF block pushed it further in. Retry once at a wider budget instead
  // of giving up (see PROBE_BYTES_FALLBACK).
  if (!dims && bytes && bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    bytes = await fetchPrefix(url, PROBE_BYTES_FALLBACK);
    dims = bytes ? parseImageDimensions(bytes) : null;
  }

  const probe = dims ? { ...dims, placeholder: null } : null;
  probeCache.set(url, probe);
  return probe;
}

/**
 * Probe every URL once, in parallel. Capped so an image-heavy page cannot fan
 * out an unbounded number of upstream requests on a cold render; images past
 * the cap render unreserved rather than blocking the page.
 */
const MAX_PROBES_PER_PAGE = 12;

export async function probeImages(urls: string[]): Promise<Map<string, ImageProbe>> {
  const unique = Array.from(new Set(urls)).slice(0, MAX_PROBES_PER_PAGE);
  const results = await Promise.all(unique.map(async (url) => [url, await probeImage(url)] as const));
  const map = new Map<string, ImageProbe>();
  for (const [url, probe] of results) {
    if (probe) map.set(url, probe);
  }
  return map;
}
