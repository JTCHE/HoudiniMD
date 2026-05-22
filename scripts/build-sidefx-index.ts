#!/usr/bin/env bun
/**
 * Crawl the SideFX docs site and build a JSON index of every reachable page.
 *
 * Output: scripts/data/sidefx-pages.json
 *   { generatedAt: "ISO", root: "https://www.sidefx.com/docs/houdini", slugs: [...] }
 *
 * Feed the output to regenerate.ts:
 *   bun scripts/regenerate.ts --from-sidefx scripts/data/sidefx-pages.json --missing
 *
 * Usage:
 *   bun scripts/build-sidefx-index.ts                       # crawl /docs/houdini/ (no page cap)
 *   bun scripts/build-sidefx-index.ts --root nodes/sop      # crawl a subtree
 *   bun scripts/build-sidefx-index.ts --limit 5000          # cap at 5000 pages
 *   bun scripts/build-sidefx-index.ts --limit 0             # explicit "no cap" (same as default)
 *   bun scripts/build-sidefx-index.ts --concurrency 8
 *   bun scripts/build-sidefx-index.ts --out custom.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse } from "node-html-parser";
import { parseArgs, getNumber, getString, c, fmtMs } from "./lib/cli";

const UA = "HoudiniMD/1.0 (Documentation Index Builder; https://houdinimd.jchd.me)";
const SIDEFX_ORIGIN = "https://www.sidefx.com";

/** Skip these subpaths — large media or non-doc resources. */
const SKIP_PATTERNS = [
  /\.(?:png|jpe?g|gif|svg|webp|mp4|webm|zip|tar|gz|pdf|css|js|woff2?)$/i,
  /\/_images\//,
  /\/_static\//,
];

interface CrawlOptions {
  rootSlug: string;
  maxPages: number;
  concurrency: number;
  verbose: boolean;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Extract /docs/houdini/* links from a page, normalised to absolute URLs. */
function extractLinks(html: string, sourceUrl: string, rootPrefix: string): string[] {
  const doc = parse(html);
  const anchors = doc.querySelectorAll("a[href]");
  const out = new Set<string>();
  const source = new URL(sourceUrl);
  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href) continue;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) continue;

    let abs: URL;
    try {
      abs = new URL(href, source);
    } catch {
      continue;
    }
    if (abs.origin !== SIDEFX_ORIGIN) continue;
    // Strip query+hash — we want canonical doc URLs only
    abs.search = "";
    abs.hash = "";
    const path = abs.pathname;
    if (!path.startsWith(rootPrefix)) continue;
    if (SKIP_PATTERNS.some((re) => re.test(path))) continue;
    out.add(abs.toString());
  }
  return [...out];
}

/** Convert https://www.sidefx.com/docs/houdini/nodes/sop/carve.html → houdini/nodes/sop/carve */
function urlToSlug(url: string): string | null {
  const m = url.match(/^https?:\/\/(?:www\.)?sidefx\.com\/docs\/(.+?)(?:\/index)?\.html$/);
  if (!m) return null;
  return m[1];
}

async function crawl(opts: CrawlOptions): Promise<{ slugs: string[]; visited: number; durationMs: number }> {
  const start = performance.now();
  const rootPrefix = `/docs/${opts.rootSlug.replace(/^\/+|\/+$/g, "")}/`;
  const seedUrl = `${SIDEFX_ORIGIN}${rootPrefix}index.html`;

  const seen = new Set<string>([seedUrl]);
  const slugs = new Set<string>();
  const queue: string[] = [seedUrl];
  let visited = 0;

  // BFS with bounded concurrency: take up to `concurrency` URLs off the queue,
  // fetch them in parallel, enqueue any new links, repeat.
  while (queue.length > 0 && visited < opts.maxPages) {
    const remaining = Number.isFinite(opts.maxPages) ? opts.maxPages - visited : opts.concurrency;
    const batch = queue.splice(0, Math.min(opts.concurrency, remaining));
    const htmls = await Promise.all(batch.map(fetchHtml));

    for (let i = 0; i < batch.length; i++) {
      visited++;
      const url = batch[i];
      const html = htmls[i];
      const slug = urlToSlug(url);
      if (slug) slugs.add(slug);

      if (!html) continue;
      const links = extractLinks(html, url, rootPrefix);
      for (const link of links) {
        if (!seen.has(link)) {
          seen.add(link);
          queue.push(link);
        }
      }

      if (process.stdout.isTTY) {
        process.stdout.write(
          `\r${c.dim("crawled")} ${visited}  ${c.dim("queue")} ${queue.length}  ${c.dim("slugs")} ${slugs.size}${" ".repeat(20)}`,
        );
      } else if (opts.verbose) {
        console.log(`[${visited}] ${url}  +${links.length} links`);
      }
    }
  }

  if (process.stdout.isTTY) process.stdout.write("\n");

  return { slugs: [...slugs].sort(), visited, durationMs: performance.now() - start };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.has("help")) {
    console.log(`Usage: bun scripts/build-sidefx-index.ts [options]

Options:
  --root <slug>        Crawl root, default "houdini" (corresponds to /docs/houdini/)
  --limit <N>          Cap total pages crawled; 0 = no cap (default: no cap)
  --concurrency <N>    Parallel requests, default 6
  --out <file>         Output path, default scripts/data/sidefx-pages.json
  --verbose            Log every URL crawled
`);
    return;
  }

  const rootSlug = getString(args, "root", "houdini");
  // --limit 0 or omitted → no cap (Infinity). Any positive N → hard cap.
  const limitRaw = getNumber(args, "limit", 0);
  const maxPages = limitRaw === 0 ? Infinity : limitRaw;
  const concurrency = getNumber(args, "concurrency", 6);
  const out = getString(args, "out", "scripts/data/sidefx-pages.json");
  const verbose = args.flags.has("verbose");

  console.log(c.bold("Crawling SideFX docs"));
  console.log(`  root          ${SIDEFX_ORIGIN}/docs/${rootSlug}/`);
  console.log(`  limit         ${Number.isFinite(maxPages) ? maxPages : "unlimited"}`);
  console.log(`  concurrency   ${concurrency}`);
  console.log("");

  const { slugs, visited, durationMs } = await crawl({ rootSlug, maxPages, concurrency, verbose });

  console.log("");
  console.log(c.bold("Done"));
  console.log(`  visited       ${visited} pages in ${fmtMs(durationMs)}`);
  console.log(`  slugs found   ${slugs.length}`);

  await mkdir(dirname(out), { recursive: true });
  await writeFile(
    out,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        root: `${SIDEFX_ORIGIN}/docs/${rootSlug}`,
        visited,
        slugs,
      },
      null,
      2,
    ),
  );
  console.log(`  wrote         ${out}`);
}

main().catch((err) => {
  console.error(c.red("fatal:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
