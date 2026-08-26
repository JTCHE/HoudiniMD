/**
 * Mother regeneration library — shared logic used by every script in this folder.
 *
 * Responsibilities:
 *   - Concurrency-limited scrape+save pipeline
 *   - Batch-aware search-index updates (single PUT at the end instead of N PUTs)
 *   - Retry with backoff for transient SideFX failures
 *   - Progress reporting with structured stats
 */

import { GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { scrapeSideFXPage, PageNotFoundError, resolveSideFXUrl } from "../../lib/scraping";
import { convertToMarkdown, detectLanguage } from "../../lib/markdown";
import { parseFrontmatter } from "../../lib/markdown/frontmatter";
import { saveToR2 } from "../../lib/r2";
import { getConfig, getS3Client } from "../../lib/r2/config";
import { mutateSearchIndex, putLiteIndex, type SearchIndexEntry } from "../../lib/r2/search-index";

const INDEX_PATH = "content/index.json";

export interface RegenJob {
  slug: string;
}

export interface RegenResult {
  slug: string;
  status: "ok" | "skipped" | "404" | "error";
  error?: string;
  durationMs: number;
}

export interface RegenOptions {
  concurrency: number;
  dryRun: boolean;
  retries: number;
  /** delay between retries in ms (exponential backoff: delay * 2^attempt) */
  retryBaseDelayMs: number;
  /** if true, skip slugs that already exist in R2 */
  skipExisting: boolean;
  onProgress?: (done: number, total: number, last: RegenResult) => void;
}

export const DEFAULT_OPTIONS: RegenOptions = {
  concurrency: 4,
  dryRun: false,
  retries: 2,
  retryBaseDelayMs: 800,
  skipExisting: false,
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strip `content/` prefix and `.md` suffix to get the slug. */
function keyToSlug(key: string): string {
  return key.replace(/^content\//, "").replace(/\.md$/, "");
}

/** List every markdown file currently in the R2 bucket. */
export async function listR2Slugs(): Promise<string[]> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) {
    throw new Error(
      "R2 not configured. Set CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL in .env.local",
    );
  }

  const slugs: string[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: "content/",
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key?.endsWith(".md") && obj.Key !== INDEX_PATH) {
        slugs.push(keyToSlug(obj.Key));
      }
    }
    token = res.NextContinuationToken;
  } while (token);

  return slugs.sort();
}

/** Read the current search index from R2 (or empty array if missing). */
export async function fetchSearchIndex(): Promise<SearchIndexEntry[]> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) return [];

  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: config.bucketName, Key: INDEX_PATH }),
    );
    if (!res.Body) return [];
    const raw = await res.Body.transformToString("utf-8");
    return JSON.parse(raw);
  } catch (err: unknown) {
    if (err && typeof err === "object") {
      if ("name" in err && err.name === "NoSuchKey") return [];
      if ("$metadata" in err) {
        const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
        if (meta?.httpStatusCode === 404) return [];
      }
    }
    throw err;
  }
}

/** Single bulk write of the search index — far cheaper than N per-entry updates. */
export async function putSearchIndex(entries: SearchIndexEntry[]): Promise<void> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) {
    throw new Error("R2 not configured — cannot write search index");
  }

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: INDEX_PATH,
      Body: JSON.stringify(sorted),
      ContentType: "application/json; charset=utf-8",
    }),
  );
  await putLiteIndex(client, config.bucketName, sorted);
}

/**
 * Scrape, convert, save a single slug. Returns the search-index entry on success
 * so the caller can batch-merge into the index in memory.
 */
async function regenerateOnce(
  slug: string,
): Promise<{ entry: SearchIndexEntry } | { status: "404" }> {
  let scraped;
  try {
    scraped = await scrapeSideFXPage((await resolveSideFXUrl(slug)).url);
  } catch (err) {
    if (err instanceof PageNotFoundError) return { status: "404" };
    throw err;
  }

  const markdown = await convertToMarkdown(scraped, { codeLanguage: detectLanguage(slug) });
  await saveToR2(`content/${slug}.md`, markdown);

  // The search index's summary feeds /api/meta-all's tooltip prefill, so it
  // must match what the tooltip actually shows — the frontmatter `description`
  // (see converter.ts), not the raw scrape, which may differ once patched pages
  // fall back to getPagePreview(body) instead of the summary blockquote.
  const { data } = parseFrontmatter(markdown);

  return {
    entry: {
      path: slug,
      title: scraped.title,
      summary: data.description ?? "",
      category: scraped.category,
      version: scraped.version,
      icon: scraped.icon,
      lastModified: new Date().toISOString(),
    },
  };
}

