const SIDEFX_DOCS_BASE = "https://www.sidefx.com/docs";
const HOUDINIMD_BASE = "";

/**
 * Coerce a variety of SideFX-style inputs into a full absolute URL.
 *
 * Handles:
 *   "sidefx.com/docs/houdini/nodes/sop/carve"        -> full https URL
 *   "www.sidefx.com/docs/houdini/nodes/sop/carve"    -> full https URL
 *   "/nodes/sop/carve"                                -> full https URL (prefixed with houdini path)
 *   "/houdini/nodes/sop/carve"                        -> full https URL
 *   already-absolute URLs                             -> returned as-is
 */
export function normalizeInput(input: string): string {
  const trimmed = input.trim();

  // Already a full URL — pass through
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Bare domain without protocol: "sidefx.com/docs/..." or "www.sidefx.com/docs/..."
  const domainMatch = trimmed.match(/^(?:www\.)?sidefx\.com\/docs\/(.+)/i);
  if (domainMatch) {
    return `${SIDEFX_DOCS_BASE}/${domainMatch[1]}`;
  }

  // Absolute path starting with /docs/...
  if (trimmed.startsWith("/docs/")) {
    return `${SIDEFX_DOCS_BASE}/${trimmed.slice(6)}`;
  }

  // Bare path like /nodes/sop/carve — assume it lives under houdini/
  if (trimmed.startsWith("/")) {
    return `${SIDEFX_DOCS_BASE}/houdini${trimmed}`;
  }

  return trimmed;
}

/**
 * Normalize URL paths by stripping extensions and trailing slashes
 */
export function normalizePath(pathname: string): string {
  let normalized = pathname;

  // Strip .html.md extension (llms.txt standard)
  if (normalized.endsWith(".html.md")) {
    normalized = normalized.slice(0, -8);
  }
  // Strip .html extension
  else if (normalized.endsWith(".html")) {
    normalized = normalized.slice(0, -5);
  }
  // Strip .md extension
  else if (normalized.endsWith(".md")) {
    normalized = normalized.slice(0, -3);
  }

  // Remove trailing slash (but not for root)
  if (normalized.endsWith("/") && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Convert a relative SideFX URL to an absolute HoudiniMD URL.
 *
 * Relative links are resolved with the standard `URL` algorithm against
 * `sourceUrl`, which honours trailing slashes. This matters for SideFX section
 * index pages (e.g. `.../houdini/news/`): their children are authored as
 * `21/index.html` and only resolve to `houdini/news/21/index` when the source is
 * treated as a directory. The scraper supplies a trailing-slash `sourceUrl` for
 * such pages (see scrapeSideFXPage).
 */
export function convertToHoudiniMDUrl(relativeUrl: string, sourceUrl: string): string {
  // Anchor-only links stay as-is (in-page navigation).
  if (relativeUrl.startsWith("#")) {
    return relativeUrl;
  }

  // Resolve to an absolute URL (handles ../, ./, bare paths, and absolute URLs).
  let absolute: URL;
  try {
    absolute = new URL(relativeUrl, sourceUrl);
  } catch {
    return relativeUrl;
  }

  // Only rewrite SideFX docs links; anything else stays an external absolute URL.
  const host = absolute.hostname.replace(/^www\./, "");
  const docsMatch = absolute.pathname.match(/^\/docs\/(.+)$/);
  if (host !== "sidefx.com" || !docsMatch) {
    return absolute.href;
  }

  const path = docsMatch[1].replace(/\.html$/i, "").replace(/\/$/, "");
  return `${HOUDINIMD_BASE}/docs/${path}${absolute.hash}`;
}

/**
 * Convert a houdinimd path to a canonical SideFX display URL (no trailing slash).
 * slug is the full path after /docs/, e.g., "houdini/vex/functions/foreach"
 * Any URL fragments (hash) are stripped since they're page anchors, not part of the path.
 */
export function toSideFXUrl(slug: string): string {
  const cleanSlug = slug.split("#")[0];
  return `https://www.sidefx.com/docs/${cleanSlug}`;
}
