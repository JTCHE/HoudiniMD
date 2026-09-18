import { parseImageDimensions, type ImageDimensions } from "./dimensions";
import { fetchFromR2 } from "../r2/read";

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
//
// Capped: a single client that walks thousands of distinct pages in one
// sustained crawl (every page probing its own icons/banners) can keep one
// isolate warm long enough to grow this unbounded, which is exactly the
// traffic shape behind a cluster of otherwise-unexplained 500s. FIFO
// eviction is enough — this is a dimensions cache, not a hot-path index;
// losing the oldest entry just costs one re-probe.
const PROBE_CACHE_MAX = 2000;
const probeCache = new Map<string, ImageProbe | null>();

function cacheProbe(url: string, probe: ImageProbe | null): void {
  if (probeCache.size >= PROBE_CACHE_MAX) {
    const oldest = probeCache.keys().next().value;
    if (oldest !== undefined) probeCache.delete(oldest);
  }
  probeCache.set(url, probe);
}

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

/**
 * Sizes for every image the mirror references, written by scripts/probe-images.ts.
 *
 * The build used to read each one off sidefx.com. A probe that times out drops
 * the image's reserved box, which changes the page — so a few percent of
 * probes failing meant ~1,100 of 11,422 pages rendered differently on every
 * build and were re-uploaded for nothing (measured: pages that churned carry
 * 9.0 images each against 5.4 for pages that do not). The build reads this
 * instead and never touches the network, so two builds of the same content
 * give the same bytes.
 */
export const DIMENSIONS_KEY = "content/image-dimensions.json";

let knownPromise: Promise<ReadonlyMap<string, ImageDimensions>> | null = null;

function known(): Promise<ReadonlyMap<string, ImageDimensions>> {
  knownPromise ??= fetchFromR2(DIMENSIONS_KEY, true)
    .then((raw) => {
      const rows = raw ? (JSON.parse(raw) as Record<string, [number, number]>) : {};
      return new Map(Object.entries(rows).map(([url, [width, height]]) => [url, { width, height }]));
    })
    .catch(() => new Map<string, ImageDimensions>());
  return knownPromise;
}

/** The build must not probe: see `known()`. A live render still may. */
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

export async function probeImage(url: string): Promise<ImageProbe | null> {
  const cached = probeCache.get(url);
  if (cached !== undefined) return cached;

  const stored = (await known()).get(url);
  if (stored) {
    const probe = { ...stored, placeholder: null };
    cacheProbe(url, probe);
    return probe;
  }
  // An image added since the last run of scripts/probe-images.ts. A live render
  // reads it once and holds it for the isolate; the build leaves it unreserved
  // rather than letting the network decide what the page looks like.
  if (IS_BUILD) {
    cacheProbe(url, null);
    return null;
  }

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
  cacheProbe(url, probe);
  return probe;
}

/**
 * Probe every URL once, in parallel. Capped so an image-heavy page cannot fan
 * out an unbounded number of upstream requests on a cold render; images past
 * the cap render unreserved rather than blocking the page.
 *
 * Pages with several image-group comparison rows (see MarkdownDiv in
 * components/docs/markdown/index.tsx) plus inline node-link icons can carry
 * 25+ distinct URLs — a group's shared height needs every member probed, or
 * it falls back to unequal per-image heights ("stairs").
 */
const MAX_PROBES_PER_PAGE = 40;

export async function probeImages(urls: string[]): Promise<Map<string, ImageProbe>> {
  const unique = Array.from(new Set(urls)).slice(0, MAX_PROBES_PER_PAGE);
  const results = await Promise.all(unique.map(async (url) => [url, await probeImage(url)] as const));
  const map = new Map<string, ImageProbe>();
  for (const [url, probe] of results) {
    if (probe) map.set(url, probe);
  }
  return map;
}
