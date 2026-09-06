/**
 * THE SAME PAGE, THREE TIMES, AND WHERE THE APP IS BEHIND.
 *
 *   node harness/compare.mts                       # 25 random pages, seeded
 *   node harness/compare.mts --pages 80 --seed 7
 *   node harness/compare.mts --section nodes       # sample one section
 *   node harness/compare.mts --paths nodes/sop/box,vex/functions/noise
 *   node harness/compare.mts --no-render           # shape only, no browser
 *   node harness/compare.mts --render 12           # how many pages to draw
 *   node harness/compare.mts --no-build            # reuse the built probe
 *   node harness/compare.mts --port 8899           # a probe server already up
 *   node harness/compare.mts --fresh               # ignore every cache
 *
 * Three renderings of one page:
 *
 *   sidefx     www.sidefx.com/docs/houdini/<path>.html     the reference
 *   web        houdinimd.com/docs/houdini/<path>           the shipped mirror
 *   app        probe --serve, this repo                    the one under test
 *
 * Both references were built from the HTML the doc build produces. The app
 * parses the wiki markup underneath it, from scratch, in Rust — so the app is
 * the one that can be wrong on its own. Where the two references AGREE and the
 * app differs, that is a defect and not a taste.
 *
 * TWO LANES, because the two kinds of defect do not show in the same place.
 *
 *   SHAPE   what the page is made of: sections, tables, lists, figures, and
 *           HOW MUCH of each. Read out of the markdown the app and the mirror
 *           serve, and out of the SideFX DOM. Catches a parameters block that
 *           is not a table, a section that went missing, a page that arrived
 *           with a twentieth of the text it should have, a marker that reached
 *           the reader.
 *
 *   DRAWN   what it looks like once drawn. All three pages are opened in a
 *           browser, and every kind of thing a doc page is built from — a
 *           heading, a row, a label, a picture, a fence — is measured the same
 *           eight ways: how many, how wide, how tall, what type size, what
 *           weight, slanted, typewriter, empty. No amount of markdown reading
 *           finds these, because CSS decides them.
 *
 * NOTHING IN HERE KNOWS ABOUT A BUG. There is no list of bad markers and no
 * list of things that went wrong before. There is a list of KINDS OF THING a
 * page is made of, and a list of HOW TO JUDGE A MEASUREMENT by the word its
 * name ends in. Every kind is put through every measurement, and every
 * measurement through the same test, so the harness reports a defect in a
 * dimension nobody thought of in advance — and a defect that gets fixed stops
 * being reported without anything being deleted here. To widen the net, add a
 * kind or a measurement, never a rule.
 *
 * AND A DIRECTION ON EVERY FINDING, because "different" is not "worse":
 *
 *   behind      the app carries LESS than both references — a picture drawn
 *               smaller, a section dropped, structure flattened. Fix these.
 *   ahead       the app carries MORE. The parameters table nests each menu
 *               value as its own block where the references run them together
 *               as one paragraph; that is an improvement, not a defect.
 *   different   neither is more than the other. A judgement call.
 *
 * A finding that has been looked at and kept goes in `harness/accepted.json`
 * by its signature, with the reason, and stops being reported.
 *
 * SPEED. A run is meant to be cheap enough to do often, so nothing is computed
 * twice: fetched pages, parsed shapes and drawn measurements are all cached on
 * disk by the hash of what they were computed from. A second run over the same
 * pages does no network and no parsing at all. Everything that is left runs
 * `WIDTH` at a time.
 *
 * Nothing this writes may be committed. Every cached page and every report
 * holds SideFX text; `harness/out/` is ignored for that reason. See AGENTS.md.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "harness/out/compare";
const CACHE = `${OUT}/cache`;
const ACCEPTED = "harness/accepted.json";
const SIDEFX = "https://www.sidefx.com/docs/houdini";
const WEB = "https://houdinimd.com/docs/houdini";
const SITEMAP = "https://houdinimd.com/sitemap.xml";

/** Enough to see a rule fail on a family, few enough to finish over a tether. */
const PAGES = 25;
/** Drawing a page costs three page loads, so fewer are drawn than are read.
    A CSS rule is the same on every page; eight pages prove it. */
const RENDER = 8;
/** Fetches, parses and browser contexts in flight at once. */
const WIDTH = 6;

/**
 * Bump when a scanner or a probe changes what it returns. Cached work is keyed
 * by this as well as by its input, so an old cache cannot answer a new
 * question — which is the only way a cache this aggressive stays honest.
 */
const VERSION = 7;

/** A page whose text is under this much of what both references hold has lost
    content, not styling. The margin is wide because the app drops the site
    furniture — the nav, the footer, the search box — on purpose. */
const THIN = 0.55;

/* ──────────────────────────────── the model ─────────────────────────────── */

/** What a block is FOR. Two sources may draw the same role differently and
    both be right; only a role the app drops or invents is wrong on its own. */
type Role =
  | "heading"
  | "prose"
  | "params"
  | "table"
  | "list"
  | "code"
  | "media"
  | "note"
  | "example"
  | "usage"
  | "raw";

interface Block {
  role: Role;
  /** How it was drawn: `table`, `sbs`, `bold-list`, `headings`, `fence`… */
  form: string;
  /** Rows, items, parameters — whatever the form counts. */
  n: number;
  /** Only for headings, and only to name the region. Never compared. */
  text: string;
}

/** A page cut at its top-level headings. The key is the heading, slugged. */
type Regions = Map<string, Block[]>;

/** One source's page: what it is made of, and how much text it holds. */
interface Read {
  blocks: Block[];
  chars: number;
  /** Runs of punctuation a reader of THIS source sees, and how often. */
  shapes: Record<string, number>;
}

/** One measured thing about a drawn page. `null` where the page has none of
    whatever it measures — a page with no picture cannot be judged on pictures. */
type Drawn = Record<string, number | null>;

type Direction = "behind" | "ahead" | "different";

interface Finding {
  path: string;
  /** The region, or the whole page for a drawn measurement. */
  where: string;
  fact: string;
  /** What both references did. */
  want: string;
  /** What the app did. */
  got: string;
  direction: Direction;
  /** The one line that groups this finding with the same defect elsewhere. */
  signature: string;
}

/* ────────────────────────────── the disk cache ──────────────────────────── */

let fresh = false;

function key(...parts: string[]): string {
  return createHash("sha1").update(`${VERSION}~${parts.join("~")}`).digest("hex").slice(0, 20);
}

/** Whatever `make` returns, computed once and read from disk after that. */
async function once<T>(name: string, make: () => Promise<T>): Promise<T> {
  const file = `${CACHE}/${name}.json`;
  if (!fresh && existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
      /* a half-written file from an interrupted run */
    }
  }
  const value = await make();
  writeFileSync(file, JSON.stringify(value));
  return value;
}

