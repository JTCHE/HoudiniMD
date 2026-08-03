import { toTitleCase } from "@/lib/markdown/page-title";
import { MarkdownActions } from "@/components/docs/MarkdownActions";

interface PageHeaderProps {
  slug: string;
  /** Page name, left exactly as scraped — never Title Cased. */
  name: string;
  /** Page kind (e.g. "geometry node"), Title Cased for display and given a
   *  lighter visual weight so it reads as a qualifier, not part of the name. */
  nodeType?: string;
  icon?: string;
  since?: string;
  summary?: string;
}

/** Single source of truth for a docs page's header row: icon, name + type,
 *  the "Since" badge, the copy-as-markdown action, and the summary caption. */
export function PageHeader({ slug, name, nodeType, icon, since, summary }: PageHeaderProps) {
  return (
    <header className="not-prose flex flex-wrap items-start justify-between gap-x-8 gap-y-3 border-b border-border pb-3 mb-6">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={icon}
            alt=""
            className="size-8 shrink-0 mt-0.5 select-none"
            aria-hidden="true"
          />
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight leading-tight m-0 wrap-break-word">
            {name}
            {nodeType && <span className="font-extralight text-muted-foreground"> | {toTitleCase(nodeType)}</span>}
          </h1>
          {since && (
            <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Since {since}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 pt-0.5">
        <MarkdownActions slug={slug} />
      </div>
      {summary && <p className="w-full basis-full m-0 text-sm italic text-muted-foreground">{summary}</p>}
    </header>
  );
}
