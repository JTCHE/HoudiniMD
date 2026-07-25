"use client";

import Link from "next/link";
import { SearchButton } from "./SearchButton";
import { useCallback } from "react";
import type { SearchOverlayRef } from "./SearchOverlay";

interface DocsHeaderProps {
  breadcrumbs: React.ReactNode;
  sourceUrl: string;
  markdownUrl: string;
  searchRef: React.RefObject<SearchOverlayRef>;
}

export function DocsHeader({ breadcrumbs, sourceUrl, markdownUrl, searchRef }: DocsHeaderProps) {
  const handleSearchClick = useCallback(() => {
    searchRef.current?.openSearch();
  }, [searchRef]);

  // Two "alternate view" links — same pattern, sibling treatment.
  // .md goes first as the canonical/internal representation; SideFX is the
  // upstream source. Both new-tab so the reader doesn't lose their place.
  const externalLinks = (
    <span className="flex items-center gap-3 print:hidden">
      <a
        href={markdownUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="View as raw Markdown"
        className="hover:text-foreground transition-colors"
      >
        .md ↗︎
      </a>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground transition-colors"
      >
        SideFX ↗︎
      </a>
    </span>
  );

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:static print:bg-background">
      <div className="mx-auto grid max-w-4xl grid-cols-[auto_1fr_auto] items-center gap-2 px-page-x py-3 text-xs text-muted-foreground">
        <Link
          href="/"
          className="shrink-0 font-semibold text-foreground hover:opacity-70 transition-opacity"
        >
          HoudiniMD
        </Link>

        <span className="@container min-w-0 truncate text-left before:content-['·'] before:mr-2 before:text-muted-foreground/30 max-sm:before:content-none ">
          {breadcrumbs}
        </span>

        <div className="flex items-center justify-end gap-2 sm:gap-3 shrink-0 print:hidden">
          {externalLinks}
          <SearchButton onOpenSearch={handleSearchClick} />
        </div>
      </div>
    </header>
  );
}
