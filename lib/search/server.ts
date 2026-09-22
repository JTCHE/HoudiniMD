/**
 * The search a Worker runs in its own isolate.
 *
 * Three routes wanted search results and each asked for them over HTTP, against
 * the site's own origin. Cloudflare bills a self-fetch as a second Worker
 * invocation, so a 404 that offered "Did you mean" paid for the miss twice: one
 * tail measured 884 ms for the miss and a further 360 ms for its suggestion
 * list. The work was never remote, only the call was.
 *
 * `/api/search` is now a thin HTTP wrapper over this function, and every caller
 * inside the Worker calls the function.
 */
import { getConfig } from "@/lib/r2/config";
import { rankResults, type RankedResult } from "@/lib/search/ranking";
import { DOCS_KEY, type DocsTable } from "@/lib/search/bm25";
import { SITE_URL as ROOT } from "@/lib/site";

export interface SearchHit extends RankedResult {
  docs_url: string;
  raw_url: string;
}

/** Thrown when R2 holds no usable index. The HTTP route turns this into a 503. */
export class SearchUnavailableError extends Error {}

// Per-isolate, because the table is the one thing a query does not re-fetch.
// Postings are cached separately inside lib/search/bm25.
let cache: { table: DocsTable; expiry: number } | null = null;
const TABLE_TTL = 5 * 60 * 1000;

type Mark = (stage: string) => void;
const noop: Mark = () => {};

export async function searchDocs(
  q: string,
  limit = 20,
  category?: string,
  mark: Mark = noop,
): Promise<SearchHit[]> {
  const config = getConfig();
  if (!config) throw new SearchUnavailableError("no R2 config");

  if (!cache || Date.now() >= cache.expiry) {
    mark("fetch-docs:start");
    // Held at the edge for the same five minutes the isolate holds it, so a
    // cold isolate reads 4.5 MB from the colo rather than from the bucket. The
    // table names the build every shard is keyed by, so a table this old is
    // paired with postings of its own build, never a mix.
    const res = await fetch(`${config.publicUrl}/${DOCS_KEY}`, {
      cf: { cacheTtl: TABLE_TTL / 1000, cacheEverything: true },
    } as RequestInit);
    mark("fetch-docs:done");
    if (!res.ok) throw new SearchUnavailableError(`docs table ${res.status}`);
    mark("parse-docs:start");
    const table: DocsTable = await res.json();
    mark("parse-docs:done");
    cache = { table, expiry: Date.now() + TABLE_TTL };
  } else {
    mark("cache-hit");
  }

  mark("rank:start");
  const ranked = await rankResults(cache.table, q, limit, category);
  mark("rank:done");

  return ranked.map((r) => ({
    ...r,
    docs_url: `${ROOT}/docs/${r.path}`,
    raw_url: `${ROOT}/docs/${r.path}.md`,
  }));
}
