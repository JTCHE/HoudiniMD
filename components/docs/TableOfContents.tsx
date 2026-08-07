"use client";

import { ChevronDown, List } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Heading } from "@/lib/markdown/headings";

// The content column is max-w-page (56rem) and centred, so the sidebar only
// appears once the right gutter is wide enough to hold it — below 1400px the
// page falls back to the inline list plus the floating pill. Every breakpoint
// class below is written out in full: Tailwind scans source text, so a class
// assembled from a variable at runtime is never generated.

/** Height of the sticky header, published as --header-h by DocsHeader. */
function headerHeight() {
  return document.querySelector("header")?.getBoundingClientRect().height ?? 56;
}

/*
 * No frosted glass here, on purpose. In WebKit a backdrop-filter over scrolled
 * content samples a stale backdrop and composites it ON TOP of the page text —
 * verified in WebKit against fixed, sticky, an inner blur layer, and a
 * separately composited page; all four smear, an opaque surface is clean.
 * `node scripts/shot.ts <slug>` reproduces it.
 */

/**
 * Distance from the top of the viewport to the first readable line: the header,
 * plus the floating pill where it exists. One number for both the jump target
 * and the active-heading test, so a section you jump to is the one the pill
 * then names.
 */
function readingLine() {
  const pill = window.matchMedia("(min-width: 1400px)").matches ? 24 : 76;
  return headerHeight() + pill;
}

/**
 * The headings themselves, in document order — index-aligned with what
 * extractHeadings returned (a unit test locks that pairing).
 *
 * Addressed by position, never by id: SideFX ships pages carrying the same
 * anchor id on several headings ("Control settings" under Disturbance,
 * Shredding and Turbulence), and getElementById only ever finds the first, so
 * an id is neither a unique key nor a usable handle here.
 */
/** Rows the inline list shows before it clips itself behind a "Show all". */
const LONG = 5;

function headingEls() {
  return document.querySelectorAll<HTMLElement>("article :is(h2,h3,h4,h5,h6)[id]");
}

/**
 * Scroll a heading clear of the sticky header.
 *
 * Safari ignores `scroll-margin-top` outside a scroll-snap container, so the
 * CSS offset alone lands the heading under the header on iOS every time. Doing
 * the scroll ourselves is the only offset that holds on every browser.
 */
