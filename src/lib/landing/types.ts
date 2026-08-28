/**
 * Shapes the landing page passes between the server and its client islands.
 *
 * A `DocChip` is the smallest thing that can stand for a page in the UI: where
 * it goes, what it is called, and the icon that identifies it. The carousel,
 * the quick links and the recently-visited list all render from this one shape,
 * so a page resolved from the search index and a page read back out of local
 * storage are interchangeable.
 */
export interface DocChip {
  /** Index path, without the `/docs/` prefix — e.g. `houdini/nodes/sop/box`. */
  path: string;
  title: string;
  /** Absolute URL of the page icon. Every chip shown must have one. */
  icon: string;
}

/** A titled run of chips. The carousel renders exactly one of these. */
export interface ChipCollection {
  id: string;
  label: string;
  chips: DocChip[];
}
