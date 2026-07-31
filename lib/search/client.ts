/**
 * Client-side search. Loads the doc table once (lazily, when the overlay first
 * opens or the first query runs) and ranks in the browser.
 *
 * The table comes same-origin from `/api/search-index`; BM25 postings shards
 * come straight from the R2 public origin named in `table.origin`, which is why
 * that bucket needs CORS. Only the 3-5 shards a query touches are downloaded.
 */
import { rankResults, type RankedResult } from "./ranking";
import { applyClickBoost } from "./clicks";
import type { DocsTable } from "./bm25";

let loadPromise: Promise<DocsTable> | null = null;

function load(): Promise<DocsTable> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const res = await fetch("/api/search-index");
      if (!res.ok) throw new Error(`search index fetch failed: ${res.status}`);
      return (await res.json()) as DocsTable;
    })();
    // Let a failed load be retried on the next call rather than caching the rejection.
    loadPromise.catch(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

/** Kick off the table download ahead of the first keystroke (e.g. on open). */
export function prewarmSearchIndex(): void {
  void load();
}

export async function searchClient(q: string, limit = 6): Promise<RankedResult[]> {
  const query = q.trim();
  if (!query) return [];
  // Rank deeper than we show: a page this browser has learned is only worth
  // promoting if it was still ranked, and the ones worth rescuing sit just
  // below the cut. `/api/search` deliberately does not do this — see ./clicks.
  const ranked = await rankResults(await load(), query, limit * 3);
  return applyClickBoost(query, ranked).slice(0, limit);
}
