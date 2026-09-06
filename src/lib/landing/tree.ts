/**
 * The shape of the documentation, as the sidebar draws it.
 *
 * The help has no table of contents the app can read, so the top of the tree
 * is stated here: four groups a reader thinks in, and the order they think of
 * them. Everything BELOW that comes from the index — the contexts, the counts,
 * the pages — so a new Houdini build changes the numbers and the rows without
 * anyone editing this file.
 *
 * The one rule that keeps it from going stale: a top-level section this file
 * does not name falls into Learn rather than disappearing. A build that adds
 * `feathers/` shows up on its own.
 */
import type { Hit } from "@/lib/search";

export interface TreeBranch {
  id: string;
  label: string;
  /** How many pages sit under it, counted from the index. */
  count: number;
  /** Sub-branches. Empty means the branch opens straight onto its pages. */
  branches: TreeBranch[];
  /** The pages directly under it, once the branch has been opened. */
  pages: Hit[];
  /** Icon path inside `icons.zip`. Only the branches this file names have
      one; a branch with no icon draws the app's own page glyph. */
  icon?: string;
}

/** Top-level path segments that belong to a named group, in the order shown. */
const GROUPS: Array<{ id: string; label: string; sections: string[] | null }> = [
  { id: "nodes", label: "Nodes", sections: ["nodes"] },
  { id: "languages", label: "Languages", sections: ["vex", "hom", "expressions", "commands"] },
  // Learn is the open one: `sections: null` means "whatever no other group
  // claimed". It is listed third so the tree reads in the order a reader
  // learns — build it, then script it, then look it up.
  { id: "learn", label: "Learn", sections: null },
  { id: "reference", label: "Reference", sections: ["ref", "props", "shelf", "hapi", "gallery", "news", "help"] },
];

/**
 * The node contexts a reader actually works in, in the order the sidebar shows
 * them, with the icon each one wears. A context the index holds but this list
 * does not name still appears — below these, under its own name — so nothing
 * is hidden, only ordered.
 *
 * The icon is named here rather than built from the context's own key: the
 * install ships `NETWORKS/rop.svg` for a context called `out`, and ships
 * nothing at all for APEX or the state contexts. A name guessed from the key
 * is a request the zip answers with a 404.
 */
const CONTEXTS: Record<string, { label: string; icon?: string }> = {
  sop: { label: "Geometry — SOP", icon: "NETWORKS/sop.svg" },
  lop: { label: "Solaris — LOP", icon: "NETWORKS/lop.svg" },
  dop: { label: "Dynamics — DOP", icon: "NETWORKS/dop.svg" },
  vop: { label: "Materials — VOP", icon: "NETWORKS/vop.svg" },
  cop: { label: "Copernicus — COP", icon: "NETWORKS/cop.svg" },
  chop: { label: "Channels — CHOP", icon: "NETWORKS/chop.svg" },
  top: { label: "PDG — TOP", icon: "NETWORKS/top.svg" },
  obj: { label: "Objects — OBJ", icon: "NETWORKS/obj.svg" },
  out: { label: "Render — ROP", icon: "NETWORKS/rop.svg" },
  apex: { label: "APEX" },
  shop: { label: "Shaders — SHOP", icon: "NETWORKS/shop.svg" },
  cop2: { label: "Compositing — COP2", icon: "NETWORKS/cop2.svg" },
  vex: { label: "VEX nodes", icon: "SOP/attribwrangle.svg" },
  manager: { label: "Managers" },
};

