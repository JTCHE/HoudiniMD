"use client";

import { useRef } from "react";
import SearchOverlay from "./SearchOverlay";
import { DocsHeader } from "./DocsHeader";
import type { SearchOverlayRef } from "./SearchOverlay";

interface DocsPageContentProps {
  breadcrumbs: React.ReactNode;
  sourceUrl: string;
  markdownUrl: string;
  children: React.ReactNode;
}

export function DocsPageContent({ breadcrumbs, sourceUrl, markdownUrl, children }: DocsPageContentProps) {
  const searchRef = useRef<SearchOverlayRef>(null) as React.RefObject<SearchOverlayRef>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SearchOverlay ref={searchRef} />
      <DocsHeader
        breadcrumbs={breadcrumbs}
        sourceUrl={sourceUrl}
        markdownUrl={markdownUrl}
        searchRef={searchRef}
      />
      {children}
    </div>
  );
}
