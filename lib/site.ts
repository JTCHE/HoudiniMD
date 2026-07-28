// Single source of truth for the public origin.
//
// Deliberately no fallback. A hardcoded default is what let the site keep
// serving `houdinimd.jchd.me` from twelve separate literals, and what let
// app/robots.ts ship `Sitemap: undefined/sitemap.xml` unnoticed for months.
// Failing loudly at import time is the whole point.
//
// Set it in two places, both of which are checked in or local:
//   * .env.local        — build, dev and the bun scripts
//   * wrangler.jsonc    — `vars.URL`, the Workers runtime

const raw = process.env.URL;

if (!raw) {
  throw new Error(
    "URL is not set. It must be the full public origin, e.g. URL=https://houdinimd.com — " +
      "set it in .env.local for local builds and in wrangler.jsonc `vars` for the Worker.",
  );
}

if (!/^https?:\/\//i.test(raw)) {
  throw new Error(`URL must include the scheme: got "${raw}", expected "https://${raw}".`);
}

// Public origin, no trailing slash. e.g. "https://houdinimd.com"
export const SITE_URL = raw.replace(/\/+$/, "");

// Bare host, for display. e.g. "houdinimd.com"
export const SITE_HOST = new URL(SITE_URL).host;
