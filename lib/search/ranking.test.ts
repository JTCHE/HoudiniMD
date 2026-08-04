import { expect, test } from "bun:test";
import { pathIntent, rankResults } from "./ranking";
import type { DocsTable } from "./bm25";

const table = {
  avgdl: 1,
  origin: "",
  build: "",
  docs: [
    { path: "houdini/nodes/sop/box", title: "Box", summary: "", category: "", version: "", t: "box", s: "box", dl: 1, headings: [] },
    { path: "houdini/nodes/sop/texturemaskpaint", title: "Texture Mask Paint", summary: "", category: "", version: "", t: "texturemaskpaint", s: "texturemaskpaint", dl: 1, headings: [] },
    { path: "houdini/nodes/sop/paintcolorvolume", title: "Paint Color Volume", summary: "", category: "", version: "", t: "paintcolorvolume", s: "paintcolorvolume", dl: 1, headings: [] },
  ],
} satisfies DocsTable;

test("keeps a missing path's node context", () => {
  expect(pathIntent(table, "docs/houdini/nodes/sop/boxx").doc?.path).toBe("houdini/nodes/sop/box");
  expect(pathIntent(table, "docs/houdini/nodes/sop/paintmaskvolume").query).toBe("paint mask volume");
});

test.each([
  ["Karma", "houdini/nodes/lop/karma", [
    ["houdini/news/19_5/karma", "What's new"],
    ["houdini/nodes/lop/karma", "Nodes > Solaris nodes"],
  ]],
  ["Attribute Wrangle", "houdini/nodes/sop/attribwrangle", [
    ["houdini/nodes/lop/attribwrangle", "Nodes > Solaris nodes"],
    ["houdini/nodes/sop/attribwrangle", "Nodes > Geometry nodes"],
  ]],
  ["Copy to Points", "houdini/nodes/sop/copytopoints", [
    ["houdini/examples/nodes/sop/copytopoints", "Examples"],
    ["houdini/nodes/sop/copytopoints", "Nodes > Geometry nodes"],
    ["houdini/shelf/copytopoints", "Shelf tools"],
  ]],
])("ranks ambiguous %s queries", async (query, expected, matches) => {
  const docs = matches.map(([path, category]) => {
    const title = query;
    const slug = path.split("/").pop()!;
    return { ...table.docs[0], path, title, category, t: title.toLowerCase().replace(/\s+/g, ""), s: slug };
  });
  const ranked = { ...table, docs } satisfies DocsTable;
  expect((await rankResults(ranked, query, 1))[0]?.path).toBe(expected);
});

test("resolves case-insensitive direct paths", async () => {
  const rbd = { ...table, docs: [{ ...table.docs[0], path: "houdini/nodes/sop/rbdcluster", t: "rbdcluster", s: "rbdcluster" }] } satisfies DocsTable;
  expect((await rankResults(rbd, "houdini/nodes/sop/RBDcluster", 1))[0]?.path).toBe("houdini/nodes/sop/rbdcluster");
});

test("prefers Vellum nodes over exact What's New slugs", async () => {
  const vellum = {
    ...table,
    docs: [
      { ...table.docs[0], path: "houdini/news/19_5/vellum", title: "What’s new Vellum", category: "What’s new", t: "whatsnewvellum", s: "vellum" },
      { ...table.docs[0], path: "houdini/nodes/dop/vellumsolver", title: "Vellum Solver", category: "Nodes > Dynamics nodes", t: "vellumsolver", s: "vellumsolver" },
    ],
  } satisfies DocsTable;

  expect((await rankResults(vellum, "vellum", 1))[0]?.path).toBe("houdini/nodes/dop/vellumsolver");
});

test("recovers a one-character typo in a multi-word node title", async () => {
  const otis = {
    ...table,
    docs: [{ ...table.docs[0], path: "houdini/nodes/sop/otissolver", title: "Otis Solver", category: "Nodes > Geometry nodes", t: "otissolver", s: "otissolver" }],
  } satisfies DocsTable;

  expect((await rankResults(otis, "ottis solver", 1))[0]?.path).toBe("houdini/nodes/sop/otissolver");
});
