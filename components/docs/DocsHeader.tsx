"use client";

import { LucideArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { HeaderSearchButton } from "./HeaderSearchButton";
import type { SearchOverlayRef } from "./SearchOverlay";

interface DocsHeaderProps {
  sourceUrl: string;
  searchRef: React.RefObject<SearchOverlayRef>;
}

export function DocsHeader({ sourceUrl, searchRef }: DocsHeaderProps) {
  const header = useRef<HTMLElement>(null);

  const handleSearchClick = useCallback(() => {
    searchRef.current?.openSearch();
  }, [searchRef]);

  // Publish the real header height. Anchor targets clear it via --header-h
  // (globals.css) — it changes with the font and the device, so no rem
  // constant can stand in for measuring it.
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty("--header-h", `${entry.contentRect.height}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const externalLinks = (
    <span className="flex items-center gap-3 print:hidden">
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
    </span>
  );

  return (
    <header
      ref={header}
      className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:static print:bg-background"
    >
      <div className="mx-auto grid max-w-page grid-cols-[auto_1fr_auto] items-center gap-3 px-page-x py-3 text-xs text-muted-foreground">
        <Link
          href="/"
          className="shrink-0 font-semibold text-foreground hover:opacity-70 transition-opacity"
        >
          HoudiniMD
        </Link>

        <div className="flex justify-center">
          <HeaderSearchButton onOpenSearch={handleSearchClick} />
        </div>

        <div className="flex items-center justify-end gap-3 shrink-0 print:hidden">{externalLinks}</div>
      </div>
    </header>
  );
}
