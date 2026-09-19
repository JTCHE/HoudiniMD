import { parseFrontmatter } from "@/lib/markdown/frontmatter";
import { localIconUrl } from "@/lib/icons";

export interface PageMeta {
  title: string;
  nodeType?: string;
  icon?: string;
  description?: string;
}

/**
 * What a page says about itself, read from its own markdown.
 *
 * Prefer the frontmatter's own name/type split — the H1 is only their
 * concatenation (`${title} ${nodeType}`), so reading it back keeps the
 * metadata title correct without re-parsing text that already came apart
 * cleanly at generation time. Fall back to the raw H1 for pages with no
 * frontmatter (should not happen for generated docs, but degrade safely).
 */
export function pageMeta(markdown: string | null, fallbackTitle: string): PageMeta {
  if (!markdown) return { title: fallbackTitle };

  const { content, data } = parseFrontmatter(markdown);
  const h1Match = content.match(/^#[ \t]+(\S[^\n]*)$/m);

  const meta: PageMeta = { title: fallbackTitle };
  if (data.title) {
    meta.title = data.title;
    meta.nodeType = data.nodeType;
    meta.icon = data.icon ? localIconUrl(data.icon) : undefined;
  } else if (h1Match) {
    meta.title = h1Match[1].trim();
  }

  const bodyAfterH1 = h1Match ? content.replace(/^#[ \t]+\S[^\n]*\r?\n+/m, "") : content;
  const summaryMatch = bodyAfterH1.match(/^\s*>[ \t]+(?!\[!)([^\n]+)\n+/);
  if (summaryMatch) meta.description = summaryMatch[1].trim();

  return meta;
}

/**
 * The `/api/og` query for a page. It is the card's whole input and, hashed,
 * the R2 key the card is stored under — so scripts/prerender-og.ts draws from
 * this same function rather than a second reading of the same markdown.
 */
export function ogParams(slugPath: string, meta: PageMeta): URLSearchParams {
  // Name and type stay separate: the card renders its own bold-name/thin-type
  // hierarchy (lib/og/og-image.tsx), not the dash-joined <title> string.
  const params = new URLSearchParams({ path: slugPath, title: meta.title });
  if (meta.nodeType) params.set("type", meta.nodeType);
  if (meta.description) params.set("summary", meta.description);
  if (meta.icon) params.set("icon", meta.icon);
  return params;
}
