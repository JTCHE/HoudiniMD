/**
 * Capture and verify each page-icon load stage in WebKit.
 *
 *   node scripts/shot-page-load.ts [slug] [outDir]
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { webkit, devices, type Page } from "playwright";

const slug = process.argv[2] ?? "houdini/nodes/dop/pyrosolver";
const outDir = process.argv[3] ?? "shots/page-load";
const base = process.env.SHOT_BASE ?? "http://localhost:3000";
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";

await mkdir(outDir, { recursive: true });

const browser = await webkit.launch();
const url = `${base}/docs/${slug}`;

async function capture(page: Page, stage: string) {
  const metrics = await page.locator("article header").evaluate((header) => {
    const icon = header.querySelector<HTMLElement>("[data-doc-icon]")!;
    const title = header.querySelector<HTMLElement>("h1")!;
    const rect = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return { icon: rect(icon), title: rect(title) };
  });
  await page.screenshot({ path: `${outDir}/${stage}.png` });
  return metrics;
}

const page = await browser.newPage({ ...devices["iPhone 14 Pro"] });
let releaseIcons!: () => void;
const iconGate = new Promise<void>((resolve) => { releaseIcons = resolve; });
await page.route("**/icons/**", async (route) => {
  await iconGate;
  await route.continue();
});
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.locator('article header [data-doc-icon][data-image-state="loading"]').waitFor();
const loading = await capture(page, "loading");
await page.locator('article header [data-doc-icon][data-image-state="skeleton"]').waitFor();
const skeleton = await capture(page, "skeleton");

releaseIcons();
await page.locator('article header [data-doc-icon][data-image-state="loaded"]').waitFor();
await page.waitForTimeout(50);
const opacity = Number(await page.locator("article header [data-doc-icon] img").evaluate((image) => getComputedStyle(image).opacity));
assert(opacity > 0 && opacity < 1, `Expected a fading icon, got opacity ${opacity}`);
const fading = await capture(page, "fading");
await page.waitForTimeout(200);
const loaded = await capture(page, "loaded");

assert.deepEqual(skeleton, loading, "The skeleton shifted the page header");
assert.deepEqual(fading, loading, "The fading icon shifted the page header");
assert.deepEqual(loaded, loading, "The loaded icon shifted the page header");
await writeFile(`${outDir}/metrics.json`, JSON.stringify({ loading, skeleton, fading, loaded }, null, 2));

await browser.close();
console.log(`wrote ${outDir}/{loading,skeleton,fading,loaded}.png; no layout shift detected`);
