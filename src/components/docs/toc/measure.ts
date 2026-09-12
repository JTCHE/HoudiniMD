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
 * Distance from the top of the scroller to the first readable line: the
 * page's bar, which stays at the top of the scroller, and the floating pill
 * under it where the pill exists. The title bar sits above the scroller, not
 * over its content, so it needs no offset here.
 */
export function readingLine() {
  // The same measure and breakpoint the gutter list is switched on: the
  // scroller's width, not the window's. Below it the pill is there too.
  const box = scroller();
  const bar = box ? parseFloat(getComputedStyle(box).getPropertyValue("--page-bar-h")) * 16 || 0 : 0;
  return bar + ((box?.clientWidth ?? window.innerWidth) >= 780 ? 24 : 64);
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
export function scrollTopFor(el: HTMLElement, box: HTMLElement) {
  return el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
}

/**
 * The element an anchor names. The page's own `#id:` anchor first: a heading
 * slug made from the text can be the same word as a parameter name (a
 * "Locomotion" folder over a `locomotion` parameter), and F1 asks for the
 * parameter.
 */
export function findAnchor(id: string) {
  return document.querySelector<HTMLElement>(`span[id="${CSS.escape(id)}"]`) ?? document.getElementById(id);
}

/**
 * Put `el` on the first readable line, clear of the page bar and the pill.
 * A jump, not a smooth scroll: the reader asked for that place, and the
 * travel only delays it.
 */
export function jumpTo(el: HTMLElement) {
  const box = scroller();
  if (box) box.scrollTo({ top: scrollTopFor(el, box) - readingLine() });
}

/** Jump to a heading from the list of contents. */
export function scrollToHeading(e: React.MouseEvent, index: number, id: string) {
  const el = headingEls()[index];
  if (!el || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  jumpTo(el);
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
