import type { ScrapedContent } from '../scraping';
import type { ConversionOptions } from './types';
import type { HTMLElement } from 'node-html-parser';
import { addCustomRules } from './turndown-rules';
import { extractSeeAlso, extractTaggedLinks } from './extractors';
import { cleanMarkdown } from './utils';
import { prepareDoxygenRoot } from './doxygen';
import { prepareSphinxRoot } from './sphinx';

function normalizeIndentedItemGroups(root: HTMLElement): void {
  root.querySelectorAll('div.item_group').forEach((group) => {
    const items = group.children.filter((child) =>
      child.classList.contains('item') && !child.classList.contains('pref')
    );
    if (items.length === 0 || items.length !== group.children.length) return;

    const listItems = items.map((item) => {
      const label = item.children.find((child) => child.classList.contains('label'));
      const content = item.children.find((child) => child.classList.contains('content'));
      if (!label) return '';
      return `<li><strong>${label.innerHTML}</strong>${content?.innerHTML || ''}</li>`;
    }).filter(Boolean);
    if (listItems.length !== items.length) return;

    group.replaceWith(`<ul>${listItems.join('')}</ul>`);
  });
}

function normalizeHeadingHierarchy(root: HTMLElement): void {
  const directHeading = (element: HTMLElement) =>
    element.children.find((child) => /^H[1-6]$/.test(child.tagName));

  const parentSectionHeadingLevel = (element: HTMLElement) => {
    let ancestor = element.parentNode as HTMLElement | null;
    while (ancestor) {
      const heading = directHeading(ancestor);
      if (ancestor.tagName === 'SECTION' && heading) {
        return Math.min(Number(heading.tagName[1]) + 1, 6);
      }
      ancestor = ancestor.parentNode as HTMLElement | null;
    }
    return null;
  };

  const labelHeadingLevel = (element: HTMLElement) => {
    // SideFX puts named groups after their section as siblings, not children.
    const siblings = element.parentNode?.children || [];
    for (let index = siblings.indexOf(element) - 1; index >= 0; index--) {
      if (siblings[index].tagName !== 'SECTION') continue;
      const heading = directHeading(siblings[index]);
      if (heading) return Math.min(Number(heading.tagName[1]) + 1, 6);
    }
    return parentSectionHeadingLevel(element) ?? 2;
  };

  root.querySelectorAll('section').forEach((section) => {
    const heading = directHeading(section);
    if (!heading) return;

    const level = parentSectionHeadingLevel(section);
    if (level === null) return;
    if (heading.tagName === `H${level}`) return;
    const attributes = heading.rawAttrs ? ` ${heading.rawAttrs}` : '';
    heading.replaceWith(`<h${level}${attributes}>${heading.innerHTML}</h${level}>`);
  });

  root.querySelectorAll('div.sep.titled').forEach((section) => {
    const label = section.children.find((child) => child.classList.contains('label'));
    const text = label?.textContent.replace(/\s+/g, ' ').trim();
    if (!label || !text) return;

    const level = labelHeadingLevel(section);
    const id = section.getAttribute('id');
    const idAttribute = id ? ` id="${id.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` : '';
    if (id) section.removeAttribute('id');
    label.replaceWith(`<h${level}${idAttribute}>${label.innerHTML}</h${level}>`);
  });
}

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

  const root = parse(scraped.mainHtml.replace(/click the image to zoom\.\s*/gi, ''));
  const codeLanguage = options.codeLanguage || 'vex';

  // The SideFX documentation root uses its marketing-site template instead of
  // the article template used by the rest of /docs. Its section icons are
  // decorative, and its version cells are visual rows rather than prose
  // paragraphs. Normalize those source elements before the shared Turndown
  // rules run so the mirror stays faithful without leaking presentation assets
  // into headings or producing a sequence of loose links.
  if (new URL(scraped.sourceUrl).pathname === '/docs/') {
    root.querySelectorAll('h2 img').forEach((img) => img.remove());
    root.querySelectorAll('div.doc').forEach((group) => {
      const items = group.querySelectorAll(':scope > div.cell')
        .map((cell) => `<li>${cell.innerHTML}</li>`)
        .join('');
      group.replaceWith(`<ul>${items}</ul>`);
    });
    root.querySelectorAll('a.btn[href*="?download"]').forEach((link) => {
      link.classList.add('download');
    });
  }

  if (scraped.renderer === 'doxygen') {
    prepareDoxygenRoot(root, scraped.summary);
  }
  if (scraped.renderer === 'sphinx') {
    prepareSphinxRoot(root, scraped.summary);
  }

  normalizeIndentedItemGroups(root);
  normalizeHeadingHierarchy(root);

  // SideFX "beta feature" notices: an icon div (beta.svg) beside a text div,
  // both children of a wrapper div. Recast as a standard notice box so the
  // noticeBox rule turns it into a "> [!NOTE]" callout and the svg is dropped.
  root.querySelectorAll('img[src*="beta.svg"]').forEach((img) => {
    const wrapper = img.parentNode?.parentNode;
    if (!wrapper || wrapper.tagName !== 'DIV') return;
    const textDiv = wrapper.children.find((child) => !child.querySelector('img[src*="beta.svg"]'));
    if (!textDiv) return;
    wrapper.replaceWith(
      `<div class="notice ind-item caution" data-callout-title="Beta"><div class="content">${textDiv.innerHTML}</div></div>`
    );
  });

  // Remove unwanted elements
  root.querySelectorAll('.headerlink, .pathsep, #premeta, .fa').forEach((el) => {
    el.remove();
  });

  // Turndown skips custom rules for empty elements. Give video-only figures
  // fallback text so the video rule can replace the complete figure.
  root.querySelectorAll('video[src]').forEach((video) => video.set_content('Video'));

  // Remove "Load" / "Launch" example buttons and "Show/hide arguments" toggles
  root.querySelectorAll('a, button, span').forEach((el) => {
    const text = el.textContent?.trim();
    if (text === 'Load' || text === 'Launch' || text === 'Show/hide arguments') el.remove();
  });
  root.querySelectorAll('.collapsible.method .collapsed-content').forEach((el) => el.remove());

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
    bodyMarkdown = turndown.turndown(root.innerHTML);
  }

  bodyMarkdown = cleanMarkdown(bodyMarkdown);
  if (new URL(scraped.sourceUrl).pathname === '/docs/') {
    bodyMarkdown = bodyMarkdown.replace(/^- {3}/gm, '- ');
  }

  // Build the final markdown document
  const parts: string[] = [];

  // YAML front matter
  parts.push('---');
  parts.push(`breadcrumbs: ${scraped.breadcrumbs.join(' > ')}`);
  parts.push(`title: ${scraped.title}`);
  if (scraped.nodeType) parts.push(`nodeType: ${scraped.nodeType}`);
  parts.push(`source: ${scraped.sourceUrl}`);
  if (new URL(scraped.sourceUrl).pathname === '/docs/') parts.push('source_template: sidefx-docs-root-v1');
  if (scraped.since) parts.push(`since: ${scraped.since}`);
  if (scraped.icon) parts.push(`icon: ${scraped.icon}`);
  if (scraped.banner) parts.push(`banner: ${scraped.banner}`);
  if (scraped.deprecation) parts.push('deprecated: true');
  parts.push(`generated_at: ${new Date().toISOString()}`);
  parts.push('---');
  parts.push('');

  // Title — keep the full name + type text visible in the rendered body,
  // matching what the source page's H1 shows (frontmatter still carries
  // title/nodeType split for the breadcrumb and title-metadata use cases).
  const h1Text = scraped.nodeType ? `${scraped.title} ${scraped.nodeType}` : scraped.title;
  parts.push(`# ${h1Text}`);
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
