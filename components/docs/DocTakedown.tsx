import { LucideArrowUpRight } from "lucide-react";
import { PageTitle } from "@/components/docs/PageTitle";
import { DownloadKey, OpenInApp } from "@/components/ui/download-key";
import { APP_SCHEME, SITE_NAME } from "@/lib/brand";

/** Static grey bars in the shape of a doc page. No shimmer: nothing is loading. */
const BARS: { w: string; h?: string; gap?: string }[] = [
  { w: "w-28", h: "h-3.5" },
  { w: "w-40", h: "h-3.5" },
  { w: "w-32", h: "h-3.5" },
  { w: "w-44", h: "h-3.5", gap: "mb-10" },
  { w: "w-1/3", h: "h-6", gap: "mb-5" },
  { w: "w-full" },
  { w: "w-[94%]" },
  { w: "w-4/5" },
];

/**
 * The page's shape, fading out. It is the part that gives way: it shrinks
 * before anything else, so the notice under it stays on a phone's first screen.
 */
function Skeleton() {
  return (
    <div
      aria-hidden="true"
      className="max-h-48 min-h-0 shrink overflow-hidden mask-b-from-0% mask-b-to-100%"
    >
      <div className="space-y-3">
        {BARS.map((bar, i) => (
          <div
            key={i}
            className={`bg-muted ${bar.h ?? "h-4"} ${bar.w} ${bar.gap ?? ""} rounded-sm`}
          />
        ))}
      </div>
    </div>
  );
}

/** The app first, the reason second. */
export function TakedownNotice({ slug, sourceUrl }: { slug: string; sourceUrl: string }) {
  return (
    <section className="flex shrink-0 flex-col items-start gap-md">
      <div className="flex flex-col gap-2xs">
        <p className="text-muted-foreground">This page is no longer available here.</p>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Read this page in {SITE_NAME}, the free desktop app.
        </h2>
        <p className="text-lede text-muted-foreground">
          It reads the docs that come with your own Houdini install. Instant, and offline.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-md gap-y-sm">
        <DownloadKey />
        <OpenInApp href={`${APP_SCHEME}://docs/${slug}`} />
      </div>
      <p className="text-meta text-muted-foreground">
        At the request of SideFX, its documentation is no longer hosted on this site.{" "}
        <a
          href={sourceUrl}
          className="group inline-flex items-center text-foreground/80 hover:text-foreground transition-colors"
        >
          Read it on sidefx.com
          <LucideArrowUpRight
            strokeWidth="1.75"
            className="size-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
          />
        </a>
      </p>
    </section>
  );
}

export function DocTakedown({
  slug,
  name,
  nodeType,
  sourceUrl,
}: {
  slug: string;
  name: string;
  nodeType?: string;
  sourceUrl: string;
}) {
  return (
    <main className="mx-auto flex min-h-0 w-full min-w-0 max-w-page flex-1 flex-col gap-lg px-page-x pt-6 pb-lg md:pt-10">
      <header className="shrink-0 border-b border-border pb-3">
        <PageTitle
          name={name}
          nodeType={nodeType}
        />
      </header>
      <Skeleton />
      <TakedownNotice
        slug={slug}
        sourceUrl={sourceUrl}
      />
    </main>
  );
}
