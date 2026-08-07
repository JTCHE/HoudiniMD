/**
 * Reports a client-side navigation to the worker, which writes it to Analytics
 * Engine (see recordViewBeacon in telemetry/page-view.ts).
 *
 * Every doc link prefetches, so the click that opens the page is usually served
 * out of Next's router cache and reaches no server. Those reads — most of the
 * reading anyone does here — were simply missing from the dataset: the feed
 * would show someone arriving on a page "from" a page it had never seen them
 * open.
 *
 * The worker counts document loads and this counts navigations, so a page is
 * counted exactly once however the browser got to it.
 *
 * Fire-and-forget, like `lib/search/log.ts`: a dropped view must never delay or
 * break a navigation.
 */

/** The page this browser was last on, so a view can say where it came from. */
let previous: string | null = null;
/** The first page of a document was loaded from the server, which counted it. */
let first = true;

/** The path we arrived from, when the browser came here from our own site. */
function referringPath(): string | null {
  try {
    const url = new URL(document.referrer);
    return url.origin === location.origin ? url.pathname : null;
  } catch {
    return null; // no referrer, or one the URL parser will not take
  }
}

/**
 * The document was loaded at `path` — as opposed to navigated to. Only true for
 * the first page of the document: going back to it later is a navigation, and
 * the navigation entry still names the address the tab opened on.
 */
function isDocumentLoad(path: string): boolean {
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  try {
    return !!entry && new URL(entry.name).pathname === path;
  } catch {
    return false;
  }
}

export function logView(path: string): void {
  // A remount is not a second read. React runs an effect twice in development,
  // and a re-render that rebuilds the props runs it again — without this, one
  // page counted as two, which is the very fault this module exists to fix. It
  // also protects `previous`: the second call would otherwise overwrite the
  // page we came from with the page we are on, and every view would report
  // itself as its own referrer.
  if (path === previous) return;

  const from = previous ?? referringPath();
  const documentLoad = first && isDocumentLoad(path);
  previous = path;
  first = false;
  if (documentLoad) return; // the worker already counted it

  const params = new URLSearchParams({ path, ...(from ? { from } : {}) });
  try {
    navigator.sendBeacon?.(`/api/view-log?${params}`);
  } catch {
    // sendBeacon throws on some payload/permission edge cases; a lost view is
    // not worth an exception on the navigation path.
  }
}
