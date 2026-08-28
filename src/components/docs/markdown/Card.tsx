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
  return node.type === "text" ? (node.value ?? "") : (node.children?.map(text).join("") ?? "");
}

export function Card({ node, children, ...props }: React.ComponentProps<"li"> & { node?: HastNode }) {
  if (!node?.properties?.dataCard) return <li {...props}>{children}</li>;

  // A single-item card grid with no description parses as a "tight" list
  // (CommonMark only wraps item content in <p> when a blank line separates
  // blocks), so the link/icon land directly under <li> instead of under a
  // <p>. Fall back to the li itself as the title source in that case.
  const paragraphs = node.children?.filter((child) => child.tagName === "p") ?? [];
  const [title, summary] = paragraphs.length ? paragraphs : [node];
  const link = title?.children?.find((child) => child.tagName === "a");
  const icon =
    link?.children?.find((child) => child.tagName === "img") ?? title?.children?.find((child) => child.tagName === "img");
  const href = typeof link?.properties?.href === "string" ? link.properties.href : undefined;
  const summaryText = summary && text(summary);

  return (
    <li {...props}>
      <p>
        {href ? (
          <DocLink
            href={href}
            underline={false}
          >
            {typeof icon?.properties?.src === "string" && (
              <DocIconClient
                src={icon.properties.src}
                alt=""
              />
            )}
            {text(link!)}
          </DocLink>
        ) : (
          <>
            {typeof icon?.properties?.src === "string" && (
              <DocIconClient
                src={icon.properties.src}
                alt=""
              />
            )}
            {text(title!)}
          </>
        )}
      </p>
      {summaryText && /[a-z]/i.test(summaryText) && <p>{summaryText}</p>}
    </li>
  );
}
