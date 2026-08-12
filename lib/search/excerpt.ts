/**
 * Text excerpts for search results.
 *
 * The index stores which SECTION matched, not what it said — postings hold
 * `[docId, tf, headingIdx]` and nothing more, because keeping ~107k section
 * snippets in the doc table would add megabytes to every cold load. So the
 * words themselves are fetched from the page markdown, on demand, only for the
 * handful of results actually on screen.
 *
 * This is a progressive enhancement: results render immediately with their
 * titles and headings, and excerpts fill in when they arrive. A failed fetch
 * costs nothing but a missing line.
 */
import { tokenize } from "./bm25";

/** Roughly one line at the overlay's width. */
const MAX_CHARS = 150;
/** Pages already fetched this session. Small, and the corpus page is ~3 KB. */
const cache = new Map<string, Promise<string | null>>();

function fetchPage(path: string): Promise<string | null> {
  let pending = cache.get(path);
  if (!pending) {
    // This is internal search data, not a page view.
    pending = fetch(`/api/raw/${path}`)
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null);
    cache.set(path, pending);
  }
  return pending;
}

/** Frontmatter, headings, callouts and table pipes are structure, not prose. */
function clean(md: string): string {
  return md
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/^\s*<h[2-6][^>]*>[\s\S]*?<\/h[2-6]>\s*$/gim, "\n")
    .replace(/^#{1,6}\s+.*$/gm, "\n")
    .replace(/^>.*$/gm, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[|>*_`]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

/**
 * The best passage of `text` for these tokens: the window that contains the
 * most distinct ones, trimmed to whole words.
 */
function bestWindow(text: string, tokens: string[]): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return null;

  const lower = flat.toLowerCase();
  let bestAt = -1;
  let bestScore = 0;

  for (const token of new Set(tokens)) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(token, from);
      if (at < 0) break;
      // How many DISTINCT tokens fall inside a window centred here.
      const start = Math.max(0, at - MAX_CHARS / 2);
      const slice = lower.slice(start, start + MAX_CHARS);
      const score = new Set(tokens.filter((t) => slice.includes(t))).size;
      if (score > bestScore) {
        bestScore = score;
        bestAt = at;
      }
      from = at + token.length;
    }
  }

  if (bestAt < 0) return flat.slice(0, MAX_CHARS).trim() || null;

  let start = Math.max(0, bestAt - Math.floor(MAX_CHARS / 3));
  // Do not open mid-word.
  if (start > 0) {
    const space = flat.indexOf(" ", start);
    start = space < 0 ? start : space + 1;
  }
  const out = flat.slice(start, start + MAX_CHARS).trim();
  return (start > 0 ? "…" : "") + out + (start + MAX_CHARS < flat.length ? "…" : "");
}

/**
 * Prose from `path` that matches `query`, restricted to one section when
 * `heading` names one. Returns null when there is nothing useful to show.
 */
export async function getExcerpt(
  path: string,
  query: string,
  heading?: string,
): Promise<string | null> {
  const md = await fetchPage(path);
  if (!md) return null;

  let scope = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  if (heading) {
    // Take from this heading to the next one of any level.
    const at = scope.search(new RegExp(`^[^\\n]*${escapeRe(heading)}[^\\n]*$`, "im"));
    if (at >= 0) {
      const rest = scope.slice(at);
      const next = rest.slice(1).search(/^\s*(#{1,6}\s|<h[2-6])/m);
      scope = next > 0 ? rest.slice(0, next + 1) : rest;
    }
  }

  return bestWindow(clean(scope), tokenize(query));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

