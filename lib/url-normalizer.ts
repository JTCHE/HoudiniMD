/**
 * Normalize URL paths by stripping extensions and trailing slashes
 */
export function normalizePath(pathname: string): string {
  let normalized = pathname;

  // Strip .html.md extension (llms.txt standard)
  if (normalized.endsWith('.html.md')) {
    normalized = normalized.slice(0, -8);
  }
  // Strip .html extension
  else if (normalized.endsWith('.html')) {
    normalized = normalized.slice(0, -5);
  }
  // Strip .md extension
  else if (normalized.endsWith('.md')) {
    normalized = normalized.slice(0, -3);
  }

  // Remove trailing slash (but not for root)
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Convert a relative SideFX URL to an absolute VexLLM URL
 */
export function convertToVexLLMUrl(relativeUrl: string, sourceUrl: string): string {
  // Handle already absolute URLs
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    // If it's a sidefx.com URL, convert it
    if (relativeUrl.includes('sidefx.com/docs/')) {
      const match = relativeUrl.match(/sidefx\.com\/docs\/(.+?)(?:\.html)?$/);
      if (match) {
        return `https://vexllm.dev/docs/${match[1].replace('.html', '')}`;
      }
    }
    return relativeUrl;
  }

  // Handle anchor-only links
  if (relativeUrl.startsWith('#')) {
    return relativeUrl;
  }

  // Parse the source URL to get the base path
  const sourceMatch = sourceUrl.match(/sidefx\.com\/docs\/(.+?)(?:\.html)?$/);
  if (!sourceMatch) {
    return relativeUrl;
  }

  const sourcePath = sourceMatch[1];
  const sourceDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));

  // Resolve relative path
  let targetPath = relativeUrl;

  // Remove .html extension
  targetPath = targetPath.replace('.html', '');

  // Handle ../ navigation
  const parts = sourceDir.split('/');
  while (targetPath.startsWith('../')) {
    parts.pop();
    targetPath = targetPath.slice(3);
  }

  // Handle ./ (current directory)
  if (targetPath.startsWith('./')) {
    targetPath = targetPath.slice(2);
  }

  // Combine path
  const finalPath = parts.length > 0 ? `${parts.join('/')}/${targetPath}` : targetPath;

  return `https://vexllm.dev/docs/${finalPath}`;
}

/**
 * Convert a VexLLM path to a SideFX source URL
 * slug is the full path after /docs/, e.g., "houdini/vex/functions/foreach"
 */
export function toSideFXUrl(slug: string): string {
  return `https://www.sidefx.com/docs/${slug}.html`;
}
