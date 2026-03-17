import { normalizeInput } from './normalizer';

/**
 * Client-side URL validation utilities
 */

/**
 * Check if input is a valid SideFX or HoudiniMD documentation URL.
 * Accepts full URLs as well as shorthand forms like:
 *   "sidefx.com/docs/houdini/nodes/sop/carve"
 *   "/nodes/sop/carve"
 */
export function isValidDocUrl(input: string): boolean {
  const normalized = normalizeInput(input);
  if (!normalized) return false;

  return (
    /^https?:\/\/(www\.)?sidefx\.com\/docs\//i.test(normalized) ||
    /^https?:\/\/(www\.)?houdinimd\.jchd\.me\/docs\//i.test(normalized) ||
    /^https?:\/\/(www\.)?houdinimd\.netlify\.app\/docs\//i.test(normalized) ||
    /^https?:\/\/(www\.)?vexllm\.jchd\.me\/docs\//i.test(normalized) ||
    /^https?:\/\/(www\.)?vexllm\.netlify\.app\/docs\//i.test(normalized)
  );
}

/**
 * Extract the slug path from a HoudiniMD or SideFX URL
 * @example "https://houdinimd.netlify.app/docs/houdini/vex/functions/foreach" -> "houdini/vex/functions/foreach"
 * @example "https://sidefx.com/docs/houdini/vex/functions/foreach.html" -> "houdini/vex/functions/foreach"
 * @example "https://sidefx.com/docs/houdini/network/shortcuts.html#notes" -> "houdini/network/shortcuts"
 */
export function extractSlugFromUrl(input: string): string | null {
  // Normalize shorthand forms (bare domain, bare path) into full URLs first
  const normalized = normalizeInput(input);

  // Strip URL fragment (hash) before processing - fragments are page anchors, not part of the path
  const urlWithoutFragment = normalized.split("#")[0];

  // Handle HoudiniMD URLs (new domain, keep old vexllm for redirect compat)
  const houdinimdMatch = urlWithoutFragment.match(/(?:houdinimd|vexllm)\.(?:jchd\.me|netlify\.app)\/docs\/(.+?)(?:\.html)?(?:\.md)?$/i);
  if (houdinimdMatch) {
    return houdinimdMatch[1].replace(/\.html$/, "").replace(/\.md$/, "");
  }

  // Handle SideFX URLs
  const sidefxMatch = urlWithoutFragment.match(/sidefx\.com\/docs\/(.+?)(?:\.html)?$/i);
  if (sidefxMatch) {
    return sidefxMatch[1].replace(/\.html$/, "");
  }

  return null;
}
