import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}

const nextConfig: NextConfig = {
  // Next 16 blocks /_next/* dev requests from any host but localhost, so
  // opening the dev server from a phone on the LAN serves HTML whose scripts
  // never load: the page paints but never hydrates. Dev-only setting.
  allowedDevOrigins: ["192.168.1.*", "100.105.167.6", "*.trycloudflare.com"],
  // Pin a stable build id. By default Next.js generates a random id per build,
  // and the OpenNext R2 incremental cache namespaces every cache key by it
  // (`incremental-cache/<buildId>/<hash>.cache`). A fresh id each deploy means
  // every entry lands at a brand-new key, orphaning the entire previous build's
  // cache in R2 — storage grew ~1× per deploy and was on track to blow the 10GB
  // free tier in a few deploys. A constant id keeps keys stable, so deploys
  // overwrite in place instead of accumulating orphans. Tradeoff: during a
  // rollout the old and new worker share keys, so a content/serialization change
  // could briefly be read by the other version — acceptable for a static wiki.
  // The value lives in lib/build-id.json: lib/stored-answer.ts builds the same
  // key to read those entries from the Worker. Read from disk, not imported:
  // Next compiles this file and evaluates it outside the repo, so every
  // relative import fails to resolve.
  generateBuildId: () =>
    JSON.parse(readFileSync(join(process.cwd(), "lib/build-id.json"), "utf8"))
      .buildId,
  // Prerendering all ~10.5k doc pages fetches each one's markdown from R2 over
  // the network. The default 60s per-page export timeout is occasionally
  // exceeded when a single R2 fetch stalls, which aborts the entire build.
  // Give slow fetches more headroom so the built-in 3-attempt retry can recover.
  staticPageGenerationTimeout: 180,
  experimental: {
    staleTimes: {
      dynamic: 30,
    },
    // Bundle the small segments of one prefetch into a single answer.
    //
    // A doc page prefetch asked for five segments separately: the tree at 322
    // gzip bytes, `/docs` at 269, the head at 1008, the index at 1538 and the
    // slug at 1703. Every one of them is a Worker request that reads the whole
    // stored entry to return a few hundred bytes, and a click that lands before
    // the last one arrives still has to fetch the page.
    //
    // Together they are 4840 bytes, inside the 10240 default bundle size, so
    // they become one request. Next 16.3 turns this on by default; 16.2 has the
    // flag and leaves it off.
    prefetchInlining: true,
    turbopackImportTypeText: true,
  },
  images: {
    minimumCacheTTL: 31536000,
  },
  async headers() {
    return [
      {
        source: "/docs/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: process.env.NODE_ENV === "development"
              ? "no-store"
              : "public, max-age=0, must-revalidate, s-maxage=86400, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/sitemap.xml",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