/** One remote page, kept on disk. The corpus does not change between runs and
    SideFX should not be asked for the same page twice in an afternoon. */
async function fetched(url: string): Promise<string | null> {
  return once<string | null>(`get-${key(url)}`, async () => {
    try {
      const response = await fetch(url, { headers: { "user-agent": BROWSER_UA } });
      return response.ok ? await response.text() : null;
    } catch {
      return null;
    }
  });
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** Runs `work` over `items`, `width` at a time, keeping the input order. */
async function pooled<T, R>(items: T[], width: number, work: (item: T, at: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      for (;;) {
        const at = next;
        next += 1;
        if (at >= items.length) return;
        out[at] = await work(items[at], at);
      }
    }),
  );
  return out;
}

/* ────────────────────────── markdown into blocks ────────────────────────── */

/** Headings that introduce a run of documented items rather than prose. */
const ITEM_SECTIONS =
  /^(parameters|attributes|methods|properties|options|arguments|variables|environment[- ]variables|inputs|outputs|returns|members|functions)$/;

const NOTE_WORDS = /^(tip|note|warning|caution|important|info)\b/i;

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Markdown to blocks. Both the app and the web mirror answer with markdown, so
 * one reader serves both — and any difference it reports is a real difference
 * and not two parsers disagreeing about the same text.
 */
function markdownRead(source: string): Read {
  return { blocks: markdownBlocks(source), chars: proseChars(source), shapes: shapes(visible(source)) };
}

/**
 * How much a reader actually gets, with the markup taken off.
 *
 * Link targets, fence markers and table rules are not text a reader reads, so
 * counting them would let a page full of broken pipes look as full as a page
 * of prose. Only what is left after they go is counted.
 */
function proseChars(markdown: string): number {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*\|[\s:|-]+\|\s*$/gm, " ")
    .replace(/[|*_`#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function markdownBlocks(source: string): Block[] {
  let body = source;
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) body = body.slice(body.indexOf("\n", end + 1) + 1);
  }
  const lines = body.split(/\r?\n/);
  const out: Block[] = [];
  let at = 0;
  const push = (role: Role, form: string, n = 1, text = "") => out.push({ role, form, n, text });

  while (at < lines.length) {
    const line = lines[at];
    const trimmed = line.trim();
    if (trimmed === "") {
      at += 1;
      continue;
    }

    const fence = /^(```|~~~)/.exec(trimmed);
    if (fence) {
      const marker = fence[1];
      at += 1;
      let rows = 0;
      while (at < lines.length && !lines[at].trim().startsWith(marker)) {
        rows += 1;
        at += 1;
      }
      at += 1;
      push("code", "fence", rows);
      continue;
    }

    // `## Parameters`, and the raw `<h2 id="parameters">Parameters</h2>` the
    // web mirror writes so that its anchors survive.
    const hash = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    const rawHeading = /^<h([1-6])[^>]*>(.*?)<\/h\1>/i.exec(trimmed);
    if (hash || rawHeading) {
      const level = hash ? hash[1].length : Number(rawHeading![1]);
      push("heading", `h${level}`, level, plain(hash ? hash[2] : rawHeading![2]));
      at += 1;
      continue;
    }

    // A pipe table needs its rule line; a lone pipe is prose. The first body
    // row is kept as the block's text so the label probe can read it.
    if (trimmed.startsWith("|") && /^\|[\s:|-]+\|?\s*$/.test((lines[at + 1] ?? "").trim())) {
      const columns = cells(trimmed).length;
      at += 2;
      let rows = 0;
      let firstCell = "";
      while (at < lines.length && lines[at].trim().startsWith("|")) {
        if (rows === 0) firstCell = cells(lines[at].trim())[0] ?? "";
        rows += 1;
        at += 1;
      }
      push("table", "pipe", rows, `${columns}~${firstCell}`);
      continue;
    }

    const tag = /^<\s*([a-z][a-z0-9]*)/i.exec(trimmed);
    if (tag) {
      const name = tag[1].toLowerCase();
      const role: Role = name === "table" ? "table" : name === "img" || name === "video" ? "media" : "raw";
      push(role, `html-${name}`, 1);
      at += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const word = NOTE_WORDS.exec(trimmed.replace(/^>+\s*\**/, ""));
      let rows = 0;
      while (at < lines.length && lines[at].trim().startsWith(">")) {
        rows += 1;
        at += 1;
      }
      push("note", word ? word[1].toLowerCase() : "quote", rows);
      continue;
    }

    const bullet = /^([-*+]|\d+[.)])\s+/.exec(trimmed);
    if (bullet) {
      const ordered = /\d/.test(bullet[1]);
      let items = 0;
      while (at < lines.length) {
        const row = lines[at].trim();
        if (row === "") {
          if (!/^([-*+]|\d+[.)])\s+/.test((lines[at + 1] ?? "").trim())) break;
          at += 1;
          continue;
        }
        if (/^([-*+]|\d+[.)])\s+/.test(row)) items += 1;
        else if (!lines[at].startsWith("  ")) break;
        at += 1;
      }
      push("list", ordered ? "ordered" : "bullet", items);
      continue;
    }

    // A picture on a line of its own is a figure, not a sentence with a
    // picture in it. The two draw very differently, so they are not one role.
    if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(trimmed)) {
      push("media", "figure", 1);
      at += 1;
      continue;
    }

    // `**Group**` alone on its line, with an indented body under it: the shape
    // a parameter takes when it is not a table. Bold inside a sentence is not.
    if (/^\*\*[^*]+\*\*:?\s*$/.test(trimmed)) {
      push("prose", "bold-line", 1, plain(trimmed));
      at += 1;
      continue;
    }

    // Whatever is left is a paragraph. The first line is taken unconditionally
    // — a branch above that declined a line must not leave this one able to
    // decline it too, or the scanner stops moving.
    let rows = 1;
    const inline = (trimmed.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length;
    at += 1;
    while (at < lines.length && lines[at].trim() !== "" && !/^(#{1,6}\s|```|~~~|\||>|<)/.test(lines[at].trim())) {
      rows += 1;
      at += 1;
    }
    if (inline > 0) push("media", "inline", inline);
    else push("prose", "text", rows);
  }
  return out;
}

function cells(row: string): string[] {
  return row.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((cell) => cell.trim());
}

