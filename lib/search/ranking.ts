/**
 * Shared search ranking — used by BOTH the client-side search overlay and the
 * server `/api/search` route so results are identical regardless of where the
 * query runs. Pure/isomorphic: no Node or browser APIs, no I/O.
 *
 * Search moved client-side because building a Fuse index over ~10.5k entries on
 * a cold Worker isolate blew the 10ms CPU limit (Error 1102). The exact/prefix
 * pass here is cheap and handles the common case (typing a node name); the Fuse
 * fuzzy pass is the expensive fallback and is invoked lazily — only when
 * exact+prefix don't fill the requested limit.
 */
import Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import type { SearchIndexEntry } from "@/lib/r2/search-index";

export type IndexedEntry = SearchIndexEntry & { slug: string };

export interface RankedResult {
  path: string;
  title: string;
  summary: string;
  category: string;
  version: string;
  score: number | null;
}

/** Fuse config — kept here so the precomputed index and the runtime agree. */
export const FUSE_OPTIONS: IFuseOptions<IndexedEntry> = {
  keys: [
    { name: "slug", weight: 0.45 },
    { name: "title", weight: 0.35 },
    { name: "summary", weight: 0.1 },
    { name: "path", weight: 0.1 },
  ],
  threshold: 0.5,
  includeScore: true,
  ignoreLocation: true,
};

/** Add the `slug` field (last path segment) Fuse and ranking key off of. */
export function toIndexed(entries: SearchIndexEntry[]): IndexedEntry[] {
  return entries.map((e) => ({ ...e, slug: e.path.split("/").pop() ?? e.path }));
}

/**
 * Rank entries for a query: exact and prefix matches first (cheap, no Fuse),
 * then a fuzzy fallback. `makeFuse` is called lazily so callers can avoid
 * constructing the Fuse index unless the fuzzy pass is actually needed.
 */
export function rankResults(
  indexed: IndexedEntry[],
  q: string,
  limit: number,
  makeFuse: () => Fuse<IndexedEntry>,
  category?: string,
): RankedResult[] {
  let pool = indexed;
  if (category) {
    const cat = category.toLowerCase();
    pool = indexed.filter((e) => e.category.toLowerCase() === cat);
  }

  const qLower = q.toLowerCase().replace(/\s+/g, "");

  // 1. Exact & prefix matches — prioritized before fuzzy
  const exactHits = new Map<string, { item: IndexedEntry; score: number }>();
  const prefixHits = new Map<string, { item: IndexedEntry; score: number }>();

  for (const e of pool) {
    const titleNorm = e.title.toLowerCase().replace(/\s+/g, "");
    const slugLower = e.slug.toLowerCase();

    if (titleNorm === qLower || slugLower === qLower) {
      exactHits.set(e.path, { item: e, score: 0 });
    } else if (titleNorm.startsWith(qLower) || slugLower.startsWith(qLower)) {
      prefixHits.set(e.path, { item: e, score: 0.05 });
    }

    if (exactHits.size + prefixHits.size >= limit * 2) break;
  }

  // Sort prefix hits: title-prefix matches before slug-only matches
  const sortedPrefix = [...prefixHits.values()].sort((a, b) => {
    const aTitle = +!a.item.title.toLowerCase().replace(/\s+/g, "").startsWith(qLower);
    const bTitle = +!b.item.title.toLowerCase().replace(/\s+/g, "").startsWith(qLower);
    return aTitle - bTitle;
  });

  // 2. Fuse fuzzy fallback — only built/run when exact+prefix can't fill the
  // limit. This is the expensive step (index construction), so skipping it for
  // the common case is what keeps the work cheap.
  const seen = new Set([...exactHits.keys(), ...prefixHits.keys()]);
  const needFuzzy = exactHits.size + prefixHits.size < limit;
  const fuseHits = needFuzzy ? makeFuse().search(q, { limit: limit * 2 }) : [];

  const deprioritizeExamples = <T extends { item: IndexedEntry }>(arr: T[]) =>
    arr.sort((a) => +a.item.path.includes("/examples/"));

  const merged = [
    ...deprioritizeExamples([...exactHits.values()]),
    ...deprioritizeExamples(sortedPrefix),
    ...deprioritizeExamples(fuseHits.filter((r) => !seen.has(r.item.path)) as { item: IndexedEntry; score?: number }[]),
  ].slice(0, limit);

  // Deduplicate anchor fragments: keep "foo" over "foo#bar"
  const seenBase = new Set<string>();
  const deduped = merged.filter(({ item }) => {
    const base = item.path.split("#")[0];
    if (seenBase.has(base)) return false;
    seenBase.add(base);
    return true;
  });

  return deduped.map(({ item, score }) => ({
    path: item.path,
    title: item.title,
    summary: item.summary,
    category: item.category,
    version: item.version,
    score: score !== undefined ? Math.round((1 - score) * 100) / 100 : null,
  }));
}
