/**
 * Slugs SideFX has confirmed it does not have.
 *
 * A slug with no mirrored markdown is normally a page worth scraping — that is
 * how the mirror grows. But agents guess URLs, and a guess that will never
 * resolve costs a framework boot and a fresh scrape on every request, for ever:
 * measured over 11.2 hours of live log, 130 requests for 60 slugs that do not
 * exist, 68,637 CPU-ms a day. `houdini/baiscs/hotkeys` and
 * `houdini/nodes/sopt/falloff` are typed-in misses; others are versions and
 * function names that were never there.
 *
 * So remember the answer. The marker holds only the date, and the Worker treats
 * one older than RECHECK_AFTER_DAYS as absent, so a page SideFX adds later is
 * still picked up. Mirrored markdown always wins over a marker, which makes a
 * stale one harmless rather than something to clean up.
 */

/** R2 key under the content bucket. Never collides with `content/`. */
export function goneKey(slug: string): string {
  return `gone/${slug}`;
}

/** How long SideFX's "no" is taken at its word. */
export const RECHECK_AFTER_DAYS = 30;

/** What a marker holds: the day it was written, and nothing else. */
export function goneMarker(now: Date = new Date()): string {
  return now.toISOString();
}

/** Whether a marker still counts. A malformed one counts as absent. */
export function goneIsCurrent(marker: string, now: Date = new Date()): boolean {
  const written = new Date(marker.trim());
  if (Number.isNaN(written.getTime())) return false;
  return now.getTime() - written.getTime() < RECHECK_AFTER_DAYS * 86_400_000;
}
