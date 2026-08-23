// Type-only: TurndownService is used purely as a parameter type here (never
// instantiated), so this import is erased at compile time and the turndown
// library is not pulled into the Worker cold-start graph through this module.
import type TurndownService from 'turndown';
import { convertToHoudiniMDUrl } from '../url';
import type { CodeLanguage } from './types';
function absoluteMediaUrl(src: string, sourceUrl: string): string {
  try {
    return new URL(src, sourceUrl).href;
  } catch {
    return src;
  }
}

function htmlAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function markdownImageHtml(tag: string, sourceUrl: string): string {
  const src = htmlAttribute(tag, 'src');
  if (!src) return '';
  const title = htmlAttribute(tag, 'title') || htmlAttribute(tag, 'alt');
  return `![${title}](${absoluteMediaUrl(src, sourceUrl)})`;
}

/**
 * SideFX groups small comparison thumbnails as siblings inside one source
 * container (a shared `<p>`, or a `.row` of `.col_*` divs) instead of one
 * image per paragraph — that grouping is itself the "these are meant to sit
 * side by side" signal, so it is reused directly instead of guessing from
 * pixel dimensions. Rendered as raw HTML (like videoFigureMarkup) so the
 * `.image-group` flex row and each `img`/`figcaption` survive into the
 * rendered page via rehype-raw.
 */
