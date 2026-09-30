"use client";

import { useEffect, useRef, useState } from "react";
import { TABS } from "@/components/landing/showcase/tabs";
import { cn } from "@/lib/utils";

/** The row under the frame: play or pause, then the tabs. */
export function Controls({
  active,
  paused,
  waiting,
  progress,
  onPick,
  onToggle,
}: {
  active: number;
  paused: boolean;
  /** The tour waits, paused or held by a hover: its gauge dims, and the
      button shows play, the way it would go on. */
  waiting: boolean;
  progress: React.RefObject<HTMLSpanElement | null>;
  onPick: (index: number) => void;
  onToggle: () => void;
}) {
  // Past the first tab the divider steps right, and the glyph half as far:
  // the space between the pill's round end and the divider grows, and its
  // optical centre (the peak of that space, blurred) moves by half the step.
  const move = "transition-[translate] duration-(--duration-slow) ease-spring";
  const later = active > 0;
  // One pill: the button is the strip's first item, drawn as a tab is.
  return (
    <div
      className="enter flex max-w-full min-w-0 shrink-0 items-center rounded-full border border-hairline bg-surface p-1"
      style={{ "--enter": 6 } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={paused ? "Play the tour" : "Pause the tour"}
        title={paused ? "Play" : "Pause"}
        className="grid size-lg shrink-0 cursor-pointer place-items-center rounded-full max-sm:size-2xl text-muted-foreground transition-colors pointer-hover:text-foreground"
      >
        <PlayPause
          playing={!waiting}
          className={cn(
            move,
            later && "translate-x-[calc(var(--spacing-ms)/4)] max-sm:translate-x-[calc(var(--spacing-md)/4)]",
          )}
        />
      </button>
      {/* Midway between the play glyph and the first tab's edge: its pill
          when it is the active tab, its label when it is not. */}
      <span
        aria-hidden
        className={cn(
          "mr-sm h-4 w-px shrink-0 bg-hairline",
          move,
          later && "translate-x-[calc(var(--spacing-ms)/2)] max-sm:translate-x-[calc(var(--spacing-md)/2)]",
        )}
      />
      <Tabs
        active={active}
        dim={waiting}
        progress={progress}
        onPick={onPick}
      />
    </div>
  );
}

function Tabs({
  active,
  dim,
  progress,
  onPick,
}: {
  active: number;
  dim: boolean;
  progress: React.RefObject<HTMLSpanElement | null>;
  onPick: (index: number) => void;
}) {
  // A screen too narrow for every tab scrolls the strip, and fades each end
  // that has more tabs past it.
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });
  const over = more.start || more.end;
  useEffect(() => {
    const node = strip.current;
    if (!node) return;
    const measure = () =>
      setMore({ start: node.scrollLeft > 1, end: node.scrollLeft + node.clientWidth < node.scrollWidth - 1 });
    const observer = new ResizeObserver(measure);
    // The tabs too: a label that changes size leaves the strip's own box as it was.
    for (const box of [node, ...node.children]) observer.observe(box);
    node.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", measure);
    };
  }, []);
  // The active tab stays in view.
  useEffect(() => {
    const node = strip.current;
    const tab = node?.children[active] as HTMLElement | undefined;
    if (!node || !tab || !over) return;
    node.scrollTo({ left: tab.offsetLeft - (node.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [active, over]);

  return (
    <div
      ref={strip}
      role="tablist"
      aria-label="What the app does"
      className={cn(
        // The padding, taken back by the margin, is room for the active tab's
        // ring and shadow: a box that scrolls clips what spills out of it. On a
        // phone, room at the end too, so the last tab clears the pill's round end.
        "-mx-px -my-1 flex min-w-0 gap-2xs overflow-x-auto rounded-full px-px py-1 [scrollbar-width:none] max-sm:pe-xs",
        more.start && "mask-l-from-75%",
        more.end && "mask-r-from-75%",
      )}
    >
      {TABS.map((tab, index) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={index === active}
          onClick={() => onPick(index)}
          className={cn(
            "relative flex h-lg shrink-0 cursor-pointer items-center overflow-hidden rounded-full px-ms text-label whitespace-nowrap transition-colors max-sm:h-2xl max-sm:px-md",
            index === active
              ? "bg-background text-foreground shadow-sm ring-1 ring-hairline"
              : "text-muted-foreground pointer-hover:text-foreground",
          )}
        >
          {index === active && (
            <span
              ref={progress}
              aria-hidden
              className={cn(
                "absolute inset-x-ms bottom-[3px] h-[2px] origin-left rounded-full bg-brand transition-opacity max-sm:inset-x-md max-sm:bottom-xs",
                dim && "opacity-40",
              )}
              style={{ scale: "var(--progress, 0) 1" }}
            />
          )}
          <span className="relative max-sm:hidden">{tab.label}</span>
          <span className="relative sm:hidden">{tab.short ?? tab.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Two shapes that are the pause bars, or the two halves of the play
    triangle, in percent of the icon's box. The same corners in the same
    order, so each shape morphs into the other. */
const SHAPES = {
  // On whole pixels of the 12px box, so the bars' edges are sharp.
  pause: ["16.67% 8.33%, 41.67% 8.33%, 41.67% 91.67%, 16.67% 91.67%", "58.33% 8.33%, 83.33% 8.33%, 83.33% 91.67%, 58.33% 91.67%"],
  // The halves overlap by a pixel, so no seam shows where they meet. The
  // triangle's centroid, not its box, is on the middle: a box-centred play
  // glyph reads left of centre.
  play: ["24% 6%, 66% 30.3%, 66% 69.7%, 24% 94%", "58% 25.7%, 100% 50%, 100% 50%, 58% 74.3%"],
};

function PlayPause({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative size-3", className)}
    >
      {SHAPES[playing ? "pause" : "play"].map((shape, i) => (
        <span
          key={i}
          className="absolute inset-0 bg-current transition-[clip-path] duration-(--duration-slow) ease-spring-bounce motion-reduce:transition-none"
          style={{ clipPath: `polygon(${shape})` }}
        />
      ))}
    </span>
  );
}
