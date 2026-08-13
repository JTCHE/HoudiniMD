import GithubSlugger from "github-slugger";

export interface Heading {
  id: string;
  text: string;
  level: number;
}

const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
};

/** Markdown and HTML syntax the heading source carries but the rendered heading does not. */
function plainText(source: string): string {
  return source
    .replace(/<[^>]+>/g, "")
    // Images are links in Markdown syntax too. Remove them first, otherwise the
    // generic link rule consumes only `[alt](url)` and leaves a stray `!` in
    // the table of contents.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/&(lt|gt|amp|quot|#39);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, " ")
    .trim();
}

// Either an ATX heading, or the raw <hN id="…"> the converter emits when SideFX
// gave the heading an anchor (turndown-rules.ts, rule `headingsWithId`).
const HEADING = /^(#{1,6})[ \t]+(\S[^\n]*)$|<h([1-6])([^>]*)>([\s\S]*?)<\/h\3>/gim;

/**
 * Every heading anchor of a markdown body, with the ids the page will really have.
 *
 * Mirrors rehypeSlug: a heading that already carries an id keeps it and is NOT
 * fed to the slugger, so it does not shift the "-1" suffix of a later duplicate.
 */
export function extractHeadings(markdown: string): Heading[] {
  const slugger = new GithubSlugger();
  const body = markdown.replace(/```[\s\S]*?```/g, "");
  const headings: Heading[] = [];

  for (const m of body.matchAll(HEADING)) {
    const atx = m[1] !== undefined;
    const level = Number(atx ? m[1].length : m[3]);
    const text = plainText(atx ? m[2] : m[5]);
    const rawId = atx ? undefined : /\bid="([^"]*)"/.exec(m[4])?.[1];
    const id = rawId ?? slugger.slug(text);
    // h1 is the page title, rendered in the header — everything below it is TOC.
    if (level > 1) headings.push({ id, text, level });
  }

  return headings;
}
