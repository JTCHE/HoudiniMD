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
import { scrapeSideFXPage, PageNotFoundError } from "../../lib/scraping";
import { convertToMarkdown, detectLanguage } from "../../lib/markdown";
import { toSideFXUrl } from "../../lib/url";
import { saveToR2 } from "../../lib/r2";
import { getConfig, getS3Client } from "../../lib/r2/config";
import type { SearchIndexEntry } from "../../lib/r2/search-index";

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
  const client = getS3Client();
  if (!config || !client) {
    throw new Error(
      "R2 not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL in .env.local",
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
  const client = getS3Client();
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
  const client = getS3Client();
  if (!config || !client) {
    throw new Error("R2 not configured — cannot write search index");
  }

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: INDEX_PATH,
      Body: JSON.stringify(sorted, null, 2),
      ContentType: "application/json; charset=utf-8",
    }),
  );
}

/**
 * Scrape, convert, save a single slug. Returns the search-index entry on success
 * so the caller can batch-merge into the index in memory.
 */
async function regenerateOnce(
  slug: string,
): Promise<{ entry: SearchIndexEntry } | { status: "404" }> {
  const sideFXUrl = toSideFXUrl(slug);

  let scraped;
  try {
    scraped = await scrapeSideFXPage(sideFXUrl);
  } catch (err) {
    if (err instanceof PageNotFoundError) {
      // Try the /index.html variant — same fallback the generator uses
      try {
        scraped = await scrapeSideFXPage(`https://www.sidefx.com/docs/${slug}/index.html`);
      } catch (err2) {
        if (err2 instanceof PageNotFoundError) return { status: "404" };
        throw err2;
      }
    } else {
      throw err;
    }
  }

  const markdown = convertToMarkdown(scraped, { codeLanguage: detectLanguage(slug) });
  await saveToR2(`content/${slug}.md`, markdown);

  return {
    entry: {
      path: slug,
      title: scraped.title,
      summary: scraped.summary,
      category: scraped.category,
      version: scraped.version,
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

/**
 * Regenerate a batch of slugs.
 *
 * Search-index entries from successful regenerations are merged into the existing
 * R2 index and written back in a single PUT at the end (instead of one PUT per slug).
 */
export async function regenerateBatch(
  slugs: string[],
  options: Partial<RegenOptions> = {},
): Promise<RegenResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Load index once so we can update it in memory and write back once at the end.
  const indexBefore = opts.dryRun ? [] : await fetchSearchIndex();
  const indexByPath = new Map(indexBefore.map((e) => [e.path, e]));

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
          indexByPath.set(res.entry.path, res.entry);
        }
        done++;
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

  // Write the merged index once at the end. Only update if at least one entry changed.
  const okCount = results.filter((r) => r.status === "ok").length;
  if (!opts.dryRun && okCount > 0) {
    await putSearchIndex([...indexByPath.values()]);
  }

  return results;
}
