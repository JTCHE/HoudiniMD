import TurndownService from 'turndown';
import { convertToVexLLMUrl } from '../url-normalizer';
import type { CodeLanguage } from './types';

/**
 * Helper to get clean text content from a cell element
 * Extracts text while preserving basic formatting
 */
function getCellText(cell: Element): string {
  // Clone the cell to avoid modifying the original
  const clone = cell.cloneNode(true) as Element;

  // Get text content, collapsing whitespace
  let text = clone.textContent || '';

  // Clean up: collapse whitespace, trim
  text = text.replace(/\s+/g, ' ').trim();

  // Escape pipes that might break table formatting
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
          cellContents.push(getCellText(cell as Element));
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

  // Links - convert to VexLLM URLs
  turndown.addRule('links', {
    filter: 'a',
    replacement: (content, node) => {
      const href = (node as Element).getAttribute('href') || '';
      if (!href || href.startsWith('#')) {
        return content;
      }
      const vexLLMUrl = convertToVexLLMUrl(href, sourceUrl);
      return `[${content}](${vexLLMUrl})`;
    },
  });

  // Var elements (variable names)
  turndown.addRule('varElements', {
    filter: 'var',
    replacement: (content) => `*${content}*`,
  });
}
