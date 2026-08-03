/**
 * Screenshot the real /api/og PNG for a set of sample pages, so OG design
 * changes can be checked visually instead of guessed at.
 *
 *   node scripts/shot-og.ts [outDir]
 *
 * Node, not bun — bun on Windows cannot hold Playwright's stdio pipe.
 * Dev server must be up (bun run dev).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const outDir = process.argv[2] ?? "shots/og";
const base = process.env.SHOT_BASE ?? "http://localhost:3000";

const SAMPLES: [string, Record<string, string>][] = [
  [
    "node-with-icon",
    {
      path: "houdini/nodes/sop/box",
      title: "Box",
      type: "geometry node",
      summary: "Creates a cube or six-sided rectangular box.",
      icon: "https://www.sidefx.com/docs/houdini/icons/SOP/box.svg",
    },
  ],
  [
    "expression-no-icon",
    {
      path: "houdini/expressions/opinput",
      title: "opinput",
      type: "expression function",
      summary: "Returns the value of an input on the current node.",
    },
  ],
  [
    "plain-article",
    {
      path: "houdini/basics/nodes",
      title: "Introduction to nodes",
      summary: "An overview of how nodes and networks work in Houdini.",
    },
  ],
  [
    "bound-previously-broken-icon",
    {
      path: "houdini/nodes/sop/bound",
      title: "Bound",
      type: "geometry node",
      summary: "Creates a bounding box, sphere, or rectangle for the input geometry.",
      icon: "https://www.sidefx.com/docs/houdini/icons/SOP/bound.svg",
    },
  ],
  [
    "long-title-wraps",
    {
      path: "houdini/nodes/sop/agentransformgroup",
      title: "Agent Transform Group",
      type: "geometry node",
      summary: "Adds new transform groups to agent primitives.",
      icon: "https://www.sidefx.com/docs/houdini/icons/SOP/agenttransformgroup.svg",
    },
  ],
  [
    "long-title-no-icon",
    {
      path: "houdini/nodes/dop/pyrosolver",
      title: "Pyro Solver Sparse Upres",
      type: "dynamics node",
      summary: "Increases the resolution of a sparse pyro simulation.",
    },
  ],
  [
    "borderline-fit",
    {
      path: "houdini/nodes/top/attributedelete",
      title: "Attribute Delete",
      type: "TOP node",
      summary: "Removes attributes from work items.",
      icon: "https://www.sidefx.com/docs/houdini/icons/SOP/attribdelete.svg",
    },
  ],
  [
    "very-long-truncated",
    {
      path: "houdini/nodes/lop/componentgeometryvariants",
      title: "Component Geometry Variants Setup",
      type: "lop node",
      summary: "Creates geometry variants for a component.",
      icon: "https://www.sidefx.com/docs/houdini/icons/LOP/componentgeometry.svg",
    },
  ],
  [
    "short-title-long-type",
    {
      path: "houdini/nodes/vop/add",
      title: "Add",
      type: "vop node",
      summary: "Adds the values of the inputs.",
      icon: "https://www.sidefx.com/docs/houdini/icons/VOP/add.svg",
    },
  ],
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

for (const [name, params] of SAMPLES) {
  const url = `${base}/api/og?${new URLSearchParams(params).toString()}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${outDir}/${name}.png` });
}

await browser.close();
console.log(`wrote ${SAMPLES.map(([name]) => `${outDir}/${name}.png`).join(", ")}`);