function imageGroupMarkup(items: { src: string; alt: string; caption?: string }[], sourceUrl: string): string {
  const figures = items.map(({ src, alt, caption }) => {
    const absoluteSrc = absoluteMediaUrl(src, sourceUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const altAttr = alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const figcaptionHtml = caption
      ? `<figcaption>${caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</figcaption>`
      : '';
    return `<figure><img src="${absoluteSrc}" alt="${altAttr}" />${figcaptionHtml}</figure>`;
  }).join('');
  return `<div class="not-prose image-group">${figures}</div>`;
}

function videoFigureMarkup(src: string, type: string, caption: string, sourceUrl: string, title?: string): string {
  const absoluteSrc = absoluteMediaUrl(src, sourceUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const typeAttr = type ? ` type="${type.replace(/"/g, '&quot;')}"` : '';
  const titleAttr = title ? ` title="${title.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` : '';
  const captionHtml = caption
    ? `<figcaption class="mt-2 text-left text-sm text-muted-foreground">${caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</figcaption>`
    : '';

  return `<figure class="not-prose my-6"><video class="h-auto w-full rounded-lg" src="${absoluteSrc}"${typeAttr}${titleAttr} controls preload="metadata"></video>${captionHtml}</figure>`;
}

function preserveMedia(html: string, sourceUrl: string): { html: string; media: string[] } {
  const media: string[] = [];
  const stash = (value: string) => {
    const index = media.push(value) - 1;
    return ` MEDIA_PLACEHOLDER_${index} `;
  };
  const captionText = (value: string) => value
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  html = html.replace(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi, (figure) => {
    const video = figure.match(/<video\b[^>]*>/i)?.[0];
    const src = video ? htmlAttribute(video, 'src') : '';
    if (!src) return figure;
    const type = htmlAttribute(video || '', 'type');
    const caption = figure.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || '';
    return stash(videoFigureMarkup(src, type, captionText(caption), sourceUrl));
  });
  html = html.replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, (video) => {
    const src = htmlAttribute(video, 'src');
    return src ? stash(videoFigureMarkup(src, htmlAttribute(video, 'type'), '', sourceUrl)) : video;
  });
  html = html.replace(/<img\b[^>]*>/gi, (image) => {
    const markdown = markdownImageHtml(image, sourceUrl);
    return markdown ? stash(markdown) : '';
  });

  return { html, media };
}

function restoreMedia(markdown: string, media: string[]): string {
  return markdown.replace(/MEDIA_PLACEHOLDER_(\d+)/g, (_, index) => media[Number(index)] || '');
}

function inlineCodeMarkdown(value: string): string {
  const cleaned = value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
  const longestRun = Math.max(0, ...Array.from(cleaned.matchAll(/`+/g), (match) => match[0].length));
  const delimiter = '`'.repeat(longestRun + 1);
  const padding = cleaned.startsWith('`') || cleaned.endsWith('`') ? ' ' : '';
  return `${delimiter}${padding}${cleaned}${padding}${delimiter}`;
}

function videoFigureHtml(figure: Element, sourceUrl: string): string {
  const video = figure.querySelector('video[src]') as Element;
  const src = video.getAttribute('src') || '';
  const type = video.getAttribute('type') || '';
  const caption = figure.querySelector('figcaption')?.textContent.replace(/\s+/g, ' ').trim() || '';
  return src ? videoFigureMarkup(src, type, caption, sourceUrl) : '';
}

/**
 * Helper to get clean text content from a cell element
 * Preserves inline code as backtick notation, links as markdown, and .def items with separators
 */
function getCellText(cell: Element, sourceUrl: string): string {
  // Use innerHTML (available on node-html-parser elements) to preserve code spans
  let html = (cell as unknown as { innerHTML: string }).innerHTML ?? '';

  const videoFigures: string[] = [];
  for (const figure of Array.from(cell.querySelectorAll('figure'))) {
    if (!figure.querySelector('video[src]')) continue;
    videoFigures.push(videoFigureHtml(figure, sourceUrl));
    html = html.replace(figure.outerHTML, ` VIDEO${videoFigures.length - 1} `);
  }

  // A `.defs` group (a parameter's per-mode/per-option breakdown, e.g.
  // "Material Sync Mode"'s three modes) is several nested `.def` blocks —
  // each a bold name plus one or more description paragraphs. The generic
  // tag-stripping below flattens every paragraph and heading into one
  // run-on sentence with no visual separation, so build a real bullet list
  // instead: one `<li>` per mode, bold name, paragraphs joined by a blank
  // line. Stashed behind a placeholder (like the video figures above) so
  // none of the generic passes below — in particular the plain `<ul>/<ol>`
  // rule further down, which strips everything but `kbd` from `<li>`
  // content — can flatten it back out.
  const defLists: string[] = [];
  for (const defsGroup of Array.from(cell.querySelectorAll('.defs'))) {
    const items = Array.from(defsGroup.querySelectorAll('.def'))
      .filter((def) => def.parentElement === defsGroup)
      .map((def) => {
        const label = def.querySelector('p.label')?.textContent?.replace(/\s+/g, ' ').trim() || '';
        if (!label) return '';
        const contentEl = def.querySelector('.content') as Element | null;
        const paragraphs = contentEl
          ? Array.from(contentEl.querySelectorAll('p'))
              .map((p) => contentHtmlToMarkdown((p as unknown as { innerHTML: string }).innerHTML, sourceUrl).replace(/\s+/g, ' ').trim())
              .filter(Boolean)
          : [];
        const desc = paragraphs.join('<br><br>');
        return `<li><strong>${label}</strong>${desc ? `<br>${desc}` : ''}</li>`;
      })
      .filter(Boolean);
    if (items.length === 0) continue;
    const index = defLists.push(`<ul>${items.join('')}</ul>`) - 1;
    html = html.replace(defsGroup.outerHTML, ` DEFLIST${index} `);
  }

  // Extract <pre> code blocks first and stash them behind placeholders. Markdown
  // tables can't hold fenced code, so we re-emit them as raw <pre><code> HTML
  // (rendered + syntax-highlighted via rehype-raw/rehype-highlight) at the end.
  const preBlocks: string[] = [];
  html = html.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
    const code = inner
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/^\n+|\n+$/g, '');
    // Escape with NUMERIC entities only — cleanMarkdown() decodes the named ones
    // (&lt; &gt; &amp;) which would corrupt this raw block; numeric ones survive
    // until rehype-raw renders them. Pipes and newlines are escaped so the cell
    // stays on a single markdown-table line.
    const escaped = code
      .replace(/&/g, '&#38;')
      .replace(/</g, '&#60;')
      .replace(/>/g, '&#62;')
      .replace(/\|/g, '&#124;')
      .replace(/\n/g, '&#10;');
    preBlocks.push(`<pre><code>${escaped}</code></pre>`);
    return ` PRE${preBlocks.length - 1} `;
  });

  // Preserve <a href> elements as markdown links (before stripping other tags)
  html = html.replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const linkText = inner
      .replace(/<img\b[^>]*>/gi, (image: string) => markdownImageHtml(image, sourceUrl))
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!href || href.startsWith('#')) return linkText;
    const url = convertToHoudiniMDUrl(href, sourceUrl);
    return `[${linkText}](${url})`;
  });

  // Preserve <code> elements as backtick inline code
  let text = html.replace(/<code[^>]*>([^<]*)<\/code>/gi, (_, inner) => `\`${inner.trim()}\``);

  // Preserve images as markdown image syntax (resolve relative URLs)
  text = text.replace(/<img\b[^>]*>/gi, (match) => {
    const srcM = match.match(/\bsrc="([^"]*)"/i);
    const altM = match.match(/\b(?:alt|title)="([^"]*)"/i);
    const src = srcM?.[1] || '';
    const alt = altM?.[1] || '';
    const isKeyIcon = /\bclass=\x22[^\x22]*\bkeyicon\b/i.test(match) && alt;
    if (!src) return '';
    let abs = src;
    if (!src.startsWith('http')) {
      try { abs = new URL(src, sourceUrl).href; } catch { /* keep */ }
    }
    return `![${alt}](${abs})${isKeyIcon ? `&#8288;<kbd>${alt}</kbd>` : ''}`;
  });

  // Convert <ul>/<ol> lists to real HTML list elements.
  // rehype-raw (enabled on the docs page) will render them as proper <ul>/<li> nodes.
  // Do this BEFORE the .def-label step so <p class="label"> inside <li> is not misread.
  // Links/code are already converted above, so stripping remaining tags yields clean item text.
  text = text.replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, listContent) => {
    const items: string[] = [];
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = liRe.exec(listContent)) !== null) {
      const itemText = m[1].replace(/<(?!\/?kbd\b)[^>]+>/gi, ' ').replace(/\s+/g, ' ').trim();
      if (itemText) items.push(`<li>${itemText}</li>`);
    }
    return items.length ? `<${tag}>${items.join('')}</${tag}>` : '';
  });

  // Format .def label elements as bold "**Label**: " markers (separates def items visually)
  text = text.replace(/<p\b[^>]*class="[^"]*\blabel\b[^"]*"[^>]*>([\s\S]*?)<\/p>/gi, (_, content) => {
    const labelText = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return ` **${labelText}**: `;
  });

  // Strip all remaining tags, but preserve the ones we want rendered:
  //   <br> for paragraph line-breaks, <ul>/<ol>/<li> for lists, and <kbd> for keys
  //   (all via rehype-raw).
  text = text.replace(/<(?!\/?(?:br|ul|ol|li|kbd)\b)[^>]+>/gi, ' ');

  // Collapse whitespace within each <br>-separated segment; trim around list tags
  text = text
    .split('<br>')
    .map(seg => seg.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .join('<br>');
  text = text.replace(/\|/g, '\\|');

  // Restore stashed <pre> code blocks (escaped above; safe to inject verbatim).
  text = text.replace(/PRE(\d+)/g, (_, n) => preBlocks[Number(n)] ?? '');
  text = text.replace(/VIDEO(\d+)/g, (_, n) => videoFigures[Number(n)] ?? '');
  text = text.replace(/DEFLIST(\d+)/g, (_, n) => defLists[Number(n)] ?? '');

  return text;
}

