/**
 * Client-side search. Loads the index once (lazily, when the overlay first
 * opens or the first query runs), builds the Fuse index on the user's device,
 * and ranks entirely in the browser — the Worker is never involved, so search
 * can never hit the 10ms CPU limit again.
 *
 * The Fuse index itself is built lazily (only on the first query that needs the
 * fuzzy fallback) so opening the overlay and typing an exact node name stays
 * instant even on slower devices.
 */
import Fuse from "fuse.js";
import {
  toIndexed,
  rankResults,
  FUSE_OPTIONS,
  type IndexedEntry,
  type RankedResult,
} from "./ranking";
import type { SearchIndexEntry } from "@/lib/r2/search-index";

interface Loaded {
  indexed: IndexedEntry[];
  fuse: Fuse<IndexedEntry> | null;
}

let loadPromise: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const res = await fetch("/api/search-index");
      if (!res.ok) throw new Error(`search index fetch failed: ${res.status}`);
      const entries: SearchIndexEntry[] = await res.json();
      return { indexed: toIndexed(entries), fuse: null };
    })();
    // Let a failed load be retried on the next call rather than caching the rejection.
    loadPromise.catch(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

/** Kick off the index download ahead of the first keystroke (e.g. on open). */
export function prewarmSearchIndex(): void {
  void load();
}

export async function searchClient(q: string, limit = 6): Promise<RankedResult[]> {
  const query = q.trim();
  if (!query) return [];
  const loaded = await load();
  const makeFuse = () => {
    if (!loaded.fuse) loaded.fuse = new Fuse(loaded.indexed, FUSE_OPTIONS);
    return loaded.fuse;
  };
  return rankResults(loaded.indexed, query, limit, makeFuse);
}
