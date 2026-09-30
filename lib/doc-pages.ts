import { readObject } from "./r2/read";

/**
 * The doc addresses the site served, and each page's title: all the takedown
 * notice keeps of a page. Read once per build from the index in R2, which is
 * not in this repo.
 */
let pages: Promise<Map<string, string>> | undefined;

/** The trees the site served. The index also holds old versions of them, and
    doxygen's header listings, which the site had stopped serving. */
const SERVED = /^(houdini|hengine|api)(\/|$)/;
const served = (path: string) => SERVED.test(path) && !path.endsWith("_source");

export const docPages = () => (pages ??= load());

async function load(): Promise<Map<string, string>> {
  const raw = await readObject("content/index.json");
  // Every doc notice would lose its title, so the build stops.
  if (!raw) throw new Error("content/index.json is not readable: the doc notices need its titles.");
  const entries: { path: string; title: string }[] = JSON.parse(raw);
  return new Map(entries.filter((e) => served(e.path)).map((e) => [e.path, e.title]));
}

export type Crumb = { label: string; href: string | null };

/**
 * The page's ancestors that are pages too, then the page itself. The tree
 * root is left out: its title names the SideFX product and version.
 */
export function crumbsFor(slug: string, titles: Map<string, string>): Crumb[] {
  const parts = slug.split("/");
  const chain: Crumb[] = [];
  for (let i = 2; i < parts.length; i++) {
    const path = parts.slice(0, i).join("/");
    const label = titles.get(path);
    if (label) chain.push({ label, href: `/docs/${path}` });
  }
  const own = titles.get(slug);
  return own ? [...chain, { label: own, href: null }] : chain;
}
