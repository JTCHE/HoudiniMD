#!/usr/bin/env bun
/**
 * Build the BM25 search index from the markdown already in R2.
 *
 * Reads `content/index.json` plus every `content/<path>.md`, and writes:
 *   search/index/<0..255>.json  — postings  {token: [[docId, tf, headingIdx], ...]}
 *   search/docs.json            — {avgdl, docs: [...]}  (docId = array position)
 *
 * Deliberately standalone, NOT part of `regen.ts`. `regen.ts` owns scraping and
 * a per-slug index PUT; a full-corpus rebuild inside that path makes both
 * fragile. Run this after a regen batch and on deploy.
 *
 * docIds are array positions, so the ordering must be reproducible: docs are
 * sorted by path. Shards are written BEFORE docs.json, so a crashed run leaves
 * the previous (consistent) table in place rather than a table pointing at
 * half-written postings.
 *
 * The browser fetches shards straight from the R2 public origin, so that bucket
 * needs a CORS rule (checked in at scripts/data/r2-cors.json):
 *   wrangler r2 bucket cors set vexllm --file scripts/data/r2-cors.json
 *
 * Usage:
 *   bun scripts/build-search-index.ts
 *   bun scripts/build-search-index.ts --concurrency 32
 *   bun scripts/build-search-index.ts --limit 500        # sample, for testing
 *   bun scripts/build-search-index.ts --dry-run          # build, report, write nothing
 */
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getConfig, getS3Client } from "../lib/r2/config";
import type { SearchIndexEntry } from "../lib/r2/search-index";
import {
  tokenize,
  shardOf,
  shardKey,
  DOCS_KEY,
  SHARD_COUNT,
  type Posting,
  type Shard,
  type SearchDoc,
  type StoredHeading,
} from "../lib/search/bm25";
import { parseArgs, getNumber, c, fmtMs } from "./lib/cli";

/**
 * A title or slug match is worth far more than a body mention, so title tokens
 * enter the postings with inflated term frequency. Folding the field weight
 * into tf keeps query-time scoring a single loop with no per-field bookkeeping.
 */
const TITLE_TF_BOOST = 8;
const SUMMARY_TF_BOOST = 3;
/**
 * Weight for the directories a page sits in, minus the leading `houdini` and
 * the page's own slug. Deliberately small: it makes the context findable at all
 * (every page under `vex/functions` now carries both tokens) without letting
 * 1,097 sibling pages tie with each other on it.
 */
const PATH_TF_BOOST = 2;
/**
 * A word in a heading counts once, exactly like a word in the body.
 *
 * It is tempting to weight it higher so that a section NAMED for the query term
 * wins the anchor instead of a long "Parameters" table that merely mentions it.
 * Measured, that is a bad trade: boosting to 8 fixed the sub-hit labels but
 * dropped `adaptiveprune` out of the top 20 for its benchmark query, because the
 * same number feeds page ranking. Anchor choice is handled separately, by
 * `headingHits` below, which does not touch tf.
 */
const HEADING_TF_BOOST = 1;
/** tf is stored as a small int; a page mentioning a word 300 times is not 10x one that says it 30 times. */
const MAX_TF = 255;

const args = parseArgs(process.argv.slice(2));
const CONCURRENCY = getNumber(args, "concurrency", 24);
const LIMIT = getNumber(args, "limit", 0);
const DRY_RUN = args.flags.has("dry-run");

const config = getConfig();
if (!config) {
  console.error("R2 is not configured — set R2_* in .env.local");
  process.exit(1);
}

/** Frontmatter carries no prose worth searching, and its URLs add noise tokens. */
function stripFrontmatter(md: string): string {
  return md.startsWith("---") ? md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "") : md;
}

// Pages mix generated `<h2 id="...">` (explicit anchor) with plain markdown
// headings. rehype-slug derives the id for the latter, so mirror it here or the
// sub-hit anchors point at nothing.
const HTML_HEADING = /^\s*<h([2-6])\s+id="([^"]*)"\s*>([\s\S]*?)<\/h\1>\s*$/i;
const MD_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

interface ParsedPage {
  headings: StoredHeading[];
  /** token -> headingIdx -> count */
  counts: Map<string, Map<number, number>>;
  /** token -> sections whose heading text contains it */
  headingHits: Map<string, Set<number>>;
  length: number;
}

