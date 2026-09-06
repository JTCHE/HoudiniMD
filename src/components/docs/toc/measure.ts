import { useEffect, useState } from "react";
import type { Heading } from "@/lib/markdown/headings";

/**
 * The element that actually scrolls. AppShell pins the window at h-dvh with
 * overflow-hidden — the window itself never scrolls — so every scroll
 * position, listener, and jump target in this file has to go through this
 * element, not `window`.
 */
export function scroller() {
  return document.querySelector<HTMLElement>(".docs-shell");
}

/**
 * Distance from the top of the scroller to the first readable line: room for
 * the floating pill where it exists, nothing else. The title bar (the app's
 * `<header>`) sits above the scroller, not over its content, so it needs no
 * offset here — unlike the sticky site header this code was ported from.
 */
export function readingLine() {
  // The same measure the gutter list is switched on: the scroller's width,
  // not the window's.
  const box = scroller();
  return (box?.clientWidth ?? window.innerWidth) >= 1150 ? 24 : 76;
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
 * `el`'s position expressed as a `scroller().scrollTop` value: the scrollTop
 * that would put `el`'s top at `box`'s own top edge. Both rects come from
 * getBoundingClientRect, so they are viewport-relative the same way, and
 * whatever sits above `box` (the title bar) cancels out of the subtraction —
 * no header height to add back in.
 */
function scrollTopFor(el: HTMLElement, box: HTMLElement) {
  return el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
}

/**
 * Scroll a heading clear of the floating pill.
 *
 * Safari ignores `scroll-margin-top` outside a scroll-snap container, so the
 * CSS offset alone lands the heading under the pill on iOS every time. Doing
 * the scroll ourselves is the only offset that holds on every browser.
 */
export function scrollToHeading(e: React.MouseEvent, index: number, id: string) {
  const el = headingEls()[index];
  const box = scroller();
  if (!el || !box || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const y = scrollTopFor(el, box) - readingLine();
  box.scrollTo({ top: y, behavior: "smooth" });
  history.replaceState(null, "", `#${id}`);
}

/** Position of the heading the reader is under, or nothing above the first one. */
export function useActiveIndex(headings: Heading[]) {
  const [active, setActive] = useState<number>();

  useEffect(() => {
    const box = scroller();
    if (!box) return;
    let frame = 0;
    // ponytail: rects on every rAF-throttled scroll. Fine up to a few hundred
    // headings; if a page ever drags, cache the offsets and refresh on resize.
    function update() {
      frame = 0;
      const line = box!.getBoundingClientRect().top + readingLine() + 8;
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
    // The scroller fires the scroll event, not window — the window never
    // moves, so a listener on it never runs and `active` never leaves its
    // initial value.
    box.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      box.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [headings]);

  return active;
}