function plain(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

/* ──────────────────────────── HTML into blocks ──────────────────────────── */

/**
 * The SideFX page, read out of a real DOM.
 *
 * The doc build does NOT use a `<table>` for parameters — it writes a run of
 * `div.parameter.sbs-item`, which draws as two columns. Reading that with a
 * regular expression would call it prose and hide the very thing this harness
 * exists to find, so it goes through a browser.
 */
async function htmlBlocks(page: Page, html: string): Promise<Omit<Read, "shapes"> & { words: string }> {
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  return page.evaluate(() => {
    const root = document.querySelector("#content") ?? document.body;
    const out: { role: string; form: string; n: number; text: string }[] = [];

    // A rule that matches CLAIMS the element: nothing inside it is looked at
    // again. A table's own rows must not each report themselves as a table.
    const walk = (element: Element) => {
      for (const child of Array.from(element.children)) {
        const tag = child.tagName.toLowerCase();
        const kind = child.className?.toString?.() ?? "";

        if (/\bsbs-item\b|\bparameter\b/.test(kind)) {
          // One run of them is one region, counted at its first item. The
          // label's own weight goes in `text` for the drawn lane to read.
          const previous = out[out.length - 1];
          const label = child.querySelector(".label, dt, .name");
          const bold = label ? /\b(strong|b)\b/i.test(label.innerHTML) : false;
          if (previous?.role === "params") previous.n += 1;
          else out.push({ role: "params", form: "sbs", n: 1, text: bold ? "bold" : "plain" });
          continue;
        }
        if (/^h[1-6]$/.test(tag)) {
          out.push({
            role: "heading",
            form: tag,
            n: Number(tag[1]),
            text: (child.textContent ?? "").replace(/¶|#/g, "").trim(),
          });
          continue;
        }
        if (tag === "table") {
          const rows = child.querySelectorAll("tr");
          const body = Array.from(rows).find((row) => row.querySelector("td"));
          const first = body?.querySelector("td");
          const bold = first ? /<(strong|b)\b/i.test(first.innerHTML) : false;
          out.push({
            role: "table",
            form: "table",
            n: rows.length,
            text: `${rows[0]?.children.length ?? 0}~${bold ? "**x**" : "x"}`,
          });
          continue;
        }
        if (tag === "pre" || /\bcode\b|\bhighlight\b/.test(kind)) {
          out.push({ role: "code", form: "fence", n: (child.textContent ?? "").split("\n").length, text: "" });
          continue;
        }
        if (tag === "ul" || tag === "ol") {
          out.push({
            role: "list",
            form: tag === "ol" ? "ordered" : "bullet",
            n: child.querySelectorAll(":scope > li").length,
            text: "",
          });
          continue;
        }
        if (tag === "figure" || tag === "img" || tag === "video" || /\bfigure\b|\bimage\b|\bfig\b/.test(kind)) {
          const inline = tag === "img" && element.tagName.toLowerCase() === "p" && (element.textContent ?? "").trim() !== "";
          out.push({ role: "media", form: inline ? "inline" : "figure", n: 1, text: "" });
          continue;
        }
        if (/\btip\b|\bnote\b|\bwarning\b|\bcaution\b/.test(kind)) {
          out.push({ role: "note", form: /\b(tip|note|warning|caution)\b/.exec(kind)?.[1] ?? "note", n: 1, text: "" });
          continue;
        }
        if (/\bexample\b/.test(kind)) {
          out.push({ role: "example", form: "example", n: 1, text: "" });
          continue;
        }
        if (/\busage\b/.test(kind)) {
          out.push({ role: "usage", form: "usage", n: 1, text: "" });
          continue;
        }
        if (tag === "p") {
          const pictures = child.querySelectorAll("img, video").length;
          if (pictures > 0) out.push({ role: "media", form: "inline", n: pictures, text: "" });
          else if ((child.textContent ?? "").trim() !== "") out.push({ role: "prose", form: "text", n: 1, text: "" });
          continue;
        }
        walk(child);
      }
    };
    walk(root);
    // The doc build wraps the page in furniture the app has no reason to
    // carry. Only what is inside #content is counted.
    const words = (root.textContent ?? "").replace(/\s+/g, " ").trim();
    return { blocks: out, chars: words.length, words } as never;
  });
}

/* ──────────────────────────── blocks into regions ───────────────────────── */

/**
 * Cuts a page at its top-level headings.
 *
 * Comparing whole pages block for block reports one finding per block after
 * the first difference and reads as noise. A region is the unit a reader
 * actually sees go wrong: "the parameters are not a table".
 */
function regionsOf(blocks: Block[]): Regions {
  const regions: Regions = new Map([["(top)", []]]);
  let current = "(top)";
  for (const block of blocks) {
    if (block.role === "heading" && block.n <= 2) {
      current = slug(block.text) || `heading-${regions.size}`;
      if (!regions.has(current)) regions.set(current, []);
      continue;
    }
    regions.get(current)!.push(block);
  }
  return regions;
}

interface Shape {
  role: Role;
  form: string;
  n: number;
  /** Whether the leading cell of a row is emphasised in the markup itself. */
  boldLabel: boolean | null;
}

/**
 * What a region is really made of, in a form the three sources can be judged
 * against each other on.
 *
 * `form` is the drawn shape. Two sources may reach the same shape by different
 * routes — a `<table>` and a run of `div.sbs-item` both draw two columns — and
 * calling those different would report the doc build as a defect on every
 * page. Only the CLASS below is compared.
 */
function shapeOf(name: string, blocks: Block[]): Shape {
  const items = ITEM_SECTIONS.test(name.replace(/-/g, " "));
  const tables = blocks.filter((b) => b.role === "table");
  const params = blocks.filter((b) => b.role === "params");
  const bold = blocks.filter((b) => b.form === "bold-line");
  const headings = blocks.filter((b) => b.role === "heading");
  const media = blocks.filter((b) => b.role === "media");

  const labelWeight = (): boolean | null => {
    if (params.length > 0) return params[0].text === "bold";
    if (tables.length > 0) return /\*\*|<(strong|b)\b/i.test(tables[0].text.split("~")[1] ?? "");
    if (bold.length > 0) return true;
    return null;
  };

  const at = (role: Role, form: string, n: number): Shape => ({ role, form, n, boldLabel: labelWeight() });

  if (items) {
    if (params.length > 0) return at("params", "sbs", params.reduce((a, b) => a + b.n, 0));
    if (tables.length > 0) {
      return at("params", tables[0].form === "pipe" ? "table" : "html-table", tables.reduce((a, b) => a + b.n, 0));
    }
    if (bold.length > 0) return at("params", "bold-list", bold.length);
    if (headings.length > 0) return at("params", "headings", headings.length);
    return at("params", "prose", blocks.length);
  }
  if (tables.length > 0) {
    const form = tables[0].form === "pipe" || tables[0].form === "table" ? "table" : tables[0].form;
    return at("table", form, tables.reduce((a, b) => a + b.n, 0));
  }
  if (media.length > 0 && media.length >= blocks.length / 2) {
    return at("media", media.every((m) => m.form === "figure") ? "figure" : "inline", media.reduce((a, b) => a + b.n, 0));
  }
  const first = blocks.find((b) => b.role !== "prose") ?? blocks[0];
  return first ? at(first.role, first.form, blocks.length) : at("prose", "empty", 0);
}

/**
 * The forms that draw the same thing, and how much each of them keeps.
 *
 * A finding must survive the question "would a reader notice, and is it
 * worse?". A parameter list is either two columns or it is not; which markup
 * got there is the doc build's business. The RANK is what makes a finding
 * `behind` rather than merely `different`: a form lower than both references
 * lost structure the references kept.
 */
const FORMS: Record<string, { class: string; rank: number }> = {
  prose: { class: "prose", rank: 0 },
  "bold-list": { class: "stacked", rank: 1 },
  headings: { class: "stacked", rank: 1 },
  deflist: { class: "stacked", rank: 1 },
  "bold-line": { class: "stacked", rank: 1 },
  inline: { class: "inline", rank: 1 },
  bullet: { class: "bullets", rank: 2 },
  "html-ul": { class: "bullets", rank: 2 },
  ordered: { class: "ordered", rank: 2 },
  figure: { class: "figure", rank: 2 },
  sbs: { class: "two-column", rank: 3 },
  table: { class: "two-column", rank: 3 },
  "html-table": { class: "two-column", rank: 3 },
};

const formClass = (form: string) => FORMS[form]?.class ?? form;
const formRank = (form: string) => FORMS[form]?.rank ?? 0;

/* ───────────────────────── what the app got wrong ───────────────────────── */

/**
 * MARKUP THAT REACHED THE READER, WORKED OUT RATHER THAN LISTED.
 *
 * A list of known bad markers only finds the bugs somebody already found. Once
 * each one is fixed its rule is dead weight, and the next parser rule to fail
 * fails silently, because nobody wrote its pattern down yet.
 *
 * So nothing is listed. All three sources answer the SAME page, so any run of
 * punctuation the app puts in front of a reader that NEITHER reference puts in
 * front of a reader is a marker the app failed to consume — whichever marker
 * it happens to be. A rule that gets fixed stops being reported because the
 * shape stops appearing, and a rule that breaks next month is reported the
 * first time it breaks, with nothing added here.
 *
 * Two things make it trustworthy. It compares what a READER SEES, so the two
 * markdown flavours' own differences never show up. And it needs BOTH
 * references to be clean, so a page whose own prose contains an odd run of
 * punctuation reports nothing.
 */
const MARKERS = /[^\w\s]{2,}|[^\w\s][a-z][a-z0-9_-]{1,11}[^\w\s]/gi;

/** A shape, not an instance: a run of one character is cut to three, so `||||`
    and `||` are one finding, and digits go, so `[node:sop/box]` and
    `[node:sop/tube]` are too. */
function shapes(text: string): Record<string, number> {
  const found: Record<string, number> = {};
  for (const hit of text.toLowerCase().match(MARKERS) ?? []) {
    const shape = hit.replace(/(.)\1{2,}/g, "$1$1$1").replace(/\d+/g, "#");
    found[shape] = (found[shape] ?? 0) + 1;
  }
  return found;
}

/**
 * Markdown with everything a reader never sees taken out.
 *
 * Fences and code spans go because markup inside them is the subject, not a
 * defect. Comments, tags and the markers of real headings, lists, links and
 * tables go because they are doing their job. Whatever punctuation is left
 * standing is punctuation the reader reads.
 */
function visible(markdown: string): string {
  return withoutTables(markdown)
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/<[^>\n]{1,200}>/g, " ")
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$)/g, "$1$2");
}

