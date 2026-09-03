import { FileText } from "lucide-react";
import DocLink from "./DocLink";
import DocIconClient from "./markdown/DocIconClient";
import { usePageMeta } from "./Tooltip";

/**
 * A link that stands on its own — a row of related pages, not a word inside a
 * sentence — drawn as a pill instead of underlined text.
 *
 * The surface is the one the floating table of contents uses: page background,
 * a border for structure, and the accent on hover. Every pill carries an icon,
 * so a row of them reads as a row: the page's own icon when it names one, and a
 * document mark when it does not.
 */
export function DocPill({ href, children }: { href: string; children: React.ReactNode }) {
  const external = /^[a-z]+:/i.test(href);
  const slug = external ? null : href.replace(/^\/+/, "").split("#")[0];
  const meta = usePageMeta(slug);

  return (
    <DocLink
      href={href}
      underline={false}
      className="doc-pill"
    >
      {meta?.icon ? (
        <DocIconClient
          src={meta.icon}
          alt=""
          className="doc-icon shrink-0"
        />
      ) : (
        <FileText
          className="size-[1em] shrink-0 text-muted-foreground"
          aria-hidden="true"
          strokeWidth={1.5}
        />
      )}
      <span className="truncate">{meta?.title ?? children}</span>
    </DocLink>
  );
}
