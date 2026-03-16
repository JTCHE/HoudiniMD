"use client";

import Link from "next/link";
import { SearchButton } from "./SearchButton";
import { useCallback } from "react";
import type { SearchOverlayRef } from "./SearchOverlay";

interface DocsHeaderProps {
  breadcrumbs: string;
  sourceUrl: string;
  searchRef: React.RefObject<SearchOverlayRef>;
}

export function DocsHeader({ breadcrumbs, sourceUrl, searchRef }: DocsHeaderProps) {
  const handleSearchClick = useCallback(() => {
    searchRef.current?.openSearch();
  }, [searchRef]);

  const sideFXLink = (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-foreground transition-colors"
    >
      SideFX ↗
    </a>
  );
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto grid max-w-4xl grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/" className="font-semibold text-foreground hover:opacity-70 transition-opacity">
            VexLLM
          </Link>
          <div className="sm:hidden">{sideFXLink}</div>
        </div>

        <span className="hidden sm:block truncate text-center">{breadcrumbs}</span>

        <div className="flex items-center justify-end gap-3 shrink-0">
          <div className="hidden sm:block">{sideFXLink}</div>
          <SearchButton onOpenSearch={handleSearchClick} />
        </div>
      </div>
    </header>
  );
}
