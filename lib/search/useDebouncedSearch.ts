"use client";

import { useEffect, useState } from "react";
import { searchClient, prewarmSearchIndex } from "./client";
import type { RankedResult } from "./ranking";

// Stable identity so callers comparing results by reference (e.g. resetting
// selection when the set changes) don't see a "new" empty array every render.
const EMPTY: RankedResult[] = [];

/**
 * Debounced client-side search — single source of truth for querying the
 * in-browser BM25 index, shared by the docs search overlay and the homepage
 * search field so both stay in sync with the same ranking/debounce behavior.
 */
export function useDebouncedSearch(query: string, limit = 6): RankedResult[] {
  const [results, setResults] = useState<RankedResult[]>([]);

  useEffect(() => {
    prewarmSearchIndex();
  }, []);

  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      searchClient(trimmed, limit)
        .then((ranked) => {
          if (!cancelled) {
            setResults(ranked);
          }
        })
        .catch(() => {});
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, limit]);

  return trimmed ? results : EMPTY;
}
