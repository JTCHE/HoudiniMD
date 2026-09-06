import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FADE_BOTH, FADE_OUT } from "@/lib/ui/overflow";

/**
 * A long list that only draws the rows on screen.
 *
 * A node context holds twelve hundred pages. Drawing them all costs a second
 * of layout on the click that opens the context, and every scroll after that
 * pays for the rows nobody is looking at. Only the visible slice is in the
 * DOM; the rest is one spacer of the right height, so the scrollbar still
 * says how long the list is.
 *
 * Every row must be exactly `rowHeight` tall. That is the price of not
 * measuring, and it is the same price the panel already pays for having one
 * row height.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  children,
  className,
  style,
  overscan = 8,
  reveal,
  onTop,
}: {
  items: T[];
  rowHeight: number;
  children: (item: T, at: number) => React.ReactNode;
  className?: string;
  /** A caller that wants the list to be as tall as its content — and to
      shrink, not to stretch — states that height here. */
  style?: React.CSSProperties;
  overscan?: number;
  /** Told the scroll position on every frame it moves, so a caller can pin a
      header over the rows that have gone under it. */
  onTop?: (top: number) => void;
  /** A row the list must bring into view — the page the reader just opened
      from somewhere else. Only moves the list when the row is off screen, so
      a row already visible is not dragged under the pointer. */
  reveal?: number;
}) {
  const node = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = node.current;
    if (!element) return;
    const measure = () => setHeight(element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The list is re-windowed on the frame, not on the event: a fast wheel
  // fires scroll far more often than the screen refreshes.
  const frame = useRef(0);
  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const at = node.current?.scrollTop ?? 0;
      setTop(at);
      onTop?.(at);
    });
  }, []);

  useEffect(() => {
    const element = node.current;
    if (!element || reveal === undefined || reveal < 0) return;
    const top = reveal * rowHeight;
    const box = element.clientHeight;
    if (top >= element.scrollTop && top + rowHeight <= element.scrollTop + box) return;
    // Centred, not flush against an edge: the rows around it are what say
    // where in the list the reader landed.
    element.scrollTop = Math.max(0, top - box / 2 + rowHeight / 2);
  }, [reveal, rowHeight]);

  const total = items.length * rowHeight;
  const first = Math.max(0, Math.floor(top / rowHeight) - overscan);
  const shown = Math.ceil(height / rowHeight) + overscan * 2;
  const slice = items.slice(first, first + shown);
  // The fade says there is more below. A list that fits must not wear one.
  const overflows = total > height + 1;

  return (
    <div
      ref={node}
      onScroll={onScroll}
      style={style}
      data-list=""
      className={cn(
        "thin-scroll min-h-0 overflow-y-auto",
        // The top edge only fades once something has gone under it.
        overflows && (top > 0 ? FADE_BOTH : FADE_OUT),
        className,
      )}
    >
      {/* The spacer holds the scroll length; the slice rides on top of it.
          The last row clears the fade, so nothing is ever read through it. */}
      <div style={{ height: total + (overflows ? 32 : 0) }} className="relative">
        <div style={{ transform: `translateY(${first * rowHeight}px)` }}>
          {slice.map((item, at) => children(item, first + at))}
        </div>
      </div>
    </div>
  );
}
