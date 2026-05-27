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
    <span className="flex items-center gap-3">
      <a
        href={markdownUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="View as raw Markdown"
        className="hover:text-foreground transition-colors"
      >
        {".md ↗︎"}
      </a>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground transition-colors"
      >
        {"SideFX ↗︎"}
      </a>
    </span>
  );

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto grid max-w-4xl grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/" className="font-semibold text-foreground hover:opacity-70 transition-opacity">
            HoudiniMD
          </Link>
          <div className="sm:hidden">{externalLinks}</div>
        </div>

        <span className="hidden sm:block truncate text-center">{breadcrumbs}</span>

        <div className="flex items-center justify-end gap-3 shrink-0">
          <div className="hidden sm:block">{externalLinks}</div>
          <SearchButton onOpenSearch={handleSearchClick} />
        </div>
      </div>
    </header>
  );
}