function scrollToHeading(e: React.MouseEvent, index: number, id: string) {
  const el = headingEls()[index];
  if (!el || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const y = el.getBoundingClientRect().top + window.scrollY - readingLine();
  window.scrollTo({ top: y, behavior: "smooth" });
  history.replaceState(null, "", `#${id}`);
}

interface ListProps {
  headings: Heading[];
  /** Level of the shallowest heading on the page — depth 0 is measured from it. */
  top: number;
  /** Position of the active heading, not its id — ids repeat. */
  active?: number;
  /**
   * "touch" gives every row a finger-sized hit area, for the views a phone
   * uses; "tight" is for the pointer-driven sidebar.
   */
  density?: "touch" | "tight";
  /** Rounded hover surface, for the rows inside the pill's panel. */
  padded?: boolean;
  onNavigate?: () => void;
}

/**
 * The list itself — one renderer behind the inline list, the sidebar and the
 * pill's panel, so a change to the shape of the TOC lands in all three.
 *
 * Spacing carries the hierarchy: sub-headings sit tight under the section they
 * belong to, and a small gap opens before each new top-level section.
 */
function TocList({ headings, top, active, density = "touch", padded = false, onNavigate }: ListProps) {
  const touch = density === "touch";

  return (
    <>
      {headings.map((h, i) => {
        const depth = Math.min(h.level - top, 3);
        const startsSection = depth === 0 && i > 0;
        return (
          <a
            key={`${h.id}-${i}`}
            href={`#${h.id}`}
            onClick={(e) => {
              scrollToHeading(e, i, h.id);
              onNavigate?.();
            }}
            aria-current={active === i ? "location" : undefined}
            // Indent is data, and it has to beat the horizontal padding below.
            style={{ paddingLeft: `${(padded ? 0.625 : 0) + depth * 0.75}rem` }}
            className={`block no-underline leading-snug transition-colors ${
              padded ? "truncate rounded-xl pr-2.5 hover:bg-accent/70" : ""
            } ${depth === 0 ? "text-sm" : "text-[0.8125rem]"} ${touch ? "py-1" : "py-0.5"} ${startsSection ? "mt-1" : ""} ${
              active === i ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {h.text}
          </a>
        );
      })}
    </>
  );
}

/** Position of the heading the reader is under, or nothing above the first one. */
function useActiveIndex(headings: Heading[]) {
  const [active, setActive] = useState<number>();

  useEffect(() => {
    let frame = 0;
    // ponytail: rects on every rAF-throttled scroll. Fine up to a few hundred
    // headings; if a page ever drags, cache the offsets and refresh on resize.
    function update() {
      frame = 0;
      const line = readingLine() + 8;
      let current: number | undefined;
      // A heading counts once it reaches the first readable line. Nothing is
      // active while the reader is still above the first one.
      headingEls().forEach((el, i) => {
        if (el.getBoundingClientRect().top <= line) current = i;
      });
      setActive(current);
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [headings]);

  return active;
}

/**
 * Three views of the same list:
 *  - a sidebar in the right gutter, on wide screens;
 *  - otherwise an inline list under the page header;
 *  - which hands over to a floating pill, top left, once it scrolls away.
 */
export function TableOfContents({ headings }: { headings: Heading[] }) {
  const inline = useRef<HTMLElement>(null);
  const floater = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const active = useActiveIndex(headings);

  // The inline list leaving the top of the viewport is what promotes the pill.
  useEffect(() => {
    const el = inline.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // Back at the inline list: the pill goes away, and so does its panel.
        setFloating(!entry.isIntersecting);
        if (entry.isIntersecting) setOpen(false);
      },
      // px only — IntersectionObserver takes no rem.
      { rootMargin: `-${headerHeight()}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!floater.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Open onto the section you are reading: on a long page the active row is
  // usually far below the fold. scrollTop rather than scrollIntoView, which
  // scrolls the ancestors too and would drag the article out from under you.
  useEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    const row = el.querySelector<HTMLElement>("[aria-current]");
    // Rows are static children of an absolutely positioned panel, so offsetTop
    // is already measured against it.
    if (row) el.scrollTop = row.offsetTop - el.clientHeight / 2 + row.offsetHeight / 2;
  }, [open, active]);

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
        <TocList
          headings={headings}
          top={top}
          active={active}
          density="tight"
        />
      </nav>

      {/* Narrow screens: the inline list, with rows a thumb can hit. */}
      <nav
        ref={inline}
        aria-label="On this page"
        className="not-prose print:hidden min-[1400px]:hidden mb-8 -mt-2"
      >
        {title}
        <div className={collapsed ? "relative max-h-64 overflow-hidden" : undefined}>
          <TocList
            headings={headings}
            top={top}
            active={active}
          />
          {collapsed && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-b from-transparent to-background" />
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

      {/* Top left, right where the headings themselves scroll past. `top` is an
          inline style, not a Tailwind arbitrary value: the comma inside the
          var() fallback stops that class from ever being generated, which left
          the pill at its static position halfway down the page. */}
      <div
        ref={floater}
        style={{ top: "calc(var(--header-h, 3.5rem) + 0.75rem)" }}
        className={`print:hidden min-[1400px]:hidden fixed inset-x-0 z-20 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
          floating ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="mx-auto flex max-w-page px-page-x">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label="Table of contents"
              className="relative inline-flex max-w-[min(20rem,calc(100vw-3rem))] items-center gap-2 h-10 pl-3.5 pr-3 text-sm font-medium text-foreground bg-background border border-border rounded-full shadow-lg shadow-black/10 transition-colors hover:bg-accent active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer"
            >
              <List className="size-4 shrink-0 text-muted-foreground" />
              {/* Keyed on the section, so each new title animates in on its own. */}
              <span
                key={active ?? "none"}
                className="toc-label truncate"
              >
                {(active === undefined ? undefined : headings[active]?.text) ?? "On this page"}
              </span>
              <ChevronDown
                className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>

            <div
              ref={panel}
              // svh, not vh or dvh: 100vh on iOS means the viewport with the
              // address bar hidden, so a panel sized against it runs off the
              // bottom of the screen under Safari's bottom bar. svh is the
              // smallest state — the panel fits with every bar on screen.
              style={{ maxHeight: "calc(100svh - var(--header-h, 3.5rem) - 6rem)" }}
              className={`absolute left-0 top-full mt-2 w-[min(20rem,calc(100vw-3rem))] overflow-y-auto overscroll-contain border border-border bg-background rounded-2xl shadow-xl shadow-black/20 p-1.5 origin-top-left transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
                open ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-[0.98]"
              }`}
            >
              <TocList
                headings={headings}
                top={top}
                active={active}
                padded
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
