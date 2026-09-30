import { LucideArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { SITE_NAME } from "@/lib/brand";

interface DocsPageContentProps {
  breadcrumbs: React.ReactNode;
  sourceUrl: string;
  children: React.ReactNode;
}

export function DocsPageContent({ breadcrumbs, sourceUrl, children }: DocsPageContentProps) {
  return (
    <div className="docs-shell h-dvh overflow-hidden flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-page justify-between items-center gap-3 px-page-x py-3 text-xs text-muted-foreground">
          <Link
            href="/"
            className="shrink-0 font-semibold text-foreground hover:opacity-70 transition-opacity"
          >
            {SITE_NAME}
          </Link>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors group flex items-center"
          >
            SideFX
            <LucideArrowUpRight
              strokeWidth="1.75"
              className="size-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
            />
          </a>
        </div>
      </header>
      {/* In the layout, not the page, so they stay put across a navigation. */}
      <div className="@container mx-auto w-full max-w-page shrink-0 px-page-x pt-5">{breadcrumbs}</div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      <Footer />
    </div>
  );
}
