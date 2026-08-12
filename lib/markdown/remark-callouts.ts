// Minimal structural types — @types/mdast isn't a dependency, and we only touch
// a few well-known node shapes.
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

/**
 * Map of supported admonition keywords to the callout style applied in the DOM.
 * Mirrors the GitHub-flavoured `> [!NOTE]` syntax emitted by the scraper.
 */
const CALLOUT_TYPES: Record<string, string> = {
  NOTE: "note",
  TIP: "tip",
  WARNING: "warning",
  IMPORTANT: "important",
  CAUTION: "caution",
};

// Any trailing text on the marker line becomes the callout's title,
// overriding the type's default capitalized label (e.g. `[!CAUTION] Beta` →
// styled as a caution callout but titled "Beta").
const MARKER = /^\s*\[!(\w+)\][ \t]*([^\n]*)\n?/;

/**
 * remark plugin: turn GitHub-style admonition blockquotes (`> [!NOTE]`) into
 * blockquotes tagged with `class="callout callout-<type>"` and `data-callout`,
 * so they render as coloured Notion-like callouts. The marker line is stripped
 * from the rendered body; inner markdown (links, code, lists) is preserved.
 */
export function remarkCallouts() {
  return (tree: MdNode) => {
    visit(tree, (bq) => {
      if (bq.type !== "blockquote" || !bq.children) return;
      const para = bq.children[0];
      if (!para || para.type !== "paragraph" || !para.children) return;

      const text = para.children[0];
      if (!text || text.type !== "text" || typeof text.value !== "string") return;

      const match = text.value.match(MARKER);
      if (!match) return;

      const type = CALLOUT_TYPES[match[1].toUpperCase()];
      if (!type) return;
      const title = match[2].trim() || undefined;

      // Strip the "[!TYPE] title" marker (and its trailing newline) from the body.
      text.value = text.value.slice(match[0].length);
      if (text.value === "") {
        para.children.shift();
        // Drop the now-empty leading paragraph entirely if nothing remains.
        if (para.children.length === 0) bq.children.shift();
      }

      const data = (bq.data ??= {});
      data.hName = "blockquote";
      data.hProperties = {
        ...data.hProperties,
        className: `callout callout-${type}`,
        "data-callout": type,
        ...(title ? { "data-callout-title": title } : {}),
      };
    });
  };
}

/** Minimal depth-first visitor — avoids pulling in unist-util-visit. */
function visit(node: MdNode, fn: (node: MdNode) => void): void {
  fn(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) visit(child, fn);
  }
}
