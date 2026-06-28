/**
 * Purge ISR render cache entries for section pages.
 *
 * Section pages are identified as cache files that have a matching subdirectory
 * (e.g. docs/houdini/nodes.cache + docs/houdini/nodes/ → section page).
 * Their ISR entries were pre-rendered at build time using toSideFXUrl() which
 * omits the trailing slash — correct for leaf pages, wrong for section pages
 * where the SideFX canonical URL ends with '/'. Purging forces a fresh runtime
 * render where fetchFromR2 works and reads the correct source: URL.
 *
 * Usage: bun scripts/purge-section-isr.ts [--apply]
 *   (default: dry-run — prints keys that would be deleted)
 */

import { createHash } from "crypto";
import { readdirSync, statSync } from "fs";
import path from "path";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { config } from "dotenv";

config({ path: ".env.local" });

const CACHE_DIR = ".open-next/cache";
const PREFIX = process.env.NEXT_INC_CACHE_R2_PREFIX ?? "incremental-cache";
const BUCKET = process.env.R2_BUCKET_NAME ?? "houdinimd-cache";
const APPLY = process.argv.includes("--apply");

function computeCacheKey(key: string, buildId: string): string {
  const hash = createHash("sha256").update(key).digest("hex");
  return `${PREFIX}/${buildId}/${hash}.cache`.replace(/\/+/g, "/");
}

function findSectionPages(): { slug: string; r2Key: string }[] {
  const results: { slug: string; r2Key: string }[] = [];
  function walk(dir: string) {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) { walk(full); continue; }
      if (!entry.endsWith(".cache")) continue;
      const stem = entry.slice(0, -6);
      // section page: has matching subdirectory
      if (!statSync(path.join(dir, stem), { throwIfNoEntry: false })?.isDirectory()) continue;
      // derive cache key: strip CACHE_DIR prefix, split off buildId
      const rel = path.relative(CACHE_DIR, full).replace(/\\/g, "/");
      const [buildId, ...keyParts] = rel.slice(0, -6).split("/");
      if (!buildId || keyParts.length === 0) continue;
      const slug = `/${keyParts.join("/")}`;
      results.push({ slug, r2Key: computeCacheKey(slug, buildId) });
    }
  }
  walk(CACHE_DIR);
  return results.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function main() {
  const pages = findSectionPages();
  console.log(`Found ${pages.length} section pages.`);
  if (!APPLY) {
    console.log("Dry run — pass --apply to delete. Keys that would be deleted:");
    for (const p of pages) console.log(`  ${p.r2Key}  (${p.slug})`);
    return;
  }

  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKeyId = process.env.R2_CACHE_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_CACHE_SECRET_ACCESS_KEY!;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const toDelete = pages;
  console.log(`Deleting ${toDelete.length} section page entries…`);

  // Delete in batches of 1000 (S3 API limit)
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000);
    await client.send(new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: batch.map(p => ({ Key: p.r2Key })) },
    }));
    console.log(`  Deleted batch ${Math.floor(i / 1000) + 1} (${batch.length} keys)`);
  }
  console.log("Done. Section pages will be re-rendered on next request.");
}

main().catch(err => { console.error(err); process.exit(1); });
