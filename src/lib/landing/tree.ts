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
 *
 * Inside a branch, the folders are the index's: each title carries the
 * folders above it (`place`) and arrives in the order the panel draws it. See
 * `place.rs`. Nothing here sorts a page or names a folder.
 */
import type { Hit } from "@/lib/search";
import { warmIcons } from "@/lib/icons";

export interface TreeBranch {
  id: string;
  label: string;
  /** How many pages sit under it. */
  count: number;
  /** The folders inside it, drawn before its pages. */
  branches: TreeBranch[];
  /** The pages directly under it. */
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

/** A branch and the folders inside it, from the `place` of each page. A page
    named `index` lists the others and is never a row of its own. */
function branch(id: string, label: string, hits: Hit[], icon?: string): TreeBranch {
  const root: TreeBranch = { id, label, count: 0, branches: [], pages: [], icon };
  const children = new Map<TreeBranch, Map<string, TreeBranch>>();
  for (const hit of hits) {
    if (hit.path.endsWith("/index")) continue;
    let at = root;
    for (const name of hit.place ?? []) {
      let known = children.get(at);
      if (!known) children.set(at, (known = new Map()));
      let next = known.get(name);
      if (!next) {
        next = { id: `${at.id}/${name}`, label: name, count: 0, branches: [], pages: [] };
        known.set(name, next);
        at.branches.push(next);
      }
      at = next;
    }
    at.pages.push(hit);
  }
  return settle(root);
}

/** Counts every folder, and folds away a folder that holds one thing: a click
    that opens onto one row, or onto one more folder, is a click for nothing. */
function settle(folder: TreeBranch): TreeBranch {
  const branches: TreeBranch[] = [];
  for (const child of folder.branches.map(settle)) {
    if (child.pages.length === 1 && child.branches.length === 0) folder.pages.push(child.pages[0]);
    else if (child.pages.length === 0 && child.branches.length === 1) branches.push(child.branches[0]);
    else branches.push(child);
  }
  folder.branches = branches;
  folder.count = folder.pages.length + branches.reduce((sum, child) => sum + child.count, 0);
  return folder;
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
    branch(`nodes/${key}`, CONTEXTS[key]?.label ?? readable(key), byContext.get(key)!, CONTEXTS[key]?.icon),
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

    if (group.id === "nodes") return tier(group.id, group.label, nodeBranches(inGroup));
    if (group.id === "languages") return tier(group.id, group.label, languageBranches(inGroup));
    return tier(group.id, group.label, sectionBranches(inGroup, titleOf));
  });
}

/** A group: its branches, and no pages of its own. */
function tier(id: string, label: string, branches: TreeBranch[]): TreeBranch {
  const count = branches.reduce((sum, child) => sum + child.count, 0);
  return { id, label, count, branches, pages: [] };
}

/** The tree the panel draws, built once per title list for every panel that
    mounts. */
export const built: { tree: TreeBranch[] | null; from: Hit[] | null } = { tree: null, from: null };

export function treeOf(all: Hit[]): TreeBranch[] {
  if (built.from !== all || !built.tree) {
    built.tree = buildTree(all);
    built.from = all;
  }
  return built.tree;
}

/** Loads the icons of the rows the panel shows when it opens on `path`: the
    page and its neighbours, about half a tall panel each way plus the list's
    overscan. Run while the page is read, so a jump to a far branch lands on
    rows that already have their icons — without the thousands the tree holds. */
export function warmRows(path: string): Promise<void> {
  const folder = folderOf(built.tree ?? [], path);
  if (!folder) return Promise.resolve();
  const at = folder.pages.findIndex((page) => page.path === path);
  const near = folder.pages.slice(Math.max(0, at - 24), at + 25);
  // The node contexts too: a branch row sits above every page row, and there
  // are only a couple of dozen of them.
  const branches = (built.tree ?? []).flatMap((group) => group.branches);
  return warmIcons([...near, ...branches].flatMap((row) => (row.icon ? [row.icon] : [])));
}

function folderOf(folders: TreeBranch[], path: string): TreeBranch | undefined {
  for (const folder of folders) {
    if (folder.pages.some((page) => page.path === path)) return folder;
    const inner = folderOf(folder.branches, path);
    if (inner) return inner;
  }
}
