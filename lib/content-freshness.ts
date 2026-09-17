/**
 * When stored markdown stops counting as current.
 *
 * It lives in its own file because two very different readers need it: the
 * Next runtime through `lib/r2/read.ts`, and `worker.ts`, which answers a
 * `.md` request before Next starts and must not pull the R2 client's module
 * graph into a cold isolate to do it.
 */

// This is a global cutoff — every one of the ~10.7k cached pages older than
// it is treated as stale and regenerated live on next visit, which is slow
// for the whole site. Only bump it for a change that affects rendering of
// EVERY page (e.g. a markdown converter/layout change). For a change scoped
// to specific pages (e.g. one template or node category), leave this alone
// and instead re-scrape just those pages: `bun regen --url <glob>`.
/** Cached files generated before this date will be re-generated */
export const CACHE_INVALIDATE_BEFORE = new Date("2026-07-24T18:00:00Z");

/** The frontmatter test `fetchFromR2` applies to every content read. */
export function generatedAtIsCurrent(markdown: string): boolean {
  const match = markdown.match(/^---[\s\S]*?generated_at:\s*(.+?)\s*\n[\s\S]*?---/);
  if (!match) return false;
  return new Date(match[1]) >= CACHE_INVALIDATE_BEFORE;
}
