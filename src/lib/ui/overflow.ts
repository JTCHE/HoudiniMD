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
    // A row's hit-area padding and its cancelling negative margin round to
    // the pixel independently, which can leave a list a couple of px taller
    // than its box with no extra row behind it. 4px clears that without
    // hiding a real one, which is always at least one row's worth more.
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 4);
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

/** The mirror of `FADE_OUT`, for a list that reads newest-at-the-bottom (the
    Recents trail): the promise of more is now above, so the full fade sits at
    the TOP and the bottom, where the newest row already sits flush, gets none. */
export const FADE_IN =
  "[mask-image:linear-gradient(to_top,black_0,black_calc(100%-40px),transparent_100%)]";