function parsePage(markdown: string): ParsedPage {
  // Index 0 is the page top: content above the first heading has no anchor.
  const headings: StoredHeading[] = [["", ""]];
  const counts = new Map<string, Map<number, number>>();
  // token -> sections whose HEADING TEXT contains it. Picks the anchor without
  // influencing tf, so sub-hit quality and page ranking stay independent.
  const headingHits = new Map<string, Set<number>>();
  let current = 0;
  let length = 0;

  const bump = (token: string, headingIdx: number, by: number) => {
    let sections = counts.get(token);
    if (!sections) {
      sections = new Map();
      counts.set(token, sections);
    }
    sections.set(headingIdx, (sections.get(headingIdx) ?? 0) + by);
  };

  for (const line of stripFrontmatter(markdown).split("\n")) {
    const html = line.match(HTML_HEADING);
    const md = html ? null : line.match(MD_HEADING);
    const text = html ? html[3].replace(/<[^>]+>/g, "").trim() : md?.[2]?.trim();

    if (text) {
      // The h1 repeats the page title, which is already indexed with a boost.
      if (!md || md[1].length > 1) {
        current = headings.length;
        headings.push([text, html ? html[2] : slugify(text)]);
      }
      for (const token of tokenize(text)) {
        bump(token, current, HEADING_TF_BOOST);
        let named = headingHits.get(token);
        if (!named) {
          named = new Set();
          headingHits.set(token, named);
        }
        named.add(current);
      }
      continue;
    }

    for (const token of tokenize(line)) {
      bump(token, current, 1);
      length++;
    }
  }

  return { headings, counts, headingHits, length };
}

