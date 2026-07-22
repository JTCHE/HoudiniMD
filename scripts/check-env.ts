#!/usr/bin/env bun
// Fails the build loudly if required env vars are missing, instead of letting
// lib/r2/config.ts silently return null and prerender pages with fallback/empty
// content (what happened when the Cloudflare Build pipeline's secrets were
// incomplete — the deploy "succeeded" with a broken sitemap).

const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
  "R2_CACHE_ACCESS_KEY_ID",
  "R2_CACHE_SECRET_ACCESS_KEY",
];

const missing = REQUIRED.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing required env var(s): ${missing.join(", ")}`);
  process.exit(1);
}
