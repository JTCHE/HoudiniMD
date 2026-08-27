"use client";

import { useRef } from "react";
import SearchOverlay from "./SearchOverlay";
import { DocsHeader } from "./DocsHeader";
import { Footer } from "@/components/Footer";
import { WindDown } from "@/components/root/WindDown";
import type { SearchOverlayRef } from "./SearchOverlay";

interface DocsPageContentProps {
  breadcrumbs: React.ReactNode;
  sourceUrl: string;
  children: React.ReactNode;
}

export function DocsPageContent({ breadcrumbs, sourceUrl, children }: DocsPageContentProps) {
  const searchRef = useRef<SearchOverlayRef>(null) as React.RefObject<SearchOverlayRef>;

  return (
    <div className="docs-shell min-h-screen flex flex-col bg-background text-foreground">
      <SearchOverlay ref={searchRef} />
      <DocsHeader sourceUrl={sourceUrl} searchRef={searchRef} />
      {/* Breadcrumbs sit atop the page title, outside the sticky header — but
          still rendered from layout.tsx (via the `breadcrumbs` prop threaded
          in from DocsLayout) so they persist untouched across a page.tsx
          remount instead of flashing on every navigation. */}
      {/* Above the breadcrumbs, and carrying its own page container, so that
          a dismissed notice leaves NO markup behind. Wrapping it in a div here
          would put an empty div in every prerendered doc page, change 21k
          cached HTML outputs, and make every deploy rewrite the whole R2
          cache. It renders nothing on the server, so the prerendered HTML is
          byte-identical to before. */}
      <WindDown variant="bar" />
      <div className="@container mx-auto w-full max-w-page px-page-x pt-5">{breadcrumbs}</div>
      <div className="flex-1 flex min-w-0 flex-col">{children}</div>
      <Footer />
    </div>
  );
}
