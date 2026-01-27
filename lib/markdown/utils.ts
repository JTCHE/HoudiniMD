import type { CodeLanguage } from './types';

/**
 * Detect the appropriate code language based on the URL slug
 */
export function detectLanguage(slug: string): CodeLanguage {
  if (slug.includes('hom/') || slug.includes('python/')) return 'python';
  if (slug.includes('hscript/')) return 'hscript';
  if (slug.includes('expressions/')) return 'hscript';
  return 'vex';
}

/**
 * Clean up generated markdown
 */
export function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(/\n{3,}/g, '\n\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/‹([^›]+)›/g, '*$1*')
    .trim();
}
