import type { HTMLElement } from 'node-html-parser';
import { convertToHoudiniMDUrl } from '../url';

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
      const houdinimdUrl = convertToHoudiniMDUrl(href, sourceUrl);
      lines.push(`- [${text}](${houdinimdUrl})`);
    }
  });

  return lines.join('\n');
}

/**
 * Extract tagged links section from postmeta table (e.g., "array", "string" tags)
 */
export function extractTaggedLinks(root: HTMLElement, sourceUrl: string): string | null {
  const postmeta = root.querySelector('#postmeta');
  if (!postmeta) return null;

  // Find all rows in the postmeta table
  const rows = postmeta.querySelectorAll('tr');
  const sections: string[] = [];

  rows.forEach((row) => {
    const label = row.querySelector('td.label');
    const taggedList = row.querySelector('.tagged-list');

    // Skip if no tagged-list (this handles the "See also" row which has .relateds instead)
    if (!taggedList || !label) return;

    // Get tag name from label, removing any icon elements
    const labelText = label.textContent?.trim() || '';
    if (!labelText) return;

    // Extract links from tagged-list
    const links = taggedList.querySelectorAll('a');
    if (links.length === 0) return;

    const linkLines: string[] = [];
    links.forEach((link) => {
      const href = link.getAttribute('href') || '';
      const text = link.textContent?.trim() || '';
      if (text && href) {
        const houdinimdUrl = convertToHoudiniMDUrl(href, sourceUrl);
        linkLines.push(`- [${text}](${houdinimdUrl})`);
      }
    });

    if (linkLines.length > 0) {
      // Capitalize the tag name for the heading
      const heading = labelText.charAt(0).toUpperCase() + labelText.slice(1);
      sections.push(`## ${heading}\n\n${linkLines.join('\n')}`);
    }
  });

  return sections.length > 0 ? sections.join('\n\n') : null;
}
