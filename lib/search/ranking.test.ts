import { expect, test } from "bun:test";
import { pathIntent } from "./ranking";
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