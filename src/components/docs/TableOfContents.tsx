"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Heading } from "@/lib/markdown/headings";
import { FloatingPill } from "./toc/FloatingPill";
import { headerHeight, useActiveIndex } from "./toc/measure";
import { TocList } from "./toc/TocList";

// The content column is max-w-page (56rem) and centred, so the sidebar only
// appears once the right gutter is wide enough to hold it — below 1400px the
// page falls back to the inline list plus the floating pill. Every breakpoint
// class below is written out in full: Tailwind scans source text, so a class
// assembled from a variable at runtime is never generated.

/** Rows the inline list shows before it clips itself behind a "Show all". */
const LONG = 5;

/*
 * Three views of the same list (TocList renders all of them):
 *  - a sidebar in the right gutter, on wide screens;
 *  - otherwise an inline list under the page header;
 *  - which hands over to a floating pill (FloatingPill), top left, once it
 *    scrolls away.
 */
export function TableOfContents({ headings }: { headings: Heading[] }) {
  const inline = useRef<HTMLElement>(null);
  const [floating, setFloating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const active = useActiveIndex(headings);

  // The inline list leaving the top of the viewport is what promotes the pill.
  useEffect(() => {
    const el = inline.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setFloating(!entry.isIntersecting), {
      rootMargin: `-${headerHeight()}px 0px`,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (headings.length < 2) return null;

  // Depth is relative to the shallowest heading on the page: a page whose
  // sections are all h3 must not render as one long indent.
  const top = Math.min(...headings.map((h) => h.level));
  // Past this many rows the inline list pushes the article off the screen, so
  // it opens clipped with the rest a tap away. Only the inline view: the
  // sidebar and the pill's panel scroll instead.
  const collapsed = headings.length > LONG && !expanded;
  const title = <p className="mb-2 text-sm font-medium text-foreground">On this page</p>;

  return (
    <>
      {/* Wide screens: the list rides along in the right gutter. Fixed rather
          than a real column, so the article keeps its own centred measure. */}
      <nav
        aria-label="On this page"
        className="not-prose print:hidden hidden min-[1400px]:block fixed top-24 left-[calc(50%+28rem+1.5rem)] w-52 max-h-[calc(100dvh-8rem)] overflow-y-auto"
      >
        {title}
        <TocList headings={headings} top={top} active={active} density="tight" />
      </nav>

      {/* Narrow screens: the inline list, with rows a thumb can hit. The clip
          starts high on a long list so the fold costs less of the screen. */}
      <nav ref={inline} aria-label="On this page" className="not-prose print:hidden min-[1400px]:hidden mb-8 -mt-2">
        {title}
        <div className={collapsed ? "relative max-h-56 overflow-hidden" : undefined}>
          <TocList headings={headings} top={top} active={active} />
          {collapsed && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent to-background" />
          )}
        </div>
        {headings.length > LONG && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {expanded ? "Show less" : "Show all"}
            <ChevronDown
              className={`size-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </button>
        )}
      </nav>

      <FloatingPill headings={headings} top={top} active={active} floating={floating} />
    </>
  );
}
