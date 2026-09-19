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
 *   bun scripts/check-index-gaps.ts --apply          # index every gap the site serves
 */

import { writeFile } from "node:fs/promises";
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getConfig, getS3Client } from "../lib/r2/config";
import { mutateSearchIndex, type SearchIndexEntry } from "../lib/r2/search-index";
import { parseFrontmatter } from "../lib/markdown/frontmatter";
import { pageMeta } from "../lib/og/params";
import { checkDocNamespace } from "../lib/url/namespaces";
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
      "R2 not configured. Set CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL in .env.local",
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

/**
 * The index entry a stored page implies, read from its own frontmatter.
 *
 * Every field lib/scraping/scraper.ts puts in the index survives in the
 * markdown it wrote, so a missed page is re-indexed from R2 alone — no second
 * scrape of SideFX, and the summary/category/version match what the original
 * generation run would have stored.
 */
function entryFromMarkdown(slug: string, markdown: string, lastModified?: Date): SearchIndexEntry | null {
  const { data } = parseFrontmatter(markdown);
  // Pages the older converter wrote carry no `title:` key and hold the title in
  // the H1 alone. pageMeta() already reads a page's name either way, so it is
  // the one place that knows the fallback.
  const title = data.title || pageMeta(markdown, "").title;
  if (!title) return null;
  const breadcrumbs = (data.breadcrumbs ?? "").split(" > ").filter(Boolean);
  // Houdini pages lead with the product and its version ("Houdini 22.0"), and
  // scraper.ts drops that crumb from the category. A sphinx or doxygen tree
  // carries no version, and its first crumb *is* the category. Reading the
  // version off crumb 0 tells the two apart.
  const version = breadcrumbs[0]?.match(/\d+\.\d+/)?.[0];
  return {
    path: slug,
    title,
    summary: data.description ?? "",
    category: version ? breadcrumbs.slice(1).join(" > ") : (breadcrumbs[0] ?? ""),
    version: version ?? "unknown",
    ...(data.icon ? { icon: data.icon } : {}),
    lastModified: (lastModified ?? new Date()).toISOString(),
  };
}

async function readPage(slug: string): Promise<{ markdown: string; lastModified?: Date } | null> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 is not configured");
  try {
    const res = await client.send(new GetObjectCommand({
      Bucket: config.bucketName,
      Key: `content/${slug}.md`,
    }));
    if (!res.Body) return null;
    return { markdown: await res.Body.transformToString("utf-8"), lastModified: res.LastModified };
  } catch {
    return null;
  }
}

/** Index every gap the site actually serves. One index write, whatever the count. */
async function applyGaps(gaps: string[]): Promise<void> {
  // Only what checkDocNamespace admits: a versioned duplicate redirects to the
  // current slug and a retired tree is not served, so neither belongs in the
  // index that feeds generateStaticParams, the sitemap and search.
  const servable = gaps.filter((slug) => checkDocNamespace(slug).kind === "allowed");
  console.log(`
  ${servable.length} of ${gaps.length} gaps are pages the site serves`);
  if (servable.length === 0) return;

  const entries: SearchIndexEntry[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < servable.length; i += 20) {
    const batch = servable.slice(i, i + 20);
    const pages = await Promise.all(batch.map((slug) => readPage(slug)));
    batch.forEach((slug, n) => {
      const page = pages[n];
      const entry = page ? entryFromMarkdown(slug, page.markdown, page.lastModified) : null;
      if (entry) entries.push(entry);
      else skipped.push(slug);
    });
    process.stdout.write(`
  read ${Math.min(i + 20, servable.length)}/${servable.length}`);
  }
  console.log("");
  if (skipped.length) {
    console.log(c.yellow(`  ${skipped.length} stored pages carry no title in their frontmatter; left out`));
    for (const slug of skipped.slice(0, 10)) console.log(c.dim(`    ${slug}`));
  }
  if (entries.length === 0) return;

  const byPath = new Map(entries.map((e) => [e.path, e]));
  const final = await mutateSearchIndex((current) => [
    ...current.filter((e) => !byPath.has(e.path)),
    ...entries,
  ]);
  console.log(c.green(`  indexed ${entries.length} pages; index now holds ${final.length} entries`));
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

  if (args.flags.has("apply")) {
    await applyGaps(gaps);
    return;
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
