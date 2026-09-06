import { useEffect, useState, type RefObject } from "react";

/**
 * Whether a scroller holds more than it can show.
 *
 * The fade at the bottom of a list is a promise that there is more below it.
 * A list that fits must not wear one — on two rows the gradient reaches the
 * second row and reads as a rendering fault — so every list that fades asks
 * this first.
 */
export function useOverflow(node: RefObject<HTMLElement | null>, deps: unknown[] = []): boolean {
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = node.current;
    if (!element) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return overflows;
}

/** The fade itself, so every list in the app falls off the same way.
 *
 * The top edge fades too, but far shorter: the bottom fade is a promise of
 * more to come and needs room to read as one, while the top is only saying
 * that a row is passing under the header above it. A top fade as deep as the
 * bottom one would grey out the row the reader is about to click. */
export const FADE_OUT =
  "[mask-image:linear-gradient(to_bottom,black_0,black_calc(100%-40px),transparent_100%)]";

/** Both edges: a short fade in at the top, the full fade out at the bottom. */
export const FADE_BOTH =
  "[mask-image:linear-gradient(to_bottom,transparent_0,black_8px,black_calc(100%-40px),transparent_100%)]";
