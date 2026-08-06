import { webkit, devices } from "playwright";
const browser = await webkit.launch();
const page = await browser.newPage({ ...devices["iPhone 14 Pro"] });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const out = await page.evaluate(() => {
  const col = document.querySelector("main header").parentElement;
  const rows = [...col.children].map((el) => ({
    tag: el.tagName + "." + (el.className || "").split(" ").slice(0, 2).join("."),
    h: Math.round(el.getBoundingClientRect().height),
  }));
  return {
    viewport: innerHeight,
    doc: document.documentElement.scrollHeight,
    main: Math.round(document.querySelector("main").getBoundingClientRect().height),
    footer: Math.round(document.querySelector("footer").getBoundingClientRect().height),
    colGap: getComputedStyle(col).rowGap,
    outerPad: getComputedStyle(col.parentElement).paddingTop,
    rows,
    cards: [...document.querySelectorAll("main article, main .grid > *, main [class*='rounded-lg']")].slice(0,0),
    cardDetail: [...document.querySelectorAll("main > div > div > div.order-4 > * > *")].map((card) => ({
      h: Math.round(card.getBoundingClientRect().height),
      parts: [...card.children].map((part) => ({
        cls: (part.className || "").split(" ").slice(0,3).join("."),
        h: Math.round(part.getBoundingClientRect().height),
      })),
    })),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
