import TurndownService from 'turndown';
import { convertToHoudiniMDUrl } from '../url';
import type { CodeLanguage } from './types';

/**
 * Helper to get clean text content from a cell element
 * Preserves inline code as backtick notation, links as markdown, and .def items with separators
 */
function getCellText(cell: Element, sourceUrl: string): string {
  // Use innerHTML (available on node-html-parser elements) to preserve code spans
  let html = (cell as unknown as { innerHTML: string }).innerHTML ?? '';

  // Preserve <a href> elements as markdown links (before stripping other tags)
  html = html.replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const linkText = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
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
    if (!src) return '';
    let abs = src;
    if (!src.startsWith('http')) {
      try { abs = new URL(src, sourceUrl).href; } catch { /* keep */ }
    }
    return `![${alt}](${abs})`;
  });

  // Format .def label elements as bold "**Label**: " markers (separates def items visually)
  text = text.replace(/<p\b[^>]*class="[^"]*\blabel\b[^"]*"[^>]*>([\s\S]*?)<\/p>/gi, (_, content) => {
    const labelText = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return ` **${labelText}**: `;
  });

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Collapse whitespace, trim, escape pipes
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/\|/g, '\\|');

  return text;
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

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('th, td'));
        if (cells.length === 0) continue;

        const cellContents: string[] = [];
        for (const cell of cells) {
          cellContents.push(getCellText(cell as Element, sourceUrl));
        }

        const rowText = '| ' + cellContents.join(' | ') + ' |';
        markdownRows.push(rowText);

        // Add separator after header row (first row)
        if (!headerProcessed) {
          const separator = '| ' + cellContents.map(() => '---').join(' | ') + ' |';
          markdownRows.push(separator);
          headerProcessed = true;
        }
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
        const content = (item.querySelector('div.content')?.textContent || '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
        rows.push(`| ${label} | ${content} |`);
      }

      return '\n\n' + rows.join('\n') + '\n\n';
    },
  });

  // Code blocks
  turndown.addRule('codeBlocks', {
    filter: (node) => {
      return (
        node.nodeName === 'PRE' ||
        (node.nodeName === 'DIV' && node.classList.contains('code-container'))
      );
    },
    replacement: (content, node) => {
      const codeElement = (node as Element).querySelector('code, pre');
      let codeContent = codeElement?.textContent || content;

      codeContent = codeContent
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      return `\n\n\`\`\`${codeLanguage}\n${codeContent}\n\`\`\`\n\n`;
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
    replacement: (content) => {
      const cleaned = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();
      return `\`${cleaned}\``;
    },
  });

  // Links - convert to houdinimd URLs
  turndown.addRule('links', {
    filter: 'a',
    replacement: (content, node) => {
      const href = (node as Element).getAttribute('href') || '';
      if (!href || href.startsWith('#')) {
        return content;
      }
      const houdinimdUrl = convertToHoudiniMDUrl(href, sourceUrl);
      return `[${content}](${houdinimdUrl})`;
    },
  });

  // Var elements (variable names)
  turndown.addRule('varElements', {
    filter: 'var',
    replacement: (content) => `*${content}*`,
  });

  // SideFX callout/notice boxes (.notice.ind-item) → blockquote with type label
  turndown.addRule('noticeBox', {
    filter: (node) =>
      node.nodeName === 'DIV' &&
      (node as Element).classList.contains('notice') &&
      (node as Element).classList.contains('ind-item'),
    replacement: (_content, node) => {
      const el = node as Element;
      const classes = Array.from(el.classList);
      const type = classes.find((c) => ['note', 'warning', 'tip', 'important', 'info'].includes(c)) ?? 'note';
      const label = type.charAt(0).toUpperCase() + type.slice(1);
      const content = (el.querySelector('.content') as Element | null)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return `\n\n> **${label}:** ${content}\n\n`;
    },
  });

  // .def items → "**Label** — description" on a single line (compact, no double-paragraph gaps)
  turndown.addRule('defItem', {
    filter: (node) => node.nodeName === 'DIV' && (node as Element).classList.contains('def'),
    replacement: (_content, node) => {
      const el = node as Element;
      const label = el.querySelector('p.label')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const desc = (el.querySelector('.content') as Element | null)?.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (!label) return _content;
      return `\n\n**${label}**  \n${desc}\n`;
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
      const text = content.trim();
      if (id) {
        return `\n\n<h${level} id="${id}">${text}</h${level}>\n\n`;
      }
      return `\n\n${'#'.repeat(level)} ${text}\n\n`;
    },
  });

  // Images - resolve relative URLs to absolute SideFX; keyicons → <kbd>
  turndown.addRule('images', {
    filter: 'img',
    replacement: (_content, node) => {
      const img = node as Element;
      const src = img.getAttribute('src') || '';
      const title = img.getAttribute('title') || img.getAttribute('alt') || '';
      const isKeyIcon = img.classList.contains('keyicon');

      if (isKeyIcon && title) {
        return `<kbd>${title}</kbd>`;
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