/**
 * Real tables come out before anything is counted.
 *
 * A pipe inside a table that built is structure doing its job. A pipe left
 * anywhere else is a table that did not build, and that is the finding.
 */
function withoutTables(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let at = 0;
  while (at < lines.length) {
    const rule = /^\|[\s:|-]+\|?\s*$/.test((lines[at + 1] ?? "").trim());
    if (lines[at].trim().startsWith("|") && rule) {
      // The rows go, but the CELLS stay: a table nested inside a cell is
      // flattened into that cell's text, and it is the case worth finding.
      at += 2;
      while (at < lines.length && lines[at].trim().startsWith("|")) {
        out.push(lines[at].trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).join("\n"));
        at += 1;
      }
      continue;
    }
    out.push(lines[at]);
    at += 1;
  }
  return out.join("\n");
}

/**
 * Shapes the app shows a reader that neither reference shows.
 *
 * A shape has to earn its way in: absent from both references, and used more
 * than once, so one odd sentence never becomes a finding.
 */
function strays(app: Record<string, number>, ...references: Record<string, number>[]): string[] {
  const out: string[] = [];
  for (const [shape, count] of Object.entries(app)) {
    if (count < 2) continue;
    if (references.some((theirs) => shape in theirs)) continue;
    // Punctuation is the tell. A shape that is mostly letters is a word one
    // reference happened to phrase differently, not a marker.
    if (shape.replace(/[\w\s]/g, "").length < 2) continue;
    out.push(shape);
  }
  return out.sort();
}

/* ──────────────────────── lane one: what it is made of ──────────────────── */