const NOTICE_TYPE_MAP: Record<string, string> = {
  note: 'NOTE',
  info: 'NOTE',
  tip: 'TIP',
  warning: 'WARNING',
  important: 'IMPORTANT',
  caution: 'CAUTION',
};

/**
 * Build a GitHub-style admonition block (`> [!NOTE] …`) from a notice's class
 * attribute and inner `.content` HTML. Shared by the standalone-notice rule and
 * the `.def` rule (Inputs), so callouts survive in both contexts.
 */
function noticeToCalloutMarkdown(classAttr: string, contentHtml: string, sourceUrl: string, title?: string, codeLanguage?: CodeLanguage): string {
  const classes = classAttr.split(/\s+/);
  const cls = classes.find((c) => c in NOTICE_TYPE_MAP) ?? 'note';
  const type = NOTICE_TYPE_MAP[cls];
  const body = contentHtmlToMarkdown(contentHtml, sourceUrl, codeLanguage);
  const quoted = body
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
  const marker = title ? `[!${type}] ${title}` : `[!${type}]`;
  return `\n\n> ${marker}\n${quoted}\n`;
}

/**
 * A code sample that itself shows markdown (recipe_format documents the
 * recipe format, so its samples contain literal ``` lines) needs a longer
 * fence than its longest backtick run, or the block breaks apart.
 */
