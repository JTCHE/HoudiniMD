/**
 * The Next build id, pinned. `next.config.ts` returns it from
 * `generateBuildId`, and the OpenNext R2 incremental cache namespaces every
 * key by it (`incremental-cache/<buildId>/<hash>.cache`), so
 * `lib/segment-prefetch.ts` needs the same value to find an entry.
 *
 * Both read it from here. A literal in two places would drift, and the drift
 * would be silent: the lookup would miss and every prefetch would quietly go
 * back to starting Next.
 */
export const BUILD_ID = "houdinimd";
