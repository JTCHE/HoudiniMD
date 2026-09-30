"use client";

import { DocsHeader } from "./DocsHeader";
import { Footer } from "@/components/Footer";

interface DocsPageContentProps {
  breadcrumbs: React.ReactNode;
  sourceUrl: string;
  children: React.ReactNode;
}

export function DocsPageContent({ breadcrumbs, sourceUrl, children }: DocsPageContentProps) {
  return (
    <div className="docs-shell h-dvh overflow-hidden flex flex-col bg-background text-foreground">
      <DocsHeader sourceUrl={sourceUrl} />
      {/* Breadcrumbs sit atop the page title, outside the sticky header — but
          still rendered from layout.tsx (via the `breadcrumbs` prop threaded
          in from DocsLayout) so they persist untouched across a page.tsx
          remount instead of flashing on every navigation. */}
      <div className="@container mx-auto w-full max-w-page shrink-0 px-page-x pt-5">{breadcrumbs}</div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      <Footer />
    </div>
  );
}
