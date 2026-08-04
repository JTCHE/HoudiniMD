/**
 * Shared search ranking — used by BOTH the client-side search overlay and the
 * server `/api/search` route so results are identical regardless of where the
 * query runs.
 *
 * Three passes, cheapest first:
 *   1. exact  — the whole query is a title or slug. `pyrosolver` resolves here.
 *   2. prefix — the query starts a title or slug.
 *   3. BM25   — full page content, sharded in R2 (see `./bm25`).
 *
 * Passes 1 and 2 are a linear scan over the precomputed `t`/`s` fields and
 * touch no network. Pass 3 runs only when they cannot fill the limit.
 */
import { searchBm25, tokenize, type DocsTable, type SearchDoc, type DocHeading } from "./bm25";

export interface RankedResult {
  path: string;
  title: string;
  summary: string;
  category: string;
  version: string;
  icon?: string;
  score: number | null;
  /** Matching sections, strongest first — rendered as sub-hits under the page. */
  headings?: DocHeading[];
}

/**
 * Multiplier on a page's score, by what kind of page it is.
 *
 * Someone searching "copy points" wants the NODE. The shelf tool and the node
 * share a title, so text scoring alone cannot separate them — the shelf page is
 * shorter, which BM25 actively rewards. Reference pages are what the docs are
 * for; a shelf entry is a button that runs the node, and an example is a file
 * that uses it. Both are worth showing, below the thing itself.
 *
 * First match wins, so order matters.
 */
const CATEGORY_WEIGHT: Array<[RegExp, number]> = [
  [/^Examples\b/, 0.55],
  [/^Shelf tools\b/, 0.7],
  [/^Galleries\b/, 0.7],
  [/^Reference > Stand-alone utilities\b/, 0.7],
  [/^What’s new\b/, 0.75],
  // Every node context is a reference page, but a name shared between contexts
  // ("Attribute Wrangle" is a SOP, a LOP and a COP) has to break the tie
  // somehow, and SOPs are what most readers are in.
  [/^Nodes > Geometry nodes\b/, 1],
  [/^(Nodes|VEX|Expression functions|Python scripting|HScript)\b/, 0.97],
];

/**
 * SideFX keeps the superseded version of a node at a trailing-dash slug —
 * `copytopoints-` is v1, `copytopoints` is "Copy to Points 2.0". 15 pages. The
 * old one is still worth finding, never worth ranking first.
 */
const SUPERSEDED_PAGE = /-$/;

/**
 * Does one query token name this page, with the rest saying where it lives?
 *
 * `point vex function` is the name `point` plus the location `vex/functions`.
 * BM25 cannot rank that: `point` is on thousands of pages so its idf is tiny,
 * and `vex`/`function` are said constantly by every sibling — so the actual
 * `point` VEX function came 10th behind `sensor_save` and `distance_pointray`.
 * The same shape covers `light lop`, `boolean sop` and `hou.Node python`.
 *
 * Requires an EXACT token match on the name, so it cannot fire loosely; the
 * locating tokens may match the path or the category, since a reader saying
 * "python" means `Python scripting > hou`, which the path spells `hom`.
 */
function locates(doc: SearchDoc, qTokens: string[]): boolean {
  if (qTokens.length < 2) return false;
  const named = qTokens.filter((tok) => tok === doc.s || tok === doc.t);
  if (!named.length) return false;
  const where = `${doc.path} ${doc.category}`.toLowerCase();
  return qTokens.every((tok) => named.includes(tok) || where.includes(tok));
}

/** A multi-word title can safely absorb one typo in one of its long words. */
function typoLocates(doc: SearchDoc, qTokens: string[]): boolean {
  if (qTokens.length < 2) return false;
  const words: string[] = doc.title.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  let typo = false;
  for (const token of qTokens) {
    if (words.includes(token)) continue;
    if (token.length < 4 || !words.some((word) => word.length >= 4 && oneEditAway(token, word))) return false;
    typo = true;
  }
  return typo;
}