function fencedCodeBlock(code: string, language?: CodeLanguage): string {
  let longest = 0;
  for (const match of code.matchAll(/`+/g)) {
    longest = Math.max(longest, match[0].length);
  }
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `\n\n${fence}${language || ''}\n${code}\n${fence}\n\n`;
}

/**
 * Lightweight HTML → markdown for callout/notice bodies.
 * Preserves links and inline code, turns paragraphs into blank-line-separated
 * blocks, keeps `<pre>` blocks as fenced code, and strips everything else to
 * plain text.
 */
function contentHtmlToMarkdown(html: string, sourceUrl: string, codeLanguage?: CodeLanguage): string {
  const prepared = preserveMedia(html, sourceUrl);
  let text = prepared.html;

  // Fenced code blocks. Without this the generic tag-stripping below flattens
  // a callout's code sample into one run of plain text (recipe_format's tip).
  const preBlocks: string[] = [];
  text = text.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
    const code = inner
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/>/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/^\n+|\n+$/g, '');
    preBlocks.push(fencedCodeBlock(code, codeLanguage));
    return `\nPREBLOCK${preBlocks.length - 1}\n`;
  });

  // Preserve <a href> as markdown links
  text = text.replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const linkText = inner
      .replace(/<img\b[^>]*>/gi, (image: string) => markdownImageHtml(image, sourceUrl))
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!href || href.startsWith('#')) return linkText;
    const url = convertToHoudiniMDUrl(href, sourceUrl);
    return `[${linkText}](${url})`;
  });

  // Preserve inline <code> as backticks
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => {
    const cleaned = inner
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
    return `\`${cleaned}\``;
  });

  // Bold for <strong>/<b>
  text = text.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, inner) => {
    return `**${inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}**`;
  });

  // Bullet/numbered lists → real markdown lists. Without this the generic
  // tag-stripping below flattens each SideFX `ul.bullets` entry (sesinetd's
  // "Interval values:") into one loose paragraph per item.
  text = text.replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, listContent) => {
    const items: string[] = [];
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = liRe.exec(listContent)) !== null) {
      const itemText = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (itemText) items.push(itemText);
    }
    if (items.length === 0) return '';
    const marker = tag === 'ol' ? '1.' : '-';
    return `\n${items.map((item) => `${marker} ${item}`).join('\n')}\n`;
  });

  // Paragraph boundaries → double newline
  text = text.replace(/<\/p>/gi, '\n\n').replace(/<p\b[^>]*>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Strip any remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode the few entities that matter and collapse intra-line whitespace
  text = text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  const markdown = text
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return restoreMedia(
    markdown.replace(/PREBLOCK(\d+)/g, (_, n) => preBlocks[Number(n)] ?? ''),
    prepared.media,
  );
}

/**
 * Add custom Turndown rules for Houdini documentation
 */
