import DocLink from "@/components/docs/DocLink";
import DocIconClient from "./DocIconClient";

type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function text(node: HastNode): string {
  return node.type === "text" ? node.value ?? "" : node.children?.map(text).join("") ?? "";
}

export function Card({ node, children, ...props }: React.ComponentProps<"li"> & { node?: HastNode }) {
  if (!node?.properties?.dataCard) return <li {...props}>{children}</li>;

  const [title, summary] = node.children?.filter((child) => child.tagName === "p") ?? [];
  const link = title?.children?.find((child) => child.tagName === "a");
  const icon = title?.children?.find((child) => child.tagName === "img");
  const href = typeof link?.properties?.href === "string" ? link.properties.href : undefined;

  return (
    <li {...props}>
      <p>
        {typeof icon?.properties?.src === "string" && <DocIconClient src={icon.properties.src} alt="" />}
        {href ? <DocLink href={href} underline={false}>{text(link!)}</DocLink> : text(title!)}
      </p>
      {summary && <p>{text(summary)}</p>}
    </li>
  );
}