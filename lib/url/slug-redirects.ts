/**
 * Verified renamed/duplicated slugs — exact matches only, never a fuzzy guess.
 * Each entry was checked with `curl -L`: the old slug 404s, the new one 200s.
 *
 * Read by middleware, which redirects them, and by `lib/segment-prefetch.ts`,
 * which must refuse to answer one: the build id is pinned, so an ISR entry
 * written under the old slug before the redirect existed is still in R2.
 */
export const VERIFIED_SLUG_REDIRECTS: Record<string, string> = {
  'houdini/nodes/sop/sop/copytopoints': 'houdini/nodes/sop/copytopoints',
  'houdini/nodes/top/labs--filecache-2.0': 'houdini/nodes/top/labs--topfilecache-2.0',
};