function weightOf(doc: SearchDoc | undefined): number {
  if (!doc) return 0;
  // `/examples/` catches example pages whose category string does not say so.
  if (doc.path.includes("/examples/")) return 0.55;
  // `nav` is stamped by the build on any page that has pages beneath it.
  if (doc.nav) return 0.6;
  if (SUPERSEDED_PAGE.test(doc.path)) return 0.8;
  for (const [pattern, w] of CATEGORY_WEIGHT) if (pattern.test(doc.category)) return w;
  return 0.9;
}

function toResult(doc: SearchDoc, score: number | null, headings?: DocHeading[]): RankedResult {
  return {
    path: doc.path,
    title: doc.title,
    summary: doc.summary,
    category: doc.category,
    version: doc.version,
    icon: doc.icon,
    score,
    ...(headings?.length ? { headings } : {}),
  };
}
type PathIntent = { doc?: SearchDoc; query?: string };

function oneEditAway(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (++edits > 1) {
      return false;
    } else if (a.length > b.length) {
      i++;
    } else if (b.length > a.length) {
      j++;
    } else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Preserve a missing docs path's node context before general text ranking. */
export function pathIntent(table: DocsTable, q: string): PathIntent {
  const path = q
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/^\/?docs\//, "")
    .replace(/\.html$/, "")
    .replace(/^\/|\/$/g, "");
  if (!path.includes("/")) return {};

  const slash = path.lastIndexOf("/");
  const parent = path.slice(0, slash + 1);
  const leaf = path.slice(slash + 1);
  if (leaf.length < 3) return {};
  const siblings = table.docs.filter((doc) => doc.path.startsWith(parent) && !doc.path.slice(parent.length).includes("/"));
  if (!siblings.length) return {};

  const exact = siblings.find((doc) => doc.s === leaf);
  if (exact) return { doc: exact };
  const typo = siblings.find((doc) => oneEditAway(doc.s, leaf));
  if (typo) return { doc: typo };

  const words = new Set(siblings.flatMap((doc) => doc.title.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length >= 3));
  const parts: string[][] = Array.from({ length: leaf.length + 1 }, () => []);
  for (let i = 0; i < leaf.length; i++) {
    if (i > 0 && parts[i].length === 0) continue;
    for (let j = i + 3; j <= leaf.length; j++) {
      const word = leaf.slice(i, j);
      if (!words.has(word)) continue;
      const candidate = [...parts[i], word];
      if (candidate.length > parts[j].length) parts[j] = candidate;
    }
  }
  return parts[leaf.length].length >= 2 ? { query: parts[leaf.length].join(" ") } : {};
}

/**
 * Rank pages for a query. Async because the BM25 pass fetches postings shards;
 * a query answered by exact/prefix alone never awaits a network call.
 *
 * Shard fetches use `table.origin`, stamped in by the build script.
 */
export async function rankResults(
  table: DocsTable,
  q: string,
  limit: number,
  category?: string,
): Promise<RankedResult[]> {
  const intent = pathIntent(table, q);
  if (intent.doc) return [toResult(intent.doc, 1)];
  const searchQuery = intent.query ?? q;
  const cat = category?.toLowerCase();
  const inCategory = (d: SearchDoc) => !cat || d.category.toLowerCase() === cat;

  const qLower = searchQuery.toLowerCase().replace(/\s+/g, "");
  const qTokens = tokenize(searchQuery);
  const exact: SearchDoc[] = [];
  const located: SearchDoc[] = [];
  const typo: SearchDoc[] = [];
  const prefix: SearchDoc[] = [];

  for (const doc of table.docs) {
    if (!inCategory(doc)) continue;
    // A bare "vellum" exactly matches stale What's New slugs, but readers
    // expect Vellum nodes. Let the weighted prefix/BM25 passes rank those.
    if ((doc.t === qLower || doc.s === qLower) && weightOf(doc) >= 0.9) exact.push(doc);
    else if (locates(doc, qTokens)) located.push(doc);
    else if (typoLocates(doc, qTokens)) typo.push(doc);
    else if (doc.t.startsWith(qLower) || doc.s.startsWith(qLower)) prefix.push(doc);
    if (exact.length + located.length + typo.length + prefix.length >= limit * 2) break;
  }

  // Within a pass, order by what kind of page it is; a title-prefix match still
  // beats a slug-only one at equal weight.
  const byWeight = (a: SearchDoc, b: SearchDoc) =>
    weightOf(b) - weightOf(a) || +!b.t.startsWith(qLower) - +!a.t.startsWith(qLower);
  exact.sort(byWeight);
  located.sort(byWeight);
  typo.sort(byWeight);
  prefix.sort(byWeight);

  const seen = new Set([...exact, ...located, ...typo, ...prefix].map((d) => d.path));
  const merged: RankedResult[] = [
    ...exact.map((d) => toResult(d, 1)),
    ...located.map((d) => toResult(d, 0.97)),
    ...typo.map((d) => toResult(d, 0.96)),
    ...prefix.map((d) => toResult(d, 0.95)),
  ];

  if (merged.length < limit) {
    // Ask for extra: category filtering and dedup below both drop rows.
    const hits = await searchBm25(searchQuery, table, limit * 3);
    // Weighting after BM25 keeps `bm25.ts` pure text scoring. It reorders only
    // within the window fetched, which is 3x what the caller asked for.
    const weighted = new Map(hits.map((h) => [h.docId, h.score * weightOf(table.docs[h.docId])]));
    hits.sort((a, b) => weighted.get(b.docId)! - weighted.get(a.docId)!);
    const top = weighted.get(hits[0]?.docId) || 1;
    for (const hit of hits) {
      const doc = table.docs[hit.docId];
      if (!doc || seen.has(doc.path) || !inCategory(doc)) continue;
      seen.add(doc.path);
      merged.push(
        toResult(
          doc,
          Math.round((weighted.get(hit.docId)! / top) * 90) / 100,
          // Widen the stored [text, slug] tuples only for what is returned.
          hit.headingIdxs
            .map((i) => doc.headings[i])
            .filter(Boolean)
            .map(([text, slug]) => ({ text, slug })),
        ),
      );
    }
  }

  // An empty result is worse than a bad one: the benchmark agent read "no
  // results" as proof the node did not exist and hand-wrote VEX instead. A
  // typo ("pyrosolvr") tokenizes to nothing the index has, so BM25 cannot
  // save it — scan for a near-miss before giving up.
  if (merged.length === 0 && qLower.length > 1) {
    for (const doc of lastResort(table, qLower, limit, inCategory)) {
      merged.push(toResult(doc, 0.1));
    }
  }

  // Collapse anchor fragments ("foo" over "foo#bar") and the `/index` twin the
  // scrape produces — `houdini/nodes/lop` and `houdini/nodes/lop/index` are one
  // page, and listing both wastes a slot on a literal duplicate.
  const seenBase = new Set<string>();
  return merged
    .filter((r) => {
      const base = r.path.split("#")[0].replace(/\/index$/, "");
      if (seenBase.has(base)) return false;
      seenBase.add(base);
      return true;
    })
    .slice(0, limit);
}

/**
 * Last resort when every other pass came back empty: substring, then a
 * shrinking prefix of the query. Trimming "pyrosolvr" to "pyrosolv" finds
 * `pyrosolver`, which covers the common trailing typo without a fuzzy matcher.
 *
 * Only ever runs on the already-empty path, so its worst case (a few passes
 * over the table) costs nothing on real queries.
 */
function lastResort(
  table: DocsTable,
  qLower: string,
  limit: number,
  inCategory: (d: SearchDoc) => boolean,
): SearchDoc[] {
  const MIN_STEM = 4;
  const found: SearchDoc[] = [];

  const scan = (matches: (d: SearchDoc) => boolean) => {
    for (const doc of table.docs) {
      if (!inCategory(doc) || !matches(doc)) continue;
      found.push(doc);
      if (found.length >= limit) return;
    }
  };

  scan((d) => d.s.includes(qLower) || d.t.includes(qLower));

  for (let len = qLower.length - 1; len >= MIN_STEM && found.length === 0; len--) {
    const stem = qLower.slice(0, len);
    scan((d) => d.s.startsWith(stem) || d.t.startsWith(stem));
  }

  return found;
}
