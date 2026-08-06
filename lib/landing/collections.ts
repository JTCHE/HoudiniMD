/**
 * What the landing page offers a reader who has not typed anything yet.
 *
 * The four quick links are fixed — they are the shape of the documentation, not
 * a ranking. The carousel collections are curated slugs resolved against the
 * search index at request time, so a chip carries the real title and the real
 * icon of the page it opens, and a slug that ever leaves the corpus simply
 * stops appearing instead of rendering a dead chip.
 */
import { fetchIndexEntries } from "@/lib/r2/read";
import type { ChipCollection, DocChip } from "./types";

// To do: move DOCS_ROOT to houdini.ts and use it as SSoT Reference
const DOCS_ROOT = "https://www.sidefx.com/docs/houdini";
const ICON_ROOT = `${DOCS_ROOT}/icons`;

export interface QuickLink {
  title: string;
  description: string;
  /** Index path, without the `/docs/` prefix. */
  path: string;
  icon: string;
}

export const QUICK_LINKS: QuickLink[] = [
  {
    title: "Index",
    description: "Get started with Houdini",
    path: "houdini",
    icon: `https://upload.wikimedia.org/wikipedia/commons/1/15/Houdini3D_icon.png`,
  },
  {
    title: "Nodes",
    description: "SOP · DOP · LOP · VOP",
    path: "houdini/nodes",
    icon: `${ICON_ROOT}/NETWORKS/sop.svg`,
  },
  // {
  //   title: "Copernicus",
  //   description: "Real-time image manipulation",
  //   path: "houdini/copernicus",
  //   icon: `${ICON_ROOT}/NETWORKS/cop.svg`,
  // },
  {
    title: "VEX",
    description: "Functions & language",
    path: "houdini/vex/functions",
    icon: `${ICON_ROOT}/SOP/attribwrangle.svg`,
  },
  // {
  //   title: "Solaris",
  //   description: "Functions & language",
  //   path: "houdini/solaris",
  //   icon: `https://assets.renderman.pixar.com/Icons/solaris-icon.png`,
  // },
  {
    title: "Python",
    description: "HOM API reference",
    path: "houdini/hom",
    icon: `${ICON_ROOT}/MISC/python.svg`,
  },
];

/**
 * Curated slugs per collection. Order is the order they appear in.
 *
 * Hand-picked rather than measured: real popularity would need a traffic
 * rollup the site does not publish, and a landing page that shows whatever
 * happened to be crawled last is worse than one that shows the nodes people
 * actually come here for.
 */
const CURATED: { id: string; label: string; paths: string[] }[] = [
  {
    id: "crowd-favourites",
    label: "Crowd-favourites",
    paths: [
      "houdini/nodes/sop/box",
      "houdini/nodes/sop/add",
      "houdini/nodes/sop/copytopoints",
      "houdini/nodes/sop/attribwrangle",
      "houdini/nodes/sop/polybevel",
      "houdini/nodes/dop/pyrosolver",
      "houdini/nodes/sop/scatter",
      "houdini/nodes/sop/vdbfrompolygons",
      "houdini/nodes/sop/remesh",
      "houdini/nodes/sop/attributetransfer",
      "houdini/nodes/sop/boolean",
      "houdini/nodes/sop/labs--auto_uv",
    ],
  },
  {
    id: "solaris",
    label: "Rendering & Solaris",
    paths: [
      "houdini/nodes/out/karma",
      "houdini/nodes/lop/karmarenderproperties",
      "houdini/nodes/lop/sublayer",
      "houdini/nodes/lop/materiallibrary",
      "houdini/nodes/lop/componentgeometry",
      "houdini/nodes/lop/rendergeometrysettings",
      "houdini/nodes/lop/light",
      "houdini/nodes/lop/sceneimport",
    ],
  },
  {
    id: "simulation",
    label: "Simulation",
    paths: [
      "houdini/nodes/dop/pyrosolver",
      "houdini/nodes/dop/flipsolver",
      "houdini/nodes/sop/otissolver",
      "houdini/nodes/dop/vellumsolver",
      "houdini/nodes/dop/rbdbulletsolver",
      "houdini/nodes/dop/popsolver",
      "houdini/nodes/dop/mpmsolver",
      "houdini/nodes/dop/smokesolver",
      "houdini/nodes/dop/staticsolver",
    ],
  },
];

/**
 * Resolve one collection, chosen by `seed`, into chips.
 *
 * Only pages the index knows AND that carry an icon survive: a chip without an
 * icon collapses to bare text and breaks the rhythm of the row, and the row is
 * decoration — it is never the only way to reach a page.
 */
export async function resolveCollection(seed: number): Promise<ChipCollection | null> {
  const entries = await fetchIndexEntries();
  if (!entries) return null;

  const pick = CURATED[seed % CURATED.length];
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));

  const chips = pick.paths.reduce<DocChip[]>((out, path) => {
    const entry = byPath.get(path);
    if (entry?.icon) out.push({ path, title: entry.title, icon: entry.icon });
    return out;
  }, []);

  return chips.length ? { id: pick.id, label: pick.label, chips } : null;
}
