import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";

const MAX_WORDS = 20;
const MAX_TOPIC_LENGTH = 160;

type MarkdownNode = {
  children?: MarkdownNode[];
  ordered?: boolean;
  type: string;
  value?: string;
};

function nodeText(node: MarkdownNode): string {
  if (node.type === "text" || node.type === "inlineCode" || node.type === "code") return node.value ?? "";
  return node.children?.map(nodeText).join(" ") ?? "";
}

/** True for a bold "1. Main menus"-style label — SideFX's markup for numbered
 * overview captions, not a real list item. */
function isNumberedLabel(node: MarkdownNode): boolean {
  return node.type === "strong" && /^\d+\.\s/.test(nodeText(node));
}

/** Paragraph text, minus a leading numbered-label caption: those read like a
 * page heading, not a sentence, and don't belong in a one-line preview. */
function paragraphText(node: MarkdownNode): string {
  const children = node.children ?? [];
  if (children.length >= 2 && isNumberedLabel(children[0]) && children[1].type === "break") {
    return children.slice(2).map(nodeText).join(" ");
  }
  return nodeText(node);
}

function prosePreview(text: string, prefix = ""): string | null {
  const sentence = text.trim().split(".", 1)[0]?.trim();
  if (!sentence) return null;
  const words = sentence.split(/\s+/);
  const preview = words.slice(0, MAX_WORDS).join(" ");
  return `${prefix}${preview}${words.length > MAX_WORDS ? "..." : text.includes(".") ? "." : ""}`;
}

function topicPreview(titles: string[]): string | null {
  let preview = "";
  for (const title of titles) {
    const candidate = preview ? `${preview} \u2219 ${title}` : title;
    if (candidate.length > MAX_TOPIC_LENGTH) return preview ? `${preview}...` : prosePreview(title);
    preview = candidate;
  }
  return preview || null;
}

function listPreview(list: MarkdownNode): string | null {
  const items = list.children?.filter((node) => node.type === "listItem") ?? [];
  const paragraphs = items.map((item) => item.children?.find((node) => node.type === "paragraph")).filter((node): node is MarkdownNode => Boolean(node));
  if (!paragraphs.length) return null;

  const linkTitles = paragraphs.map((paragraph) => {
    const children = paragraph.children ?? [];
    return children.length === 1 && children[0].type === "link" ? nodeText(children[0]).trim() : null;
  });
  if (linkTitles.every((title): title is string => Boolean(title))) return topicPreview(linkTitles);

  return prosePreview(paragraphText(paragraphs[0]), list.ordered ? "1. " : "");
}

function parse(markdown: string): MarkdownNode | null {
  try {
    const content = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    return unified().use(remarkParse).use(remarkGfm).parse(content) as MarkdownNode;
  } catch {
    return null;
  }
}

// Doc pages mark sections with raw `<h2 id="...">Text</h2>` tags, so remark
// sees them as "html" nodes rather than mdast "heading" nodes — that's also
// why getPagePreview must skip node.type "html" instead of "heading".
function headingId(node: MarkdownNode): string | null {
  if (node.type !== "html" || typeof node.value !== "string") return null;
  return node.value.match(/^<h[1-6]\s+id="([^"]+)"/i)?.[1] ?? null;
}

/** A preview candidate for one top-level node, or null if it isn't one
 * (headings, images, tables, etc). Shared by whole-page and per-section preview. */
function nodePreview(node: MarkdownNode): string | null {
  if (node.type === "list") return listPreview(node);
  if (node.type === "paragraph") return prosePreview(paragraphText(node));
  return null;
}

/** First readable paragraph, or the titles of the opening topic list. */
export function getPagePreview(markdown: string): string | null {
  const tree = parse(markdown);
  if (!tree) return null;

  for (const node of tree.children ?? []) {
    const preview = nodePreview(node);
    if (preview) return preview;
  }
  return null;
}

/** Same as getPagePreview, but scoped to the section headed by `anchor` — the
 * first readable paragraph between that heading and the next one. Links that
 * point at a specific section should preview that section, not the page opener. */
export function getSectionPreview(markdown: string, anchor: string): string | null {
  const tree = parse(markdown);
  if (!tree) return null;

  const nodes = tree.children ?? [];
  const start = nodes.findIndex((node) => headingId(node) === anchor);
  if (start === -1) return null;

  for (let i = start + 1; i < nodes.length; i++) {
    if (headingId(nodes[i])) break;
    const preview = nodePreview(nodes[i]);
    if (preview) return preview;
  }
  return null;
}

/** Generated metadata uses the same Markdown parser as page previews. */
export const getSummaryPreview = getPagePreview;