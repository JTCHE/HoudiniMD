import { normalizeDocSlug, normalizeInput, normalizePath } from './normalizer';

/**
 * Client-side URL validation utilities
 */

/**
 * Check if input is a valid SideFX or HoudiniMD documentation URL.
 * Accepts full URLs as well as shorthand forms like:
 *   "sidefx.com/docs/houdini/nodes/sop/carve"
 *   "/nodes/sop/carve"
 */
// Hosts we recognise as our own. houdinimd.com is canonical; the jchd.me
// subdomain and the Netlify host stay listed so pasted links from before the
// move still resolve.
const HOUDINIMD_HOSTS = /houdinimd\.(?:com|jchd\.me|netlify\.app)/.source;

export function isValidDocUrl(input: string): boolean {
  const normalized = normalizeInput(input);
  if (!normalized) return false;

  return (
    /^https?:\/\/(www\.)?sidefx\.com\/docs\//i.test(normalized) ||
    new RegExp(`^https?://(www\\.)?${HOUDINIMD_HOSTS}/docs/`, "i").test(normalized)
  );
}

/**
 * Extract the slug path from a HoudiniMD or SideFX URL
 * @example "https://houdinimd.com/docs/houdini/vex/functions/foreach" -> "houdini/vex/functions/foreach"
 * @example "https://sidefx.com/docs/houdini/vex/functions/foreach.html" -> "houdini/vex/functions/foreach"
 * @example "https://sidefx.com/docs/houdini/network/shortcuts.html#notes" -> "houdini/network/shortcuts"
 */
export function extractSlugFromUrl(input: string): string | null {
  // Normalize shorthand forms (bare domain, bare path) into full URLs first
  const normalized = normalizeInput(input);

  // Strip URL fragment (hash) before processing - fragments are page anchors, not part of the path
  const urlWithoutFragment = normalized.split("#")[0];

  // Handle HoudiniMD URLs, canonical host and the pre-move ones alike
  const houdinimdMatch = urlWithoutFragment.match(
    new RegExp(`${HOUDINIMD_HOSTS}/docs/(.+?)(?:\\.html)?(?:\\.md)?$`, "i"),
  );
  if (houdinimdMatch) {
    return normalizeDocSlug(normalizePath(houdinimdMatch[1]));
  }

  // Handle SideFX URLs
  const sidefxMatch = urlWithoutFragment.match(/sidefx\.com\/docs\/(.+?)(?:\.html)?$/i);
  if (sidefxMatch) {
    return normalizeDocSlug(normalizePath(sidefxMatch[1]));
  }

  return null;
}
