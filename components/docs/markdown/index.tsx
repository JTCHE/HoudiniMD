import type { Components } from "react-markdown";
import DocLink from "@/components/docs/DocLink";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { Table, Th, Td } from "./MarkdownTable";
import { Blockquote } from "./MarkdownBlockquote";
import { Code } from "./MarkdownCode";
import { Image } from "./MarkdownImage";
import { Video } from "./MarkdownVideo";
import { Card } from "./Card";

/** Single source of truth for how docs markdown renders. */
export const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="not-prose text-2xl font-bold tracking-tight border-b border-border pb-3 mb-6 mt-0">{children}</h1>
  ),
  blockquote: Blockquote,
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
