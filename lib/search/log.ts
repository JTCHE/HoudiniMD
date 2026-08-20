/**
 * Reports a search the reader acted on — or gave up on — to the worker, which
 * writes it to Analytics Engine (see recordSearchBeacon in worker.ts).
 *
 * Two paths need this. Picking a result out of the list, and closing the
 * overlay with no pick. Every other submit path (pressing Enter with no
 * result, the homepage "Go" button) goes through `/api/resolve` or
 * `/api/generate`, which the worker already records server-side — beaconing
 * those too would count one search twice. A close with no navigation is
 * covered by nothing else, so it is beaconed here.
 *
 * Fire-and-forget: a dropped log must never delay or break a navigation.
 */
function beacon(params: URLSearchParams): void {
  try {
    navigator.sendBeacon?.(`/api/search-log?${params}`);
  } catch {
    // sendBeacon throws on some payload/permission edge cases; a lost log is
    // not worth an exception on the navigation path.
  }
}

/** A reader picked a result. `results` is how many the list held. */
export function logSearch(q: string, dest: string, source: "overlay" | "home", rank: number, results: number): void {
  const query = q.trim();
  if (!query) return; // a click from the recents list answers no query
  beacon(new URLSearchParams({
    q: query,
    dest,
    src: source,
    n: String(results),
    ...(rank ? { rank: String(rank) } : {}),
  }));
}

/**
 * A reader closed the overlay without picking anything. Only the last settled
 * query goes out, never the keystrokes that led to it — a row per prefix is
 * noise, and each row is free text a person typed.
 */
export function logAbandonedSearch(q: string, results: number): void {
  const query = q.trim();
  if (!query) return;
  beacon(new URLSearchParams({ q: query, src: "abandon", n: String(results) }));
}
