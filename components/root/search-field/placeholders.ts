/**
 * The placeholder rotation for the search field — the single source of truth
 * for what the field suggests. The first entry tells the reader what the field
 * accepts; every entry after it is a real query that shows it.
 *
 * `narrow` is what a field too small for `wide` shows instead. Both texts are
 * rendered and CSS picks one, so the swap costs no media query in JavaScript
 * and no layout jump.
 */
export interface PlaceholderExample {
  wide: string;
  /** Omit where `wide` already fits a small field. */
  narrow?: string;
}

export const PLACEHOLDER_EXAMPLES: PlaceholderExample[] = [
  { wide: "Type a node name, a VEX function, or paste a SideFX URL", narrow: "Type a node name" },
  { wide: "Copy to points" },
  { wide: "Box" },
  { wide: "Pyro solver" },
  { wide: "Read point attribute" },
  { wide: "MPM vs other solvers" },
  { wide: "vex/functions/abs" },
  { wide: "https://www.sidefx.com/docs/houdini/nodes/sop/scatter.html", narrow: "sidefx.com/…/sop/scatter" },
  { wide: "Karma Texture Maps" },
  { wide: "Attribute wrangle" },
  { wide: "Copernicus" },
  { wide: "How do I cache a simulation", narrow: "Cache a simulation" },
];
