import type { NextConfig } from "next";

if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}

const nextConfig: NextConfig = {
  // Pin a stable build id. By default Next.js generates a random id per build,
  // and the OpenNext R2 incremental cache namespaces every cache key by it
  // (`incremental-cache/<buildId>/<hash>.cache`). A fresh id each deploy means
  // every entry lands at a brand-new key, orphaning the entire previous build's
  // cache in R2 — storage grew ~1× per deploy and was on track to blow the 10GB
  // free tier in a few deploys. A constant id keeps keys stable, so deploys
  // overwrite in place instead of accumulating orphans. Tradeoff: during a
  // rollout the old and new worker share keys, so a content/serialization change
  // could briefly be read by the other version — acceptable for a static wiki.
  generateBuildId: () => "houdinimd",
  // Prerendering all ~10.5k doc pages fetches each one's markdown from R2 over
  // the network. The default 60s per-page export timeout is occasionally
  // exceeded when a single R2 fetch stalls, which aborts the entire build.
  // Give slow fetches more headroom so the built-in 3-attempt retry can recover.
  staticPageGenerationTimeout: 180,
  experimental: {
    staleTimes: {
      dynamic: 30,
    },
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
            value:
              "public, max-age=0, must-revalidate, s-maxage=86400, stale-while-revalidate=2592000",
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