function compareShape(path: string, sfx: Read, web: Read, app: Read): Finding[] {
  const found: Finding[] = [];

  // WHOLE PAGE FIRST. A page that arrived with a fraction of its text has lost
  // content, and every shape finding under it would only be a symptom of that.
  const want = Math.min(sfx.chars, web.chars);
  const spread = Math.abs(sfx.chars - web.chars) / Math.max(sfx.chars, web.chars, 1);
  if (want > 400 && spread < 0.45 && app.chars < want * THIN) {
    const share = Math.round((app.chars / want) * 100);
    found.push({
      path,
      where: "(page)",
      fact: "text",
      want: `about ${want} characters (sidefx ${sfx.chars}, web ${web.chars})`,
      got: `${app.chars} — ${share}% of it`,
      direction: "behind",
      signature: `the page holds under ${Math.round(THIN * 100)}% of the text both references hold`,
    });
  }

  const bySfx = regionsOf(sfx.blocks);
  const byWeb = regionsOf(web.blocks);
  const byApp = regionsOf(app.blocks);

  for (const name of new Set([...bySfx.keys(), ...byWeb.keys(), ...byApp.keys()])) {
    if (name === "(top)") continue;
    const inSfx = bySfx.get(name);
    const inWeb = byWeb.get(name);
    const inApp = byApp.get(name);

    // A region only the app is missing is one it dropped; a region only the
    // app HAS is one it invented. Both need the references to agree first.
    if (inSfx && inWeb && !inApp) {
      found.push({
        path,
        where: name,
        fact: "section",
        want: "the section exists",
        got: "the app has no such section",
        direction: "behind",
        signature: `section missing: ${name}`,
      });
      continue;
    }
    if (!inSfx && !inWeb && inApp) {
      found.push({
        path,
        where: name,
        fact: "section",
        want: "no such section",
        got: "the app drew one",
        direction: "ahead",
        signature: `section invented: ${name}`,
      });
      continue;
    }
    if (!inSfx || !inWeb || !inApp) continue;

    const wantSfx = shapeOf(name, inSfx);
    const wantWeb = shapeOf(name, inWeb);
    const got = shapeOf(name, inApp);
    const kind = ITEM_SECTIONS.test(name.replace(/-/g, " ")) ? "params" : wantSfx.role;

    // Only where the references agree. Where they differ, the doc build and
    // the mirror disagree about the page and the app cannot be judged on it.
    if (formClass(wantSfx.form) === formClass(wantWeb.form) && formClass(got.form) !== formClass(wantSfx.form)) {
      const direction: Direction =
        formRank(got.form) < formRank(wantSfx.form)
          ? "behind"
          : formRank(got.form) > formRank(wantSfx.form)
            ? "ahead"
            : "different";
      found.push({
        path,
        where: name,
        fact: "form",
        want: `${formClass(wantSfx.form)} (${wantSfx.form}/${wantWeb.form})`,
        got: `${formClass(got.form)} (${got.form})`,
        direction,
        signature: `${kind} drawn ${formClass(got.form)}, both references draw it ${formClass(wantSfx.form)}`,
      });
    }

    // HOW MANY. A Parameters section that exists but holds two headings where
    // both references hold sixty rows is not a shape difference — the items
    // are gone. Counted separately from the form, because a region can carry
    // the right shape and almost none of the content.
    const most = Math.max(wantSfx.n, wantWeb.n);
    const least = Math.min(wantSfx.n, wantWeb.n);
    if (least >= 4 && most > 0 && Math.abs(wantSfx.n - wantWeb.n) / most < 0.5 && got.n < least * THIN) {
      found.push({
        path,
        where: name,
        fact: "count",
        want: `about ${least} items (sidefx ${wantSfx.n}, web ${wantWeb.n})`,
        got: `${got.n}`,
        direction: "behind",
        signature: `${kind} section holds far fewer items than both references`,
      });
    }

    // The label of a row, in the markup. A parameter name is a name, not an
    // emphasis: the references leave it plain and let the column style it.
    if (
      wantSfx.boldLabel !== null &&
      wantSfx.boldLabel === wantWeb.boldLabel &&
      got.boldLabel !== null &&
      got.boldLabel !== wantSfx.boldLabel
    ) {
      found.push({
        path,
        where: name,
        fact: "label weight",
        want: wantSfx.boldLabel ? "the row label is emphasised" : "the row label is plain text",
        got: got.boldLabel ? "the app emphasises it" : "the app leaves it plain",
        direction: "different",
        signature: got.boldLabel
          ? `${kind} row labels are emphasised in the markup; neither reference emphasises them`
          : `${kind} row labels are plain; both references emphasise them`,
      });
    }
  }
  return found;
}

/* ───────────────────────── lane two: what it looks like ─────────────────── */

/**
 * What one drawn page measures.
 *
 * Every number here is a RATIO or a FRACTION, never a pixel count, because the
 * three pages are drawn in different columns at different widths and a pixel
 * comparison between them says nothing. A picture that fills its column is
 * `1`, wherever that column is and however wide it is.
 */
/**
 * WHAT A DRAWN PAGE MEASURES, WORKED OUT RATHER THAN LISTED.
 *
 * The list below names KINDS OF THING a doc page is built from, not defects.
 * Every kind is then measured the same eight ways, and every measurement is
 * judged the same way, so the harness reports a defect in a dimension nobody
 * thought about in advance. Nothing here knows that pictures were once drawn
 * too small or that a table once collapsed; it knows that a figure has a width
 * and a table has rows, and the comparison does the rest.
 *
 * Every number is a RATIO or a FRACTION, never a pixel count, because the
 * three pages are drawn in different columns at different widths and a pixel
 * comparison between them says nothing.
 *
 * To make the harness see a new dimension, add a kind here or a measurement in
 * the loop — not a rule. One line, and it applies to every page and every kind
 * at once.
 */
