import { useEffect, useState } from "react";
import { bodies, match, titles, type Hit } from "@/lib/search";

/** The body search waits this long after the last key. The title pick does not
 *  wait at all — it reads a list that is already in memory. */
export const BODY_SEARCH_DELAY = 120;

/**
 * Shorter than this, the body search does not run at all.
 *
 * One letter matches most of the corpus, and FTS5 has to rank all of it: the
 * measured cost is 202ms on this machine and 635ms on the reference laptop
 * while Houdini works, against 28ms for a real word. It buys nothing either —
 * the title list already answers a letter instantly, and BM25 over a one-letter
 * prefix ranks noise. See spec: Local — Performance Harness and Budgets.
 */
const MIN_BODY_QUERY = 3;

/** A result set, with the query it answers. */
export interface Found {
  query: string;
  hits: Hit[];
}

const NONE: Found = { query: "", hits: [] };

/**
 * The search behind every field in the app.
 *
 * Two paths, as the spec says. The titles come back from Rust once and are
 * picked from in memory, so the list answers every keystroke. The body text is
 * searched in SQLite with FTS5, a moment behind, and its hits are added under
 * the title hits. See spec: Local — SQLite FTS5 Index.
 *
 * The hits come back with the query they answer, so a caller never reads a
 * count against text the reader has already typed past.
 */
export function useSearch(query: string): Found {
  const [found, setFound] = useState<Found>(NONE);

  // `live` drops the answer to a query the reader has already typed past.
  useEffect(() => {
    const wanted = query.trim();
    if (!wanted) {
      setFound(NONE);
      return;
    }
    let live = true;

    titles().then((all) => {
      if (live) setFound({ query: wanted, hits: match(all, wanted) });
    });

    if (wanted.length < MIN_BODY_QUERY) return () => { live = false; };

    const timer = window.setTimeout(async () => {
      const [all, found] = await Promise.all([titles(), bodies(wanted)]);
      if (!live) return;
      const picked = match(all, wanted);
      const seen = new Set(picked.map((hit) => hit.path));
      setFound({
        query: wanted,
        hits: [...picked, ...found.filter((hit) => !seen.has(hit.path))],
      });
    }, BODY_SEARCH_DELAY);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  return found;
}
