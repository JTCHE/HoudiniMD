import { MarkdownActions } from "@/components/docs/MarkdownActions";
import { PageTitle } from "@/components/docs/PageTitle";
import DocImageClient from "@/components/docs/markdown/DocImageClient";
import type { ImageDimensions } from "@/lib/images/dimensions";

interface PageHeaderProps {
  slug: string;
  /** Page name, left exactly as scraped — never Title Cased. */
  name: string;
  /** Page kind (e.g. "geometry node"), Title Cased for display and given a
   *  lighter visual weight so it reads as a qualifier, not part of the name. */
  nodeType?: string;
  icon?: string;
  iconDimensions?: ImageDimensions;
  since?: string;
  summary?: string;
  /** Top banner image scraped from the source page's `.billboard` (index/listicle pages only). */
  banner?: string;
  bannerDimensions?: ImageDimensions;
}

/** Single source of truth for a docs page's header row: banner, icon, name + type,
 *  the "Since" badge, the copy-as-markdown action, and the summary caption. */
export function PageHeader({
  slug,
  name,
  nodeType,
  icon,
  iconDimensions,
  since,
  summary,
  banner,
  bannerDimensions,
}: PageHeaderProps) {
  return (
    <header className="not-prose border-b border-border pb-3 mb-6">
      {banner && bannerDimensions && (
        <DocImageClient
          src={banner}
          alt=""
          width={bannerDimensions.width}
          height={600}
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
          <PageTitle
            name={name}
            nodeType={nodeType}
            icon={icon}
            iconDimensions={iconDimensions}
          />
          {since && (
            <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Since {since}
            </span>
          )}
        </div>
        <div className="shrink-0 pt-0.5">
          <MarkdownActions slug={slug} />
        </div>
        {summary && <p className="w-full basis-full m-0 text-sm italic text-muted-foreground">{summary}</p>}
      </div>
    </header>
  );
}
