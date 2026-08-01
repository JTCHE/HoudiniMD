/**
 * Screenshot a page in WebKit — the engine Safari and every iOS browser use.
 * Chromium lies about backdrop-filter and scroll-margin; this does not.
 *
 *   node scripts/shot.ts <slug> [outDir]
 *
 * Node, not bun: bun on Windows cannot hold the stdio pipe Playwright talks to
 * the browser over, and every launch times out.
 *
 * Writes <outDir>/{top,scrolled,open}.png: the page at rest, scrolled far
 * enough for the floating TOC pill, and with the pill's panel open.
 */
import { webkit, devices } from "playwright";
import { mkdir } from "node:fs/promises";

const slug = process.argv[2] ?? "houdini/nodes/dop/pyrosolver_sparse";
const outDir = process.argv[3] ?? "shots";
const base = process.env.SHOT_BASE ?? "http://localhost:3000";

await mkdir(outDir, { recursive: true });

const browser = await webkit.launch();
const page = await browser.newPage({ ...devices["iPhone 14 Pro"] });
await page.goto(`${base}/docs/${slug}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("article h2", { timeout: 20000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/top.png` });

await page.evaluate(() => window.scrollBy({ top: 1800 }));
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}/scrolled.png` });

await page.getByLabel("Table of contents").click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/open.png` });

// Jump to a section: the heading must clear both the header and the pill.
// The link inside the open panel, not the one in the inline list off-screen.
await page.getByRole("link", { name: "Simulation", exact: true }).last().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/jumped.png` });

await browser.close();
console.log(`wrote ${outDir}/top.png, scrolled.png, open.png`);
