/**
 * WHAT A PAGE LOOKS LIKE ON PAPER.
 *
 *   node harness/print.mts --port 8851              # a server already up
 *   node harness/print.mts --port 8851 --pages 40   # more random pages
 *   node harness/print.mts --port 8851 --seed 7     # another random set
 *
 * Prints a fixed family of pages plus random ones to PDF, on A4 and on Letter,
 * with the window in the dark theme, the way a reader presses Ctrl P. Each
 * page gets a report of the faults a machine can see — window chrome on the
 * sheet, a box that clips, light text, one sheet for a long page, a sheet cut
 * short — and, when Python has PyMuPDF, a PNG of every sheet to look at. The
 * faults a machine cannot see (an awkward break, a picture split from its
 * caption) are for the eyes: open `harness/out/print/`.
 */
import { chromium, type Page } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const OUT = "harness/out/print";
const FAMILY = ["nodes/sop/box", "vex/functions/point", "hom/hou/Node", "nodes/dop/pyrosolver", "basics/intro", "shelf/box"];
const PAPERS = ["A4", "Letter"] as const;
/** Inches, as the protocol takes them. The margin is the page's own @page. */
const SIZES = { A4: { paperWidth: 8.27, paperHeight: 11.69 }, Letter: { paperWidth: 8.5, paperHeight: 11 } };

interface Finding {
  page: string;
  paper?: string;
  check: string;
  got: string;
}

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

