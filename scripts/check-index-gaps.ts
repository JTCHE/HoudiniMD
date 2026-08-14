#!/usr/bin/env bun
/**
 * Diff content/index.json against the actual content/*.md keys in R2.
 *
 * The index feeds generateStaticParams, sitemap.xml, and /api/search-index —
 * a page with real content in R2 but no index entry is invisible to all three
 * (see specs/Issue/Open/Content Index Misses Pages That Are Live In R2.md).
 * This is a read-only report; it does not touch R2 or the index.
 *
 * Talks to R2 directly via lib/r2/config's S3 client, the same way
 * audit-source-aliases.ts does — not via scripts/lib/regen.ts, which pulls in
 * lib/scraping/lib/markdown for its regenerateBatch() pipeline that this
 * script never needs.
 *
 * Usage:
 *   bun scripts/check-index-gaps.ts                 # summary + up to 50 examples
 *   bun scripts/check-index-gaps.ts --full           # print every gap
 *   bun scripts/check-index-gaps.ts --out gaps.json  # write the full slug list as JSON
 */

import { writeFile } from "node:fs/promises";
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getConfig, getS3Client } from "../lib/r2/config";
import type { SearchIndexEntry } from "../lib/r2/search-index";
import { parseArgs, getString, c } from "./lib/cli";

const INDEX_PATH = "content/index.json";

/** Strip `content/` prefix and `.md` suffix to get the slug. */
function keyToSlug(key: string): string {
  return key.replace(/^content\//, "").replace(/\.md$/, "");
}

/** List every markdown file's slug currently in the R2 bucket (content/ prefix). */
async function listR2Slugs(): Promise<string[]> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) {
    throw new Error(
      "R2 not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL in .env.local",
    );
  }

  const slugs: string[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: "content/",
      ContinuationToken: token,
    }));
    for (const obj of res.Contents ?? []) {
      // content/index.json and content/index-lite.json live under the same
      // prefix as the .md pages — the .md suffix check excludes both.
      if (obj.Key?.endsWith(".md")) slugs.push(keyToSlug(obj.Key));
    }
    token = res.NextContinuationToken;
  } while (token);

  return slugs.sort();
}

/** Read the current search index from R2 (empty array if missing). */
async function fetchSearchIndex(): Promise<SearchIndexEntry[]> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 is not configured");

  try {
    const res = await client.send(new GetObjectCommand({ Bucket: config.bucketName, Key: INDEX_PATH }));
    if (!res.Body) return [];
    return JSON.parse(await res.Body.transformToString("utf-8"));
  } catch (error: unknown) {
    const status = error && typeof error === "object" && "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
    if (status === 404 || (error instanceof Error && error.name === "NoSuchKey")) return [];
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(c.bold("HoudiniMD index-gap check"));
  console.log(c.dim("  comparing content/index.json against content/*.md in R2\n"));

  const [r2Slugs, index] = await Promise.all([listR2Slugs(), fetchSearchIndex()]);
  const indexedPaths = new Set(index.map((e) => e.path));

  // content/_docs-root.md (SideFX's /docs/, slug "") is deliberately never
  // indexed — see the "/docs is a navigation page" comment in
  // lib/generator.ts. keyToSlug("content/_docs-root.md") is "_docs-root", not
  // "", so it is a real R2 key that legitimately has no index counterpart;
  // exclude it explicitly instead of reporting a permanent false-positive gap.
  const gaps = r2Slugs.filter((slug) => slug !== "_docs-root" && !indexedPaths.has(slug)).sort();

  console.log(`  content/*.md in R2:     ${r2Slugs.length}`);
  console.log(`  content/index.json:     ${index.length} entries`);
  console.log(`  ${gaps.length ? c.red("gaps") : c.green("gaps")} (in R2, not indexed): ${gaps.length}`);
  console.log("");

  if (gaps.length === 0) {
    console.log(c.green("Every R2 content file has a matching index entry."));
    return;
  }

  const full = args.flags.has("full");
  const shown = full ? gaps : gaps.slice(0, 50);
  for (const slug of shown) console.log(`  ${c.yellow(slug)}`);
  if (!full && gaps.length > shown.length) {
    console.log(c.dim(`  … and ${gaps.length - shown.length} more (use --full to print all)`));
  }

  const outPath = getString(args, "out", "");
  if (outPath) {
    await writeFile(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), gaps }, null, 2));
    console.log(`\nWrote ${gaps.length} slugs to ${outPath}`);
  }

  process.exitCode = 1;
}

main().catch((err) => {
  console.error(c.red("fatal:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