async function fetchMarkdown(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${config!.publicUrl}/content/${path}.md`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Run `worker` over `items` with a fixed number of in-flight requests. */
async function mapPool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i], i);
      }
    }),
  );
}

async function main() {
  const started = Date.now();

  const res = await fetch(`${config!.publicUrl}/content/index.json`);
  if (!res.ok) throw new Error(`Cannot read content/index.json: ${res.status}`);
  const all: SearchIndexEntry[] = await res.json();

  // Sort by path so docIds are reproducible across runs.
  const entries = all.sort((a, b) => a.path.localeCompare(b.path));
  const source = LIMIT > 0 ? entries.slice(0, LIMIT) : entries;
  console.log(`${c.bold(String(source.length))} pages, concurrency ${CONCURRENCY}`);

  // A page with other pages beneath it is a section listing. It names
  // everything it contains, so it matches almost any query in its area and is
  // almost never the answer. Derived from the corpus because the shapes vary:
  // `houdini/nodes/lop`, `houdini/vex/functions`, and every `*/index`.
  const parents = new Set<string>();
  for (const e of entries) {
    const cut = e.path.lastIndexOf("/");
    if (cut > 0) parents.add(e.path.slice(0, cut));
  }

  const docs: SearchDoc[] = source.map((e) => ({
    path: e.path,
    title: e.title,
    summary: e.summary,
    category: e.category,
    version: e.version,
    ...(e.icon ? { icon: e.icon } : {}),
    t: e.title.toLowerCase().replace(/\s+/g, ""),
    s: e.path.split("/").pop()?.toLowerCase() ?? "",
    dl: 0,
    headings: [],
    ...(parents.has(e.path) || parents.has(e.path.replace(/\/index$/, "")) ? { nav: 1 as const } : {}),
  }));

  // Null-prototype: the docs contain the words "constructor", "toString" and
  // friends, and on a normal object `shard[token] ??= []` finds the inherited
  // member and never assigns.
  const tokenMaps: Shard["tokens"][] = Array.from(
    { length: SHARD_COUNT },
    () => Object.create(null) as Shard["tokens"],
  );
  let fetched = 0;
  let missing = 0;

  await mapPool(source, CONCURRENCY, async (entry, docId) => {
    const markdown = await fetchMarkdown(entry.path);
    if (++fetched % 500 === 0) process.stdout.write(`\r  fetched ${fetched}/${source.length}`);

    const doc = docs[docId];
    // A page with no markdown yet still belongs in the table — exact/prefix
    // must keep finding it. It simply contributes no postings.
    if (!markdown) {
      missing++;
      return;
    }

    const { headings, counts, headingHits, length } = parsePage(markdown);
    doc.headings = headings;
    doc.dl = length;

    // Title and slug are the strongest signal a page can give; the summary is
    // the next. Kept OUT of `counts` so the damping below cannot touch them.
    const fieldBoost = new Map<string, number>();
    for (const token of [...tokenize(entry.title), ...tokenize(doc.s)]) {
      fieldBoost.set(token, (fieldBoost.get(token) ?? 0) + TITLE_TF_BOOST);
    }
    // Where the page LIVES is part of what it is. `vex/functions/point` is the
    // point VEX function, but nothing in its title, summary or body says "VEX
    // function" — so `point vex function` could not find it, while the section
    // listing that names every VEX function ranked first. Readers type the
    // context they are in (`light lop`, `boolean sop`, `point vex function`),
    // and the path is where that context is actually recorded.
    for (const segment of entry.path.split("/").slice(1, -1)) {
      for (const token of tokenize(segment)) {
        fieldBoost.set(token, (fieldBoost.get(token) ?? 0) + PATH_TF_BOOST);
      }
    }
    for (const token of tokenize(entry.summary)) {
      fieldBoost.set(token, (fieldBoost.get(token) ?? 0) + SUMMARY_TF_BOOST);
    }

    for (const token of new Set([...counts.keys(), ...fieldBoost.keys()])) {
      const sections = counts.get(token);
      const named = headingHits.get(token);
      let tf = fieldBoost.get(token) ?? 0;
      let bestIdx = 0;
      let bestRank = -1;
      for (const [idx, count] of sections ?? []) {
        // Sublinear within a section. Parameter tables repeat one phrase per
        // row: the Position Map COP says "cube" 16 times, 15 of them in the
        // same Clamp/Mirror/Wrap boilerplate across its X, Y and Z Border
        // rows, which outscored the Box SOP whose summary defines it as one.
        // Saying a word twice in a section is real evidence; saying it fifteen
        // times in one table is one piece of evidence, formatted.
        tf += 1 + Math.log(count);
        // A section whose own heading names the token outranks any section that
        // merely mentions it often, however often. `tf` is accumulated above
        // from `count` alone, so this preference cannot move the BM25 score.
        const rank = (named?.has(idx) ? 1e6 : 0) + count;
        if (rank > bestRank) {
          bestRank = rank;
          bestIdx = idx;
        }
      }
      const posting: Posting = [docId, Math.min(Math.round(tf), MAX_TF), bestIdx];
      const tokens = tokenMaps[shardOf(token)];
      (tokens[token] ??= []).push(posting);
    }
  });

  process.stdout.write("\r");
  const withBody = docs.filter((d) => d.dl > 0);
  const avgdl = withBody.reduce((sum, d) => sum + d.dl, 0) / (withBody.length || 1);
  const tokens = tokenMaps.reduce((n, s) => n + Object.keys(s).length, 0);
  const postings = tokenMaps.reduce(
    (n, s) => n + Object.values(s).reduce((m, p) => m + p.length, 0),
    0,
  );

  console.log(
    `${c.green("indexed")} ${withBody.length} pages · ${tokens.toLocaleString()} tokens · ` +
      `${postings.toLocaleString()} postings · avgdl ${avgdl.toFixed(0)}` +
      (missing ? c.yellow(` · ${missing} without markdown`) : ""),
  );

  // Stamp where the shards live, so the browser needs no env var of its own,
  // and which build this is, so a cached table can never be paired with
  // postings that renumbered underneath it.
  const build = String(started);
  const table = JSON.stringify({ avgdl, origin: config!.publicUrl, build, docs });
  const shardBodies = tokenMaps.map((t) => JSON.stringify({ build, tokens: t }));
  const totalBytes = shardBodies.reduce((n, b) => n + b.length, 0);
  console.log(
    `  docs.json ${(table.length / 1e6).toFixed(2)} MB · ` +
      `shards ${(totalBytes / 1e6).toFixed(2)} MB ` +
      `(avg ${(totalBytes / SHARD_COUNT / 1024).toFixed(0)} KB)`,
  );

  if (DRY_RUN) {
    console.log(c.dim("--dry-run: nothing written"));
    return;
  }

  const client = await getS3Client();
  if (!client) throw new Error("R2 client unavailable");

  const put = (key: string, body: string) =>
    client.send(
      new PutObjectCommand({
        Bucket: config!.bucketName,
        Key: key,
        Body: body,
        ContentType: "application/json; charset=utf-8",
      }),
    );

  // Shards first: docs.json landing last means a crashed run never leaves a
  // table whose docIds outrun the postings that were written.
  let written = 0;
  await mapPool(shardBodies, 16, async (body, n) => {
    await put(shardKey(n), body);
    if (++written % 32 === 0) process.stdout.write(`\r  wrote ${written}/${SHARD_COUNT} shards`);
  });
  process.stdout.write("\r");
  await put(DOCS_KEY, table);

  console.log(`${c.green("done")} in ${fmtMs(Date.now() - started)}`);
}

main().catch((err) => {
  console.error(c.red(String(err)));
  process.exit(1);
});
