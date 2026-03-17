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
 * Convert a relative SideFX URL to an absolute HoudiniMD URL
 */
export function convertToHoudiniMDUrl(relativeUrl: string, sourceUrl: string): string {
  // Handle already absolute URLs
  if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
    // If it's a sidefx.com URL, convert it
    if (relativeUrl.includes("sidefx.com/docs/")) {
      const match = relativeUrl.match(/sidefx\.com\/docs\/(.+?)(?:\.html)?$/);
      if (match) {
        return `${HOUDINIMD_BASE}/docs/${match[1].replace(".html", "")}`;
      }
    }
    return relativeUrl;
  }

  // Handle anchor-only links
  if (relativeUrl.startsWith("#")) {
    return relativeUrl;
  }

  // Parse the source URL to get the base path
  const sourceMatch = sourceUrl.match(/sidefx\.com\/docs\/(.+?)(?:\.html)?$/);
  if (!sourceMatch) {
    return relativeUrl;
  }

  const sourcePath = sourceMatch[1];
  const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf("/"));

  // Resolve relative path
  let targetPath = relativeUrl;

  // Remove .html extension
  targetPath = targetPath.replace(".html", "");

  // Handle ../ navigation
  const parts = sourceDir.split("/");
  while (targetPath.startsWith("../")) {
    parts.pop();
    targetPath = targetPath.slice(3);
  }

  // Handle ./ (current directory)
  if (targetPath.startsWith("./")) {
    targetPath = targetPath.slice(2);
  }

  // Combine path
  const finalPath = parts.length > 0 ? `${parts.join("/")}/${targetPath}` : targetPath;

  return `${HOUDINIMD_BASE}/docs/${finalPath}`;
}

/**
 * Convert a VexLLM path to a SideFX source URL
 * slug is the full path after /docs/, e.g., "houdini/vex/functions/foreach"
 * Any URL fragments (hash) are stripped since they're page anchors, not part of the path
 */
export function toSideFXUrl(slug: string): string {
  // Strip any hash fragment that might have slipped through
  const cleanSlug = slug.split("#")[0];
  return `https://www.sidefx.com/docs/${cleanSlug}.html`;
}
