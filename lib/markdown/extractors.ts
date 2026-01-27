import type { HTMLElement } from 'node-html-parser';
import { convertToVexLLMUrl } from '../url-normalizer';

/**
 * Extract "See Also" links from postmeta table
 */
export function extractSeeAlso(root: HTMLElement, sourceUrl: string): string | null {
  const seeAlsoLinks = root.querySelectorAll('#postmeta .relateds a');

  if (seeAlsoLinks.length === 0) {
    return null;
  }

  const lines = ['## See Also', ''];

  seeAlsoLinks.forEach((link) => {
    const href = link.getAttribute('href') || '';
    const text = link.textContent?.trim() || '';
    if (text && href) {
      const vexLLMUrl = convertToVexLLMUrl(href, sourceUrl);
      lines.push(`- [${text}](${vexLLMUrl})`);
    }
  });

  return lines.join('\n');
}