const PROBE = String.raw`() => {
  const KINDS = {
    heading: "h1, h2, h3, h4, h5, h6",
    paragraph: "p",
    list: "ul, ol",
    item: "li",
    table: "table",
    row: "tr",
    label: "table tr > td:first-child, table tr > th:first-child, .parameter .label, .sbs-item .label",
    cell: "td",
    picture: "img, video",
    fence: "pre",
    term: "dt",
    quote: "blockquote",
    link: "a[href]",
    note: ".tip, .note, .warning, .caution, [class*=callout], [class*=admonition]",
  };

  const box = (element) => element.getBoundingClientRect();
  const article =
    document.querySelector("article, #content, main .prose, main") ?? document.body;

  // The text measure: the widest paragraph. It is the same idea in all three
  // pages, and it is what a reader compares everything else against.
  const paragraphs = [...article.querySelectorAll("p")]
    .map((p) => box(p).width)
    .filter((width) => width > 80);
  const column = paragraphs.length ? Math.max(...paragraphs) : box(article).width;
  if (!column) return {};
  const base = parseFloat(getComputedStyle(article).fontSize) || 16;

  const middle = (list) => {
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => a - b);
    return sorted[(sorted.length - 1) >> 1];
  };
  const share = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

  const out = {};

  /* THE PAGE ITSELF. */
  out["page.column"] = box(article).width ? column / box(article).width : null;
  out["page.text"] = (article.textContent ?? "").replace(/\s+/g, " ").trim().length;

  // MARKUP DRAWN AS WORDS. Not a list of markers: anything that is punctuation
  // arranged like markup, sitting in running text. Code is left alone, because
  // markup inside a code sample is the subject of the page.
  const prose = document.createElement("div");
  prose.innerHTML = article.innerHTML;
  for (const node of [...prose.querySelectorAll("pre, code, kbd, samp")]) node.remove();
  const words = (prose.textContent ?? "").replace(/\s+/g, " ");
  out["page.markup shown"] = (words.match(/[^\w\s]{2,}/g) ?? []).filter(
    // Ellipses, dashes, quotes and brackets are typography, not markup.
    (run) => !/^[.…–—’‘“”«»\-→(),:;!?'"\/\[\]]+$/.test(run),
  ).length;

  /* EVERY KIND, MEASURED THE SAME WAY. */
  for (const name in KINDS) {
    let nodes;
    try {
      nodes = [...article.querySelectorAll(KINDS[name])];
    } catch (error) {
      continue;
    }
    out[name + ".count"] = nodes.length;
    if (!nodes.length) continue;

    out[name + ".empty"] = share(
      nodes.map((node) =>
        (node.textContent ?? "").trim() === "" && !node.querySelector("img, video, input, svg") ? 1 : 0,
      ),
    );
    const drawn = nodes.filter((node) => box(node).width > 0 && box(node).height > 0);
    out[name + ".hidden"] = 1 - drawn.length / nodes.length;
    if (!drawn.length) continue;

    const style = drawn.map((node) => getComputedStyle(node));
    out[name + ".width"] = middle(drawn.map((node) => box(node).width / column));
    out[name + ".height"] = middle(drawn.map((node) => box(node).height / base));
    out[name + ".size"] = middle(style.map((s) => (parseFloat(s.fontSize) || base) / base));
    out[name + ".weight"] = middle(style.map((s) => parseInt(s.fontWeight, 10) || 400));
    out[name + ".italic"] = share(style.map((s) => (s.fontStyle !== "normal" ? 1 : 0)));
    out[name + ".mono"] = share(style.map((s) => (/mono|courier|consol/i.test(s.fontFamily) ? 1 : 0)));
  }

  /* PICTURES NEED TWO THINGS NO OTHER KIND DOES. */
  const pictures = [...article.querySelectorAll("img, video")].filter((node) => {
    const rect = box(node);
    // Icons, badges and spacers are not the pictures a page is judged on.
    return rect.width > 64 && rect.height > 64;
  });
  if (pictures.length) {
    out["picture.big count"] = pictures.length;
    out["picture.big width"] = middle(pictures.map((node) => box(node).width / column));
    // A picture on its own line fills the row it is on. One flowed into a
    // sentence does not, and its line holds text beside it.
    out["picture.own line"] = share(
      pictures.map((node) => {
        const holder = node.closest("figure, p, div") ?? node.parentElement;
        if (!holder) return 0;
        const text = (holder.textContent ?? "").trim().length;
        return text === 0 && box(holder).width - box(node).width < 40 ? 1 : 0;
      }),
    );
  }
  if (document.querySelectorAll("img").length) {
    out["picture.broken"] = share(
      [...article.querySelectorAll("img")].map((image) =>
        image.complete && image.naturalWidth === 0 ? 1 : 0,
      ),
    );
  }

  /* A HEADING WITH NOTHING UNDER IT. Generic, and the shape a page takes when
     the parser found the section but not its body. */
  const headings = [...article.querySelectorAll("h2, h3")];
  if (headings.length) {
    out["heading.barren"] = share(
      headings.map((heading) => {
        let text = 0;
        for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
          if (/^H[1-6]$/.test(node.tagName)) break;
          text += (node.textContent ?? "").trim().length + node.querySelectorAll("img, video").length * 40;
        }
        return text < 8 ? 1 : 0;
      }),
    );
  }

  return out;
}`;

/**
 * How a measurement is judged, BY THE WORD IT ENDS IN.
 *
 * The rules are per suffix, never per fact, so a new kind of thing in `KINDS`
 * above is judged correctly the moment it is added and needs nothing written
 * here. `less` and `more` say which way is worse. `slack` is how far the app
 * may sit from the references before it counts at all — three pages laid out
 * by three stylesheets never agree to the last percent.
 */
const JUDGE: Record<string, { said: string; slack: number; less: Direction; more: Direction; round?: true }> = {
  count: { said: "how many the page draws", slack: 0.34, less: "behind", more: "ahead", round: true },
  text: { said: "characters of text", slack: 0.4, less: "behind", more: "ahead", round: true },
  width: { said: "how wide it is drawn, against the text column", slack: 0.2, less: "behind", more: "ahead" },
  height: { said: "how tall it is drawn, in lines", slack: 0.45, less: "behind", more: "ahead" },
  size: { said: "the type size it is drawn at", slack: 0.15, less: "behind", more: "ahead" },
  weight: { said: "the weight it is drawn at", slack: 0.15, less: "different", more: "different", round: true },
  italic: { said: "how often it is drawn slanted", slack: 0.35, less: "different", more: "different" },
  mono: { said: "how often it is drawn in a typewriter face", slack: 0.35, less: "different", more: "different" },
  empty: { said: "how often it is drawn with nothing in it", slack: 0.3, less: "ahead", more: "behind" },
  hidden: { said: "how often it is drawn with no size at all", slack: 0.3, less: "ahead", more: "behind" },
  barren: { said: "how often a heading has nothing under it", slack: 0.25, less: "ahead", more: "behind" },
  broken: { said: "how often a picture fails to load", slack: 0.25, less: "ahead", more: "behind" },
  column: { said: "how much of its space the reading column takes", slack: 0.2, less: "behind", more: "ahead" },
  "own line": { said: "how often a picture gets a line of its own", slack: 0.3, less: "behind", more: "ahead" },
  "markup shown": { said: "runs of punctuation drawn as words instead of obeyed", slack: 0.5, less: "ahead", more: "behind", round: true },
  "big count": { said: "how many full-size pictures the page draws", slack: 0.34, less: "behind", more: "ahead", round: true },
  "big width": { said: "how wide a full-size picture is drawn", slack: 0.2, less: "behind", more: "ahead" },
};

/**
 * Every measurement, judged the same way.
 *
 * The references have to agree with each other first. Where they do not, the
 * doc build and the mirror disagree about the page and the app cannot be
 * judged on it — which is what keeps a harness this broad from filling up with
 * differences that are nobody's fault.
 */
function compareDrawn(path: string, sfx: Drawn, web: Drawn, app: Drawn): Finding[] {
  const found: Finding[] = [];
  for (const fact of Object.keys(app)) {
    const kind = fact.slice(0, fact.indexOf("."));
    const rule = JUDGE[fact.slice(fact.indexOf(".") + 1)];
    if (!rule) continue;
    const a = sfx[fact];
    const b = web[fact];
    const got = app[fact];
    if (a == null || b == null || got == null) continue;

    // Everything is compared as a share of the larger value, so one rule works
    // for a count of sixty and for a ratio of 0.4.
    const apart = (one: number, two: number) => Math.abs(one - two) / Math.max(Math.abs(one), Math.abs(two), 1);
    if (apart(a, b) > rule.slack) continue;
    const want = (a + b) / 2;
    if (apart(got, want) <= rule.slack) continue;
    // A fraction already sits between 0 and 1, where the share rule is
    // generous. A twentieth of the text column is not worth a reader's time.
    if (!rule.round && Math.abs(got - want) < 0.06) continue;

    const direction = got < want ? rule.less : rule.more;
    const show = (value: number) => (rule.round ? String(Math.round(value)) : value.toFixed(2));
    found.push({
      path,
      where: "(drawn)",
      fact,
      want: `${show(want)} — ${kind}: ${rule.said} (sidefx ${show(a)}, web ${show(b)})`,
      got: show(got),
      direction,
      // The numbers stay out of the signature. Two pages that lose their
      // pictures lose different numbers of them, and they are one defect —
      // and a signature that carries numbers can never be pinned as accepted.
      signature: `${fact}: the app draws ${got < want ? "less" : "more"} than both references — ${kind}: ${rule.said}`,
    });
  }
  return found;
}

