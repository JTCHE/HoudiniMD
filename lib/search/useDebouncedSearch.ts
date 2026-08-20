"use client";

import { useEffect, useState } from "react";
import { searchClient, prewarmSearchIndex } from "./client";
import type { RankedResult } from "./ranking";

// Stable identity so callers comparing results by reference (e.g. resetting
// selection when the set changes) don't see a "new" empty array every render.
const EMPTY: RankedResult[] = [];

/** The query the current results answer, and the results. */
interface Settled {
  query: string;
  results: RankedResult[];
}

const NONE: Settled = { query: "", results: EMPTY };

/**
 * Debounced client-side search — single source of truth for querying the
 * in-browser BM25 index, shared by the docs search overlay and the homepage
 * search field so both stay in sync with the same ranking/debounce behavior.
 *
 * The query comes back with the results because the reader keeps typing while
 * a search runs: the results on screen belong to an earlier query, and search
 * telemetry must report the pair that actually settled.
 */
export function useDebouncedSearch(query: string, limit = 6): Settled {
  const [settled, setSettled] = useState<Settled>(NONE);

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
            setSettled({ query: trimmed, results: ranked });
          }
        })
        .catch(() => {});
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, limit]);

  return trimmed ? settled : NONE;
}
