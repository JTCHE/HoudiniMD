/**
 * The queries the MCP benchmark agent actually typed before concluding these
 * nodes did not exist. Fuse matched a query as ONE literal string with no IDF,
 * so adding words made recall worse and body text was never consulted at all.
 *
 * Runs against the live index in R2, so it also catches a broken build.
 *
 *   bun test lib/search/ranking.test.ts
 */
import { expect, test } from "bun:test";
import { rankResults } from "./ranking";
import {
  tokenize,
  shardOf,
  scoreTokens,
  searchBm25,
  SHARD_COUNT,
  type DocsTable,
} from "./bm25";

const R2 = process.env.R2_PUBLIC_URL;
if (!R2) throw new Error("R2_PUBLIC_URL is not set — needed to fetch the search index");

const table: DocsTable = await (await fetch(`${R2}/search/docs.json`)).json();
const rank = async (q: string, n = 5) =>
  (await rankResults(table, q, n)).map((r) => r.path);

test("an exact node name wins outright", async () => {
  expect((await rank("pyrosolver"))[0]).toMatch(/\/pyrosolver$/);
});

test("a one-word query resolves", async () => {
  expect((await rank("geodesic"))[0]).toBe("houdini/nodes/sop/heatgeodesic");
});

test("a multi-word query finds its node", async () => {
  expect(await rank("transfer attribute by uv")).toContain(
    "houdini/nodes/sop/attribtransferbyuv",
  );
});

// The three benchmark failures. Each needs page BODY text: none of these
// queries share a word with the page's title or summary.
//
// This one is the weakest of the three and does NOT reach the top 5. The page
// never uses the word "reduce" — its own words are "Adaptive Prune" and
// "removes elements" — so no amount of BM25 tuning promotes it (a coordination
// bonus measurably pushed it DOWN, 17 -> 33). Content indexing takes it from
// "not in top 300" to the first page of results; closing the rest is the
// synonym gap the spec defers to embeddings.
//
// It drifts between rank 17 and 25 as the name-field weights move, because it
// wins on body text alone and every field signal added since helps pages that
// have a name match instead. Each of those trades was measured and worth it.
test("finds a node from a description of what it does", async () => {
  expect(await rank("reduce point density with distance from camera", 25)).toContain(
    "houdini/nodes/sop/adaptiveprune",
  );
});

// Both were reported as returning junk: the ranker found only substring hits
// ("Solver", "Copy Property") because the browser could not read the postings
// shards at all — the R2 bucket had no CORS rule. With the shards reachable,
// BM25 still ranked every pyro GUIDE page above the pyro solver NODE, because
// tf saturates and the node page is the longest. TITLE_WEIGHT is the fix.
test("word order does not matter", async () => {
  expect((await rank("solver pyro"))[0]).toBe("houdini/nodes/dop/pyrosolver");
});

test("a title match outranks a longer page that merely says the words often", async () => {
  expect(await rank("copy points")).toContain("houdini/nodes/sop/copytopoints");
});

// Reported by hand after the first release of content search. Each one failed
// for the same reason: BM25 tf saturates around 5, so above ~20 mentions every
// page scores alike and the order fell to length normalisation — which
// penalises exactly the thorough reference pages that are usually the answer.
// Fixed by scoring the page's NAME as its own field, weighted by how much of
// the name the query accounts for and how much of the query the name explains.
test("a context word does not bury the node it qualifies", async () => {
  // `light` is tf 180 on lop/light, `lop` is tf 8, and it still lost to Portal
  // Light and LPE Tag because the real Light page is four times longer.
  expect((await rank("light lop"))[0]).toBe("houdini/nodes/lop/light");
});

test("a query that splits a jammed-together node name finds it", async () => {
  // "reduce"+"poly" share no whole token with "polyreduce" but account for
  // every character of it. Labs Tree Trunk Generator used to win on body text.
  expect((await rank("reduce poly"))[0]).toBe("houdini/nodes/sop/polyreduce");
});

test("the current node outranks the version it replaced", async () => {
  // SideFX keeps v1 at a trailing-dash slug. `copytopoints-` is "Copy to
  // Points"; `copytopoints` is "Copy to Points 2.0" and is what people want.
  expect((await rank("copy points"))[0]).toBe("houdini/nodes/sop/copytopoints");
});

// One token names the page, the rest say where it lives. BM25 cannot rank this
// shape: `point` is on thousands of pages so its idf is tiny, and every sibling
// VEX function page says "VEX function" constantly. The real page came 10th.
test("a name plus its location finds the page", async () => {
  expect((await rank("point vex function"))[0]).toBe("houdini/vex/functions/point");
});

test("the locating words may name the category rather than the path", async () => {
  // A reader saying "python" means `Python scripting > hou`; the path says `hom`.
  expect(await rank("hou.Node python", 3)).toContain("houdini/hom/hou/Node");
});