export function addCustomRules(
  turndown: TurndownService,
  codeLanguage: CodeLanguage,
  sourceUrl: string
): void {
  // Custom table handling to produce clean single-line cells
  turndown.addRule('tables', {
    filter: 'table',
    replacement: (_content, node) => {
      const table = node as Element;
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) return '';

      const markdownRows: string[] = [];
      let headerProcessed = false;

      // A first row of <td> cells is a headerless table (SideFX's lidarimport
      // "Available position storage types"). Emit an empty header row so the
      // real data row isn't styled as a header; MarkdownTable hides the empty
      // thead at render time.
      const hasHeader = Boolean(table.querySelector('th'));

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('th, td'));
        if (cells.length === 0) continue;

        const cellContents: string[] = [];
        for (const cell of cells) {
          cellContents.push(getCellText(cell as Element, sourceUrl));
        }

        const rowText = '| ' + cellContents.join(' | ') + ' |';

        // Add separator after header row (first row)
        if (!headerProcessed) {
          headerProcessed = true;
          if (!hasHeader) {
            // Headerless table: emit blank header cells above the separator so
            // no data row is styled as a header; MarkdownTable hides the empty
            // thead. The first row stays a data row.
            markdownRows.push('| ' + cellContents.map(() => '  ').join(' | ') + ' |');
            markdownRows.push('| ' + cellContents.map(() => '---').join(' | ') + ' |');
            markdownRows.push(rowText);
            continue;
          }
          markdownRows.push(rowText);
          markdownRows.push('| ' + cellContents.map(() => '---').join(' | ') + ' |');
          continue;
        }

        markdownRows.push(rowText);
      }

      if (markdownRows.length === 0) return '';

      return '\n\n' + markdownRows.join('\n') + '\n\n';
    },
  });

  // SideFX parameter divs (not real <table> elements) — convert to markdown table
  turndown.addRule('parameterDivs', {
    filter: (node) => {
      return (
        node.nodeName === 'DIV' &&
        node.classList.contains('parameters') &&
        node.classList.contains('sbs-group')
      );
    },
    replacement: (_content, node) => {
      const items = Array.from((node as Element).querySelectorAll('.parameter.sbs-item'));
      if (items.length === 0) return '';

      const rows: string[] = [];
      rows.push('| Parameter | Description |');
      rows.push('| --- | --- |');

      for (const item of items) {
        const label = (item.querySelector('p.label')?.textContent || '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');

        const contentEl = item.querySelector('div.content');
        let content = '';
        if (contentEl) {
          // Pull notices out first so they render as distinct "**Note:** …"
          // markers rather than being flattened into the description text.
          // (Markdown table cells can't hold block-level callouts.)
          const noticeEls = Array.from(contentEl.querySelectorAll('.notice.ind-item')) as Element[];
          const noticeTexts = noticeEls.map((n) => {
            const cls = (n.getAttribute('class') || '').split(/\s+/).find((c) => c in NOTICE_TYPE_MAP) ?? 'note';
            const kind = NOTICE_TYPE_MAP[cls].toLowerCase(); // note | tip | warning | important | caution
            const pretty = kind.charAt(0).toUpperCase() + kind.slice(1);
            // Markdown table cells can't hold a blockquote, so emit an inline-HTML
            // mini-callout (rendered via rehype-raw, styled by .cell-callout CSS).
            // Encode entities so the cell stays a single, valid markdown-table line.
            const noticeContent = n.querySelector('.content') as Element | null;
            const noticeHtml = (noticeContent as unknown as { innerHTML: string } | null)?.innerHTML ?? '';
            const { media } = preserveMedia(noticeHtml, sourceUrl);
            const txt = (noticeContent?.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\|/g, '&#124;');
            const inlineMedia = media
              .map((asset) => asset.replace(/^<figure\b[^>]*>/, '').replace(/<\/figure>$/, '').replace(/\|/g, '&#124;'))
              .join('<br>');
            return `<span class="callout callout-${kind}"><span class="callout-title">${pretty}</span>${txt}</span>${inlineMedia}`;
          });
          noticeEls.forEach((n) => (n as unknown as { remove: () => void }).remove());

          content = getCellText(contentEl, sourceUrl);
          if (noticeTexts.length) {
            content = [content, ...noticeTexts].filter(Boolean).join('<br>');
          }
        }
        content = content.replace(/\|/g, '\\|');
        rows.push(`| ${label} | ${content} |`);
      }

      return '\n\n' + rows.join('\n') + '\n\n';
    },
  });

  // Code blocks. `.code-container` sometimes wraps a `<code>` directly and
  // sometimes wraps a `<pre>` (e.g. the plain examples on expression-function
  // pages) — when it wraps a `<pre>`, that child already matches this same
  // filter and turndown visits it first, so matching the wrapping div too
  // fed its already-fenced output back through fencedCodeBlock a second
  // time, doubling the fence for no reason.
  turndown.addRule('codeBlocks', {
    filter: (node) => {
      return (
        node.nodeName === 'PRE' ||
        (node.nodeName === 'DIV' && node.classList.contains('code-container') && !node.querySelector('pre'))
      );
    },
    replacement: (content, node) => {
      const element = node as Element;
      const codeElement = element.querySelector('code');
      let codeContent = element.nodeName === 'PRE'
        ? element.textContent
        : codeElement?.textContent || content;

      codeContent = codeContent
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      return fencedCodeBlock(codeContent, codeLanguage);
    },
  });

  // Inline code
  turndown.addRule('inlineCode', {
    filter: (node) => {
      return (
        node.nodeName === 'CODE' &&
        node.parentNode?.nodeName !== 'PRE'
      );
    },
    replacement: (content) => inlineCodeMarkdown(content),
  });

  turndown.addRule('keyboardKeys', {
    filter: 'kbd',
    replacement: (content) => `<kbd>${content}</kbd>`,
  });

  // VEX signature argument types: SideFX trails a real type name with `&nbsp;`
  // (e.g. `<span class="vextype vexstring">string&nbsp;</span>`), which survives
  // turndown's tag-stripping as a literal space. A union/placeholder type
  // (`int|string`, `<type>`) is instead rendered as `.vexpattern` with no
  // trailing `&nbsp;`, so the following `.vexname` (the argument name) glues
  // straight onto it — `int|stringchannel`, `<type>defvalue`. Add the same
  // trailing space here so both type spans behave alike.
  turndown.addRule('vexPatternType', {
    filter: (node) => node.nodeName === 'SPAN' && (node as Element).classList.contains('vexpattern'),
    replacement: (content) => `${content.trim()} `,
  });

  turndown.addRule('sphinxAnchors', {
    filter: (node) => node.nodeName === 'SPAN' && (node as Element).classList.contains('sphinx-anchor'),
    replacement: (_content, node) => {
      const id = (node as Element).getAttribute('id') || '';
      return id ? `<span id="${id.replace(/"/g, '&quot;')}"></span>` : '';
    },
  });

  // Links - convert to houdinimd URLs
  turndown.addRule('links', {
    filter: 'a',
    replacement: (content, node) => {
      const link = node as Element;
      const href = link.getAttribute('href') || '';
      if (!href || href.startsWith('#')) {
        return content;
      }
      if (link.classList.contains('download')) {
        return `[${content}](${new URL(href, sourceUrl).href})`;
      }
      const houdinimdUrl = convertToHoudiniMDUrl(href, sourceUrl);
      return `[${content}](${houdinimdUrl})`;
    },
  });

  // Var elements (variable names)
  turndown.addRule('varElements', {
    filter: 'var',
    replacement: (content, node) => (node.parentNode as Element | null)?.tagName === 'CODE' ? content : `*${content}*`,
  });

  // SideFX callout/notice boxes (.notice.ind-item) → GitHub-style admonition
  // blockquote (e.g. "> [!NOTE]"). Rendered as a coloured Notion-like callout by
  // the remark-callouts plugin on the docs page. Inner links and inline code are
  // preserved so they render as real links / code in the callout body.
  turndown.addRule('noticeBox', {
    filter: (node) =>
      node.nodeName === 'DIV' &&
      (node as Element).classList.contains('notice') &&
      (node as Element).classList.contains('ind-item'),
    replacement: (_content, node) => {
      const el = node as Element;
      const contentEl = el.querySelector('.content') as Element | null;
      const contentHtml = contentEl ? (contentEl as unknown as { innerHTML: string }).innerHTML : '';
      const title = el.getAttribute('data-callout-title') || undefined;
      return noticeToCalloutMarkdown(el.getAttribute('class') || '', contentHtml, sourceUrl, title, codeLanguage) + '\n';
    },
  });

  turndown.addRule('methodItems', {
    filter: (node) =>
      node.nodeName === 'DIV' &&
      (node as Element).classList.contains('collapsible') &&
      (node as Element).classList.contains('method'),
    replacement: (content) => `\n\n- ${content.trim().replace(/\n{2,}/g, '\n  ')}\n`,
  });

  // .def items → "**Label** — description" on a single line (compact, no double-paragraph gaps)
  turndown.addRule('defItem', {
    filter: (node) => node.nodeName === 'DIV' && (node as Element).classList.contains('def'),
    replacement: (_content, node) => {
      const el = node as Element;
      const labelEl = el.querySelector('p.label') as Element | null;
      const label = labelEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const contentEl = el.querySelector('.content') as Element | null;
      if (!label) return _content;
      let desc = '';
      let callouts = '';
      if (contentEl) {
        // Lift any nested notices out into proper callouts so they aren't
        // flattened into the description text. Remove them from the DOM first.
        const notices = Array.from(contentEl.querySelectorAll('.notice.ind-item')) as Element[];
        for (const n of notices) {
          const nContent = n.querySelector('.content') as Element | null;
          const nHtml = nContent ? (nContent as unknown as { innerHTML: string }).innerHTML : '';
          callouts += noticeToCalloutMarkdown(n.getAttribute('class') || '', nHtml, sourceUrl, undefined, codeLanguage);
          (n as unknown as { remove: () => void }).remove();
        }

        const html = (contentEl as unknown as { innerHTML: string }).innerHTML ?? '';
        desc = contentHtmlToMarkdown(html, sourceUrl);
      }
      const labelMarkdown = labelEl?.querySelector('code')
        ? contentHtmlToMarkdown(labelEl.innerHTML, sourceUrl)
        : `**${label}**`;
      return `\n\n${labelMarkdown}  \n${desc}\n${callouts}\n`;
    },
  });

  // Renders a list of {titleMd, iconMd, summaryMd} entries as a card grid, UNLESS
  // every entry lacks both an icon and a summary — a group of bare titles (e.g.
  // "New features and improvements" tiles on /docs/houdini/news/22) reads as an
  // empty, oversized card grid with nothing but a heading in each box, so that
  // case falls back to a plain listicle instead.
  function renderItemGroup(items: { titleMd: string; iconMd: string; summaryMd: string }[]): string {
    if (items.length === 0) return '';
    if (!items.some((item) => item.iconMd || item.summaryMd)) {
      return `\n\n${items.map((item) => `- ${item.titleMd}`).join('\n')}\n\n`;
    }
    const cards = items.map((item) => `- ${item.iconMd}${item.titleMd}${item.summaryMd}`);
    return `\n\n<div class="not-prose shelf-grid">\n\n${cards.join('\n\n')}\n\n</div>\n\n`;
  }

  // Shelf tool cards (the one-off card component on /docs/houdini/shelf/index):
  // a `.shelftab` group of `.shelftool` cards (icon + title link + summary).
  // Wrapped in a raw <div class="shelf-grid"> so the docs page renders it as a
  // card grid (styled in globals.css), while the text mirror still reads as a
  // plain markdown list — every link and word survives, no HTML per card.
  turndown.addRule('shelfCards', {
    filter: (node) =>
      node.nodeName === 'DIV' && (node as Element).classList.contains('shelftab'),
    replacement: (_content, node) => {
      const tools = Array.from((node as Element).querySelectorAll('div.shelftool'));
      if (tools.length === 0) return '';

      const items = tools
        .map((tool) => {
          const label = tool.querySelector('p.text a') as Element | null;
          const title = label?.textContent?.replace(/\s+/g, ' ').trim() || '';
          if (!title) return null; // no title/link, no card worth showing

          const href = label?.getAttribute('href') || '';
          const titleMd = href ? `[${title}](${convertToHoudiniMDUrl(href, sourceUrl)})` : title;

          const iconSrc = tool.querySelector('img.shelficon')?.getAttribute('src') || '';
          let iconMd = '';
          if (iconSrc) {
            let abs = iconSrc;
            if (!iconSrc.startsWith('http')) {
              try { abs = new URL(iconSrc, sourceUrl).href; } catch { /* keep relative */ }
            }
            iconMd = `![](${abs}) `;
          }

          const summary = tool.querySelector('p.summary')?.textContent?.replace(/\s+/g, ' ').trim() || '';
          const summaryMd = summary ? `\n\n  ${summary}` : '';

          return { titleMd, iconMd, summaryMd };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      return renderItemGroup(items);
    },
  });

  // Icon item-group lists (the same card component as the shelf, reused across
  // most node-category index pages — /docs/houdini/nodes/sop, nodes/obj, etc.
  // — and the plain subtopic listicles on index pages like /docs/houdini/render):
  // a `ul.item_group` of `li` entries (optional icon + title link + optional
  // summary). Wrapped in the same raw <div class="shelf-grid"> as shelfCards
  // below, so every item_group on a page renders as the same card grid instead
  // of some being cards and others a bare list — icons and summaries are each
  // optional per item already (see shelf-grid CSS), so a group with no icons
  // at all just renders as text-only cards rather than falling through.
  turndown.addRule('itemGroupCards', {
    filter: (node) => {
      if (node.nodeName !== 'UL') return false;
      const el = node as Element;
      return el.classList.contains('item_group');
    },
    replacement: (_content, node) => {
      const items = Array.from((node as Element).querySelectorAll('li'));
      if (items.length === 0) return '';

      const cards = items
        .map((item) => {
          const label = item.querySelector('p.label a') as Element | null;
          const title = label?.textContent?.replace(/\s+/g, ' ').trim() || '';
          if (!title) return null; // no title/link, no card worth showing

          const href = label?.getAttribute('href') || '';
          const titleMd = href ? `[${title}](${convertToHoudiniMDUrl(href, sourceUrl)})` : title;

          // converter.ts's li.with-icon pre-pass already merges the `.g` icon
          // into this same label link (and drops the now-empty `.g` div), so
          // the icon lives inside `label`, not elsewhere in `item`.
          const iconSrc = label?.querySelector('img')?.getAttribute('src') || '';
          let iconMd = '';
          if (iconSrc) {
            let abs = iconSrc;
            if (!iconSrc.startsWith('http')) {
              try { abs = new URL(iconSrc, sourceUrl).href; } catch { /* keep relative */ }
            }
            iconMd = `![](${abs}) `;
          }

          const summary = item.querySelector('p.summary')?.textContent?.replace(/\s+/g, ' ').trim() || '';
          const summaryMd = summary ? `\n\n  ${summary}` : '';

          return { titleMd, iconMd, summaryMd };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      return renderItemGroup(cards);
    },
  });

  // Headings - preserve SideFX anchor IDs using raw HTML (rendered via rehype-raw)
  // This enables in-page anchor scrolling for URLs like /docs/pyrosolver#shapetab
  turndown.addRule('headingsWithId', {
    filter: ['h2', 'h3', 'h4', 'h5', 'h6'],
    replacement: (content, node) => {
      const el = node as Element;
      const level = parseInt(el.nodeName[1]);
      const id = el.getAttribute('id');
      const text = el.classList.contains('sphinx-function') || el.classList.contains('doxygen-member')
        ? el.textContent.replace(/\s+/g, ' ').trim()
        : content.trim();
      if (id) {
        return `\n\n<h${level} id="${id}">${text}</h${level}>\n\n`;
      }
      return `\n\n${'#'.repeat(level)} ${text}\n\n`;
    },
  });

  // A `<p>` whose only content is 2+ sibling `<img>`s (no other text) is
  // SideFX's plain thumbnail-comparison pattern (e.g. rbdmaterialfracture's
  // "Using different displays" section) — render as a horizontal row instead
  // of one full-width image per line.
  turndown.addRule('imageGroupInline', {
    filter: (node) => {
      if (node.nodeName !== 'P') return false;
      const el = node as Element;
      const children = Array.from(el.children);
      if (children.length < 2 || !children.every((child) => child.tagName === 'IMG')) return false;
      const text = Array.from(el.childNodes)
        .filter((child) => child.nodeType === 3)
        .map((child) => child.textContent || '')
        .join('')
        .trim();
      return text === '';
    },
    replacement: (_content, node) => {
      const items = Array.from((node as Element).children)
        .map((img) => ({
          src: img.getAttribute('src') || '',
          alt: img.getAttribute('title') || img.getAttribute('alt') || '',
        }))
        .filter((item) => item.src);
      if (items.length < 2) return '';
      return `\n\n${imageGroupMarkup(items, sourceUrl)}\n\n`;
    },
  });

  // SideFX's other thumbnail pattern: a `.row` of `.col_*` divs, each holding
  // one image and an optional caption — either a `.box-label` above the image
  // (polyreduce's 100%/50%/10% comparison) or a native `<figcaption>` beside
  // it (geometrylight's Material Sync Mode comparison) — where the caption
  // currently gets orphaned instead of staying attached to its image. Falls
  // back to the default recursive markdown (`content`) for any `.row` that
  // isn't this clean one-image-per-column shape, so unrelated column layouts
  // are untouched.
  turndown.addRule('imageGroupColumns', {
    filter: (node) => {
      if (node.nodeName !== 'DIV' || !(node as Element).classList.contains('row')) return false;
      const cols = Array.from((node as Element).children).filter((child) => /\bcol_/.test(child.getAttribute('class') || ''));
      return cols.length >= 2;
    },
    replacement: (content, node) => {
      const cols = Array.from((node as Element).children).filter((child) => /\bcol_/.test(child.getAttribute('class') || ''));
      const items: { src: string; alt: string; caption?: string }[] = [];
      for (const col of cols) {
        const imgs = Array.from(col.querySelectorAll('img'));
        if (imgs.length !== 1) return content;
        const src = imgs[0].getAttribute('src') || '';
        if (!src) return content;
        const caption = (col.querySelector('.box-label') || col.querySelector('figcaption'))
          ?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const alt = imgs[0].getAttribute('title') || imgs[0].getAttribute('alt') || caption;
        items.push({ src, alt, caption: caption || undefined });
      }
      if (items.length < 2) return content;
      return `\n\n${imageGroupMarkup(items, sourceUrl)}\n\n`;
    },
  });

  // Keep video captions attached to their native player.
  turndown.addRule('videoFigure', {
    filter: (node) => node.nodeName === 'FIGURE' && !!(node as Element).querySelector('video[src]'),
    replacement: (_content, node) => `\n\n${videoFigureHtml(node as Element, sourceUrl)}\n\n`,
  });


  turndown.addRule('vimeoVideo', {
    filter: (node) => node.nodeName === 'DIV' && (node as Element).classList.contains('video-container') && !!(node as Element).querySelector('iframe[src*="vimeo.com"]'),
    replacement: (_content, node) => `\n\n${vimeoVideoHtml(node as Element, sourceUrl)}\n\n`,
  });
  // Images - resolve relative URLs to absolute SideFX; keyicons → <kbd>
  turndown.addRule('images', {
    filter: 'img',
    replacement: (_content, node) => {
      const img = node as Element;
      const src = img.getAttribute('src') || '';
      const title = img.getAttribute('title') || img.getAttribute('alt') || '';
      const isKeyIcon = img.classList.contains('keyicon');

      if (isKeyIcon && title && src) {
        let absoluteSrc = src;
        if (!src.startsWith('http')) {
          try { absoluteSrc = new URL(src, sourceUrl).href; } catch { /* keep original */ }
        }
        return `![${title}](${absoluteSrc})&#8288;<kbd>${title}</kbd>`;
      }

      if (!src) return '';

      let absoluteSrc = src;
      if (!src.startsWith('http')) {
        try { absoluteSrc = new URL(src, sourceUrl).href; } catch { /* keep original */ }
      }

      return `![${title}](${absoluteSrc})`;
    },
  });
}

/**
 * `<video>` isn't one of CommonMark's block-level HTML tag names, so a bare
 * `<video>` (no wrapping `<figure>`) parses as inline content and lands
 * inside a `<p>` — DocVideoClient's root `<div>` then can't legally nest
 * there, which fails hydration and leaves the player unmounted. Route
 * through videoFigureMarkup like every other video path so it's always
 * `<figure>`-wrapped (a recognized block tag) and stays its own HTML block.
 */
function vimeoVideoHtml(container: Element, sourceUrl: string): string {
  const iframe = container.querySelector('iframe[src*="vimeo.com"]');
  const src = iframe?.getAttribute('src') || '';
  const title = iframe?.getAttribute('title') || container.getAttribute('title') || '';
  if (!src) return '';
  return videoFigureMarkup(src, 'video/vimeo', '', sourceUrl, title);
}
