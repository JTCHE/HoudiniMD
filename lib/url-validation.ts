/**
 * Client-side URL validation utilities
 */

/**
 * Check if input is a valid SideFX or VexLLM documentation URL
 */
export function isValidDocUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;

  return (
    /^https?:\/\/(www\.)?sidefx\.com\/docs\//i.test(trimmed) ||
    /^https?:\/\/(www\.)?vexllm\.dev\/docs\//i.test(trimmed)
  );
}

/**
 * Extract the slug path from a VexLLM or SideFX URL
 * @example "https://vexllm.dev/docs/houdini/vex/functions/foreach" -> "houdini/vex/functions/foreach"
 * @example "https://sidefx.com/docs/houdini/vex/functions/foreach.html" -> "houdini/vex/functions/foreach"
 */
export function extractSlugFromUrl(input: string): string | null {
  // Handle VexLLM URLs
  const vexllmMatch = input.match(/vexllm\.dev\/docs\/(.+?)(?:\.html)?(?:\.md)?$/i);
  if (vexllmMatch) {
    return vexllmMatch[1].replace(/\.html$/, '').replace(/\.md$/, '');
  }

  // Handle SideFX URLs
  const sidefxMatch = input.match(/sidefx\.com\/docs\/(.+?)(?:\.html)?$/i);
  if (sidefxMatch) {
    return sidefxMatch[1].replace(/\.html$/, '');
  }

  return null;
}
