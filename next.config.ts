import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/@sparticuz/chromium/**/*"],
    "/docs/**/*": ["./node_modules/@sparticuz/chromium/**/*"],
  },
};

export default nextConfig;
