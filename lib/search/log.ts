/**
 * Reports a *submitted* search — a query the reader acted on — to the worker,
 * which writes it to Analytics Engine (see recordSearchBeacon in worker.ts).
 *
 * Only picking a result out of the list needs this. Every other submit path
 * (pressing Enter with no result, the homepage "Go" button) goes through
 * `/api/resolve` or `/api/generate`, which the worker already records
 * server-side — beaconing those too would count one search twice.
 *
 * Fire-and-forget: a dropped log must never delay or break a navigation.
 */
export function logSearch(q: string, dest: string, source: "overlay" | "home"): void {
  const query = q.trim();
  if (!query) return; // a click from the recents list answers no query
  // No result count: picking a result already says the search worked, and the
  // page picked is the finer answer. The count only matters where there is no
  // landing page — the API rows, which the worker counts server-side.
  const params = new URLSearchParams({ q: query, dest, src: source });
  try {
    navigator.sendBeacon?.(`/api/search-log?${params}`);
  } catch {
    // sendBeacon throws on some payload/permission edge cases; a lost log is
    // not worth an exception on the navigation path.
  }
}
