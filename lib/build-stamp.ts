/**
 * Written by `scripts/write-build-stamp.ts` before every build. The committed
 * value is a placeholder; the deployed one is the build's own.
 *
 * It names the build in the edge cache key (lib/edge-cache.ts) and in the
 * service worker's cache name (lib/sw-source.ts), so a deploy starts both
 * caches empty instead of replaying the build before it.
 */
export const BUILD_STAMP = "dev";
