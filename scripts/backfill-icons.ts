#!/usr/bin/env bun
/**
 * Backfill the `icon` field on existing search-index entries without
 * re-scraping SideFX. Every page's markdown already carries its icon in
 * frontmatter (lib/markdown/converter.ts) from whenever it was last scraped —
 * this just reads that already-cached frontmatter and copies it into the
 * index, for entries indexed before the `icon` field existed.
 *
 * Usage: bun scripts/backfill-icons.ts [--dry-run] [--concurrency N]
 */

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getConfig, getS3Client } from "../lib/r2/config";
import { fetchSearchIndex, putSearchIndex } from "./lib/regen";
import { parseArgs, getNumber, c } from "./lib/cli";

async function readIcon(client: Awaited<ReturnType<typeof getS3Client>>, bucket: string, slug: string): Promise<string | undefined> {
  try {
    const res = await client!.send(new GetObjectCommand({ Bucket: bucket, Key: `content/${slug}.md` }));
    if (!res.Body) return undefined;
    const raw = await res.Body.transformToString("utf-8");
    return raw.match(/\nicon:\s*(\S+)/)?.[1];
  } catch {
    return undefined;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args.flags.has("dry-run");
  const concurrency = getNumber(args, "concurrency", 16);

  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) {
    throw new Error("R2 not configured — set R2_* env vars in .env.local");
  }

  const entries = await fetchSearchIndex();
  const missing = entries.filter((e) => !e.icon);
  console.log(c.bold("Icon backfill"));
  console.log(`  ${entries.length} entries total, ${missing.length} missing icon\n`);

  let done = 0, found = 0, cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, missing.length) }, async () => {
    while (cursor < missing.length) {
      const entry = missing[cursor++];
      const icon = await readIcon(client, config.bucketName, entry.path);
      if (icon) {
        entry.icon = icon;
        found++;
      }
      done++;
      if (process.stdout.isTTY) {
        process.stdout.write(`\r${done}/${missing.length} checked, ${found} icons found${" ".repeat(10)}`);
      }
    }
  });
  await Promise.all(workers);
  if (process.stdout.isTTY) process.stdout.write("\n");

  console.log(`\n  ${c.green(`${found} icons backfilled`)}, ${missing.length - found} pages have no icon on SideFX`);

  if (dryRun) {
    console.log(`\n${c.dim("(dry run — nothing was written)")}`);
    return;
  }

  await putSearchIndex(entries);
  console.log(`  ${c.green("index.json + index-lite.json written")}`);
}

main().catch((err) => {
  console.error(c.red("fatal:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
