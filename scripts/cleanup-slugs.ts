#!/usr/bin/env bun
/**
 * Purge stray R2 objects and index entries whose paths are not routable:
 *   - Paths containing '#'  (anchor fragment baked into slug, e.g. page#section)
 *   - Paths ending in '.html' (bare HTML-extension slugs)
 *   - Paths with a leading/trailing slash or an internal '//' (produces an
 *     empty segment when split on '/', which breaks Next.js static params —
 *     "Requested and resolved page mismatch")
 *   - With --source: paths SideFX redirects somewhere else, i.e. the stored
 *     page is a duplicate of the page it redirects to. Paths a crawler invented
 *     under a moved section are all of this kind. Costs HEAD requests against
 *     SideFX and no extra R2 operations — R2 deletes are free.
 *
 * Runs as a dry-run by default so you can review before committing writes.
 *
 * Usage:
 *   bun scripts/cleanup-slugs.ts              # dry-run: list what would be removed
 *   bun scripts/cleanup-slugs.ts --apply      # delete R2 objects + update index
 *   bun scripts/cleanup-slugs.ts --source     # also verify slugs against SideFX
 *   bun scripts/cleanup-slugs.ts --source --drop-404   # remove 404s as well as redirects
 *   bun scripts/cleanup-slugs.ts --source --concurrency 32
 *   bun scripts/cleanup-slugs.ts --source --refresh   # ignore cached verdicts
 *   bun scripts/cleanup-slugs.ts --apply --verbose
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getConfig, getS3Client } from "../lib/r2/config";
import { resolveSideFXUrl, PageNotFoundError } from "../lib/scraping";
import { listR2Slugs, fetchSearchIndex, putSearchIndex } from "./lib/regen";
import { parseArgs, getNumber, c } from "./lib/cli";

// Verdicts survive between runs. The check is one HEAD per slug against SideFX
// and the answer changes only when SideFX moves a page, so a re-run — after a
// timeout, or to apply what a dry-run listed — costs nothing instead of another
// half hour. Lives in the temp dir: it is a cache, not part of the repo.
const VERDICT_CACHE = path.join(tmpdir(), "houdinimd-slug-verdicts.json");
const VERDICT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Verdict {
  at: number;
  /** null when SideFX serves the slug under its own spelling. */
  reason: string | null;
}

function loadVerdicts(refresh: boolean): Map<string, Verdict> {
  if (refresh) return new Map();
  try {
    const raw = JSON.parse(readFileSync(VERDICT_CACHE, "utf8")) as Record<string, Verdict>;
    const cutoff = Date.now() - VERDICT_TTL_MS;
    return new Map(Object.entries(raw).filter(([, v]) => v.at > cutoff));
  } catch {
    return new Map();
  }
}

function saveVerdicts(verdicts: Map<string, Verdict>): void {
  try {
    writeFileSync(VERDICT_CACHE, JSON.stringify(Object.fromEntries(verdicts)));
  } catch (err) {
    console.log(c.dim(`  could not write verdict cache: ${err instanceof Error ? err.message : err}`));
  }
}

function isBadSlug(slug: string): boolean {
  return (
    slug.includes("#") ||
    slug.endsWith(".html") ||
    slug === "" ||
    slug.startsWith("/") ||
    slug.endsWith("/") ||
    slug.includes("//")
  );
}

function badSlugReason(slug: string, stale?: Map<string, string>): string {
  const staleReason = stale?.get(slug);
  if (staleReason) return c.yellow(staleReason);
  if (slug.includes("#")) return c.yellow("#fragment");
  if (slug.endsWith(".html")) return c.yellow(".html");
  if (slug === "" || slug.startsWith("/") || slug.endsWith("/") || slug.includes("//")) return c.yellow("empty segment");
  return c.yellow("unknown");
}

/** Run async tasks with bounded concurrency. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/**
 * Ask SideFX what it serves for each slug. A redirect means the stored page is
 * a duplicate of the page it points at; a 404 means SideFX has nothing there.
 * A slug whose check fails to answer at all is left out — a transport error is
 * not evidence about the page.
 */
