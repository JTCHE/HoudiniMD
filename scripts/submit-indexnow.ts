#!/usr/bin/env bun
/**
 * Submit the live sitemap to IndexNow — which fans out to Bing, Yandex,
 * Seznam.cz, Naver, etc. — and directly to Bing's own IndexNow endpoint.
 *
 * Requires the key file at public/<key>.txt (see lib/indexnow.ts) to already
 * be deployed, since search engines verify ownership by fetching it.
 *
 * Usage:
 *   bun scripts/submit-indexnow.ts                       # submit every URL in the live sitemap
 *   bun scripts/submit-indexnow.ts --sitemap-url <url>   # override sitemap location
 *   bun scripts/submit-indexnow.ts --url <url>           # submit specific URL(s) instead (repeatable)
 *   bun scripts/submit-indexnow.ts --limit 10            # cap how many URLs are submitted
 *   bun scripts/submit-indexnow.ts --dry-run             # show what would be submitted
 */

import { submitToIndexNow, INDEXNOW_KEY } from "../lib/indexnow";
import { parseArgs, getNumber, c } from "./lib/cli";

const DEFAULT_SITEMAP_URL = `${process.env.URL ?? "https://houdinimd.jchd.me"}/sitemap.xml`;

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const res = await fetch(sitemapUrl);
  if (!res.ok) throw new Error(`GET ${sitemapUrl} → ${res.status}`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (urls.length === 0) throw new Error(`No <loc> entries found in ${sitemapUrl}`);
  return urls;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.has("help")) {
    console.log(`Usage: bun scripts/submit-indexnow.ts [options]

  --sitemap-url <url>   Sitemap to pull URLs from (default: ${DEFAULT_SITEMAP_URL})
  --url <url>           Submit specific URL(s) instead of the sitemap (repeatable)
  --limit <N>           Cap how many URLs are submitted (mostly for smoke tests)
  --dry-run             Print what would be submitted, don't call IndexNow
`);
    return;
  }

  const explicitUrls = args.multiValues.get("url");
  const sitemapUrl = args.values.get("sitemap-url") ?? DEFAULT_SITEMAP_URL;

  const urls = explicitUrls ?? (await fetchSitemapUrls(sitemapUrl));
  const host = new URL(urls[0]).host;

  const limit = args.values.has("limit") ? getNumber(args, "limit", Infinity) : Infinity;
  const list = Number.isFinite(limit) ? urls.slice(0, limit) : urls;

  console.log(c.bold("IndexNow submission"));
  console.log(`  source    ${explicitUrls ? `${explicitUrls.length} --url arg(s)` : sitemapUrl}`);
  console.log(`  host      ${host}`);
  console.log(`  urls      ${list.length}`);
  console.log(`  key       ${INDEXNOW_KEY} (https://${host}/${INDEXNOW_KEY}.txt)`);
  console.log("");

  if (args.flags.has("dry-run")) {
    for (const u of list) console.log(`  ${c.dim(u)}`);
    console.log(`\n${c.dim("(dry run — nothing was submitted)")}`);
    return;
  }

  const results = await submitToIndexNow(host, list);
  let failed = 0;
  for (const r of results) {
    const status = r.ok ? c.green(`${r.status}`) : c.red(`${r.status || "ERR"}`);
    console.log(`  ${status}  ${r.endpoint}${r.error ? c.dim(` — ${r.error}`) : ""}`);
    if (!r.ok) failed++;
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(c.red("fatal:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
