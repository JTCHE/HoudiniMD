/**
 * The doc trees this mirror carries, and what to do with everything else.
 *
 * SideFX serves a version-suffixed copy of each tree beside the current one:
 * `houdini22.0/`, `hdk19.5/`, `hengine20.0/` and so on. Every one of those
 * paths answers 200, so a crawler that walks them made the mirror grow with no
 * bound — one scrape, one content object and one ISR entry per version of
 * every page. Measured on 2026-08-24: `houdini22.0` reached 3,946 distinct
 * paths in 24 hours from an index of zero.
 *
 * SideFX also answers 200 for any path under a tree it has moved, which turns
 * that tree into a crawl trap: `/docs/hqueue/**` served the section index for
 * every invented path, and each page's relative links invented a deeper one.
 * That wrote ~236,000 R2 objects in 17 hours.
 *
 * So the namespace is a closed set. A version-suffixed path redirects to the
 * current tree; anything else is not mirrored and says so. Both answers come
 * from middleware, before the route renders, so neither reads R2 nor leaves an
 * ISR entry behind.
 */

/** Doc trees the mirror carries. Adding one here is a deliberate act. */
export const DOC_NAMESPACES = ["houdini", "hdk", "hengine", "api"] as const;

/**
 * A doxygen "source" listing: the whole C++ header, verbatim, under a name
 * doxygen builds from the file — `hdk/_g_a___range_8h_source`, and the same
 * shape under `hengine`.
 *
 * Not documentation, and not ours to carry. Every one of these pages opens with
 * SideFX's own notice — proprietary, not to be reproduced or disclosed — so
 * mirroring it publishes their source. It is also unbounded: there is one per
 * header in the HDK, and a scraper pool walking them was measured on
 * 2026-09-19 at 2.5M CPU-ms a day, four times the whole daily allowance, one
 * scrape and one stored object at a time.
 *
 * Checked against the index before this rule landed: all 36 paths ending
 * `_source` are doxygen listings, and no documentation page ends that way.
 *
 * The documentation page for the same header, without the suffix, is kept.
 */
const DOXYGEN_SOURCE = /_source$/;

/** `houdini22.0`, `hdk19.5`, `hengine20.0` — a tree name with a version glued on. */
const VERSIONED = /^([a-z]+)\d+(?:\.\d+)*$/;

const ALLOWED: ReadonlySet<string> = new Set(DOC_NAMESPACES);

export type NamespaceVerdict =
  /** Carried. Render it. */
  | { kind: "allowed" }
  /** An old version of a tree we carry. `slug` is the same page in the current tree. */
  | { kind: "versioned"; slug: string }
  /** Not mirrored. */
  | { kind: "unknown" };

/**
 * Judge a bare docs slug — the part after `/docs/`, with no extension and no
 * trailing slash. The empty slug is the docs root, which is always allowed.
 */
export function checkDocNamespace(slug: string): NamespaceVerdict {
  if (slug === "") return { kind: "allowed" };

  if (DOXYGEN_SOURCE.test(slug)) return { kind: "unknown" };

  const slash = slug.indexOf("/");
  const namespace = slash === -1 ? slug : slug.slice(0, slash);
  if (ALLOWED.has(namespace)) return { kind: "allowed" };

  const versionMatch = namespace.match(VERSIONED);
  if (versionMatch && ALLOWED.has(versionMatch[1])) {
    const rest = slash === -1 ? "" : slug.slice(slash);
    return { kind: "versioned", slug: `${versionMatch[1]}${rest}` };
  }

  return { kind: "unknown" };
}