async function verifySlugs(
  slugs: string[],
  concurrency: number,
  label: string,
  verdicts: Map<string, Verdict>,
): Promise<Map<string, string>> {
  const stale = new Map<string, string>();
  const toCheck: string[] = [];
  for (const slug of slugs) {
    const cached = verdicts.get(slug);
    if (!cached) toCheck.push(slug);
    else if (cached.reason) stale.set(slug, cached.reason);
  }
  if (toCheck.length < slugs.length) {
    console.log(c.dim(`  ${label}: ${slugs.length - toCheck.length} answered from cache, ${toCheck.length} to check`));
  }

  let checked = 0;
  await pool(toCheck, concurrency, async (slug) => {
    let reason: string | null = null;
    try {
      const { canonicalSlug } = await resolveSideFXUrl(slug);
      if (canonicalSlug !== slug) reason = `redirects to ${canonicalSlug}`;
    } catch (err) {
      // Only a definite answer is cached — a transport error says nothing
      // about the page, so leave it unrecorded and check it again next run.
      if (!(err instanceof PageNotFoundError)) return;
      reason = "404 on SideFX";
    }
    verdicts.set(slug, { at: Date.now(), reason });
    if (reason) stale.set(slug, reason);
    if (++checked % 500 === 0) {
      console.log(c.dim(`  ${label}: checked ${checked}/${toCheck.length}, ${stale.size} stale`));
      saveVerdicts(verdicts);
    }
  });
  if (toCheck.length) saveVerdicts(verdicts);
  return stale;
}

