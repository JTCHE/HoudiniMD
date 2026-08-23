import { useEffect, useState } from "react";
import type { Heading } from "@/lib/markdown/headings";

/** Height of the sticky header, published as --header-h by DocsHeader. */
export function headerHeight() {
  return document.querySelector("header")?.getBoundingClientRect().height ?? 56;
}

/**
 * Distance from the top of the viewport to the first readable line: the header,
 * plus the floating pill where it exists. One number for both the jump target
 * and the active-heading test, so a section you jump to is the one the pill
 * then names.
 */
export function readingLine() {
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
export function headingEls() {
  return document.querySelectorAll<HTMLElement>("article :is(h2,h3,h4,h5,h6)[id]");
}

/**
 * Scroll a heading clear of the sticky header.
 *
 * Safari ignores `scroll-margin-top` outside a scroll-snap container, so the
 * CSS offset alone lands the heading under the header on iOS every time. Doing
 * the scroll ourselves is the only offset that holds on every browser.
 */
export function scrollToHeading(e: React.MouseEvent, index: number, id: string) {
  const el = headingEls()[index];
  if (!el || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const y = el.getBoundingClientRect().top + window.scrollY - readingLine();
  window.scrollTo({ top: y, behavior: "smooth" });
  history.replaceState(null, "", `#${id}`);
}

/** Position of the heading the reader is under, or nothing above the first one. */
export function useActiveIndex(headings: Heading[]) {
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
