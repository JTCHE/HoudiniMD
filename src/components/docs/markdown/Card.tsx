import DocLink from "@/components/docs/DocLink";
import { DocPill } from "@/components/docs/DocPill";
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

/** A "Related" row: the item holds links and nothing else but the dashes the
    help source puts between them. */
function standaloneLinks(node: HastNode): HastNode[] | null {
  const body = node.children?.length === 1 && node.children[0].tagName === "p" ? node.children[0] : node;
  const parts = body.children ?? [];
  const links = parts.filter((child) => child.tagName === "a" && typeof child.properties?.href === "string");
  if (!links.length) return null;
  const rest = parts.filter((child) => !links.includes(child));
  // Anything that is not a link has to be a separator, or this is prose.
  if (rest.some((child) => child.type !== "text" || /[^\s\-–•,]/.test(child.value ?? ""))) return null;
  return links;
}

export function Card({ node, children, ...props }: React.ComponentProps<"li"> & { node?: HastNode }) {
  if (!node?.properties?.dataCard) {
    const links = node ? standaloneLinks(node) : null;
    if (links) {
      return (
        <li {...props} className="doc-pill-row">
          {links.map((link, i) => (
            <DocPill
              key={`${String(link.properties!.href)}-${i}`}
              href={String(link.properties!.href)}
            >
              {text(link)}
            </DocPill>
          ))}
        </li>
      );
    }
    return <li {...props}>{children}</li>;
  }

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