function ancestors(slug: string): string[] {
  const parts = slug.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

/**
 * Slugs SideFX does not serve under that spelling any more.
 *
 * Ancestors go first, shallowest out. SideFX answers every path under a moved
 * section with that section's index page, so one HEAD on `hqueue` condemns the
 * 200k paths a crawler invented below it, instead of one HEAD per path. A
 * redirecting ancestor only condemns its subtree once sample children redirect
 * the same way, and a 404 ancestor condemns nothing — a directory with no page
 * of its own still has real children.
 */
async function findStaleSourceSlugs(
  slugs: string[],
  concurrency: number,
  verdicts: Map<string, Verdict>,
): Promise<Map<string, string>> {
  const staleRoots = new Map<string, string>();
  const condemned = (slug: string) => ancestors(slug).find((a) => staleRoots.has(a));

  for (const depth of [1, 2, 3, 4]) {
    const prefixes = [
      ...new Set(
        slugs
          .filter((s) => s.split("/").length > depth && !condemned(s))
          .map((s) => s.split("/").slice(0, depth).join("/")),
      ),
    ];
    if (prefixes.length === 0) continue;
    const suspect = await verifySlugs(prefixes, concurrency, `prefix depth ${depth}`, verdicts);
    for (const [prefix, reason] of suspect) {
      if (!reason.startsWith("redirects")) continue;
      const samples = slugs.filter((s) => s.startsWith(`${prefix}/`)).slice(0, 3);
      const sampled = await verifySlugs(samples, concurrency, "sample", verdicts);
      if (samples.length > 0 && samples.every((s) => sampled.get(s)?.startsWith("redirects"))) {
        staleRoots.set(prefix, reason);
      }
    }
    console.log(
      c.dim(`  depth ${depth}: ${prefixes.length} prefix(es) checked, ${staleRoots.size} stale subtree(s) so far`),
    );
  }

  for (const [root, reason] of staleRoots) {
    console.log(c.dim(`  stale subtree ${root}/** — ${reason}`));
  }

  const stale = new Map<string, string>();
  const remaining: string[] = [];
  for (const slug of slugs) {
    const root = condemned(slug);
    if (root) stale.set(slug, `under ${root}, which ${staleRoots.get(root)}`);
    else remaining.push(slug);
  }
  console.log(
    c.dim(`  ${stale.size} slug(s) condemned by an ancestor, ${remaining.length} left to check one by one`),
  );
  for (const [slug, reason] of await verifySlugs(remaining, concurrency, "slug", verdicts)) {
    stale.set(slug, reason);
  }
  return stale;
}

/** Delete objects in batches of 1000 — the DeleteObjects limit. R2 deletes are free. */
async function deleteR2Objects(keys: string[], onProgress: (done: number) => void): Promise<void> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 not configured");
  const RETRIES = 4;
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    for (let attempt = 1; ; attempt++) {
      try {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucketName,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        break;
      } catch (err) {
        // A batch of 1000 keys is the most likely request to hit the 30s
        // client timeout. One slow batch must not abandon the run — the index
        // is only rewritten once every delete lands.
        if (attempt === RETRIES) throw err;
        console.log(c.dim(`  batch at ${i} failed (attempt ${attempt}), retrying`));
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    onProgress(Math.min(i + batch.length, keys.length));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.flags.has("apply");
  const verbose = args.flags.has("verbose");
  const checkSource = args.flags.has("source");
  // A 404 can be SideFX being briefly unreachable rather than a page that is
  // gone, and a wrong call there deletes mirrored content. A redirect is proof:
  // SideFX answered, and named another page. Removing 404s is opt-in.
  const drop404 = args.flags.has("drop-404");
  const concurrency = getNumber(args, "concurrency", 24);
  const refresh = args.flags.has("refresh");

  console.log(c.bold("HoudiniMD slug cleanup"));
  console.log(`  mode        ${apply ? c.red("--apply (writes to R2)") : c.dim("dry-run (pass --apply to commit)")}`);
  console.log(`  source      ${checkSource ? `verify against SideFX (concurrency ${concurrency})` : c.dim("off (--source to verify against SideFX)")}`);
  if (checkSource) console.log(`  404s        ${drop404 ? c.red("removed too (--drop-404)") : c.dim("kept")}`);
  if (checkSource) console.log(`  verdicts    ${refresh ? c.yellow("re-checked from scratch (--refresh)") : `cached in ${VERDICT_CACHE}`}`);
  console.log("");

  // Scan R2 objects and the search index in parallel
  console.log(c.dim("Scanning R2 objects and search index..."));
  const [allSlugs, indexEntries] = await Promise.all([listR2Slugs(), fetchSearchIndex()]);

  const stale = new Map<string, string>();
  if (checkSource) {
    const candidates = [...new Set([...allSlugs, ...indexEntries.map((e) => e.path)])]
      // `_docs-root` is the storage name of the `/docs` root page, not a slug
      // SideFX can be asked about — see contentPathForSlug().
      .filter((slug) => !isBadSlug(slug) && slug !== "_docs-root");
    console.log(c.dim(`Verifying ${candidates.length} slug(s) against SideFX...`));
    const found = await findStaleSourceSlugs(candidates, concurrency, loadVerdicts(refresh));
    let skipped404 = 0;
    for (const [slug, reason] of found) {
      if (!drop404 && reason === "404 on SideFX") {
        skipped404++;
        continue;
      }
      stale.set(slug, reason);
    }
    console.log(`  ${c.yellow(String(stale.size))} slug(s) SideFX serves from somewhere else`);
    if (skipped404) {
      console.log(c.dim(`  ${skipped404} slug(s) 404 on SideFX — kept (pass --drop-404 to remove them too)`));
    }
    console.log("");
  }

  const isRemovable = (slug: string) => isBadSlug(slug) || stale.has(slug);
  const badObjects = allSlugs.filter(isRemovable);
  const badIndexEntries = indexEntries.filter((e) => isRemovable(e.path));

  console.log(`  R2 objects     ${allSlugs.length} total,  ${c.yellow(String(badObjects.length))} bad`);
  console.log(`  Index entries  ${indexEntries.length} total,  ${c.yellow(String(badIndexEntries.length))} bad`);
  console.log("");

  if (badObjects.length === 0 && badIndexEntries.length === 0) {
    console.log(c.green("Nothing to clean up."));
    return;
  }

  const LIST_CAP = 40;
  if (verbose || badObjects.length > 0) {
    console.log(c.bold("Bad R2 objects") + (apply ? "" : c.dim(" (would delete)")));
    for (const slug of verbose ? badObjects : badObjects.slice(0, LIST_CAP)) {
      console.log(`  ${c.red("✗")} [${badSlugReason(slug, stale)}] ${slug}`);
    }
    if (!verbose && badObjects.length > LIST_CAP) {
      console.log(c.dim(`  … ${badObjects.length - LIST_CAP} more (pass --verbose to list them all)`));
    }
    if (badObjects.length === 0) console.log(c.dim("  (none)"));
    console.log("");
  }

  if (verbose || badIndexEntries.length > 0) {
    console.log(c.bold("Bad index entries") + (apply ? "" : c.dim(" (would remove)")));
    for (const e of verbose ? badIndexEntries : badIndexEntries.slice(0, LIST_CAP)) {
      console.log(`  ${c.red("✗")} [${badSlugReason(e.path, stale)}] ${e.path}`);
    }
    if (!verbose && badIndexEntries.length > LIST_CAP) {
      console.log(c.dim(`  … ${badIndexEntries.length - LIST_CAP} more (pass --verbose to list them all)`));
    }
    if (badIndexEntries.length === 0) console.log(c.dim("  (none)"));
    console.log("");
  }

  if (!apply) {
    console.log(c.dim("Dry-run complete. Pass --apply to delete these objects and update the index."));
    return;
  }

  // Delete bad R2 objects
  if (badObjects.length > 0) {
    console.log(c.dim(`Deleting ${badObjects.length} R2 object(s)...`));
    await deleteR2Objects(
      badObjects.map((slug) => `content/${slug}.md`),
      (done) => console.log(c.dim(`  deleted ${done}/${badObjects.length}`)),
    );
    console.log(`  deleted ${c.green(String(badObjects.length))}`);
    console.log("");
  }

  // Rewrite index without bad entries
  const cleanIndex = indexEntries.filter((e) => !isRemovable(e.path));
  console.log(c.dim(`Writing cleaned index (${cleanIndex.length} entries)...`));
  await putSearchIndex(cleanIndex);
  console.log(c.green(`Done. Removed ${badIndexEntries.length} bad index entries.`));
}

main().catch((err) => {
  console.error(c.red("fatal:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
