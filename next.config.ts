import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Restore the pre-v15 behavior: cache the partially-prefetched loading skeleton
    // for 30s (changed from 30s → 0s in v15). Safety net for links not covered by
    // prefetch={true} (e.g. programmatic router.push, links not yet in viewport).
    staleTimes: {
      dynamic: 30,
    },
  },
  images: {
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
