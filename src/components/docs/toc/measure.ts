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
    const els = [...headingEls()];
    const at = new Map<Element, number>(els.map((el, i) => [el, i]));
    // Read a rect on every scroll and the reader feels it: the index page is
    // ten thousand nodes, and each read made the engine lay them out again.
    // The observer reports a heading only when it crosses the reading line,
    // and reports the rect it had at the crossing, so nothing is measured
    // while the page moves.
    const passed = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // `rootBounds` is the band, so its top IS the reading line.
          if (entry.boundingClientRect.top <= entry.rootBounds!.top) passed.add(entry.target);
          else passed.delete(entry.target);
        }
        let current: number | undefined;
        for (const el of passed) {
          const index = at.get(el)!;
          if (current === undefined || index > current) current = index;
        }
        setActive(current);
      },
      // A band from the reading line to the bottom of the scroller: a heading
      // enters it from below and leaves it at the line, so both crossings are
      // reported. The scroller is the root — the window never moves.
      { root: box, rootMargin: `-${readingLine() + 8}px 0px 0px 0px`, threshold: 0 },
    );
    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, [headings]);

  return active;
}
