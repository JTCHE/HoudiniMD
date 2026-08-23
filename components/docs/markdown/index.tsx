import type { Components } from "react-markdown";
import DocLink from "@/components/docs/DocLink";
import { CodeBlock, CodePanel } from "@/components/docs/CodeBlock";
import { Table, Th, Td } from "./MarkdownTable";
import { Blockquote } from "./MarkdownBlockquote";
import { Code } from "./MarkdownCode";
import { Image, type ImageMetaMap } from "./MarkdownImage";
import { Video } from "./MarkdownVideo";
import { Card } from "./Card";

interface HastLikeNode {
  tagName?: string;
  properties?: { src?: unknown };
  children?: HastLikeNode[];
}

function collectImageSrcs(node: HastLikeNode | undefined): string[] {
  if (!node?.children) return [];
  const srcs: string[] = [];
  for (const child of node.children) {
    if (child.tagName === "img" && typeof child.properties?.src === "string") srcs.push(child.properties.src);
    srcs.push(...collectImageSrcs(child));
  }
  return srcs;
}

/**
 * `.image-group` rows conform to their smallest member (see globals.css) —
 * the shared height comes from the group's own probed images, read straight
 * off the hast node before react-markdown turns it into elements.
 */
export function createDivComponent(metaMap: ImageMetaMap): Components["div"] {
  return function MarkdownDiv({ className, children, node, ...props }) {
    if (className?.split(" ").includes("image-group")) {
      const heights = collectImageSrcs(node as HastLikeNode)
        .map((src) => metaMap.get(src)?.height)
        .filter((h): h is number => typeof h === "number");
      const style = heights.length
        ? ({ "--image-group-height": `${Math.min(...heights)}px` } as React.CSSProperties)
        : undefined;
      return <div className={className} style={style} {...props}>{children}</div>;
    }
    return className?.split(" ").includes("code-panel") ? (
      <CodePanel>
        <div className={className} {...props}>{children}</div>
      </CodePanel>
    ) : (
      <div className={className} {...props}>{children}</div>
    );
  };
}

const Div = createDivComponent(new Map());
/** Single source of truth for how docs markdown renders. */
export const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="not-prose text-2xl font-bold tracking-tight border-b border-border pb-3 mb-6 mt-0">{children}</h1>
  ),
  blockquote: Blockquote,
  div: Div,
  table: Table,
  th: Th,
  td: Td,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: Code,
  img: Image,
  video: Video,
  li: Card,
  figcaption: ({ children }) => <figcaption className="mt-2 px-4 text-left text-sm text-muted-foreground">{children}</figcaption>,
  a: ({ href, children, ...props }) =>
    href ? (
      <DocLink
        href={href}
        {...props}
      >
        {children}
      </DocLink>
    ) : (
      <span {...(props as React.HTMLAttributes<HTMLSpanElement>)}>{children}</span>
    ),
};