/** A small seeded generator, so a failing set can be printed again. */
function random(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** What the sheet must not show, and what it must, read under print media. */
async function inspect(page: Page) {
  return page.evaluate(() => {
    const shown = (el: Element | null) => !!el && getComputedStyle(el).display !== "none" && (el as HTMLElement).offsetParent !== null;
    const faults: string[] = [];
    for (const [name, selector] of [
      ["title bar", "header.h-titlebar"],
      ["side panel", "aside"],
      ["key strip", "footer.status-scrim"],
      ["page bar", ".page-bar-scrim"],
      ["copy and bookmark buttons", "article header .print\\:hidden, article header button"],
      ["copy code button", ".code-copy"],
      ["floating list of contents", "[aria-label='On this page'] + *[class*=sticky]"],
    ] as const) {
      if ([...document.querySelectorAll(selector)].some(shown)) faults.push(`${name} is on the sheet`);
    }
    const shell = document.querySelector<HTMLElement>(".docs-shell");
    if (shell && shell.scrollHeight > shell.clientHeight + 1) faults.push(`the page scrolls inside its box (${shell.scrollHeight} > ${shell.clientHeight})`);
    for (const el of document.querySelectorAll<HTMLElement>("article *")) {
      const style = getComputedStyle(el);
      if (style.overflowX === "visible" || !shown(el)) continue;
      if (el.scrollWidth > el.clientWidth + 2) {
        faults.push(`<${el.tagName.toLowerCase()} class="${el.className.toString().slice(0, 40)}"> clips ${el.scrollWidth - el.clientWidth}px`);
        break;
      }
    }
    const text = document.querySelector("article p");
    if (text) {
      const [r, g, b] = getComputedStyle(text).color.match(/[\d.]+/g)!.map(Number);
      if ((0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6) faults.push(`body text is light (${getComputedStyle(text).color})`);
    }
    const headings = document.querySelectorAll("article :is(h2,h3,h4,h5,h6)[id]").length;
    const toc = [...document.querySelectorAll("nav[aria-label='On this page']")].find(shown);
    if (headings >= 2 && !toc) faults.push("no list of contents");
    if (toc && toc.querySelector("[class*=max-h-32]") && getComputedStyle(toc.querySelector("[class*=max-h-32]")!).maxHeight !== "none")
      faults.push("the list of contents is clipped");
    return { faults, height: document.querySelector("article")?.getBoundingClientRect().height ?? 0 };
  });
}

/** Sheets, their text depth, and a PNG of each, through PyMuPDF. */
function sheets(pdf: string, png: string) {
  const script = `
import json, sys, pymupdf
doc = pymupdf.open(sys.argv[1])
out = []
for i, sheet in enumerate(doc):
    blocks = [b for b in sheet.get_text("blocks") if b[4].strip()]
    bottom = max((b[3] for b in blocks), default=0)
    out.append(round(bottom / sheet.rect.height, 2))
    sheet.get_pixmap(dpi=60).save(f"{sys.argv[2]}-{i + 1}.png")
print(json.dumps(out))
`;
  const run = spawnSync(process.env.PYTHON ?? "python", ["-c", script, pdf, png], { encoding: "utf8" });
  if (run.status !== 0) {
    console.error(`[print] PyMuPDF: ${run.error ?? run.stderr.trim().split("\n").pop()}`);
    return null;
  }
  return JSON.parse(run.stdout) as number[];
}

async function main() {
  const args = process.argv.slice(2);
  const port = flag(args, "--port");
  if (!port) {
    console.error("usage: node harness/print.mts --port <port of probe --serve>");
    process.exit(2);
  }
  const base = `http://localhost:${port}/`;
  const count = Number(flag(args, "--pages") ?? 12);
  const next = random(Number(flag(args, "--seed") ?? 1));

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, colorScheme: "dark" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const titles = await page.evaluate(async () => {
    const invoke = (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: object) => Promise<unknown> } })
      .__TAURI_INTERNALS__.invoke;
    await invoke("set_setting", { key: "onboarded", value: "done" });
    return ((await invoke("titles", {})) as { path: string }[]).map((t) => t.path);
  });
  const paths = [...FAMILY];
  while (paths.length < FAMILY.length + count) paths.push(titles[Math.floor(next() * titles.length)]);

  const findings: Finding[] = [];
  let pngs = true;
  for (const path of paths) {
    console.error(`[print] ${path}`);
    await page.goto(base + path, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("article", { timeout: 10_000 }).catch(() => {});
    // A picture that never loads must not hold the run.
    await page.evaluate(() =>
      Promise.race([
        Promise.all([...document.images].map((img) => img.decode().catch(() => {}))),
        new Promise((done) => setTimeout(done, 3000)),
      ]),
    );
    await page.emulateMedia({ media: "print" });
    // page.pdf() fires no beforeprint, and the theme swap listens for it.
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    const { faults, height } = await inspect(page);
    for (const fault of faults) findings.push({ page: path, check: "sheet", got: fault });

    for (const paper of PAPERS) {
      const file = `${OUT}/${path.replace(/\//g, "_")}-${paper}`;
      const started = Date.now();
      // Straight through the protocol: page.pdf() reads the file back as a
      // stream, and that read fails on this machine. Base64 does not.
      const pdf = await cdp
        .send("Page.printToPDF", { ...SIZES[paper], transferMode: "ReturnAsBase64" })
        .then(({ data }) => Buffer.from(data, "base64"))
        .catch((error: Error) => {
          findings.push({ page: path, paper, check: "pdf", got: error.message.slice(0, 120) });
          return null;
        });
      console.error(`[print]   ${paper} ${pdf ? `${pdf.length} bytes` : "failed"} in ${Date.now() - started} ms`);
      if (!pdf) continue;
      writeFileSync(`${file}.pdf`, pdf);
      const depths = pngs ? sheets(`${file}.pdf`, file) : null;
      if (!depths) {
        pngs = false;
        continue;
      }
      // A sheet is about 900 CSS px of text; a page longer than two of those
      // printed on one sheet was cut.
      if (depths.length === 1 && height > 1800) findings.push({ page: path, paper, check: "length", got: `one sheet for ${Math.round(height)}px of page` });
      depths.slice(0, -1).forEach((depth, at) => {
        // A tall picture or table row carried to the next sheet leaves a gap;
        // past this much it is worth a look.
        if (depth < 0.4) findings.push({ page: path, paper, check: "gap", got: `sheet ${at + 1} of ${depths.length} ends at ${Math.round(depth * 100)}%` });
      });
    }
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.emulateMedia({ media: "screen" });
    process.stdout.write(".");
  }
  await browser.close();

  writeFileSync(`${OUT}/report.json`, JSON.stringify(findings, null, 2));
  console.log(`\n${paths.length} pages, ${PAPERS.length} papers, ${findings.length} findings${pngs ? "" : " (no PyMuPDF: set PYTHON to a Python that has it for PNGs)"}`);
  for (const f of findings) console.log(`  ${f.page}${f.paper ? ` [${f.paper}]` : ""} ${f.check}: ${f.got}`);
  process.exit(findings.length ? 1 : 0);
}

void main();
