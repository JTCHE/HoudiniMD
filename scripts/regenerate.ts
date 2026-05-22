#!/usr/bin/env bun
/**
 * Regenerate markdown pages into the R2 cache.
 *
 * Sources of slugs (pick ONE):
 *   --all                  Re-scrape every page currently in R2 (forces refresh)
 *   --missing              Pages listed in a SideFX index file but absent from R2
 *   --stale <days>         Pages in R2 whose lastModified is older than N days
 *   --cache-misses <file>  Newline-delimited file of slugs that returned cache miss
 *   --from-sidefx <file>   Use a SideFX index JSON (output of build-sidefx-index.ts)
 *
 * Common options:
 *   --concurrency <N>      Parallel workers (default 4 — be nice to SideFX)
 *   --limit <N>            Cap total pages processed (useful for smoke tests)
 *   --dry-run              List what would be regenerated, don't fetch/save
 *   --verbose              One line per page (default: live progress on a single line)
 *
 * Examples:
 *   bun scripts/regenerate.ts --all --concurrency 6
 *   bun scripts/regenerate.ts --stale 30
 *   bun scripts/regenerate.ts --from-sidefx scripts/data/sidefx-pages.json --missing
 *   bun scripts/regenerate.ts --cache-misses ./misses.txt
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  regenerateBatch,
  listR2Slugs,
  fetchSearchIndex,
  DEFAULT_OPTIONS,
  type RegenResult,
} from "./lib/regen";
import { parseArgs, getNumber, c } from "./lib/cli";
import { CACHE_INVALIDATE_BEFORE } from "../lib/r2/read";

async function loadSidefxIndex(path: string): Promise<string[]> {
  if (!existsSync(path)) {
    throw new Error(`SideFX index file not found: ${path} — run scripts/build-sidefx-index.ts first`);
  }
  const raw = await readFile(path, "utf-8");
  const data = JSON.parse(raw) as { slugs: string[] };
  if (!Array.isArray(data.slugs)) {
    throw new Error(`${path} does not look like a SideFX index (missing .slugs array)`);
  }
  return data.slugs;
}

async function loadCacheMisses(path: string): Promise<string[]> {
  const raw = await readFile(path, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

async function pickSlugs(args: ReturnType<typeof parseArgs>): Promise<{ slugs: string[]; mode: string }> {
  if (args.flags.has("all")) {
    const slugs = await listR2Slugs();
    return { slugs, mode: `--all (${slugs.length} pages in R2)` };
  }

  // --stale (no arg)        → use CACHE_INVALIDATE_BEFORE from lib/r2/read.ts
  // --stale <days>          → relative to now
  const hasStaleFlag = args.flags.has("stale");
  const staleRaw = args.values.get("stale");
  if (hasStaleFlag || staleRaw !== undefined) {
    let cutoff: Date;
    let label: string;
    if (staleRaw !== undefined) {
      const days = Number(staleRaw);
      if (!Number.isFinite(days) || days < 0) throw new Error(`--stale must be a non-negative number of days`);
      cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      label = `--stale ${days}d`;
    } else {
      cutoff = CACHE_INVALIDATE_BEFORE;
      label = `--stale (CACHE_INVALIDATE_BEFORE = ${cutoff.toISOString().slice(0, 10)})`;
    }
    const index = await fetchSearchIndex();
    const slugs = index
      .filter((e) => !e.lastModified || new Date(e.lastModified).getTime() < cutoff.getTime())
      .map((e) => e.path);
    return { slugs, mode: `${label} (${slugs.length} pages older than ${cutoff.toISOString().slice(0, 10)})` };
  }

  const misses = args.values.get("cache-misses");
  if (misses) {
    const slugs = await loadCacheMisses(misses);
    return { slugs, mode: `--cache-misses ${misses} (${slugs.length} slugs)` };
  }

  const sidefxPath = args.values.get("from-sidefx");
  if (sidefxPath) {
    const sidefxSlugs = await loadSidefxIndex(sidefxPath);
    if (args.flags.has("missing")) {
      const inR2 = new Set(await listR2Slugs());
      const missing = sidefxSlugs.filter((s) => !inR2.has(s));
      return { slugs: missing, mode: `--from-sidefx ${sidefxPath} --missing (${missing.length} of ${sidefxSlugs.length} not in R2)` };
    }
    return { slugs: sidefxSlugs, mode: `--from-sidefx ${sidefxPath} (${sidefxSlugs.length} slugs)` };
  }

  if (args.flags.has("missing")) {
    throw new Error(`--missing requires --from-sidefx <file>`);
  }

  throw new Error(
    `No source selected. Pass one of: --all, --stale <days>, --cache-misses <file>, --from-sidefx <file>`,
  );
}

function printProgress(done: number, total: number, last: RegenResult, verbose: boolean) {
  const status =
    last.status === "ok" ? c.green("ok ") :
    last.status === "404" ? c.yellow("404") :
    last.status === "error" ? c.red("err") :
    c.dim("skp");

  if (verbose) {
    const err = last.error ? c.dim(` — ${last.error}`) : "";
    console.log(`[${done}/${total}] ${status} ${last.slug}${err}`);
    return;
  }

  // Compact single-line progress (only redraw to TTY)
  if (process.stdout.isTTY) {
    const bar = `${done}/${total}`;
    process.stdout.write(`\r${status} ${bar} ${c.dim(last.slug.slice(0, 60))}${" ".repeat(20)}`);
    if (done === total) process.stdout.write("\n");
  }
}

function printSummary(results: RegenResult[], mode: string, dryRun: boolean) {
  const ok = results.filter((r) => r.status === "ok");
  const e404 = results.filter((r) => r.status === "404");
  const errs = results.filter((r) => r.status === "error");
  const totalMs = results.reduce((a, r) => a + r.durationMs, 0);
  const avg = ok.length ? totalMs / ok.length : 0;

  console.log("");
  console.log(c.bold("Summary"));
  console.log(`  mode      ${mode}`);
  console.log(`  total     ${results.length}`);
  console.log(`  ${c.green("ok      ")} ${ok.length}`);
  console.log(`  ${c.yellow("404     ")} ${e404.length}`);
  console.log(`  ${c.red("error   ")} ${errs.length}`);
  if (ok.length) console.log(`  avg time  ${avg.toFixed(0)}ms/page`);

  if (errs.length) {
    console.log("");
    console.log(c.bold("Errors"));
    for (const r of errs.slice(0, 20)) {
      console.log(`  ${c.red("✗")} ${r.slug} — ${c.dim(r.error ?? "unknown")}`);
    }
    if (errs.length > 20) console.log(`  ${c.dim(`...and ${errs.length - 20} more`)}`);
  }

  if (dryRun) console.log(`\n${c.dim("(dry run — nothing was written)")}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.has("help") || args.positional[0] === "help") {
    console.log(`Usage: bun scripts/regenerate.ts [source] [options]

Sources (pick one):
  --all                    Re-scrape every page currently in R2
  --stale [days]           Pages older than N days (no arg = use CACHE_INVALIDATE_BEFORE)
  --cache-misses <file>    Newline-delimited slug list (e.g. from audit-perf.ts)
  --from-sidefx <file>     SideFX index JSON (from build-sidefx-index.ts)
  --from-sidefx <file> --missing
                           Only pages in the SideFX index but missing from R2

Options:
  --concurrency <N>        Parallel workers, default ${DEFAULT_OPTIONS.concurrency}
  --limit <N>              Cap pages processed
  --dry-run                List what would be done
  --verbose                One line per page
`);
    return;
  }

  const { slugs: allSlugs, mode } = await pickSlugs(args);

  const limit = args.values.has("limit") ? getNumber(args, "limit", Infinity) : Infinity;
  const slugs = Number.isFinite(limit) ? allSlugs.slice(0, limit) : allSlugs;

  if (slugs.length === 0) {
    console.log(`Nothing to do — 0 slugs matched (${mode}).`);
    return;
  }

  const concurrency = getNumber(args, "concurrency", DEFAULT_OPTIONS.concurrency);
  const dryRun = args.flags.has("dry-run");
  const verbose = args.flags.has("verbose");

  console.log(c.bold("HoudiniMD regenerator"));
  console.log(`  ${mode}`);
  console.log(`  concurrency ${concurrency}${dryRun ? c.dim(" (dry-run)") : ""}`);
  console.log("");

  const results = await regenerateBatch(slugs, {
    concurrency,
    dryRun,
    onProgress: (done, total, last) => printProgress(done, total, last, verbose),
  });

  printSummary(results, mode, dryRun);

  const failed = results.filter((r) => r.status === "error").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(c.red("fatal:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
