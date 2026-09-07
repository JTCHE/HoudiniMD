"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useOverflow } from "@/lib/ui/overflow";
import type { Heading } from "@/lib/markdown/headings";
import { FloatingPill } from "./toc/FloatingPill";
import { scroller, useActiveIndex } from "./toc/measure";
import { TocList } from "./toc/TocList";

// The content column is max-w-page (105 characters at most) and centred, so the list in the
// gutter only appears once that gutter is wide enough to hold it; below that
// the page falls back to the inline list plus the floating pill.
//
// The measure is the READING COLUMN's own width, not the window's. The window
// carries a panel down its left side that the reader can drag or hide, so a
// window-width breakpoint puts the gutter list on a page that has no room for
// it and the article scrolls sideways. Every breakpoint class below is written
// out in full: Tailwind scans source text, so a class assembled from a
// variable at runtime is never generated.

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
  const [floating, setFloating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const active = useActiveIndex(headings);
  // A short list never needs to scroll, but "never" is only true up to
  // rounding: a row's own hit-area padding can leave it a couple of px taller
  // than its text, which tips `scrollHeight` past `clientHeight` on a list
  // that has no real next row. Scrolling is turned on only past that, so a
  // list that fits draws no scrollbar at all.
  const sidebarList = useRef<HTMLElement>(null);
  const sidebarOverflows = useOverflow(sidebarList, [headings]);

  /* The inline list leaving the top of the scroller is what promotes the pill.
     The watch is set by a ref callback, not by an effect: the list is not on
     every page — a page with one heading has none — so the node it watches
     comes and goes, and an effect that ran once at mount would end up watching
     a node that has left the document. That is a pill stuck on a page it was
     never asked for, and a pill that never comes on the next page.

     The root has to be the scroller, not the default (the window): the window
     never scrolls, so against the window the inline list would read as
     permanently visible and the pill would never show. */
  const watch = useRef<IntersectionObserver | null>(null);
  const inline = useCallback((el: HTMLElement | null) => {
    watch.current?.disconnect();
    watch.current = null;
    const root = scroller();
    if (!el || !root) {
      setFloating(false);
      return;
    }
    watch.current = new IntersectionObserver(([entry]) => setFloating(!entry.isIntersecting), {
      root,
    });
    watch.current.observe(el);
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
      {/* Wide screens: the list rides along in the gutter beside the article.
          It hangs off the RIGHT EDGE OF THE COLUMN, not off the middle of the
          window: the window has a panel down its left side, so a list placed
          against the window centres itself over the reading column and lands
          on the page's own header. */}
      <div className="not-prose print:hidden hidden @min-[920px]:block absolute top-0 left-full ml-lg h-full w-52">
        <nav
          ref={sidebarList}
          aria-label="On this page"
          className={cn(
            "sticky top-24 max-h-[calc(100dvh-8rem)]",
            sidebarOverflows ? "thin-scroll overflow-y-auto" : "overflow-hidden",
          )}
        >
          {title}
          <TocList headings={headings} top={top} active={active} density="tight" />
        </nav>
      </div>

      {/* Narrow screens: the inline list, with rows a thumb can hit. The clip
          starts high on a long list so the fold costs less of the screen.
          It carries no bottom margin: the first heading under it already has
          the space every heading has, and a margin here would add a second
          gap on top of it. */}
      <nav ref={inline} aria-label="On this page" className="not-prose print:hidden @min-[920px]:hidden -mt-2">
        {title}
        <div className={collapsed ? "relative max-h-40 overflow-hidden" : undefined}>
          <TocList headings={headings} top={top} active={active} />
          {collapsed && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-b from-transparent to-background" />
          )}
        </div>
        {headings.length > LONG && (
          <button
            type="button"
            onClick={(() => setExpanded((v) => !v))}
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
