import { MarkdownActions } from "@/components/docs/MarkdownActions";
import { BookmarkButton } from "@/components/docs/BookmarkButton";
import type { LibraryEntry } from "@/lib/store/library";
import { PageTitle } from "@/components/docs/PageTitle";

interface PageHeaderProps {
  /** Page name, left exactly as written in the help source. */
  name: string;
  /** Page kind (e.g. "geometry node"), Title Cased for display and given a
   *  lighter visual weight so it reads as a qualifier, not part of the name. */
  nodeType?: string;
  icon?: string;
  since?: string;
  summary?: string;
  /** The page as Markdown, for the copy button. */
  markdown: string;
  /** The page itself, for the bookmark control. */
  entry: Omit<LibraryEntry, "at">;
}

/** Single source of truth for a docs page's header row: icon, name + type,
 *  the "Since" badge, the copy-as-markdown action, and the summary caption. */
export function PageHeader({ name, nodeType, icon, since, summary, markdown, entry }: PageHeaderProps) {
  return (
    <header className="not-prose border-b border-border pb-3 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
          <PageTitle name={name} nodeType={nodeType} icon={icon} />
          {since && (
            <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Since {since}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <BookmarkButton entry={entry} />
          <MarkdownActions markdown={markdown} />
        </div>
        {summary && <p className="w-full basis-full m-0 text-sm italic text-muted-foreground">{summary}</p>}
      </div>
    </header>
  );
}
