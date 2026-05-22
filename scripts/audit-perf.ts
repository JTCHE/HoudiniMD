#!/usr/bin/env bun
/**
 * Production performance audit.
 *
 * Hits a random sample of pages from the live site, measures TTFB + total
 * time + size, and surfaces Netlify cache headers so you can see what
 * fraction of requests are actually being served from the edge cache.
 *
 * Random sampling matters: hitting the same URL twice biases the second
 * read warm-cached. We sample without replacement across the full index.
 *
 * Usage:
 *   bun scripts/audit-perf.ts                          # 50 random HTML pages
 *   bun scripts/audit-perf.ts --samples 200            # bigger sample
 *   bun scripts/audit-perf.ts --md                     # test /docs/*.md endpoint
 *   bun scripts/audit-perf.ts --warm                   # second pass on same URLs (cold→warm delta)
 *   bun scripts/audit-perf.ts --seed 42                # reproducible sample
 *   bun scripts/audit-perf.ts --out audit.json         # write detailed JSON
 *   bun scripts/audit-perf.ts --base-url http://localhost:3000
 *   bun scripts/audit-perf.ts --misses-out misses.txt  # write cache-miss slugs (feed to regenerate --cache-misses)
 */

import { writeFile } from "node:fs/promises";
import { parseArgs, getNumber, getString, percentile, fmtMs, fmtPct, shuffleSeeded, c } from "./lib/cli";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

interface Probe {
  slug: string;
  url: string;
  status: number;
  ttfbMs: number;
  totalMs: number;
  bytes: number;
  cacheStatus: string | null;
  age: string | null;
  /** "hit" | "miss" | "bypass" | "stale" | "dynamic" | "unknown" */
  cacheClass: string;
  /** "ok" | "error" */
  outcome: "ok" | "error";
  error?: string;
}

/**
 * Classify Netlify's multi-layer cache-status header into a single bucket.
 * Format example: `"Netlify Durable"; fwd=bypass, "Netlify Edge"; fwd=miss`
 */
function classifyCache(cacheStatus: string | null, cfCache: string | null): string {
  if (!cacheStatus && !cfCache) return "unknown";
  const s = (cacheStatus ?? "").toLowerCase();
  if (s.includes("hit")) return "hit";
  if (s.includes("fwd=bypass") || s.includes("bypass")) return "bypass";
  if (s.includes("fwd=stale") || s.includes("stale")) return "stale";
  if (s.includes("fwd=miss") || s.includes("miss")) return "miss";
  if (cfCache && cfCache.toLowerCase() === "hit") return "hit";
  if (cfCache && cfCache.toLowerCase() === "dynamic") return "dynamic";
  return "unknown";
}

