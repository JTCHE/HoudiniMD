import { parse } from 'node-html-parser';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { ScrapedContent } from '../scraping';
import type { ConversionOptions } from './types';
import { addCustomRules } from './turndown-rules';
import { extractSeeAlso, extractTaggedLinks } from './extractors';
import { cleanMarkdown } from './utils';

/**
 * Convert scraped HTML content to llms.txt-compliant markdown
 */
export function convertToMarkdown(
  scraped: ScrapedContent,
  options: ConversionOptions = {}
): string {
  const root = parse(scraped.mainHtml);
  const codeLanguage = options.codeLanguage || 'vex';

  // Remove unwanted elements
  root.querySelectorAll('.headerlink, .pathsep, #premeta, .fa').forEach((el) => {
    el.remove();
  });

  // Remove "Load" / "Launch" example buttons and "Show/hide arguments" toggles
  root.querySelectorAll('a, button, span').forEach((el) => {
    const text = el.textContent?.trim();
    if (text === 'Load' || text === 'Launch' || text === 'Show/hide arguments') el.remove();
  });

  // Remove standalone icon <img> that immediately precedes a <link> containing the same icon
  root.querySelectorAll('a').forEach((link) => {
    const firstImg = link.querySelector('img');
    if (!firstImg) return;
    const linkSrc = firstImg.getAttribute('src');
    const prev = link.previousElementSibling;
    if (prev && prev.rawTagName?.toUpperCase() === 'IMG' && prev.getAttribute('src') === linkSrc) {
      prev.remove();
    }
  });

  // Initialize Turndown with custom settings
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });

  // Add GFM plugin for tables support
  turndown.use(gfm);

  // Add custom rules
  addCustomRules(turndown, codeLanguage, scraped.sourceUrl);

  // Extract "See Also" and tagged links sections BEFORE removing #postmeta
  const seeAlsoMarkdown = extractSeeAlso(root, scraped.sourceUrl);
  const taggedLinksMarkdown = extractTaggedLinks(root, scraped.sourceUrl);

  // Get content div
  const contentDiv = root.querySelector('#content');
  let bodyMarkdown = '';

  if (contentDiv) {
    const postmeta = contentDiv.querySelector('#postmeta');
    if (postmeta) {
      postmeta.remove();
    }
    bodyMarkdown = turndown.turndown(contentDiv.innerHTML);
  } else {
    bodyMarkdown = turndown.turndown(scraped.mainHtml);
  }

  bodyMarkdown = cleanMarkdown(bodyMarkdown);

  // Build the final markdown document
  const parts: string[] = [];

  // YAML front matter
  parts.push('---');
  parts.push(`breadcrumbs: ${scraped.breadcrumbs.join(' > ')}`);
  parts.push(`source: ${scraped.sourceUrl}`);
  parts.push(`generated_at: ${new Date().toISOString()}`);
  parts.push('---');
  parts.push('');

  // Title
  parts.push(`# ${scraped.title}`);
  parts.push('');

  // Summary as blockquote
  if (scraped.summary) {
    parts.push(`> ${scraped.summary}`);
    parts.push('');
  }

  // Main content
  parts.push(bodyMarkdown);

  // Add "See Also" section (already extracted above)
  if (seeAlsoMarkdown) {
    parts.push('');
    parts.push(seeAlsoMarkdown);
  }

  // Add tagged links sections (e.g., "Array", "String")
  if (taggedLinksMarkdown) {
    parts.push('');
    parts.push(taggedLinksMarkdown);
  }

  return parts.join('\n');
}
