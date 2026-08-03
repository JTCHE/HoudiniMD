import assert from "node:assert/strict";
import { webkit } from "playwright";

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
await page.goto("http://localhost:3000/docs/houdini/ml/stages", { waitUntil: "domcontentloaded" });
const player = page.locator("[data-media-player]").first();
await player.hover();

assert.equal(await page.locator("[data-media-player]").count(), 4);
assert.equal(await page.locator("figure figcaption").count(), 4);
assert.equal(await player.locator(".vds-chapter-title, .vds-google-cast-button, .vds-pip-button, .vds-settings-menu").count(), 0);
assert.equal(
  await player.evaluate((element) => getComputedStyle(element).getPropertyValue("--media-time-color").trim()),
  await page.locator("body").evaluate((element) => getComputedStyle(element).getPropertyValue("--muted-foreground").trim()),
);
assert.deepEqual(
  await player.locator("xpath=ancestor::figure/figcaption").evaluate((caption) => ({
    align: getComputedStyle(caption).textAlign,
    left: Math.round(caption.getBoundingClientRect().left),
  })),
  await player.evaluate((element) => ({
    align: "left",
    left: Math.round(element.getBoundingClientRect().left),
  })),
);
assert.equal(
  await player.evaluate((element) => element.getBoundingClientRect().right <= document.documentElement.clientWidth),
  true,
);

await browser.close();
console.log("video player layout passed");