/**
 * Opens one page and measures it, ONCE IT HAS STOPPED CHANGING.
 *
 * This wait is the difference between a harness and a random number generator.
 * The app is hash-routed and fetches its page after the shell loads, so a
 * measurement taken too early reports a page with no headings, no labels and
 * no text — which reads exactly like the worst defect the harness can find,
 * and is not a defect at all. Three such phantoms turned up in one run.
 *
 * `expect` is the guard against believing an early reading: the caller passes
 * roughly how much text the source it came from actually holds, and a page
 * that never reaches a fraction of it is reported as unmeasured rather than as
 * empty. Silence beats a false finding.
 */
async function drawn(context: BrowserContext, url: string, expect = 0): Promise<Drawn> {
  const page = await context.newPage();
  const words = () =>
    page
      .evaluate(() => ((document.querySelector("article, #content, main") ?? document.body).textContent ?? "").trim().length)
      .catch(() => 0);
  try {
    await page.goto(url, { waitUntil: "load", timeout: 45_000 });

    // Settle: wait until the text stops growing, twice in a row. A page still
    // arriving grows; a page that is done does not.
    let last = -1;
    let still = 0;
    for (let tries = 0; tries < 40 && still < 2; tries += 1) {
      await page.waitForTimeout(300);
      const now = await words();
      still = now > 0 && now === last ? still + 1 : 0;
      last = now;
    }
    if (expect > 0 && last < expect * 0.35) return {};

    // A picture that has not arrived measures zero wide. Anything below the
    // fold is loaded on sight, so the page is scrolled through first.
    await page.evaluate(() => {
      for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) window.scrollTo(0, y);
      window.scrollTo(0, 0);
    });
    await page
      .waitForFunction(() => [...document.images].every((image) => image.complete), null, { timeout: 15_000 })
      .catch(() => {});
    await page.waitForTimeout(300);
    return (await page.evaluate(`(${PROBE})()`)) as Drawn;
  } catch {
    return {};
  } finally {
    await page.close();
  }
}

const THIRD_PARTY = /googletagmanager|google-analytics|doubleclick|cse\.google|gstatic\.com\/cse|hotjar|segment|sentry/;

/* ──────────────────────────────── the run ───────────────────────────────── */

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