/** Promise pool with N workers consuming a queue. */
async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// Flush the search index every FLUSH_EVERY successful regenerations instead
// of only once at the very end. A single end-of-batch write meant an
// interrupted run (Ctrl-C, OOM, box reboot, SideFX rate-limiting a run to
// death) lost the index entry for every page it had *already* saved to R2 in
// that run — the content was live but invisible to search/sitemap/static
// params until someone noticed and re-ran the index step by hand. This is
// most of the historical 4,241-page gap documented in "Content Index Misses
// Pages That Are Live In R2".
//
// 25 was picked as a middle ground: mutateSearchIndex() does a GET-sort-PUT
// round (~3MB body, ~16k entries) with up to 8 conditional-write retries on
// 409/412, plus its own internal lite-index resync. At concurrency 4 (the
// default), one entry lands roughly every 1-2s, so a flush every 25 is
// roughly a 30-60s cadence — frequent enough that an interrupted run only
// ever loses a couple dozen entries, not thousands, but spaced out enough
// that flushes rarely overlap and start colliding on the ETag (each 409 is a
// full extra GET-sort-PUT round-trip against a multi-MB object).
const FLUSH_EVERY = 25;

/**
 * Regenerate a batch of slugs.
 *
 * Search-index entries from successful regenerations are flushed to the R2
 * index incrementally (every FLUSH_EVERY successes) rather than in a single
 * PUT at the end, so an interrupted run only loses the tail of already-saved
 * content, not the whole batch. A final flush after the pool drains catches
 * any remainder smaller than FLUSH_EVERY.
 */
export async function regenerateBatch(
  slugs: string[],
  options: Partial<RegenOptions> = {},
): Promise<RegenResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Entries/removals accumulated since the last flush. mutateSearchIndex()
  // merges against whatever is live in R2 at flush time, so these only need
  // to hold what hasn't been written yet — not the whole batch.
  let pendingEntries = new Map<string, SearchIndexEntry>();
  let pendingRemovals = new Set<string>();
  // Serializes flushes so concurrent workers hitting FLUSH_EVERY at once
  // don't fire overlapping mutateSearchIndex() calls (each one is a
  // GET-sort-PUT round against the same object; overlapping ones just
  // guarantee each other a 409 and burn a retry).
  let flushChain: Promise<void> = Promise.resolve();

  const flush = () => {
    if (opts.dryRun || (!pendingEntries.size && !pendingRemovals.size)) return flushChain;
    const entries = pendingEntries;
    const removals = pendingRemovals;
    pendingEntries = new Map();
    pendingRemovals = new Set();
    flushChain = flushChain.then(() =>
      mutateSearchIndex((current) => {
        const indexByPath = new Map(current.map((entry) => [entry.path, entry]));
        for (const path of removals) indexByPath.delete(path);
        for (const entry of entries.values()) indexByPath.set(entry.path, entry);
        return [...indexByPath.values()];
      }).then(() => {}),
    );
    return flushChain;
  };

  let done = 0;
  const results = await runPool<string, RegenResult>(slugs, opts.concurrency, async (slug) => {
    const start = performance.now();

    if (opts.dryRun) {
      const r: RegenResult = { slug, status: "skipped", durationMs: 0 };
      done++;
      opts.onProgress?.(done, slugs.length, r);
      return r;
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      try {
        const res = await regenerateOnce(slug);
        const r: RegenResult = {
          slug,
          status: "status" in res ? "404" : "ok",
          durationMs: performance.now() - start,
        };
        if (!("status" in res)) {
          pendingEntries.set(res.entry.path, res.entry);
        } else {
          // SideFX confirmed this page is gone: retaining it makes search link
          // to a local 404 until somebody manually repairs the index.
          pendingRemovals.add(slug);
        }
        done++;
        if (done % FLUSH_EVERY === 0) flush();
        opts.onProgress?.(done, slugs.length, r);
        return r;
      } catch (err) {
        lastErr = err;
        if (attempt < opts.retries) {
          await sleep(opts.retryBaseDelayMs * Math.pow(2, attempt));
        }
      }
    }

    const r: RegenResult = {
      slug,
      status: "error",
      error: lastErr instanceof Error ? lastErr.message : String(lastErr),
      durationMs: performance.now() - start,
    };
    done++;
    opts.onProgress?.(done, slugs.length, r);
    return r;
  });

  // Final flush for whatever remainder didn't line up on a FLUSH_EVERY
  // boundary (including the entire batch, if it was smaller than that).
  flush();
  await flushChain;

  return results;
}
