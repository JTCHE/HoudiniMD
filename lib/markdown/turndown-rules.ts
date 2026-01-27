import TurndownService from 'turndown';
import { convertToVexLLMUrl } from '../url-normalizer';
import type { CodeLanguage } from './types';

/**
 * Add custom Turndown rules for Houdini documentation
 */
export function addCustomRules(
  turndown: TurndownService,
  codeLanguage: CodeLanguage,
  sourceUrl: string
): void {
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
