import { useRef } from "react";
import { cn } from "@/lib/utils";
import { FADE_OUT, useOverflow } from "@/lib/ui/overflow";

/**
 * A list that scrolls inside its own box and falls off at the bottom edge.
 *
 * Every long list in the window is this: the tree, the recents, the library
 * panel. A list is never cut across a row — it fades, which says there is more
 * below — and it never fades when the last row is already on screen, which
 * would say the same thing and be a lie.
 */
export function FadeList({
  children,
  className,
  deps = [],
}: {
  children: React.ReactNode;
  className?: string;
  /** What changes the length of the list, so the fade is measured again. */
  deps?: unknown[];
}) {
  const node = useRef<HTMLDivElement>(null);
  const overflows = useOverflow(node, [children, ...deps]);

  return (
    <div
      ref={node}
      // The mark says "this scroller is a list". A page of prose scrolls too,
      // and must NOT fade; the design harness reads this to tell them apart.
      data-list=""
      className={cn(
        "thin-scroll flex min-h-0 flex-col overflow-y-auto",
        // The last row has to clear the fade, or the reader can never read it.
        overflows && `${FADE_OUT} pb-lg`,
        className,
      )}
    >
      {children}
    </div>
  );
}
