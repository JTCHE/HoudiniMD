import type { ScrapedContent } from '../scraping';
import type { ConversionOptions } from './types';
import { addCustomRules } from './turndown-rules';
import { extractSeeAlso, extractTaggedLinks } from './extractors';
import { cleanMarkdown } from './utils';

/**
 * Convert scraped HTML content to llms.txt-compliant markdown.
 *
 * The heavy parsing libraries (node-html-parser, turndown) are loaded via
 * dynamic import() so they stay out of the Worker cold-start path — this
 * function only runs when generating a brand-new (uncached) page, which is
 * rare. Serving a cached page never touches this module.
 */
export async function convertToMarkdown(
  scraped: ScrapedContent,
  options: ConversionOptions = {}
): Promise<string> {
  const [{ parse }, { default: TurndownService }, { gfm }] = await Promise.all([
    import('node-html-parser'),
    import('turndown'),
    import('turndown-plugin-gfm'),
  ]);

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

  // For subtopic list items (.with-icon), merge the .g icon into the label link and
  // remove the .g div. Two HTML patterns on SideFX:
  //   nodes-style: <div class="g"><img/></div> + <a><img/>text</a>  → icon already in link, .g is duplicate
  //   lop-style:   <div class="g"><a><img/></a></div> + <a>text</a>  → icon separate from text, need to merge
  root.querySelectorAll('li.with-icon').forEach((li) => {
    const gDiv = li.querySelector('div.g');
    if (!gDiv) return;

    const gImg = gDiv.querySelector('img');
    if (!gImg) { gDiv.remove(); return; }

    const imgSrc = gImg.getAttribute('src') || '';
    const labelAnchor = li.querySelector('p.label a');

    if (labelAnchor && imgSrc) {
      const hasIcon = !!labelAnchor.querySelector('img');
      if (!hasIcon) {
        // lop-style: prepend the icon into the label anchor so it renders inline with text
        const existingHtml = (labelAnchor as unknown as { innerHTML: string }).innerHTML;
        (labelAnchor as unknown as { set_content: (c: string) => void }).set_content(
          `<img src="${imgSrc}" />` + existingHtml
        );
      }
    }

    gDiv.remove();
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
  if (scraped.since) parts.push(`since: ${scraped.since}`);
  if (scraped.icon) parts.push(`icon: ${scraped.icon}`);
  if (scraped.deprecation) parts.push('deprecated: true');
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

  // Deprecation callout — rendered as a coloured warning admonition.
  if (scraped.deprecation) {
    const { reason, version } = scraped.deprecation;
    const bits = ['This node is deprecated and is scheduled to be removed in a future version of Houdini.'];
    if (reason) bits.push(reason.endsWith('.') ? reason : `${reason}.`);
    if (version) bits.push(`(Deprecated since version ${version}.)`);
    parts.push('> [!WARNING]');
    parts.push(`> ${bits.join(' ')}`);
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