async function probe(slug: string, baseUrl: string, asMarkdown: boolean): Promise<Probe> {
  const path = asMarkdown ? `/docs/${slug}.md` : `/docs/${slug}`;
  const url = `${baseUrl}${path}`;
  const start = performance.now();

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, "Accept-Encoding": "identity" },
      redirect: "manual",
    });

    const ttfbMs = performance.now() - start;
    // Drain the body to measure full transfer time (but cap to avoid OOM on big pages).
    const buf = await res.arrayBuffer();
    const totalMs = performance.now() - start;

    const cacheStatus = res.headers.get("cache-status");
    const cfCache = res.headers.get("cf-cache-status");
    const age = res.headers.get("age");

    return {
      slug,
      url,
      status: res.status,
      ttfbMs,
      totalMs,
      bytes: buf.byteLength,
      cacheStatus,
      age,
      cacheClass: classifyCache(cacheStatus, cfCache),
      outcome: res.status >= 200 && res.status < 400 ? "ok" : "error",
    };
  } catch (err) {
    return {
      slug,
      url,
      status: 0,
      ttfbMs: performance.now() - start,
      totalMs: performance.now() - start,
      bytes: 0,
      cacheStatus: null,
      age: null,
      cacheClass: "unknown",
      outcome: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Promise pool with N workers. */
async function pool<T, R>(items: T[], concurrency: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

async function fetchSlugList(baseUrl: string): Promise<string[]> {
  // Primary: parse /sitemap.xml — always available, no auth, no 503 risk.
  // Fallback: /api/index for setups without a sitemap.
  const sitemapUrl = `${baseUrl}/sitemap.xml`;
  const res = await fetch(sitemapUrl, { headers: { "User-Agent": BROWSER_UA } });
  if (res.ok) {
    const xml = await res.text();
    const slugs: string[] = [];
    // Cheap regex — sitemaps from this app are flat and small.
    const locs = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    for (const m of locs) {
      const locUrl = m[1].trim();
      const docMatch = locUrl.match(/\/docs\/(.+?)\/?$/);
      if (docMatch) slugs.push(docMatch[1]);
    }
    if (slugs.length > 0) return slugs;
  }

  // Fallback: paginated /api/index
  const slugs: string[] = [];
  let page = 1;
  while (true) {
    const url = `${baseUrl}/api/index?page=${page}&limit=200`;
    const r = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
    if (!r.ok) throw new Error(`Neither /sitemap.xml nor /api/index returned a usable slug list (api/index → ${r.status})`);
    const json = (await r.json()) as { entries: { path: string }[]; pages: number };
    for (const e of json.entries) slugs.push(e.path);
    if (page >= json.pages) break;
    page++;
  }
  return slugs;
}

interface PassStats {
  label: string;
  samples: Probe[];
}

function summarisePass({ label, samples }: PassStats) {
  const ok = samples.filter((s) => s.outcome === "ok");
  const ttfb = ok.map((s) => s.ttfbMs).sort((a, b) => a - b);
  const total = ok.map((s) => s.totalMs).sort((a, b) => a - b);

  console.log("");
  console.log(c.bold(label));
  console.log(`  samples       ${samples.length}  (${ok.length} ok, ${samples.length - ok.length} error)`);
  if (ok.length) {
    console.log(`  TTFB          p50 ${fmtMs(percentile(ttfb, 0.5))}   p95 ${fmtMs(percentile(ttfb, 0.95))}   p99 ${fmtMs(percentile(ttfb, 0.99))}   max ${fmtMs(ttfb[ttfb.length - 1])}`);
    console.log(`  total time    p50 ${fmtMs(percentile(total, 0.5))}   p95 ${fmtMs(percentile(total, 0.95))}   p99 ${fmtMs(percentile(total, 0.99))}   max ${fmtMs(total[total.length - 1])}`);
  }

  const buckets = new Map<string, number>();
  for (const s of samples) buckets.set(s.cacheClass, (buckets.get(s.cacheClass) ?? 0) + 1);
  console.log(`  cache-status  ${[...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v} (${fmtPct(v, samples.length)})`)
    .join("   ")}`);

  const slowest = [...ok].sort((a, b) => b.totalMs - a.totalMs).slice(0, 5);
  if (slowest.length) {
    console.log(`  slowest:`);
    for (const s of slowest) {
      console.log(`    ${c.yellow(fmtMs(s.totalMs).padStart(7))}  ${c.dim(s.cacheClass.padEnd(8))} ${s.slug}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.has("help")) {
    console.log(`Usage: bun scripts/audit-perf.ts [options]

Options:
  --base-url <url>     Default https://houdinimd.jchd.me
  --samples <N>        Number of random pages to probe (default 50)
  --concurrency <N>    Parallel requests (default 5)
  --md                 Test /docs/*.md endpoint instead of HTML
  --warm               After cold pass, re-hit same URLs to measure warm-cache speed
  --seed <N>           Seed the PRNG for reproducible samples
  --out <file>         Write detailed per-request JSON to <file>
  --misses-out <file>  Write slugs whose cacheClass is miss/bypass — feed to regenerate.ts --cache-misses
`);
    return;
  }

  const baseUrl = getString(args, "base-url", "https://houdinimd.jchd.me").replace(/\/$/, "");
  const samples = getNumber(args, "samples", 50);
  const concurrency = getNumber(args, "concurrency", 5);
  const asMd = args.flags.has("md");
  const warm = args.flags.has("warm");
  const seed = args.values.has("seed") ? getNumber(args, "seed", 0) : Date.now();
  const outPath = args.values.get("out");
  const missesOutPath = args.values.get("misses-out");

  console.log(c.bold("HoudiniMD perf audit"));
  console.log(`  target      ${baseUrl}${asMd ? c.dim("  (.md endpoint)") : ""}`);
  console.log(`  samples     ${samples}  concurrency ${concurrency}  seed ${seed}`);
  console.log("");

  console.log(c.dim(`Fetching slug list from ${baseUrl}/sitemap.xml ...`));
  const allSlugs = await fetchSlugList(baseUrl);
  console.log(c.dim(`  ${allSlugs.length} slugs available`));

  const picked = shuffleSeeded(allSlugs, seed).slice(0, samples);

  // Cold pass
  const cold = await runPass(picked, baseUrl, asMd, concurrency, "cold");
  summarisePass({ label: "Cold pass (random sample, expected first-touch)", samples: cold });

  let warmSamples: Probe[] = [];
  if (warm) {
    // Small pause so server-side regeneration (triggered by miss) can complete.
    await new Promise((r) => setTimeout(r, 2000));
    warmSamples = await runPass(picked, baseUrl, asMd, concurrency, "warm");
    summarisePass({ label: "Warm pass (same URLs, expected cache-hit)", samples: warmSamples });

    // Delta diagnostics
    const coldOk = new Map(cold.filter((p) => p.outcome === "ok").map((p) => [p.slug, p]));
    const warmOk = warmSamples.filter((p) => p.outcome === "ok" && coldOk.has(p.slug));
    if (warmOk.length) {
      const deltas = warmOk.map((w) => (coldOk.get(w.slug)!.totalMs) - w.totalMs).sort((a, b) => a - b);
      console.log("");
      console.log(c.bold("Cold→warm delta"));
      console.log(`  p50  ${fmtMs(percentile(deltas, 0.5))}   p95 ${fmtMs(percentile(deltas, 0.95))}   max ${fmtMs(deltas[deltas.length - 1])}`);
      console.log(c.dim(`  (positive = warm faster than cold; near-zero = no edge cache benefit)`));
    }
  }

  if (outPath) {
    await writeFile(outPath, JSON.stringify({ baseUrl, samples, seed, asMd, cold, warm: warmSamples }, null, 2));
    console.log(`\n${c.dim(`wrote ${outPath}`)}`);
  }

  if (missesOutPath) {
    const misses = cold.filter((p) => p.cacheClass === "miss" || p.cacheClass === "bypass").map((p) => p.slug);
    await writeFile(missesOutPath, misses.join("\n") + "\n");
    console.log(`${c.dim(`wrote ${missesOutPath}  (${misses.length} miss/bypass slugs — pipe to regenerate.ts --cache-misses)`)}`);
  }
}

async function runPass(
  slugs: string[],
  baseUrl: string,
  asMd: boolean,
  concurrency: number,
  label: string,
): Promise<Probe[]> {
  let done = 0;
  const total = slugs.length;
  return pool(slugs, concurrency, async (slug) => {
    const p = await probe(slug, baseUrl, asMd);
    done++;
    if (process.stdout.isTTY) {
      process.stdout.write(`\r${c.dim(label)} ${done}/${total} ${c.dim(slug.slice(0, 50))}${" ".repeat(20)}`);
      if (done === total) process.stdout.write("\n");
    }
    return p;
  });
}

main().catch((err) => {
  console.error(c.red("fatal:"), err instanceof Error ? err.message : err);
  process.exit(1);
});
