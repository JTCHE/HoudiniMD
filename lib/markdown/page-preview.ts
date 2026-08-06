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

  return prosePreview(nodeText(paragraphs[0]), list.ordered ? "1. " : "");
}

function parse(markdown: string): MarkdownNode | null {
  try {
    const content = markdown
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
      .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>\s*/gi, "");
    return unified().use(remarkParse).use(remarkGfm).parse(content) as MarkdownNode;
  } catch {
    return null;
  }
}

/** First readable paragraph, or the titles of the opening topic list. */
export function getPagePreview(markdown: string): string | null {
  const tree = parse(markdown);
  if (!tree) return null;

  for (const node of tree.children ?? []) {
    if (node.type === "heading" || node.type === "html" || node.type === "table" || node.type === "image") continue;
    if (node.type === "list") {
      const preview = listPreview(node);
      if (preview) return preview;
      continue;
    }
    if (node.type === "paragraph") {
      const preview = prosePreview(nodeText(node));
      if (preview) return preview;
    }
  }
  return null;
}

/** Generated metadata uses the same Markdown parser as page previews. */
export const getSummaryPreview = getPagePreview;