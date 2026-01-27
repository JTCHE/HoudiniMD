import { parse } from 'node-html-parser';
import TurndownService from 'turndown';
import type { ScrapedContent } from '../scraper';
import type { ConversionOptions } from './types';
import { addCustomRules } from './turndown-rules';
import { extractSeeAlso } from './extractors';
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

  // Initialize Turndown with custom settings
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });

  // Add custom rules
  addCustomRules(turndown, codeLanguage, scraped.sourceUrl);

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

  // Extract and add "See Also" section
  const seeAlsoMarkdown = extractSeeAlso(root, scraped.sourceUrl);
  if (seeAlsoMarkdown) {
    parts.push('');
    parts.push(seeAlsoMarkdown);
  }

  return parts.join('\n');
}
