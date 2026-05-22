import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,
    },
  },
  images: {
    minimumCacheTTL: 31536000,
  },
  // Aggressive CDN caching for doc pages — this is a wiki, content is near-immutable.
  // Overrides Netlify's default `no-store` for dynamic SSR responses, so the edge
  // can actually cache them. The browser still revalidates (max-age=0) — ETag/304
  // keeps that fast. After `regen` runs, every URL in R2 serves from edge.
  //
  // Caveat: a newly-requested slug that's not yet in R2 renders the loading skeleton
  // and that response will be edge-cached for up to s-maxage. To minimise the window,
  // s-maxage is kept at 1 day with a long SWR window — by the time it expires, R2
  // will have content from the SSE generator, and the next revalidate gets real content.
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
        // Sitemap + RSS-like feeds — moderate caching, refreshed by the
        // revalidate=3600 setting inside app/sitemap.ts
        source: "/sitemap.xml",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
