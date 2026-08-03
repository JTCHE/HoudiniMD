#!/usr/bin/env bun
// Fails the build loudly if required env vars are missing, instead of letting
// lib/r2/config.ts silently return null and prerender pages with fallback/empty
// content (what happened when the Cloudflare Build pipeline's secrets were
// incomplete — the deploy "succeeded" with a broken sitemap).

// Deploys must come from Cloudflare CI. Tailwind's oxide/lightningcss binaries
// differ per OS, so a local build stamps its own content-hashed CSS URL into all
// ~11k prerendered pages: the local deploy re-uploads the whole cache, and the
// next CI deploy re-uploads it back. ~2.1 GB and ~10 minutes each way.
if (!process.env.CI) {
  console.error(
    "Local deploy blocked. Push to main — Cloudflare CI deploys. See AGENTS.md.",
  );
  process.exit(1);
}

const REQUIRED = [
  // Public origin. lib/site.ts also throws on it, but failing here keeps the
  // error ahead of a multi-minute build instead of part-way through one.
  "URL",
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
