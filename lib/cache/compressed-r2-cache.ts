import { error } from "@opennextjs/aws/adapters/logger.js";
import { IgnorableError } from "@opennextjs/aws/utils/error.js";
import type {
  CacheEntryType,
  CacheValue,
  IncrementalCache,
  WithLastModified,
} from "@opennextjs/aws/types/overrides.js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { computeCacheKey } from "@opennextjs/cloudflare/overrides/internal";

const BINDING_NAME = "NEXT_INC_CACHE_R2_BUCKET";
const PREFIX_ENV_NAME = "NEXT_INC_CACHE_R2_PREFIX";

/**
 * ISR cache stored gzipped and de-duplicated instead of raw JSON.
 *
 * A doc page entry is ~250 KB of JSON: prerendered `html`, the `rsc` payload,
 * and `segmentData` for Next's segment prefetch. Two savings, applied in order:
 *
 *  1. `segmentData["/_full"]` is byte-identical to `rsc` in every entry
 *     measured, so it is dropped on write and restored on read. gzip's 32 KB
 *     window cannot span the ~400 KB between the two copies, so removing the
 *     duplicate before compressing is a real win, not a redundant one.
 *  2. gzip over the result. Measured on the largest live entries: 7.6x from
 *     gzip alone, 9.5x with the de-duplication.
 *
 * There is no read path for uncompressed entries. An old raw-JSON object fails
 * `JSON.parse` after gunzip, the `get` returns null, and Next treats it as a
 * miss and re-renders — the cache heals itself one entry at a time.
 */

const FULL_SEGMENT_KEY = "/_full";

type MaybeRouteEntry = {
  rsc?: string;
  segmentData?: Record<string, string | null>;
};

/**
 * Replace `segmentData["/_full"]` with null when it duplicates `rsc`. Null
 * rather than a delete: the key keeps its slot, so `expand` restores the entry
 * byte-for-byte instead of moving the segment to the end of the object.
 */
function shrink<CacheType extends CacheEntryType>(
  value: CacheValue<CacheType>,
): CacheValue<CacheType> {
  const entry = value as MaybeRouteEntry;
  const full = entry.segmentData?.[FULL_SEGMENT_KEY];
  if (full === undefined || full !== entry.rsc) return value;
  return {
    ...value,
    segmentData: { ...entry.segmentData, [FULL_SEGMENT_KEY]: null },
  } as CacheValue<CacheType>;
}

function expand<CacheType extends CacheEntryType>(
  value: CacheValue<CacheType>,
): CacheValue<CacheType> {
  const entry = value as MaybeRouteEntry;
  if (entry.segmentData?.[FULL_SEGMENT_KEY] !== null) return value;
  return {
    ...value,
    segmentData: { ...entry.segmentData, [FULL_SEGMENT_KEY]: entry.rsc },
  } as CacheValue<CacheType>;
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function gunzip(body: ReadableStream): Promise<string> {
  return new Response(body.pipeThrough(new DecompressionStream("gzip"))).text();
}

/**
 * Hash of the *uncompressed* payload, stored alongside the object.
 * gzip output is not byte-stable across implementations, so the deploy-time
 * sync (scripts/cache-sync.ts) cannot diff on the R2 etag for entries the
 * worker wrote. It compares this instead and skips the PUT when the content
 * is unchanged — Class A operations are the expensive ones.
 */
async function sourceHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

class CompressedR2IncrementalCache implements IncrementalCache {
  readonly name = "compressed-r2-incremental-cache";

  async get<CacheType extends CacheEntryType = "cache">(
    key: string,
    cacheType?: CacheType,
  ): Promise<WithLastModified<CacheValue<CacheType>> | null> {
    const r2 = this.bucket();
    try {
      const object = await r2.get(this.getR2Key(key, cacheType));
      if (!object) return null;
      const value = JSON.parse(await gunzip(object.body)) as CacheValue<CacheType>;
      return { value: expand(value), lastModified: object.uploaded.getTime() };
    } catch (e) {
      error("Failed to get from cache", e);
      return null;
    }
  }

  async set<CacheType extends CacheEntryType = "cache">(
    key: string,
    value: CacheValue<CacheType>,
    cacheType?: CacheType,
  ): Promise<void> {
    const r2 = this.bucket();
    try {
      const json = JSON.stringify(shrink(value));
      const [body, srchash] = await Promise.all([gzip(json), sourceHash(json)]);
      await r2.put(this.getR2Key(key, cacheType), body, {
        httpMetadata: { contentEncoding: "gzip", contentType: "application/json" },
        customMetadata: { srchash },
      });
    } catch (e) {
      error("Failed to set to cache", e);
    }
  }

  async delete(key: string): Promise<void> {
    const r2 = this.bucket();
    try {
      await r2.delete(this.getR2Key(key));
    } catch (e) {
      error("Failed to delete from cache", e);
    }
  }

  private bucket() {
    const r2 = getCloudflareContext().env[BINDING_NAME];
    if (!r2) throw new IgnorableError("No R2 bucket");
    return r2;
  }

  private getR2Key(key: string, cacheType?: CacheEntryType): string {
    return computeCacheKey(key, {
      prefix: getCloudflareContext().env[PREFIX_ENV_NAME],
      buildId: process.env.OPEN_NEXT_BUILD_ID,
      cacheType,
    });
  }
}

const compressedR2IncrementalCache = new CompressedR2IncrementalCache();
export default compressedR2IncrementalCache;
