import assert from "node:assert/strict";
import { webkit } from "playwright";

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
await page.goto("http://localhost:3000/docs/houdini/nodes/vop/kma_ao", { waitUntil: "domcontentloaded" });
await page.locator("article h1").waitFor();

async function layout() {
  return page.locator("article h1").evaluate((heading) => {
    const [name, type] = heading.querySelectorAll(":scope > span");
    const separator = type.querySelector("span")!;
    const icon = heading.parentElement!.querySelector("img")!;
    const iconRect = icon.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    return {
      inline: Math.abs(name.getBoundingClientRect().bottom - type.getBoundingClientRect().bottom) < 1,
      typeLines: type.getClientRects().length,
      separator: getComputedStyle(separator).visibility,
      iconCenterDelta: Math.abs(iconRect.top + iconRect.bottom - headingRect.top - headingRect.bottom) / 2,
    };
  });
}

await page.evaluate(() => new Promise(requestAnimationFrame));
assert.equal((await layout()).separator, "hidden");

await page.setViewportSize({ width: 1200, height: 800 });
await page.waitForFunction(() => getComputedStyle(document.querySelector("article h1 > span:nth-child(2) > span")!).visibility === "visible");
assert.equal((await layout()).separator, "visible");

await page.setViewportSize({ width: 393, height: 852 });
await page.goto("http://localhost:3000/docs/houdini/nodes/dop/pyrosolver", { waitUntil: "domcontentloaded" });
await page.locator("article h1").waitFor();
await page.waitForFunction(() => getComputedStyle(document.querySelector("article h1 > span:nth-child(2) > span")!).visibility === "visible");
const wrappedType = await layout();
assert.equal(wrappedType.typeLines, 2);
assert.equal(wrappedType.separator, "visible");

await browser.close();
console.log("page header layout passed");