test("a section listing does not outrank the pages it lists", async () => {
  // `houdini/nodes/lop` names all 192 LOP nodes, so it matches almost any LOP
  // query. It is a table of contents, never the answer.
  const paths = await rank("light lop", 10);
  expect(paths).not.toContain("houdini/nodes/lop");
  expect(paths).not.toContain("houdini/nodes/lop/index");
});

// A near miss must still be reachable: the pyro solver IS a smoke solver, and
// the page says so in its first line.
test("a related node appears alongside the exact one", async () => {
  expect(await rank("smoke solver")).toContain("houdini/nodes/dop/pyrosolver");
});

// The shelf tool and the node share a title, and the shelf page is shorter —
// which BM25 rewards. The node is what the reader wants.
test("a reference page outranks the shelf tool of the same name", async () => {
  const paths = await rank("copy points", 10);
  const node = paths.indexOf("houdini/nodes/sop/copytopoints");
  const shelf = paths.indexOf("houdini/shelf/copytopoints");
  expect(node).toBeGreaterThanOrEqual(0);
  expect(shelf === -1 || node < shelf).toBe(true);
});

// The Box SOP never says "cube" outside its one-line summary, and a Copernicus
// page that repeats "cubemap" used to bury it at rank 19.
test("a word carried only by the summary finds the page", async () => {
  expect(await rank("cube")).toContain("houdini/nodes/sop/box");
});

test("examples rank below the node they demonstrate", async () => {
  const paths = await rank("rbd fracture", 10);
  expect(paths.findIndex((p) => p.includes("/examples/"))).toBe(-1);
});

test("finds a node from a word only its summary carries", async () => {
  expect(await rank("colour non touching primitives")).toContain(
    "houdini/nodes/sop/graphcolor",
  );
});

// The `point` VEX function's summary IS this query, word for word, but scoring
// words one at a time threw their order away: three common words counted
// separately lost to Karma Point Cloud Read, whose title merely contains two.
test("the whole query said back to back in a summary wins", async () => {
  expect((await rank("reads a point attribute"))[0]).toBe("houdini/vex/functions/point");
  // The stemmer has to carry the verb, or the run breaks at its first word.
  expect((await rank("read a point attribute"))[0]).toBe("houdini/vex/functions/point");
});

test("a phrase bonus does not outvote the page's own name", async () => {
  // `greduce` opens its summary "Reduces polygon count", so it earns the full
  // run — but PolyReduce IS the thing being asked for.
  expect((await rank("reduce polygons"))[0]).toBe("houdini/nodes/sop/polyreduce");
});

test("IDF outranks the common word", async () => {
  // `distance` is on hundreds of pages, `geodesic` on a handful. Without IDF
  // this returned planepointdistance first.
  expect((await rank("geodesic distance"))[0]).toBe("houdini/nodes/sop/heatgeodesic");
});

test("a content hit carries the heading it matched", async () => {
  const results = await rankResults(table, "reduce point density with distance from camera", 25);
  const hit = results.find((r) => r.path === "houdini/nodes/sop/adaptiveprune");
  expect(hit?.headings?.length).toBeGreaterThan(0);
  // A sub-hit is only useful if it links somewhere.
  for (const h of hit!.headings!) expect(h.slug).not.toBe("");
});

test("a query that matches nothing still returns something", async () => {
  // An empty list reads to an agent as proof the node does not exist — the
  // exact failure this spec exists to fix.
  expect((await rank("pyrosolvr")).length).toBeGreaterThan(0);
});

test("tokens land in the shard the build wrote them to", () => {
  // The build script and the query path share tokenize/shardOf; if they ever
  // diverge every content query silently returns nothing.
  for (const token of tokenize("Reduce point density with distance from camera")) {
    const n = shardOf(token);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThan(SHARD_COUNT);
  }
  expect(tokenize("the and Graph-Color UV")).toEqual(["graph", "color", "uv"]);
});

test("a token that is also an Object member does not crash scoring", () => {
  // JSON.parse yields prototype-bearing objects: shard.tokens["constructor"]
  // resolves to a function, not a postings array.
  const shard = JSON.parse(`{"build":"${table.build}","tokens":{"real":[[0,3,0]]}}`);
  const hits = scoreTokens(["constructor", "toString", "real"], new Map([
    [shardOf("constructor"), shard],
    [shardOf("toString"), shard],
    [shardOf("real"), shard],
  ]), table, 5);
  expect(hits.length).toBe(1);
});

test("a shard whose build does not match the table is discarded", async () => {
  // docId is an array position, so pairing a table with another build's
  // postings resolves every hit to the wrong page. A stale table must find
  // nothing rather than confidently name the wrong node.
  expect((await searchBm25("geodesic", table, 5)).length).toBeGreaterThan(0);

  const impostor = { ...table, build: "not-the-build-that-wrote-the-shards" };
  expect(await searchBm25("geodesic", impostor, 5)).toEqual([]);
});