/** A seeded shuffle, so a failing run can be repeated exactly. */
function shuffled<T>(list: T[], seed: number): T[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const swap = Math.floor(random() * (at + 1));
    [out[at], out[swap]] = [out[swap], out[at]];
  }
  return out;
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(base: string, tries = 120) {
  for (let at = 0; at < tries; at += 1) {
    try {
      if ((await fetch(`${base}api/installs`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`no answer from ${base}`);
}

async function main() {
  const started = Date.now();
  const args = process.argv.slice(2);
  const given = flag(args, "--port");
  const want = Number(flag(args, "--pages") ?? PAGES);
  const seed = Number(flag(args, "--seed") ?? 1);
  const section = flag(args, "--section");
  const asked = flag(args, "--paths")?.split(",").filter(Boolean);
  const render = args.includes("--no-render") ? 0 : Number(flag(args, "--render") ?? RENDER);
  fresh = args.includes("--fresh");

  if (!args.includes("--no-build") && !given) {
    const built = spawnSync("cargo", ["build", "--bin", "probe"], { cwd: "src-tauri", stdio: "inherit", shell: true });
    if (built.status !== 0) process.exit(built.status ?? 1);
  }

  mkdirSync(CACHE, { recursive: true });
  const accepted: Record<string, string> = existsSync(ACCEPTED)
    ? JSON.parse(readFileSync(ACCEPTED, "utf8"))
    : {};

  const port = given ? Number(given) : await freePort();
  let server: ChildProcess | null = null;
  if (!given) {
    server = spawn("src-tauri/target/debug/probe.exe", ["--serve", String(port), "--dist", "dist"], { stdio: "ignore" });
  }
  const base = `http://localhost:${port}/`;

  let browser: Browser | null = null;
  const findings: Finding[] = [];
  const leaked: { path: string; said: string }[] = [];
  let compared = 0;
  let skipped = 0;
  let drew = 0;
  // Pages the drawn lane could not measure: reported, never guessed at.
  const unread: string[] = [];
  /** Paths the mirror publishes and the app does not have at all. */
  let missing: string[] = [];

  try {
    await waitForServer(base);

    const titles = (await (await fetch(`${base}api/titles`)).json()) as { path: string }[];
    const known = new Set(titles.map((hit) => hit.path));

    // THE BLIND SPOT, CLOSED. Sampling from the app's own index can never find
    // a page the app does not know it should have — those pages are invisible
    // to every other check here, because they are never picked. The mirror's
    // sitemap is the list of pages that ought to exist.
    missing = shuffled(
      [...(await fetched(SITEMAP).then((xml) => xml ?? ""))
        .matchAll(/<loc>[^<]*\/docs\/houdini\/([^<]+?)<\/loc>/g)]
        .map((hit) => hit[1])
        .filter((path) => !path.endsWith("/") && !known.has(path)),
      seed,
    );

    let paths = asked;
    if (!paths) {
      const all = [...known].filter((path) => !section || path.startsWith(`${section}/`));
      paths = shuffled(all, seed).slice(0, want);
    }
    console.log(`${paths.length} page(s), seed ${seed}, ${Math.min(render, paths.length)} drawn`);

    // Everything remote, at once. The app is local and answers in microseconds.
    const sources = await pooled(paths, WIDTH, async (path) => {
      const [html, web, app] = await Promise.all([
        fetched(`${SIDEFX}/${path}.html`),
        fetched(`${WEB}/${path}.md`),
        fetch(`${base}api/page?path=${encodeURIComponent(path)}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ markdown: string }>) : null))
          .catch(() => null),
      ]);
      return { path, html, web, app };
    });

    const usable = sources.filter((page) => page.html && page.web && page.app);
    skipped = sources.length - usable.length;
    compared = usable.length;

    browser = await chromium.launch();

    /* LANE ONE. The SideFX DOM is the only part that needs a browser, and its
       result is cached by the hash of the HTML, so a second run parses none. */
    const readers = await Promise.all(
      Array.from({ length: Math.min(WIDTH, Math.max(usable.length, 1)) }, async () => {
        const context = await browser!.newContext({ javaScriptEnabled: false });
        return context.newPage();
      }),
    );
    await pooled(usable, readers.length, async (page, at) => {
      const sfx = await once(`sfx-${key(page.html!)}`, async () => {
        // The SideFX page is already drawn, so what it shows a reader is its
        // own text. The other two are markdown and have to be reduced first.
        const read = await htmlBlocks(readers[at % readers.length], page.html!);
        return { ...read, shapes: shapes(read.words) };
      });
      const web = await once(`web-${key(page.web!)}`, async () => markdownRead(page.web!));
      const app = await once(`app-${key(page.app!.markdown)}`, async () => markdownRead(page.app!.markdown));
      for (const shape of strays(app.shapes, web.shapes, sfx.shapes)) {
        leaked.push({ path: page.path, said: `\`${shape}\`` });
      }
      findings.push(...compareShape(page.path, sfx, web, app));
    });
    await Promise.all(readers.map((reader) => reader.context().close()));

    /* LANE TWO. Three real page loads each, so only a few pages, and every
       result cached by URL — a CSS rule does not change between runs. */
    const toDraw = usable.slice(0, render);
    if (toDraw.length > 0) {
      const contexts = await Promise.all(
        Array.from({ length: Math.min(WIDTH, toDraw.length) }, async () => {
          const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, userAgent: BROWSER_UA });
          await context.route("**/*", (route) =>
            THIRD_PARTY.test(route.request().url()) ? route.abort() : route.continue(),
          );
          return context;
        }),
      );
      await pooled(toDraw, contexts.length, async (page, at) => {
        const context = contexts[at % contexts.length];
        // Each page is held to the length of the markdown IT came from, so a
        // reading taken before the page finished is thrown away instead of
        // being reported as a page with nothing on it.
        const [sfx, web, app] = await Promise.all([
          once(`draw-sfx-${key(page.path)}`, () => drawn(context, `${SIDEFX}/${page.path}.html`, 200)),
          once(`draw-web-${key(page.path)}`, () => drawn(context, `${WEB}/${page.path}`, proseChars(page.web!))),
          // Never cached: this is the thing under test and it changes on every
          // build. The other two are somebody else's shipped page.
          drawn(context, `${base}#/${page.path}`, proseChars(page.app!.markdown)),
        ]);
        if (Object.keys(app).length === 0) unread.push(page.path);
        drew += 1;
        findings.push(...compareDrawn(page.path, sfx, web, app));
      });
      await Promise.all(contexts.map((context) => context.close()));
    }
  } finally {
    await browser?.close();
    server?.kill();
  }

  /* ─────────────────────────────── the report ───────────────────────────── */

  const kept = findings.filter((finding) => !(finding.signature in accepted));
  const pinned = findings.filter((finding) => finding.signature in accepted);

  const group = (list: Finding[]) => {
    const by = new Map<string, Finding[]>();
    for (const finding of list) by.set(finding.signature, [...(by.get(finding.signature) ?? []), finding]);
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  };

  const lines: string[] = [`# What the app draws differently\n`];
  lines.push(
    `${compared} page(s) read, ${drew} drawn, ${skipped} not mirrored or unreadable, ` +
      `seed ${seed}, ${((Date.now() - started) / 1000).toFixed(1)}s.\n`,
  );

  if (missing.length > 0) {
    lines.push(`## Pages the mirror publishes and the app does not have
`);
    lines.push(`${missing.length} of them. These are never sampled by anything else here, because the sample comes from the app's own index.
`);
    for (const path of missing.slice(0, 20)) lines.push(`- ${path}`);
    if (missing.length > 20) lines.push(`- and ${missing.length - 20} more`);
    lines.push(``);
  }

  // Said out loud, because a page the browser could not settle is a page this
  // run says nothing about — and a reader must not read that as a clean page.
  if (unread.length > 0) {
    lines.push(`${unread.length} page(s) never settled in the browser and were not measured: ${unread.join(", ")}.\n`);
  }

  const leakGroups = new Map<string, string[]>();
  for (const { path, said } of leaked) leakGroups.set(said, [...(leakGroups.get(said) ?? []), path]);
  lines.push(`## Markup shapes the app writes and the mirror never does\n`);
  if (leakGroups.size === 0) lines.push(`None.\n`);
  for (const [said, pages] of [...leakGroups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`- **${pages.length}/${compared}** — ${said}`);
    lines.push(`  - ${pages.slice(0, 4).join(", ")}`);
  }

  const bucket = (title: string, note: string, list: Finding[]) => {
    lines.push(`\n## ${title}\n`);
    lines.push(`${note}\n`);
    const groups = group(list);
    if (groups.length === 0) lines.push(`None.\n`);
    for (const [signature, hits] of groups) {
      lines.push(`- **${hits.length}** — ${signature}`);
      lines.push(`  - want: ${hits[0].want}`);
      // Each page carries its own numbers. A section that lost 1% of its text
      // and one that lost 45% group together, and printing one of them as if
      // it spoke for both hides how bad the worst page is.
      const varies = new Set(hits.map((hit) => hit.got)).size > 1;
      for (const hit of hits.slice(0, 5)) {
        const where = hit.where === "(drawn)" || hit.where === "(page)" ? "" : `#${hit.where}`;
        lines.push(`  - ${hit.path}${where}${varies ? ` — got ${hit.got}` : ""}`);
      }
      if (!varies) lines.push(`  - got: ${hits[0].got}`);
      if (hits.length > 5) lines.push(`  - and ${hits.length - 5} more`);
    }
  };

  bucket("Behind", "The app carries less than both references. Fix these.", kept.filter((f) => f.direction === "behind"));
  bucket(
    "Different",
    "Neither is more than the other. A judgement call — pin the ones you keep in `harness/accepted.json`.",
    kept.filter((f) => f.direction === "different"),
  );
  bucket(
    "Ahead",
    "The app carries more than both references. Check that it is on purpose, then pin it.",
    kept.filter((f) => f.direction === "ahead"),
  );

  if (pinned.length > 0) {
    lines.push(`\n## Known and kept\n`);
    for (const [signature, hits] of group(pinned)) {
      lines.push(`- **${hits.length}** — ${signature}`);
      lines.push(`  - ${accepted[signature]}`);
    }
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/report.md`, `${lines.join("\n")}\n`);
  writeFileSync(
    `${OUT}/report.json`,
    `${JSON.stringify({ at: new Date().toISOString(), seed, compared, drew, skipped, findings, leaked }, null, 2)}\n`,
  );

  console.log(`\n${lines.join("\n")}\n`);
  console.log(`Report in ${OUT}/report.md`);
  if (compared === 0) {
    console.error("nothing was compared — no page reached all three sources");
    process.exitCode = 2;
  }
}

if (!existsSync("harness")) {
  console.error("run this from the repo root");
  process.exit(2);
}

await main();
