/**
 * Screenshot a page in WebKit, the engine Safari and every iOS browser use, at
 * iPhone size, before and after hydration.
 *
 *   node scripts/webkit-shot.ts [path] [outDir]
 *
 * Node, not bun: bun on Windows cannot hold the stdio pipe Playwright talks to
 * the browser over, and every launch times out.
 *
 * Writes <outDir>/{first,settled}.png.
 */
import { webkit, devices } from "playwright";
import { mkdir } from "node:fs/promises";

const path = process.argv[2] ?? "/docs/houdini/nodes/chop";
const outDir = process.argv[3] ?? "shots";
const base = process.env.SHOT_BASE ?? "http://localhost:3112";

await mkdir(outDir, { recursive: true });

const browser = await webkit.launch();
const page = await browser.newPage({ ...devices["iPhone 14 Pro"] });
await page.goto(`${base}${path}`, { waitUntil: "commit" });
await page.waitForSelector("main", { timeout: 20000 });
await page.screenshot({ path: `${outDir}/first.png` });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1000);
await page.screenshot({ path: `${outDir}/settled.png` });
await browser.close();
