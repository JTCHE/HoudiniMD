#!/usr/bin/env bun
/**
 * Purge stray R2 objects and index entries whose paths are not routable:
 *   - Paths containing '#'  (anchor fragment baked into slug, e.g. page#section)
 *   - Paths ending in '.html' (bare HTML-extension slugs)
 *
 * Runs as a dry-run by default so you can review before committing writes.
 *
 * Usage:
 *   bun scripts/cleanup-slugs.ts              # dry-run: list what would be removed
 *   bun scripts/cleanup-slugs.ts --apply      # delete R2 objects + update index
 *   bun scripts/cleanup-slugs.ts --apply --verbose
 */

import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getConfig, getS3Client } from "../lib/r2/config";
import { listR2Slugs, fetchSearchIndex, putSearchIndex } from "./lib/regen";
import { parseArgs, c } from "./lib/cli";

function isBadSlug(slug: string): boolean {
  return slug.includes("#") || slug.endsWith(".html");
}

async function deleteR2Object(key: string): Promise<void> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 not configured");
  await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.flags.has("apply");
  const verbose = args.flags.has("verbose");

  console.log(c.bold("HoudiniMD slug cleanup"));
  console.log(`  mode        ${apply ? c.red("--apply (writes to R2)") : c.dim("dry-run (pass --apply to commit)")}`);
  console.log("");

  // Scan R2 objects and the search index in parallel
  console.log(c.dim("Scanning R2 objects and search index..."));
  const [allSlugs, indexEntries] = await Promise.all([listR2Slugs(), fetchSearchIndex()]);

  const badObjects = allSlugs.filter(isBadSlug);
  const badIndexEntries = indexEntries.filter((e) => isBadSlug(e.path));

  console.log(`  R2 objects     ${allSlugs.length} total,  ${c.yellow(String(badObjects.length))} bad`);
  console.log(`  Index entries  ${indexEntries.length} total,  ${c.yellow(String(badIndexEntries.length))} bad`);
  console.log("");

  if (badObjects.length === 0 && badIndexEntries.length === 0) {
    console.log(c.green("Nothing to clean up."));
    return;
  }

  if (verbose || badObjects.length > 0) {
    console.log(c.bold("Bad R2 objects") + (apply ? "" : c.dim(" (would delete)")));
    for (const slug of badObjects) {
      const reason = slug.includes("#") ? c.yellow("#fragment") : c.yellow(".html");
      console.log(`  ${c.red("✗")} [${reason}] ${slug}`);
    }
    if (badObjects.length === 0) console.log(c.dim("  (none)"));
    console.log("");
  }

  if (verbose || badIndexEntries.length > 0) {
    console.log(c.bold("Bad index entries") + (apply ? "" : c.dim(" (would remove)")));
    for (const e of badIndexEntries) {
      const reason = e.path.includes("#") ? c.yellow("#fragment") : c.yellow(".html");
      console.log(`  ${c.red("✗")} [${reason}] ${e.path}`);
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
    let deleted = 0;
    let failed = 0;
    for (const slug of badObjects) {
      const key = `content/${slug}.md`;
      try {
        await deleteR2Object(key);
        deleted++;
        if (verbose) console.log(`  ${c.green("✓")} deleted ${key}`);
      } catch (err) {
        failed++;
        console.log(`  ${c.red("✗")} failed to delete ${key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log(`  deleted ${c.green(String(deleted))}  failed ${failed > 0 ? c.red(String(failed)) : String(failed)}`);
    console.log("");
  }

  // Rewrite index without bad entries
  const cleanIndex = indexEntries.filter((e) => !isBadSlug(e.path));
  console.log(c.dim(`Writing cleaned index (${cleanIndex.length} entries)...`));
  await putSearchIndex(cleanIndex);
  console.log(c.green(`Done. Removed ${badIndexEntries.length} bad index entries.`));
}

main().catch((err) => {
  console.error(c.red("fatal:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
