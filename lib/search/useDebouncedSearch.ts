"use client";

import { useEffect, useState } from "react";
import { searchClient, prewarmSearchIndex } from "./client";
import type { RankedResult } from "./ranking";
import { recordSearch } from "./telemetry";

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

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      searchClient(q, limit)
        .then((ranked) => {
          if (!cancelled) {
            setResults(ranked);
            recordSearch(q, ranked.length);
          }
        })
        .catch(() => {});
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, limit]);

  return results;
}