/** A context nobody named: `pop_state` reads as "Pop state", not as a key. */
function readable(key: string): string {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const LANGUAGE_LABELS: Record<string, string> = {
  vex: "VEX",
  hom: "Python",
  expressions: "Expression functions",
  commands: "HScript",
};

function section(hit: Hit): string {
  return hit.path.split("/")[0];
}

function context(hit: Hit): string {
  return hit.path.split("/")[1] ?? "";
}

/** A branch's rows, newest naming first: a page named `index` lists the others
    and is never a row of its own in a list of them. */
function pagesOf(hits: Hit[]): Hit[] {
  return hits
    .filter((hit) => !hit.path.endsWith("/index"))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function branch(
  id: string,
  label: string,
  hits: Hit[],
  branches: TreeBranch[] = [],
  icon?: string,
): TreeBranch {
  return { id, label, count: hits.length, branches, pages: branches.length ? [] : pagesOf(hits), icon };
}

/** Node contexts, the named ones first in their stated order and the rest
    after, each keeping the label the index gave it. */
function nodeBranches(hits: Hit[]): TreeBranch[] {
  const byContext = new Map<string, Hit[]>();
  for (const hit of hits) {
    const key = context(hit);
    if (!key) continue;
    const bucket = byContext.get(key);
    if (bucket) bucket.push(hit);
    else byContext.set(key, [hit]);
  }

  const named = Object.keys(CONTEXTS).filter((key) => byContext.has(key));
  const rest = [...byContext.keys()]
    .filter((key) => !(key in CONTEXTS))
    .sort((a, b) => byContext.get(b)!.length - byContext.get(a)!.length);

  return [...named, ...rest].map((key) =>
    branch(
      `nodes/${key}`,
      CONTEXTS[key]?.label ?? readable(key),
      byContext.get(key)!,
      [],
      CONTEXTS[key]?.icon,
    ),
  );
}

function languageBranches(hits: Hit[]): TreeBranch[] {
  return Object.entries(LANGUAGE_LABELS)
    .map(([key, label]) => [key, label, hits.filter((hit) => section(hit) === key)] as const)
    .filter(([, , pages]) => pages.length > 0)
    .map(([key, label, pages]) => branch(key, label, pages));
}

/** Each remaining top-level section becomes a branch of its own, biggest
    first, titled the way the section's own index page titles it. */
function sectionBranches(hits: Hit[], titleOf: (sectionName: string) => string): TreeBranch[] {
  const bySection = new Map<string, Hit[]>();
  for (const hit of hits) {
    const key = section(hit);
    const bucket = bySection.get(key);
    if (bucket) bucket.push(hit);
    else bySection.set(key, [hit]);
  }
  return [...bySection.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([key, pages]) => branch(key, titleOf(key), pages));
}

/**
 * The whole tree, from every title in the build.
 *
 * A section's own index page carries its proper title ("Copernicus", not
 * "cop"), so that is where a group label comes from when this file does not
 * state one.
 */
export function buildTree(all: Hit[]): TreeBranch[] {
  // A help page with no title is an include the other pages pull in — the
  // `_heightfield_common` kind. It is not a page a reader opens, so it is
  // neither a row nor part of a count.
  const hits = all.filter((hit) => hit.title.trim() !== "");

  const indexTitles = new Map<string, string>();
  for (const hit of hits) {
    if (hit.path === `${section(hit)}/index`) indexTitles.set(section(hit), hit.title);
  }
  const titleOf = (name: string) =>
    indexTitles.get(name) ?? name.charAt(0).toUpperCase() + name.slice(1);

  const claimed = new Set(GROUPS.flatMap((group) => group.sections ?? []));

  return GROUPS.map((group) => {
    const inGroup = group.sections
      ? hits.filter((hit) => group.sections!.includes(section(hit)))
      : hits.filter((hit) => !claimed.has(section(hit)));

    if (group.id === "nodes") return branch(group.id, group.label, inGroup, nodeBranches(inGroup));
    if (group.id === "languages") return branch(group.id, group.label, inGroup, languageBranches(inGroup));
    return branch(group.id, group.label, inGroup, sectionBranches(inGroup, titleOf));
  }).filter((group) => group.count > 0);
}


/**
 * The pages of one context, gathered into families.
 *
 * A context is a flat list of a thousand names, and a flat list of a thousand
 * names is a wall. The website groups them under a taxonomy the local help
 * does not carry, so the grouping is read off the names themselves: pages that
 * start with the same word are one family — "Attribute Blur", "Attribute
 * Cast", "Attribute Copy" — and a family earns a row only when enough pages
 * join it. A version is not a kind of its own, so "Copy to Points 2.0" lands
 * beside "Copy to Points" for free.
 */
export interface PageFamily {
  /** The shared first word, as the pages themselves write it. */
  label: string;
  pages: Hit[];
}

/** Under this many pages, a family is not worth the row it would take. */
const FAMILY_MIN = 4;

export function familiesOf(pages: Hit[]): { families: PageFamily[]; loose: Hit[] } {
  const byWord = new Map<string, Hit[]>();
  for (const page of pages) {
    const word = page.title.trim().split(/\s+/)[0] ?? "";
    const key = word.toLowerCase();
    if (!key) continue;
    const bucket = byWord.get(key);
    if (bucket) bucket.push(page);
    else byWord.set(key, [page]);
  }

  const families: PageFamily[] = [];
  const loose: Hit[] = [];
  for (const bucket of byWord.values()) {
    if (bucket.length >= FAMILY_MIN) {
      families.push({ label: bucket[0].title.trim().split(/\s+/)[0], pages: bucket });
    } else {
      loose.push(...bucket);
    }
  }

  families.sort((a, b) => a.label.localeCompare(b.label));
  loose.sort((a, b) => a.title.localeCompare(b.title));
  return { families, loose };
}